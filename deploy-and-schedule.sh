#!/bin/bash

# gcloud-config.json 파일에서 설정 읽기
CONFIG_FILE="gcloud-config.json"

# jq가 설치되어 있어야 함. (sudo apt-get install jq 또는 brew install jq)
if ! command -v jq &> /dev/null
then
    echo "jq could not be found. Please install jq (https://stedolan.github.io/jq/)"
    exit 1
fi

PROJECT_ID=$(jq -r '.project_id' $CONFIG_FILE)
REGION=$(jq -r '.region' $CONFIG_FILE)
SERVICE_NAME=$(jq -r '.service_name' $CONFIG_FILE)
SCHEDULER_JOB_NAME=$(jq -r '.scheduler_job_name' $CONFIG_FILE)
SCHEDULER_FREQUENCY=$(jq -r '.scheduler_frequency' $CONFIG_FILE)
SCHEDULER_TIMEZONE=$(jq -r '.scheduler_timezone' $CONFIG_FILE)

IMAGE_NAME="$SERVICE_NAME"
FULL_IMAGE_NAME="gcr.io/$PROJECT_ID/$IMAGE_NAME"

echo "=== Google Cloud Deploy & Schedule Script ==="
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Service Name: $SERVICE_NAME"
echo "Scheduler Job Name: $SCHEDULER_JOB_NAME"
echo "Scheduler Frequency: $SCHEDULER_FREQUENCY"
echo "Scheduler Timezone: $SCHEDULER_TIMEZONE"
echo "==========================================="

# 1. Docker 이미지 빌드
echo "1/4: Building Docker image..."
docker build -t $IMAGE_NAME .

# 2. Docker 이미지 태그
echo "2/4: Tagging Docker image..."
docker tag $IMAGE_NAME $FULL_IMAGE_NAME

# 3. Google Container Registry에 이미지 푸시
echo "3/4: Pushing Docker image to Google Container Registry..."
docker push $FULL_IMAGE_NAME

# 4. Cloud Run에 서비스 배포
echo "4/4: Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $FULL_IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --project $PROJECT_ID

# 배포 후 서비스 URL 가져오기 (선택사항, 로깅용)
# SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --project $PROJECT_ID --format 'value(status.url)')
# echo "Deployed service URL: $SERVICE_URL"

echo "Deployment completed successfully!"

# 5. Cloud Scheduler 작업 생성/업데이트 (선택사항)
echo "5/5: Setting up Cloud Scheduler job..."
# 먼저, 사용 가능한 위치 목록 확인 (https://cloud.google.com/scheduler/docs#locations)
# asia-northeast3는 Scheduler를 지원하는지 확인 필요. 지원하지 않으면 가장 가까운 리전 선택.
# 예를 들어 asia-northeast1 은 일반적으로 지원됨.
# 여기서는 asia-northeast1을 사용하는 예시. 필요시 gcloud-config.json에서 region_scheduler로 분리 가능.

SCHEDULER_LOCATION="asia-northeast1" # Scheduler가 지원하는 리전

# Scheduler 작업 생성 (이미 존재하면 업데이트)
gcloud scheduler jobs create http $SCHEDULER_JOB_NAME \
  --schedule="$SCHEDULER_FREQUENCY" \
  --uri="https://$SERVICE_NAME-$UNIQUE_HASH.$REGION.run.app/crawl" \
  --http-method=GET \
  --time-zone=$SCHEDULER_TIMEZONE \
  --location=$SCHEDULER_LOCATION \
  --project=$PROJECT_ID

# 위 명령어에서 URI 부분은 배포 후 실제 Cloud Run 서비스 URL을 넣어야 합니다.
# 이 URL은 배포 명령어의 출력에서 확인하거나, 별도로 gcloud run services describe 명령어로 조회해야 합니다.
# 예: gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --project $PROJECT_ID --format 'value(status.url)'
# 이를 스크립트에서 자동으로 처리하려면 추가 로직이 필요합니다.

echo "Cloud Scheduler job setup command executed. Please verify the URI in the command matches your deployed Cloud Run service URL."
echo "You might need to manually update the URI in the Cloud Scheduler job if it's not correct."