import express from 'express';
import { initializeFirebase } from './firebase';
import { crawlAndArchive } from './crawler';
import { getLogs } from './logger';

const app = express();
const port = process.env.PORT || 8080;

// Firebase 초기화
initializeFirebase();

// 기본 헬스체크 엔드포인트
app.get('/', (req, res) => {
  res.status(200).send('Everytime Crawler Server is running');
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

// 로그 조회 엔드포인트
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