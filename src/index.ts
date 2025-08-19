import express from 'express';
import path from 'path'; // 정적 파일 경로 설정을 위해 추가
import { initializeFirebase } from './firebase';
import { crawlAndArchive } from './crawler';
import { getLogs } from './logger';

const app = express();
const port = process.env.PORT || 8080;

// Firebase 초기화
initializeFirebase();

// 정적 파일 제공 미들웨어 추가 (src/public 디렉토리)
// 예: http://localhost:8080/logs.html 로 접근 가능
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// 기본 루트 엔드포인트: logs.html 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'logs.html'));
});

// 크롤링 및 아카이빙 엔드포인트 (주기적 실행을 위한 수동 트리거)
app.get('/crawl', async (req, res) => {
  try {
    await crawlAndArchive();
    res.status(200).send('Crawling and archiving completed');
  } catch (error) {
    console.error('Crawling error:', error);
    res.status(500).send('Crawling failed');
  }
});

// 로그 조회 API 엔드포인트 (JSON 응답)
app.get('/logs', async (req, res) => {
  try {
    const logs = await getLogs();
    res.status(200).json(logs);
  } catch (error) {
    console.error('Log retrieval error:', error);
    res.status(500).send('Failed to retrieve logs');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});