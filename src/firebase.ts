// src/firebase.ts

import * as admin from 'firebase-admin';

// Firebase 초기화 함수
export const initializeFirebase = (): admin.app.App | undefined => {
  // Firebase 서비스 계정 키를 사용하여 초기화
  // 실제 운영 환경에서는 환경 변수나 Google Cloud의 기본 인증 정보를 사용하는 것이 좋습니다.
  // 이 예시에서는 서비스 계정 키 파일을 사용합니다.
  // const serviceAccount = require('../path/to/serviceAccountKey.json');

  // 임시로 애플리케이션 기본 인증 정보를 사용 (Cloud Run 등에서 자동 제공)
  // 로컬 개발 시에는 GOOGLE_APPLICATION_CREDENTIALS 환경 변수를 설정해야 합니다.
  try {
    const app = admin.initializeApp({
      // credential: admin.credential.cert(serviceAccount), // 서비스 계정 키 사용 시
      // projectId: 'your-project-id' // 필요 시 프로젝트 ID 명시
    });
    console.log('Firebase initialized successfully');
    return app;
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return undefined;
  }
};

// Firestore 데이터베이스 인스턴스 가져오기
export const getFirestore = (): admin.firestore.Firestore => {
  return admin.firestore();
};

// Cloud Logging (Stackdriver) 인스턴스 가져오기
// Firebase Admin SDK를 통해 직접 Cloud Logging을 사용하는 대신,
// Google Cloud Logging 라이브러리를 별도로 사용할 수도 있습니다.
// 여기서는 Firebase Admin SDK의 logging 기능을 사용하는 방식으로 예시를 들겠습니다.
// 하지만 실제 로깅은 별도의 logger.ts 모듈에서 처리할 예정이므로,
// 이 함수는 필요 시 추가로 구현하겠습니다.