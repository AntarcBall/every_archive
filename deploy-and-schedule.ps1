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

Write-Host "=== Google Cloud Deploy & Schedule Script (using Cloud Build) ==="
Write-Host "Project ID: $projectId"
Write-Host "Region: $region"
Write-Host "Service Name: $serviceName"
Write-Host "Scheduler Job Name: $schedulerJobName"
Write-Host "Scheduler Frequency: $schedulerFrequency"
Write-Host "Scheduler Timezone: $schedulerTimezone"
Write-Host "==========================================="

# 1. 현재 디렉토리를 .tar.gz로 압축 (Cloud Build에 업로드하기 위함)
Write-Host "1/5: Compressing source code..."
$sourceArchive = "source.tar.gz"
# .git, node_modules, dist 폴더는 제외
tar -czf $sourceArchive --exclude=.git --exclude=node_modules --exclude=dist .

# 2. Cloud Build로 이미지 빌드 및 푸시
Write-Host "2/5: Building and pushing Docker image using Cloud Build..."
$buildArgs = @(
  "builds", "submit", "--tag", $fullImageName, $sourceArchive,
  "--project", $projectId
)
& gcloud @buildArgs

if ($LASTEXITCODE -ne 0) {
  Write-Error "Cloud Build failed."
  # 임시 압축파일 삭제
  if (Test-Path $sourceArchive) { Remove-Item $sourceArchive }
  exit $LASTEXITCODE
}

# 임시 압축파일 삭제
if (Test-Path $sourceArchive) { Remove-Item $sourceArchive }
Write-Host "Docker image built and pushed successfully to $fullImageName"

# 3. Cloud Run에 서비스 배포
Write-Host "3/5: Deploying to Cloud Run..."
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

# 4. 배포된 서비스 URL 가져오기
Write-Host "4/5: Retrieving deployed service URL..."
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

# 5. Cloud Scheduler 작업 생성/업데이트
# Scheduler 리전 설정 (asia-northeast3가 Scheduler를 지원하는지 확인 필요)
$schedulerLocation = "asia-northeast1" # 일반적으로 지원됨
$crawlEndpointUrl = "$serviceUrl/crawl"

Write-Host "5/5: Setting up Cloud Scheduler job..."
$schedulerCreateArgs = @(
  "scheduler", "jobs", "create", "http", $schedulerJobName,
  "--schedule", $schedulerFrequency,
  "--uri", $crawlEndpointUrl,
  "--http-method", "GET",
  "--time-zone", $schedulerTimezone,
  "--location", $schedulerLocation,
  "--project", $projectId
)

# 먼저 생성 시도
& gcloud @schedulerCreateArgs

if ($LASTEXITCODE -ne 0) {
  Write-Warning "Cloud Scheduler job creation failed, might already exist. Attempting to update..."
  # 생성 실패하면 업데이트 시도
  $schedulerUpdateArgs = @(
    "scheduler", "jobs", "update", "http", $schedulerJobName,
    "--schedule", $schedulerFrequency,
    "--uri", $crawlEndpointUrl,
    "--http-method", "GET",
    "--time-zone", $schedulerTimezone,
    "--location", $schedulerLocation,
    "--project", $projectId
  )
  & gcloud @schedulerUpdateArgs

  if ($LASTEXITCODE -ne 0) {
    Write-Error "Cloud Scheduler job update also failed."
    exit $LASTEXITCODE
  } else {
    Write-Host "Cloud Scheduler job updated successfully!"
  }
} else {
  Write-Host "Cloud Scheduler job created successfully!"
}

Write-Host "=== Script execution finished ==="