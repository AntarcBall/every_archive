// src/database.ts
import * as admin from 'firebase-admin';
import { getFirestore } from './firebase';
import { FirestoreArticle } from './types';

/**
 * Firestore에서 기존 게시글 목록을 가져옵니다.
 * @returns Firestore에 저장된 게시글 ID와 데이터 매핑
 */
export const getExistingArticlesFromDB = async (): Promise<Record<string, FirestoreArticle>> => {
  const db = getFirestore();
  const snapshot = await db.collection('articles').get();
  const articles: Record<string, FirestoreArticle> = {};
  
  snapshot.forEach(doc => {
    articles[doc.id] = doc.data() as FirestoreArticle;
  });
  
  return articles;
};