// src/logger.ts

import * as admin from 'firebase-admin';
import { getFirestore } from './firebase';
import { LogEntry } from './types';

/**
 * 로그 항목을 Firestore에 저장합니다.
 * @param logEntry 저장할 로그 항목
 */
export const logChange = async (logEntry: LogEntry): Promise<void> => {
  const db = getFirestore();
  
  // 타임스탬프를 문서 ID로 사용하거나, 자동 생성 ID를 사용할 수 있습니다.
  // 여기서는 자동 생성 ID를 사용합니다.
  await db.collection('logs').add(logEntry);
  console.log(`Log entry added: ${logEntry.type} - ${logEntry.details}`);
};

/**
 * Firestore에서 로그 항목을 조회합니다.
 * @returns 로그 항목 배열
 */
export const getLogs = async (): Promise<LogEntry[]> => {
  const db = getFirestore();
  const snapshot = await db.collection('logs')
    .orderBy('timestamp', 'desc') // 최신 로그부터 조회
    .limit(100) // 필요에 따라 제한 수 조정
    .get();
  
  const logs: LogEntry[] = [];
  snapshot.forEach(doc => {
    logs.push(doc.data() as LogEntry);
  });
  
  return logs;
};