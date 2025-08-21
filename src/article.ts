// src/article.ts
import * as admin from 'firebase-admin';
import { getFirestore } from './firebase';
import { EverytimeArticle, FirestoreArticle } from './types';
import { logChange } from './logger';
import { fetchCommentsForArticle } from './api';

/**
 * 새로운 게시글을 Firestore에 저장하고, 해당 글의 댓글도 가져와 로그에 기록합니다.
 * @param article 저장할 게시글
 */
export const saveNewArticleToDB = async (article: EverytimeArticle): Promise<void> => {
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
    // 기존 댓글 수 조회
    const existingArticle = await db.collection('articles').doc(article.id).get();
    const existingCommentCount = existingArticle.exists ? (existingArticle.data() as FirestoreArticle).comment : 0;
    
    // 현재 댓글 수 (새로 가져온 댓글 수)
    const currentCommentCount = comments.length;
    
    // 댓글 수가 변경된 경우에만 로그 기록
    if (existingCommentCount !== currentCommentCount) {
      await logChange({
        timestamp: now.toDate().toLocaleString('ko-KR', { 
          month: '2-digit', day: '2-digit', 
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false
        }).replace(', ', ' | ').replace(/\./g, ''),
        type: '댓글',
        details: article.title, // 게시글 제목
        content: `총 댓글 수: ${existingCommentCount} -> ${currentCommentCount}`,  // 변경된 댓글 수 정보
        user_nickname: '시스템', // 시스템에서 기록
        before: existingCommentCount, 
        after: currentCommentCount,
        article_id: article.id // 게시글 ID
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
export const updateArticleFieldAndLog = async (
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