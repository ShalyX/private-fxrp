#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="project-d79f9e62-d832-4631-9f6"
PROJECT_NUMBER="351242117184"
REGION="us-west1"
REPOSITORY="private-fxrp"
SERVICE="private-fxrp-access-desk"
TAG="v0.5.0"
RUNTIME_SA_NAME="private-fxrp-web"
RUNTIME_SA="$RUNTIME_SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
PROXY_URL="https://augusta-unjoking-sarahi.ngrok-free.dev"
BUILD_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
BUILD_MEMBER="serviceAccount:$BUILD_SA"
BUILD_ROLE="roles/cloudbuild.builds.builder"
SOURCE_BUCKET="gs://${PROJECT_ID}_cloudbuild"
SOURCE_ROLE="roles/storage.objectViewer"
IMAGE_BASE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/private-fxrp-web"

PROJECT_ROLE_ADDED=false
BUCKET_ROLE_ADDED=false

cleanup() {
  if [[ "$BUCKET_ROLE_ADDED" == "true" ]]; then
    gcloud storage buckets remove-iam-policy-binding "$SOURCE_BUCKET" \
      --member="$BUILD_MEMBER" \
      --role="$SOURCE_ROLE" \
      --quiet >/dev/null 2>&1 || true
  fi
  if [[ "$PROJECT_ROLE_ADDED" == "true" ]]; then
    gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
      --member="$BUILD_MEMBER" \
      --role="$BUILD_ROLE" \
      --condition=None \
      --quiet >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

for command in gcloud curl; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "ERROR: $command is required" >&2
    exit 1
  }
done

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

if ! gcloud iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
    --display-name="Private FXRP public web runtime"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="$BUILD_MEMBER" \
  --role="$BUILD_ROLE" \
  --condition=None \
  --quiet >/dev/null
PROJECT_ROLE_ADDED=true

gcloud storage buckets add-iam-policy-binding "$SOURCE_BUCKET" \
  --member="$BUILD_MEMBER" \
  --role="$SOURCE_ROLE" \
  --quiet >/dev/null
BUCKET_ROLE_ADDED=true

gcloud builds submit --config=cloudbuild.web.yaml .

IMAGE_DIGEST="$(
  gcloud artifacts docker images describe "$IMAGE_BASE:$TAG" \
    --format='value(image_summary.digest)'
)"
[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  echo "ERROR: Artifact Registry returned an invalid image digest" >&2
  exit 1
}

gcloud run deploy "$SERVICE" \
  --region="$REGION" \
  --image="$IMAGE_BASE@$IMAGE_DIGEST" \
  --service-account="$RUNTIME_SA" \
  --allow-unauthenticated \
  --ingress=all \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=40 \
  --min-instances=0 \
  --max-instances=2 \
  --timeout=30s \
  --startup-probe=httpGet.path=/health,initialDelaySeconds=0,timeoutSeconds=3,periodSeconds=5,failureThreshold=12 \
  --set-env-vars="EXT_PROXY_URL=$PROXY_URL" \
  --labels=app=private-fxrp,network=coston2,release=v0-5-0 \
  --quiet

SERVICE_URL="$(
  gcloud run services describe "$SERVICE" \
    --region="$REGION" \
    --format='value(status.url)'
)"
[[ "$SERVICE_URL" =~ ^https:// ]] || {
  echo "ERROR: Cloud Run did not return an HTTPS service URL" >&2
  exit 1
}

curl --fail --silent --show-error "$SERVICE_URL/health"
curl --fail --silent --show-error "$SERVICE_URL/api/tee/info" >/dev/null
curl --fail --silent --show-error "$SERVICE_URL/" | grep -q "Veyra"

echo
echo "PRIVATE_FXRP_WEB_DEPLOYED url=$SERVICE_URL image=$IMAGE_BASE@$IMAGE_DIGEST"
