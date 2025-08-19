# everytime-crawler

에브리타임 게시판 크롤러 및 아카이빙 서버

## 프로젝트 구조

- `src/`: TypeScript 소스 코드
- `dist/`: 컴파일된 JavaScript 코드
- `Dockerfile`: Cloud Run용 컨테이너 이미지 정의
- `package.json`: 프로젝트 메타데이터 및 스크립트
- `tsconfig.json`: TypeScript 컴파일 설정

## 개발 시작하기

1. 의존성 설치: `npm install`
2. 개발 서버 실행: `npm run dev`
3. 빌드: `npm run build`
4. 프로덕션 서버 실행: `npm start`

## Docker

1. 이미지 빌드: `docker build -t everytime-crawler .`
2. 컨테이너 실행: `docker run -p 8080:8080 everytime-crawler`