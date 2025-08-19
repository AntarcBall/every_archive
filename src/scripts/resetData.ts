// src/scripts/resetData.ts
// 이 스크립트는 개발/테스트 목적으로 Firestore의 'articles' 및 'logs' 컬렉션을 삭제합니다.
// 프로덕션 환경에서는 절대 실행하지 마세요!

import * as admin from 'firebase-admin';
import { getFirestore } from '../firebase'; // 기존 firebase 초기화 로직 재사용

async function resetData() {
  try {
    // Firebase Admin SDK 초기화 (src/firebase.ts의 로직 재사용)
    // 이는 process.env.GOOGLE_APPLICATION_CREDENTIALS 또는 기본 인증 정보를 사용합니다.
    const app = admin.initializeApp();
    console.log('Firebase Admin SDK initialized for reset script.');

    const db = getFirestore(); // Firestore 인스턴스 가져오기

    console.log('Deleting all documents in "articles" collection...');
    const articlesSnapshot = await db.collection('articles').get();
    const articlesBatch = db.batch();
    articlesSnapshot.forEach(doc => {
        articlesBatch.delete(doc.ref);
    });
    await articlesBatch.commit();
    console.log(`Deleted ${articlesSnapshot.size} documents from "articles" collection.`);

    console.log('Deleting all documents in "logs" collection...');
    const logsSnapshot = await db.collection('logs').get();
    const logsBatch = db.batch();
    logsSnapshot.forEach(doc => {
        logsBatch.delete(doc.ref);
    });
    await logsBatch.commit();
    console.log(`Deleted ${logsSnapshot.size} documents from "logs" collection.`);

    console.log('All data reset successfully.');
    
    // 애플리케이션 종료
    await app.delete();
    process.exit(0);

  } catch (error) {
    console.error('Error resetting data:', error);
    process.exit(1);
  }
}

// 스크립트 직접 실행 시 함수 호출
if (require.main === module) {
    resetData();
}