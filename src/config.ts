// src/config.ts
import * as fs from 'fs';
import * as path from 'path';

export interface CrawlConfig {
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
export const EVERYTIME_ARTICLE_API_URL = 'https://api.everytime.kr/find/board/article/list';
export const EVERYTIME_COMMENT_API_URL = 'https://api.everytime.kr/find/board/comment/list'; // 댓글 API URL 추가
export const EVERYTIME_ORIGIN = 'https://everytime.kr';
export const EVERYTIME_REFERER = 'https://everytime.kr/';
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';

// Cookie.txt 파일에서 가져온 쿠키 값
export const EVERYTIME_COOKIE = 'x-et-device=6188842; etsid=s%3AuT72G_sPY1fmhSOPWM58iB9DQ7GgP1mD.K7rfrJgccDwsMMmx3W1YcSkPCO7smcN9VwSywt569Bw; _ga=GA1.1.342229312.1754717565; _ga_85ZNEFVRGL=GS2.1.s1755570953$o46$g1$t1755570989$j24$l0$h0';

export default config;