# deploy-and-schedule.ps1

# gcloud-config.json 파일에서 설정 읽기
$configFile = "gcloud-config.json"
if (-not (Test-Path $configFile)) {
  Write-Error "Configuration file $configFile not found!"
  exit 1
}

try {
  $config = Get-Content $configFile | ConvertFrom-Json
} catch {
  Write-Error "Failed to parse $configFile. Please check the JSON format."
  exit 1
}

$projectId = $config.project_id
$region = $config.region
$serviceName = $config.service_name
$schedulerJobName = $config.scheduler_job_name
$schedulerFrequency = $config.scheduler_frequency
$schedulerTimezone = $config.scheduler_timezone

$imageName = $serviceName
$fullImageName = "gcr.io/$projectId/$imageName"

Write-Host "=== Google Cloud Deploy & Schedule Script ==="
Write-Host "Project ID: $projectId"
Write-Host "Region: $region"
Write-Host "Service Name: $serviceName"
Write-Host "Scheduler Job Name: $schedulerJobName"
Write-Host "Scheduler Frequency: $schedulerFrequency"
Write-Host "Scheduler Timezone: $schedulerTimezone"
Write-Host "==========================================="

# 1. Docker 이미지 빌드
Write-Host "1/4: Building Docker image..."
docker build -t $imageName .

# 2. Docker 이미지 태그
Write-Host "2/4: Tagging Docker image..."
docker tag $imageName $fullImageName

# 3. Google Container Registry에 이미지 푸시
Write-Host "3/4: Pushing Docker image to Google Container Registry..."
docker push $fullImageName

# 4. Cloud Run에 서비스 배포
Write-Host "4/4: Deploying to Cloud Run..."
$deployArgs = @(
  "run", "deploy", $serviceName,
  "--image", $fullImageName,
  "--platform", "managed",
  "--region", $region,
  "--allow-unauthenticated",
  "--project", $projectId
)
& gcloud @deployArgs

if ($LASTEXITCODE -ne 0) {
  Write-Error "Cloud Run deployment failed."
  exit $LASTEXITCODE
}

Write-Host "Deployment completed successfully!"

# 5. 배포된 서비스 URL 가져오기
Write-Host "5/5: Retrieving deployed service URL..."
$describeArgs = @(
  "run", "services", "describe", $serviceName,
  "--platform", "managed",
  "--region", $region,
  "--project", $projectId,
  "--format", "value(status.url)"
)
$serviceUrl = & gcloud @describeArgs

if ($LASTEXITCODE -ne 0 -or -not $serviceUrl) {
  Write-Warning "Failed to retrieve service URL. You will need to set the Scheduler URI manually."
  $serviceUrl = "https://YOUR_SERVICE_URL_HERE.run.app" # Placeholder
} else {
  Write-Host "Deployed service URL: $serviceUrl"
}

# 6. Cloud Scheduler 작업 생성/업데이트
# Scheduler 리전 설정 (asia-northeast3가 Scheduler를 지원하는지 확인 필요)
$schedulerLocation = "asia-northeast1" # 일반적으로 지원됨
$crawlEndpointUrl = "$serviceUrl/crawl"

Write-Host "6/6: Setting up Cloud Scheduler job..."
$schedulerArgs = @(
  "scheduler", "jobs", "create", "http", $schedulerJobName,
  "--schedule", $schedulerFrequency,
  "--uri", $crawlEndpointUrl,
  "--http-method", "GET",
  "--time-zone", $schedulerTimezone,
  "--location", $schedulerLocation,
  "--project", $projectId
)
& gcloud @schedulerArgs

if ($LASTEXITCODE -ne 0) {
  Write-Warning "Cloud Scheduler job creation might have failed or the job already exists. You may need to update it manually."
  Write-Host "To update an existing job, you can use:"
  Write-Host "gcloud scheduler jobs update http $schedulerJobName --schedule=`"$schedulerFrequency`" --uri=`"$crawlEndpointUrl`" --http-method=GET --time-zone=$schedulerTimezone --location=$schedulerLocation --project=$projectId"
} else {
  Write-Host "Cloud Scheduler job setup completed successfully!"
}

Write-Host "=== Script execution finished ==="