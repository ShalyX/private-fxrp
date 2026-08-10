#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VISUAL="$VIDEO_DIR/dist/veyra-90s-demo-review-cut.mp4"
AUDIO="$VIDEO_DIR/build/veyra-final-mix.wav"
CAPTIONS="$VIDEO_DIR/CAPTIONS.srt"
OUTPUT="$VIDEO_DIR/dist/veyra-90s-demo-submission-master.mp4"

bash "$SCRIPT_DIR/render.sh"
bash "$SCRIPT_DIR/build-audio.sh"

ffmpeg -hide_banner -loglevel error -y \
  -i "$VISUAL" -i "$AUDIO" -i "$CAPTIONS" \
  -map 0:v:0 -map 1:a:0 -map 2:s:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 \
  -c:s mov_text -metadata:s:s:0 language=eng -disposition:s:0 default \
  -t 90 -movflags +faststart "$OUTPUT"

ffmpeg -hide_banner -loglevel error -i "$OUTPUT" -f null -

duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT")"
resolution="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$OUTPUT")"

echo "VEYRA_SUBMISSION_MASTER_RENDERED file=$OUTPUT duration=$duration resolution=$resolution voice=flite-slt"
