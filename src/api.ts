// src/api.ts
import * as https from 'https';
import * as querystring from 'querystring';
import { parseStringPromise } from 'xml2js';
import config, { EVERYTIME_ARTICLE_API_URL, EVERYTIME_COMMENT_API_URL, EVERYTIME_ORIGIN, EVERYTIME_REFERER, USER_AGENT, EVERYTIME_COOKIE } from './config';
import { EverytimeArticle, EverytimeComment } from './types';

/**
 * 에브리타임 XML API에서 게시글 목록을 가져옵니다.
 * @param start_num 시작 인덱스
 * @param limit_num 가져올 게시글 수 (기본값은 설정 파일에서 읽은 값)
 * @returns 게시글 목록 (Promise)
 */
export const fetchArticlesFromAPI = async (start_num: number = 0, limit_num: number = config.limitNum): Promise<EverytimeArticle[]> => {
  return new Promise((resolve, reject) => {
    // 1. 요청 파라미터 구성 (application/x-www-form-urlencoded)
    const postData = querystring.stringify({
      id: config.boardId,
      limit_num: limit_num.toString(),
      start_num: start_num.toString(),
      moiminfo: 'true' // 필요 시 게시판 정보 포함
    });

    // 2. 요청 옵션 구성
    const options: https.RequestOptions = {
      hostname: 'api.everytime.kr',
      port: 443,
      path: '/find/board/article/list', // 경로도 상수 사용 가능
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': USER_AGENT,
        'Origin': EVERYTIME_ORIGIN,
        'Referer': EVERYTIME_REFERER,
        // --- 핵심: Cookie.txt에서 가져온 쿠키 사용 ---
        'Cookie': EVERYTIME_COOKIE
      }
    };

    // 3. HTTPS 요청 보내기
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', async () => {
        try {
          console.log(`API Response Status: ${res.statusCode}`);
          
          if (res.statusCode === 200) {
            // console.log('Raw XML Response:', data); // 디버깅용
            
            // 4. XML 응답 파싱
            const result = await parseStringPromise(data, { explicitArray: false });
            
            // console.log('Parsed XML Object:', JSON.stringify(result, null, 2)); // 디버깅용

            // 5. 파싱된 객체를 EverytimeArticle[]로 변환
            // 응답 구조: 
            // <response>
            //   <moim ... />
            //   <hashtags />
            //   <article id="..." ... />
            //   <article id="..." ... />
            //   ...
            // </response>
            const articles: EverytimeArticle[] = [];
            
            // result.response가 존재하고, 그 안에 article이 있는지 확인
            if (result.response && result.response.article) {
              // article이 하나만 있을 경우 배열이 아닌 객체로 처리될 수 있으므로, 
              // 항상 배열로 만듭니다.
              const articleList = Array.isArray(result.response.article) ? result.response.article : [result.response.article];
              
              // 설정된 limit_num만큼만 처리
              const articlesToProcess = articleList.slice(0, limit_num);

              for (const article of articlesToProcess) {
                // XML 파싱 시 속성은 `$` 키 안에 들어갑니다.
                // 예: <article id="123" title="..." /> -> { $: { id: "123", title: "..." } }
                if (article && article.$) {
                  const attr = article.$;
                  articles.push({
                    id: attr.id,
                    title: attr.title || '',
                    text: attr.text || '',
                    created_at: attr.created_at || '',
                    posvote: parseInt(attr.posvote || '0', 10),
                    comment: parseInt(attr.comment || '0', 10),
                    scrap_count: parseInt(attr.scrap_count || '0', 10)
                  });
                }
              }
            }
            
            console.log(`Successfully fetched and parsed ${articles.length} articles from XML API (requested limit: ${limit_num})`);
            resolve(articles);
            
          } else {
            console.error(`API request failed with status code: ${res.statusCode}, response: ${data}`);
            reject(new Error(`API request failed with status code: ${res.statusCode}`));
          }
        } catch (error) {
          console.error('Error parsing XML API response:', error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error making XML API request:', error);
      reject(error);
    });

    // 5. 요청 파라미터 쓰고 요청 종료
    req.write(postData);
    req.end();
  });
};

/**
 * 최신 글을 페이지네이션하며 최대 maxFetch개까지 가져옵니다.
 * 1페이지 당 limitNum 개를 요청하고, start_num을 증가시키며 수집합니다.
 */
export const fetchLatestArticlesPaginated = async (maxFetch: number): Promise<EverytimeArticle[]> => {
  const pageSize = config.limitNum;
  const collected: EverytimeArticle[] = [];
  let start = 0;

  while (collected.length < maxFetch) {
    const toFetch = Math.min(pageSize, maxFetch - collected.length);
    const page = await fetchArticlesFromAPI(start, toFetch);
    if (page.length === 0) break;

    const known = new Set(collected.map(a => a.id));
    for (const a of page) {
      if (!known.has(a.id)) collected.push(a);
    }

    start += page.length;
    if (page.length < toFetch) break; // 마지막 페이지 추정
  }

  return collected;
};

// 댓글 정보를 담는 인터페이스 추가
interface EverytimeCommentLocal {
  id: string;
  text: string;
  user_nickname?: string; // 댓글 작성자 닉네임
  created_at?: string; // 댓글 작성 시간 추가
  // parent_id 등 다른 필드도 필요 시 추가 가능
}

/**
 * 에브리타임 XML API에서 특정 게시글의 댓글 목록을 가져옵니다.
 * @param articleId 게시글 ID
 * @returns 댓글 목록 (Promise)
 */
export const fetchCommentsForArticle = async (articleId: string): Promise<EverytimeCommentLocal[]> => {
  return new Promise((resolve, reject) => {
    // 1. 요청 파라미터 구성 (application/x-www-form-urlencoded)
    const postData = querystring.stringify({
      id: articleId,
      limit_num: '-1', // 모든 댓글 가져오기
      articleInfo: 'true' // 게시글 정보 포함 (선택 사항)
    });

    // 2. 요청 옵션 구성
    const options: https.RequestOptions = {
      hostname: 'api.everytime.kr',
      port: 443,
      path: '/find/board/comment/list', // 댓글 API 경로
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': USER_AGENT,
        'Origin': EVERYTIME_ORIGIN,
        'Referer': EVERYTIME_REFERER,
        // --- 핵심: Cookie.txt에서 가져온 쿠키 사용 ---
        'Cookie': EVERYTIME_COOKIE
      }
    };

    // 3. HTTPS 요청 보내기
    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', async () => {
        try {
          console.log(`Comment API Response Status for article ${articleId}: ${res.statusCode}`);
          
          if (res.statusCode === 200) {
            // console.log('Raw Comment XML Response:', data); // 디버깅용
            
            // 4. XML 응답 파싱
            const result = await parseStringPromise(data, { explicitArray: false });
            
            // console.log('Parsed Comment XML Object:', JSON.stringify(result, null, 2)); // 디버깅용

            // 5. 파싱된 객체를 EverytimeComment[]로 변환
            // 응답 구조: 
            // <response>
            //   <article ... />
            //   <poll />
            //   <comment id="..." text="..." user_nickname="..." />
            //   <comment id="..." text="..." user_nickname="..." />
            //   ...
            // </response>
            const comments: EverytimeCommentLocal[] = [];
            
            // result.response가 존재하고, 그 안에 comment가 있는지 확인
            if (result.response && result.response.comment) {
              // comment가 하나만 있을 경우 배열이 아닌 객체로 처리될 수 있으므로, 
              // 항상 배열로 만듭니다.
              const commentList = Array.isArray(result.response.comment) ? result.response.comment : [result.response.comment];

              for (const comment of commentList) {
                // XML 파싱 시 속성은 `$` 키 안에 들어갑니다.
                // 예: <comment id="123" text="..." user_nickname="..." /> -> { $: { id: "123", text: "...", user_nickname: "..." } }
                if (comment && comment.$) {
                  const attr = comment.$;
                  comments.push({
                    id: attr.id,
                    text: attr.text || '',
                    user_nickname: attr.user_nickname || '익명', // 기본값 설정
                    created_at: attr.created_at || new Date().toISOString() // 댓글 작성 시간 추가
                  });
                }
              }
            }
            
            console.log(`Successfully fetched and parsed ${comments.length} comments for article ${articleId} from XML API`);
            resolve(comments);
            
          } else {
            console.error(`Comment API request failed for article ${articleId} with status code: ${res.statusCode}, response: ${data}`);
            reject(new Error(`Comment API request failed with status code: ${res.statusCode}`));
          }
        } catch (error) {
          console.error(`Error parsing Comment XML API response for article ${articleId}:`, error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`Error making Comment XML API request for article ${articleId}:`, error);
      reject(error);
    });

    // 5. 요청 파라미터 쓰고 요청 종료
    req.write(postData);
    req.end();
  });
};