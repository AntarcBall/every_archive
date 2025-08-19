// src/crawler.ts

import * as https from 'https';
import * as http from 'http'; // 필요 시 HTTP 리디렉션 처리
import * as querystring from 'querystring'; // URL 파라미터 인코딩용
import { parseStringPromise } from 'xml2js'; // XML 파싱용
import * as fs from 'fs'; // 설정 파일 읽기를 위해 fs 모듈 추가
import * as path from 'path'; // 경로 처리를 위해 path 모듈 추가
import * as admin from 'firebase-admin'; // Firebase Admin SDK import 추가
import { getFirestore } from './firebase';
import { EverytimeArticle, FirestoreArticle } from './types';
import { logChange } from './logger';

// --- 설정 로드 ---
interface CrawlConfig {
  boardId: string;
  limitNum: number;
  intervalMinutes: number; // 스케줄러 설정 참고용
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
    limitNum: 5,       // 기본 limit
    intervalMinutes: 2 // 기본 주기
  };
  // 또는 process.exit(1); 로 종료할 수도 있습니다.
}

// --- 설정 부분 ---
// XML API 엔드포인트
const EVERYTIME_API_URL = 'https://api.everytime.kr/find/board/article/list';
const EVERYTIME_ORIGIN = 'https://everytime.kr';
const EVERYTIME_REFERER = 'https://everytime.kr/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

// Cookie.txt 파일에서 가져온 쿠키 값
const EVERYTIME_COOKIE = 'x-et-device=6188842; etsid=s%3AuT72G_sPY1fmhSOPWM58iB9DQ7GgP1mD.K7rfrJgccDwsMMmx3W1YcSkPCO7smcN9VwSywt569Bw; _ga=GA1.1.342229312.1754717565; _ga_85ZNEFVRGL=GS2.1.s1755570953$o46$g1$t1755570989$j24$l0$h0';

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
      path: '/find/board/article/list',
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
 * 새로운 게시글을 Firestore에 저장합니다.
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
  
  // 로그 기록
  await logChange({
    timestamp: now.toDate().toLocaleString('ko-KR', { 
      month: '2-digit', day: '2-digit', 
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).replace(', ', ' | ').replace(/\./g, ''),
    type: '글 신규 작성',
    details: article.title,
    before: '-', // 신규 작성은 before 값이 없음
    after: '-', // 신규 작성은 after 값이 없음
    article_id: article.id
  });
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
    
    // 최신 N개 글 가져오기 (start_num=0, limit_num=config.limitNum)
    const latestArticles = await fetchArticlesFromAPI(0, config.limitNum);
    console.log(`Fetched ${latestArticles.length} latest articles from API`);
    
    // 기존 DB 게시글 가져오기
    const existingArticles = await getExistingArticlesFromDB();
    console.log(`Found ${Object.keys(existingArticles).length} existing articles in DB`);
    
    // 신규 글 감지 및 저장
    for (const article of latestArticles) {
      if (!existingArticles[article.id]) {
        await saveNewArticleToDB(article);
      }
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