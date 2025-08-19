// src/crawler.ts

import * as https from 'https';
import * as admin from 'firebase-admin'; // Firebase Admin SDK import 추가
// v2 API는 JSON을 반환하므로 xml2js는 더 이상 필요하지 않습니다.
// import { parseStringPromise } from 'xml2js';
import { getFirestore } from './firebase';
import { EverytimeArticle, FirestoreArticle } from './types';
import { logChange } from './logger';

// --- 설정 부분 ---
// 실제 크롤링할 게시판 ID를 입력하세요 (예: 393752는 자유게시판)
const TARGET_BOARD_ID = '393752';

// Cookie.txt 파일에서 가져온 쿠키 값
const EVERYTIME_COOKIE = 'x-et-device=6188842; etsid=s%3AuT72G_sPY1fmhSOPWM58iB9DQ7GgP1mD.K7rfrJgccDwsMMmx3W1YcSkPCO7smcN9VwSywt569Bw; _ga=GA1.1.342229312.1754717565; _ga_85ZNEFVRGL=GS2.1.s1755570953$o46$g1$t1755570989$j24$l0$h0';

const EVERYTIME_API_URL = 'https://api.everytime.kr/v2/find/board/article/list';
const EVERYTIME_ORIGIN = 'https://everytime.kr';
const EVERYTIME_REFERER = 'https://everytime.kr/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

/**
 * 에브리타임 API에서 게시글 목록을 가져옵니다.
 * @param start_num 시작 인덱스 (v2 API에서의 사용 여부 확인 필요)
 * @param limit_num 가져올 게시글 수 (v2 API에서의 사용 여부 확인 필요)
 * @returns 게시글 목록 (Promise)
 */
const fetchArticlesFromAPI = async (start_num: number, limit_num: number): Promise<EverytimeArticle[]> => {
  return new Promise((resolve, reject) => {
    // 1. 요청 본문(JSON) 구성
    // 참고: v2 API의 페이징은 start_num/limit_num이 아닐 수 있습니다. 
    // nextArticleId 등을 사용할 수 있으므로, 실제 동작을 확인하고 조정이 필요할 수 있습니다.
    const postData = JSON.stringify({
      mode: 'board',
      boardId: TARGET_BOARD_ID,
      // isBoardInfoRequired: false // 일반적으로 글 목록만 필요함
      // limit_num, start_num // v2 API 사용법에 따라 조정 필요
    });

    // 2. 요청 옵션 구성
    const options: https.RequestOptions = {
      hostname: 'api.everytime.kr',
      port: 443,
      path: '/v2/find/board/article/list',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
            const result = JSON.parse(data);
            // console.log('API 응답 본문:', result); // 디버깅용

            // 4. JSON 응답 파싱 및 EverytimeArticle[]로 변환
            // 응답 구조 예시: { status: "success", result: { articles: [...] } }
            if (result.status === 'success' && result.result && Array.isArray(result.result.articles)) {
              const articles: EverytimeArticle[] = result.result.articles.map((apiArticle: any) => ({
                id: apiArticle.id.toString(), // ID는 문자열로 변환
                title: apiArticle.title,
                text: apiArticle.text,
                created_at: apiArticle.createdAt, // 필드명 주의 (camelCase)
                posvote: apiArticle.posvote,
                comment: apiArticle.commentCount, // 필드명 매핑
                scrap_count: apiArticle.scrapCount // 필드명 매핑
              }));
              console.log(`API에서 ${articles.length}개의 글을 성공적으로 가져왔습니다.`);
              resolve(articles);
            } else {
              console.error('예상치 못한 API 응답 구조:', result);
              reject(new Error('예상치 못한 API 응답 구조'));
            }
          } else {
            console.error(`API 요청 실패. Status Code: ${res.statusCode}, Response: ${data}`);
            reject(new Error(`API 요청 실패. Status Code: ${res.statusCode}`));
          }
        } catch (error) {
          console.error('API 응답 파싱 중 오류:', error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('API 요청 중 오류:', error);
      reject(error);
    });

    // 5. 요청 본문 쓰고 요청 종료
    req.write(postData);
    req.end();
  });
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
    
    // 최신 10개 글 가져오기
    const latestArticles = await fetchArticlesFromAPI(0, 10);
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