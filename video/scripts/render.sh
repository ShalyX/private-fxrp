#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRAME_DIR="$VIDEO_DIR/build/frames"
CLIP_DIR="$VIDEO_DIR/build/clips"
DIST_DIR="$VIDEO_DIR/dist"
CONCAT_FILE="$VIDEO_DIR/build/clips.txt"
VIDEO_ONLY="$VIDEO_DIR/build/veyra-video-only.mp4"
SOUND_BED="$VIDEO_DIR/build/veyra-sound-bed.wav"
OUTPUT="$DIST_DIR/veyra-90s-demo-review-cut.mp4"

command -v convert >/dev/null || { echo "IMAGEMAGICK_REQUIRED" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "FFMPEG_REQUIRED" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "FFPROBE_REQUIRED" >&2; exit 1; }

mkdir -p "$CLIP_DIR" "$DIST_DIR"
find "$CLIP_DIR" -maxdepth 1 -type f -name '*.mp4' -delete
bash "$SCRIPT_DIR/build-frames.sh"

render_clip() {
  local name="$1"
  local duration="$2"
  local frames=$((duration * 30))
  local output="$CLIP_DIR/$name.mp4"
  local staged
  staged="$(mktemp --suffix=.mp4 "$CLIP_DIR/.${name}.XXXXXX")"

  ffmpeg -hide_banner -loglevel error -y \
    -loop 1 -i "$FRAME_DIR/$name.png" \
    -vf "scale=1984:1116,zoompan=z='min(zoom+0.00006,1.02)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$frames:s=1920x1080:fps=30,format=yuv420p" \
    -frames:v "$frames" -an \
    -c:v libx264 -preset veryfast -crf 18 -movflags +faststart \
    "$staged"

  ffprobe -v error -show_entries format=duration -of csv=p=0 "$staged" >/dev/null
  mv -f "$staged" "$output"
}

render_clip problem 6
render_clip landing 8
render_clip issuer 10
render_clip encryption 8
render_clip fcc 12
render_clip decision 8
render_clip access 9
render_clip recorded-proof 8
render_clip network-coston 2
render_clip network-extension 2
render_clip network-production 3
render_clip vault 4
render_clip consumer 4
render_clip cta 6

: > "$CONCAT_FILE"
for name in problem landing issuer encryption fcc decision access recorded-proof network-coston network-extension network-production vault consumer cta; do
  printf "file '%s'\n" "$CLIP_DIR/$name.mp4" >> "$CONCAT_FILE"
done

ffmpeg -hide_banner -loglevel error -y \
  -f concat -safe 0 -i "$CONCAT_FILE" \
  -c copy "$VIDEO_ONLY"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "sine=frequency=110:duration=90:sample_rate=48000" \
  -f lavfi -i "sine=frequency=164.81:duration=90:sample_rate=48000" \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.012:duration=90:sample_rate=48000" \
  -filter_complex "[0:a]volume=0.028[a0];[1:a]volume=0.018[a1];[2:a]lowpass=f=900,highpass=f=80,volume=0.11[a2];[a0][a1][a2]amix=inputs=3:normalize=0,afade=t=in:st=0:d=2,afade=t=out:st=87:d=3,loudnorm=I=-30:TP=-6:LRA=5,aresample=48000[a]" \
  -map "[a]" -c:a pcm_s16le "$SOUND_BED"

ffmpeg -hide_banner -loglevel error -y \
  -i "$VIDEO_ONLY" -i "$SOUND_BED" \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest \
  -movflags +faststart "$OUTPUT"

duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUTPUT")"
resolution="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$OUTPUT")"

echo "VEYRA_VIDEO_RENDERED file=$OUTPUT duration=$duration resolution=$resolution"
