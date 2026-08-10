#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VISUAL="$VIDEO_DIR/dist/veyra-90s-demo-review-cut.mp4"
OUTPUT="$VIDEO_DIR/dist/veyra-90s-demo-submission-master.mp4"

bash "$SCRIPT_DIR/render.sh"

ffmpeg -hide_banner -loglevel error -y \
  -i "$VISUAL" \
  -map 0:v:0 -map 0:a:0 \
  -c copy -t 90 -movflags +faststart "$OUTPUT"

ffmpeg -hide_banner -loglevel error -i "$OUTPUT" -f null -

duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT")"
resolution="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$OUTPUT")"

echo "VEYRA_SUBMISSION_MASTER_RENDERED file=$OUTPUT duration=$duration resolution=$resolution voice=none"
