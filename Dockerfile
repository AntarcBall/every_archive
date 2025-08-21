# Multi-stage Dockerfile for TypeScript application

######################
# 1. 빌드 스테이지 (Build Stage)
######################
FROM node:18 AS builder

# 작업 디렉토리 설정
WORKDIR /app

# package.json 및 package-lock.json 복사
COPY package*.json ./

# 모든 의존성 설치 (빌드 및 실행 모두 필요)
RUN npm ci

# 소스 코드 복사
COPY . .

# TypeScript 코드 빌드 (dist/ 디렉토리 생성)
RUN npm run build

######################
# 2. 실행 스테이지 (Run Stage)
######################
FROM node:18-slim

# 작업 디렉토리 설정
WORKDIR /app

# 빌드 스테이지에서 생성된 컴파일된 코드와 package.json 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/crawlconfig.json ./

# 실행에 필요한 의존성만 설치 (선택 1: 새로 설치 - 권장)
RUN npm ci --only=production

# 실행에 필요한 의존성만 설치 (선택 2: 빌드 스테이지의 node_modules에서 복사 - 더 빠를 수 있음)
# COPY --from=builder /app/node_modules ./node_modules

# 포트 노출
EXPOSE 8080

# 애플리케이션 실행
CMD [ "node", "dist/index.js" ]