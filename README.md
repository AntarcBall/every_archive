# everytime-crawler

에브리타임 게시판 크롤러 및 아카이빙 서버

## 프로젝트 구조

- `src/`: TypeScript 소스 코드
- `dist/`: 컴파일된 JavaScript 코드
- `Dockerfile`: Cloud Run용 컨테이너 이미지 정의
- `package.json`: 프로젝트 메타데이터 및 스크립트
- `tsconfig.json`: TypeScript 컴파일 설정
- `crawlconfig.json`: 크롤링 설정 (게시판 ID, 글 개수 등)

## 개발 시작하기

1. 의존성 설치: `npm install`
2. 개발 서버 실행: `npm run dev`
3. 빌드: `npm run build`
4. 프로덕션 서버 실행: `npm start`

## 개발용 데이터 재설정

Firestore에 저장된 게시글(`articles`)과 로그(`logs`) 데이터를 모두 삭제하고, 처음부터 다시 크롤링을 시작하고 싶을 때 사용합니다. **이 명령어는 개발 및 테스트 환경에서만 사용하세요. 프로덕션 데이터는 절대 삭제하지 않습니다.**

1.  **필수 조건**: `GOOGLE_APPLICATION_CREDENTIALS` 환경 변수가 올바르게 설정되어 있어야 합니다 (Firebase 서비스 계정 키).

2.  **데이터 삭제 및 재크롤링 실행**:
    ```bash
    # 1. 데이터 삭제 스크립트 실행
    npx ts-node src/scripts/resetData.ts

    # 2. 서버가 실행 중이지 않다면, 새 터미널에서 서버 시작
    # npm run dev

    # 3. 초기 크롤링 실행 (최초 20개 글 아카이빙 포함)
    # crawlconfig.json에서 limitNum을 20으로 임시 변경하거나,
    # 별도의 초기 아카이빙 로직이 구현되어 있다면 해당 엔드포인트 호출.
    # 현재는 수동으로 /crawl 엔드포인트를 호출하여 최신 N개 글을 가져옵니다.
    curl http://localhost:8080/crawl
    # 또는 브라우저에서 http://localhost:8080/crawl 접속
    ```

## Docker

1. 이미지 빌드: `docker build -t everytime-crawler .`
2. 컨테이너 실행: `docker run -p 8080:8080 everytime-crawler`