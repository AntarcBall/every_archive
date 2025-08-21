// src/crawler.ts

import * as https from 'https';
import * as http from 'http'; // 필요 시 HTTP 리디렉션 처리
import * as querystring from 'querystring'; // URL 파라미터 인코딩용
import { parseStringPromise } from 'xml2js'; // XML 파싱용
import * as fs from 'fs'; // 설정 파일 읽기를 위해 fs 모듈 추가
import * as path from 'path'; // 경로 처리를 위해 path 모듈 추가
import * as admin from 'firebase-admin'; // Firebase Admin SDK import 추가
import { getFirestore } from './firebase';
import { EverytimeArticle, FirestoreArticle, EverytimeComment } from './types';
import { logChange } from './logger';

// --- 설정 로드 ---
interface CrawlConfig {
  boardId: string;
  limitNum: number; // 페이지 크기
  intervalMinutes: number; // 스케줄러 설정 참고용
  maxLookback?: number; // 신규 글 탐지를 위해 뒤로 몇 개까지 살펴볼지
}

let config: CrawlConfig;
try {
  const configPath = path.resolve(__dirname, '../crawlconfig.json');
  const configRaw = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configRaw);
  console.log('Crawl configuration loaded:', config);
} catch (error) {
  console.error('Failed to load crawlconfig.json. Using default values or exiting.', error);
  // 기본값 설정 또는 프로세스 종료
  config = {
    boardId: '393752', // 기본 게시판 ID
    limitNum: 5,       // 기본 페이지 크기
    intervalMinutes: 2, // 기본 주기
    maxLookback: 50
  };
  // 또는 process.exit(1); 로 종료할 수도 있습니다.
}

// maxLookback 기본값 보정 (설정 파일에 없을 수 있음)
if (!config.maxLookback || config.maxLookback <= 0) {
  config.maxLookback = Math.max(config.limitNum * 3, 50);
}

// --- 설정 부분 ---
// XML API 엔드포인트
const EVERYTIME_ARTICLE_API_URL = 'https://api.everytime.kr/find/board/article/list';
const EVERYTIME_COMMENT_API_URL = 'https://api.everytime.kr/find/board/comment/list'; // 댓글 API URL 추가
const EVERYTIME_ORIGIN = 'https://everytime.kr';
const EVERYTIME_REFERER = 'https://everytime.kr/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

// Cookie.txt 파일에서 가져온 쿠키 값
const EVERYTIME_COOKIE = 'x-et-device=6188842; etsid=s%3AuT72G_sPY1fmhSOPWM58iB9DQ7GgP1mD.K7rfrJgccDwsMMmx3W1YcSkPCO7smcN9VwSywt569Bw; _ga=GA1.1.342229312.1754717565; _ga_85ZNEFVRGL=GS2.1.s1755570953$o46$g1$t1755570989$j24$l0$h0';

// 댓글 정보를 담는 인터페이스 추가
interface EverytimeCommentLocal {
  id: string;
  text: string;
  user_nickname?: string; // 댓글 작성자 닉네임
  created_at?: string; // 댓글 작성 시간 추가
  // parent_id 등 다른 필드도 필요 시 추가 가능
}

/**
 * 에브리타임 XML API에서 게시글 목록을 가져옵니다.
 * @param start_num 시작 인덱스
 * @param limit_num 가져올 게시글 수 (기본값은 설정 파일에서 읽은 값)
 * @returns 게시글 목록 (Promise)
 */
const fetchArticlesFromAPI = async (start_num: number = 0, limit_num: number = config.limitNum): Promise<EverytimeArticle[]> => {
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
const fetchLatestArticlesPaginated = async (maxFetch: number): Promise<EverytimeArticle[]> => {
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

/**
 * 에브리타임 XML API에서 특정 게시글의 댓글 목록을 가져옵니다.
 * @param articleId 게시글 ID
 * @returns 댓글 목록 (Promise)
 */
const fetchCommentsForArticle = async (articleId: string): Promise<EverytimeCommentLocal[]> => {
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

/**
 * 새로운 게시글을 Firestore에 저장하고, 해당 글의 댓글도 가져와 로그에 기록합니다.
 * @param article 저장할 게시글
 */
const saveNewArticleToDB = async (article: EverytimeArticle): Promise<void> => {
  const db = getFirestore();
  const now = admin.firestore.Timestamp.now();
  
  const firestoreArticle: FirestoreArticle = {
    ...article,
    created_at: now, // created_at은 Firestore 타임스탬프로 변환
    updated_at: now
  };
  
  await db.collection('articles').doc(article.id).set(firestoreArticle);
  console.log(`New article saved to DB: ${article.id}`);
  
  // 실제 게시글 작성 시간을 사용하도록 수정
  const articleTimestamp = new Date(article.created_at).toLocaleString('ko-KR', { 
    month: '2-digit', day: '2-digit', 
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).replace(', ', ' | ').replace(/\./g, '');

  // 로그 기록 - 게시글 제목과 내용 모두 저장
  await logChange({
    timestamp: articleTimestamp, // 실제 게시글 작성 시간 사용
    type: '글 신규 작성',
    details: article.title, // 게시글 제목
    content: article.text,  // 게시글 내용 (새로 추가)
    user_nickname: '익명', // 게시글 작성자는 '익명'으로 가정 (향후 API에서 가져올 수 있음)
    before: '-', 
    after: '-',
    article_id: article.id
  });

  // 댓글 가져오기 및 로그 기록
  try {
    const comments = await fetchCommentsForArticle(article.id);
    for (const comment of comments) {
      // 실제 댓글 작성 시간을 사용하도록 수정 (타입 가드 추가)
      const commentTimestamp = comment.created_at 
        ? new Date(comment.created_at).toLocaleString('ko-KR', { 
            month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
          }).replace(', ', ' | ').replace(/\./g, '')
        : new Date().toLocaleString('ko-KR', { 
            month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
          }).replace(', ', ' | ').replace(/\./g, '');

      await logChange({
        timestamp: commentTimestamp, // 실제 댓글 작성 시간 사용
        type: '댓글',
        details: article.title, // 게시글 제목
        content: comment.text,  // 댓글 내용
        user_nickname: comment.user_nickname || '익명', // 댓글 작성자 닉네임
        before: 0, // 댓글은 신규 작성 시 0에서 1로 증가한다고 가정
        after: 1,  // 댓글은 신규 작성 시 0에서 1로 증가한다고 가정
        article_id: article.id, // 게시글 ID
        comment_id: comment.id  // 댓글 ID
      });
    }
  } catch (error) {
    console.error(`Failed to fetch or log comments for article ${article.id}:`, error);
    // 댓글 로그 실패는 게시글 저장 자체에는 영향을 주지 않음
  }
};

/**
 * 변경된 게시글 필드를 Firestore에 업데이트하고 로그를 기록합니다.
 * @param articleId 게시글 ID
 * @param field 변경된 필드명
 * @param oldValue 이전 값
 * @param newValue 새로운 값
 * @param title 게시글 제목 (로그용)
 */
const updateArticleFieldAndLog = async (
  articleId: string, 
  field: keyof EverytimeArticle, 
  oldValue: number, 
  newValue: number,
  title: string
): Promise<void> => {
  const db = getFirestore();
  const now = admin.firestore.Timestamp.now();
  
  // Firestore 문서 업데이트
  await db.collection('articles').doc(articleId).update({
    [field]: newValue,
    updated_at: now
  });
  
  console.log(`Article ${articleId} field ${field} updated: ${oldValue} -> ${newValue}`);
  
  // 로그 타입 매핑
  let logType: '좋아요' | '댓글' | '스크랩' = '좋아요'; // 기본값
  if (field === 'posvote') logType = '좋아요';
  else if (field === 'comment') logType = '댓글';
  else if (field === 'scrap_count') logType = '스크랩';
  
  // 로그 기록
  await logChange({
    timestamp: now.toDate().toLocaleString('ko-KR', { 
      month: '2-digit', day: '2-digit', 
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).replace(', ', ' | ').replace(/\./g, ''),
    type: logType,
    details: title,
    before: oldValue,
    after: newValue,
    article_id: articleId
  });
};

/**
 * 크롤링 및 아카이빙 작업을 수행합니다.
 */
export const crawlAndArchive = async (): Promise<void> => {
  console.log('Starting crawl and archive process...');
  
  try {
    // 1단계: 초기 아카이빙 (최초 1회 실행) - 생략 (필요 시 별도 엔드포인트 또는 플래그로 처리)
    // 2단계: 지속적 관측
    
  // 최신 글 페이지네이션 수집 (놓침 방지)
  const maxFetch = config.maxLookback ?? Math.max(config.limitNum * 3, 50);
  const latestArticles = await fetchLatestArticlesPaginated(maxFetch);
  console.log(`Fetched ${latestArticles.length} latest articles from API (maxLookback=${maxFetch}, pageSize=${config.limitNum})`);
  const sampleIds = latestArticles.slice(0, Math.min(10, latestArticles.length)).map(a => a.id).join(', ');
  console.log(`Sample fetched IDs: ${sampleIds}`);
    
    // 기존 DB 게시글 가져오기
    const existingArticles = await getExistingArticlesFromDB();
    console.log(`Found ${Object.keys(existingArticles).length} existing articles in DB`);
    
    // 신규 글 감지 및 저장 (오래된 순으로 저장)
    const newArticles = latestArticles.filter(a => !existingArticles[a.id]);
    console.log(`Detected ${newArticles.length} new articles`);
    newArticles.sort((a, b) => Number(a.id) - Number(b.id));
    for (const article of newArticles) {
      await saveNewArticleToDB(article);
    }
    
    // 변동값 업데이트
    for (const article of latestArticles) {
      const existingArticle = existingArticles[article.id];
      if (existingArticle) {
        // posvote, comment, scrap_count 비교 및 업데이트
        if (existingArticle.posvote !== article.posvote) {
          await updateArticleFieldAndLog(
            article.id, 
            'posvote', 
            existingArticle.posvote, 
            article.posvote,
            article.title
          );
        }
        if (existingArticle.comment !== article.comment) {
          await updateArticleFieldAndLog(
            article.id, 
            'comment', 
            existingArticle.comment, 
            article.comment,
            article.title
          );
        }
        if (existingArticle.scrap_count !== article.scrap_count) {
          await updateArticleFieldAndLog(
            article.id, 
            'scrap_count', 
            existingArticle.scrap_count, 
            article.scrap_count,
            article.title
          );
        }
      }
    }
    
    console.log('Crawl and archive process completed successfully');
  } catch (error) {
    console.error('Error during crawl and archive process:', error);
    throw error; // 상위 호출자에게 에러 전파
  }
};

/**
 * Firestore에서 기존 게시글 목록을 가져옵니다.
 * @returns Firestore에 저장된 게시글 ID와 데이터 매핑
 */
const getExistingArticlesFromDB = async (): Promise<Record<string, FirestoreArticle>> => {
  const db = getFirestore();
  const snapshot = await db.collection('articles').get();
  const articles: Record<string, FirestoreArticle> = {};
  
  snapshot.forEach(doc => {
    articles[doc.id] = doc.data() as FirestoreArticle;
  });
  
  return articles;
};