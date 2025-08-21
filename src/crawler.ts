// src/crawler.ts

import * as admin from 'firebase-admin';
import { getFirestore } from './firebase';
import config from './config';
import { fetchLatestArticlesPaginated, fetchCommentsForArticle } from './api';
import { getExistingArticlesFromDB } from './database';
import { saveNewArticleToDB, updateArticleFieldAndLog } from './article';
import { EverytimeArticle, FirestoreArticle } from './types';

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