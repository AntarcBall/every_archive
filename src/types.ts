// src/types.ts

import { firestore } from 'firebase-admin'; // Firebase Firestore 타입만 import

// 에브리타임 게시글 타입 정의
export interface EverytimeArticle {
  id: string;
  title: string;
  text: string;
  created_at: string; // ISO 8601 문자열 또는 타임스페이스
  posvote: number;
  comment: number;
  scrap_count: number;
}

// Firestore에 저장될 게시글 문서 타입 (Firebase Timestamp 포함)
export interface FirestoreArticle extends Omit<EverytimeArticle, 'created_at'> {
  created_at: firestore.Timestamp; // admin.firestore.Timestamp 대신 firestore.Timestamp 사용
  updated_at: firestore.Timestamp;
}

// 로그 항목 타입
export interface LogEntry {
  timestamp: string; // MM.DD | HH:MM'SS 형식
  type: '글 신규 작성' | '글 삭제' | '좋아요' | '댓글' | '스크랩';
  details: string; // 게시글 제목
  before: number | string;
  after: number | string;
  article_id: string;
}