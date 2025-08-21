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

// 댓글 정보를 담는 인터페이스 추가
export interface EverytimeComment {
  id: string;
  text: string;
  user_nickname?: string; // 댓글 작성자 닉네임
  created_at?: string; // 댓글 작성 시간 추가
  // parent_id 등 다른 필드도 필요 시 추가 가능
}

// 로그 항목 타입 - content, comment_id, user_nickname 필드 추가
// article_id와 comment_id는 특정 로그 항목이 어떤 글/댓글과 관련된지 식별하기 위해 사용됩니다.
// 예: '댓글' 타입 로그는 article_id와 comment_id 모두 사용.
//     '글 신규 작성' 타입 로그는 주로 article_id만 사용.
export interface LogEntry {
  timestamp: string; // MM.DD | HH:MM'SS 형식
  type: '글 신규 작성' | '글 삭제' | '좋아요' | '댓글' | '스크랩';
  details: string; // 게시글 제목
  content?: string; // 게시글 내용 또는 댓글 내용 (선택적)
  user_nickname?: string; // 글쓴이 또는 댓글 작성자 닉네임 (선택적)
  before: number | string;
  after: number | string;
  article_id: string; // 관련된 게시글의 ID
  comment_id?: string; // 관련된 댓글의 ID (댓글 로그에 사용)
}