// scripts/deleteAllData.ts
import * as admin from 'firebase-admin';
import { initializeFirebase, getFirestore } from '../src/firebase';

// Firebase 초기화
const app = initializeFirebase();
if (!app) {
  console.error('Failed to initialize Firebase');
  process.exit(1);
}

const db = getFirestore();

async function deleteAllData() {
  try {
    // articles 컬렉션의 모든 문서 삭제
    const articlesSnapshot = await db.collection('articles').get();
    if (!articlesSnapshot.empty) {
      const articlesBatch = db.batch();
      articlesSnapshot.forEach((doc) => {
        articlesBatch.delete(doc.ref);
      });
      await articlesBatch.commit();
      console.log(`Deleted ${articlesSnapshot.size} articles`);
    }

    // logs 컬렉션의 모든 문서 삭제
    const logsSnapshot = await db.collection('logs').get();
    if (!logsSnapshot.empty) {
      const logsBatch = db.batch();
      logsSnapshot.forEach((doc) => {
        logsBatch.delete(doc.ref);
      });
      await logsBatch.commit();
      console.log(`Deleted ${logsSnapshot.size} logs`);
    }

    console.log('All data deleted successfully');
  } catch (error) {
    console.error('Error deleting data:', error);
  } finally {
    // Firebase 앱 종료
    if (app) {
      await app.delete();
      console.log('Firebase app closed');
    }
  }
}

deleteAllData();