#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ID="project-d79f9e62-d832-4631-9f6"
PROJECT_NUMBER="351242117184"
ZONE="us-west1-b"
VM_NAME="private-fxrp-coston2"
REGISTRY="us-west1-docker.pkg.dev"
REPOSITORY="private-fxrp"
TAG="v0.4.0"
STARTUP="scripts/gcp/private-fxrp-vm-startup-v0.3.0.sh"
BUILD_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
BUILD_MEMBER="serviceAccount:$BUILD_SA"
BUILD_ROLE="roles/cloudbuild.builds.builder"
SOURCE_BUCKET="gs://${PROJECT_ID}_cloudbuild"
SOURCE_ROLE="roles/storage.objectViewer"

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

gcloud config set project "$PROJECT_ID"

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

gcloud builds submit --config=cloudbuild.yaml .

BASE="$REGISTRY/$PROJECT_ID/$REPOSITORY"
TEE_DIGEST="$(
  gcloud artifacts docker images describe "$BASE/private-fxrp-tee:$TAG" \
    --format='value(image_summary.digest)'
)"
PROXY_DIGEST="$(
  gcloud artifacts docker images describe "$BASE/private-fxrp-proxy:$TAG" \
    --format='value(image_summary.digest)'
)"

for digest in "$TEE_DIGEST" "$PROXY_DIGEST"; do
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || {
    echo "Invalid image digest returned by Artifact Registry" >&2
    exit 1
  }
done

sed -i -E \
  "s#private-fxrp-tee@sha256:[0-9a-f]{64}#private-fxrp-tee@$TEE_DIGEST#" \
  "$STARTUP"
sed -i -E \
  "s#private-fxrp-proxy@sha256:[0-9a-f]{64}#private-fxrp-proxy@$PROXY_DIGEST#" \
  "$STARTUP"

bash -n "$STARTUP"

gcloud compute instances add-metadata "$VM_NAME" \
  --zone="$ZONE" \
  --metadata-from-file="startup-script=$STARTUP"

gcloud compute instances reset "$VM_NAME" --zone="$ZONE"

echo "PRIVATE_FXRP_V040_RESET_SENT"
echo "TEE_IMAGE=$BASE/private-fxrp-tee@$TEE_DIGEST"
echo "PROXY_IMAGE=$BASE/private-fxrp-proxy@$PROXY_DIGEST"
