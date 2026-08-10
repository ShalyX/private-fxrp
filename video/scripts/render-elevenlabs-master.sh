#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VOICE="$VIDEO_DIR/assets/audio/veyra-narration-ryan.mp3"
VISUAL="$VIDEO_DIR/dist/veyra-90s-demo-review-cut.mp4"
CAPTIONS="$VIDEO_DIR/CAPTIONS.srt"
WORK_DIR="$VIDEO_DIR/build/elevenlabs"
SEGMENT_DIR="$WORK_DIR/segments"
VOICE_SOURCE="$WORK_DIR/voice-source.wav"
VOICE_TRACK="$WORK_DIR/voice-track.wav"
SCORE="$VIDEO_DIR/build/score/veyra-score.wav"
FINAL_MIX="$WORK_DIR/final-mix.wav"
OUTPUT="$VIDEO_DIR/dist/veyra-90s-demo-elevenlabs-master.mp4"
STAGED_OUTPUT="$(mktemp --suffix=.mp4 "$VIDEO_DIR/dist/.veyra-elevenlabs.XXXXXX")"

command -v ffmpeg >/dev/null || { echo "FFMPEG_REQUIRED" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "FFPROBE_REQUIRED" >&2; exit 1; }
[[ -f "$VOICE" ]] || { echo "ELEVENLABS_VOICE_REQUIRED file=$VOICE" >&2; exit 1; }

mkdir -p "$SEGMENT_DIR" "$VIDEO_DIR/dist"
bash "$SCRIPT_DIR/render.sh"
bash "$SCRIPT_DIR/build-score.sh"

ffmpeg -hide_banner -loglevel error -y \
  -i "$VOICE" \
  -af "highpass=f=75,lowpass=f=10000,equalizer=f=230:t=q:w=1.1:g=-1.5,equalizer=f=3200:t=q:w=1.0:g=1.2,acompressor=threshold=0.08:ratio=2.0:attack=10:release=120:makeup=1.1,loudnorm=I=-19:TP=-2:LRA=5,aresample=48000" \
  -ar 48000 -ac 1 -c:a pcm_s16le "$VOICE_SOURCE"

source_starts=(0.104 9.357 13.945 23.215 32.489 41.638 52.124 61.131 73.019 81.566 84.774)
source_ends=(8.590 13.125 22.389 31.744 41.000 51.162 60.363 72.159 81.195 83.870 95.375)
target_starts=(200 8800 12800 24000 32200 44200 52200 61200 76000 81300 84000)
target_slots=(8.4 3.8 11.0 7.8 11.4 7.6 8.6 14.6 5.0 2.6 5.7)

segment_files=()

for index in "${!source_starts[@]}"; do
  number="$(printf '%02d' "$((index + 1))")"
  trimmed="$SEGMENT_DIR/$number-trimmed.wav"
  processed="$SEGMENT_DIR/$number.wav"

  ffmpeg -hide_banner -loglevel error -y \
    -ss "${source_starts[$index]}" -to "${source_ends[$index]}" \
    -i "$VOICE_SOURCE" \
    -af "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-42dB:stop_periods=-1:stop_duration=0.35:stop_threshold=-42dB:stop_silence=0.15" \
    -ar 48000 -ac 1 -c:a pcm_s16le "$trimmed"

  duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$trimmed")"
  tempo="$(awk -v duration="$duration" -v slot="${target_slots[$index]}" 'BEGIN {
    factor = duration / slot;
    if (factor < 1.0) factor = 1.0;
    printf "%.5f", factor;
  }')"

  ffmpeg -hide_banner -loglevel error -y \
    -i "$trimmed" \
    -af "rubberband=tempo=$tempo:pitch=1.0:transients=smooth:detector=soft:formant=preserved,afade=t=in:st=0:d=0.025" \
    -ar 48000 -ac 1 -c:a pcm_s16le "$processed"

  segment_files+=("$processed")
done

mix_inputs=()
mix_filter=""
mix_labels=""

for index in "${!segment_files[@]}"; do
  mix_inputs+=(-i "${segment_files[$index]}")
  mix_filter+="[$index:a]adelay=${target_starts[$index]}|${target_starts[$index]}[v$index];"
  mix_labels+="[v$index]"
done

mix_filter+="$mix_labels amix=inputs=${#segment_files[@]}:normalize=0,atrim=0:90,apad=whole_dur=90,aresample=48000[voice]"

ffmpeg -hide_banner -loglevel error -y \
  "${mix_inputs[@]}" \
  -filter_complex "$mix_filter" \
  -map "[voice]" -t 90 -ar 48000 -ac 1 -c:a pcm_s16le "$VOICE_TRACK"

ffmpeg -hide_banner -loglevel error -y \
  -i "$SCORE" -i "$VOICE_TRACK" \
  -filter_complex "[1:a]pan=stereo|c0=c0|c1=c0,asplit=2[voice_sc][voice_mix];[0:a][voice_sc]sidechaincompress=threshold=0.020:ratio=7:attack=18:release=260[ducked];[ducked]volume=0.92[score];[score][voice_mix]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7,alimiter=limit=0.84:attack=5:release=80:level=false,volume=-0.8dB,atrim=0:90,aresample=48000[mix]" \
  -map "[mix]" -t 90 -ar 48000 -ac 2 -c:a pcm_s16le "$FINAL_MIX"

ffmpeg -hide_banner -loglevel error -y \
  -i "$VISUAL" -i "$FINAL_MIX" -i "$CAPTIONS" \
  -map 0:v:0 -map 1:a:0 -map 2:s:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 \
  -c:s mov_text -metadata:s:s:0 language=eng -disposition:s:0 default \
  -t 90 -movflags +faststart "$STAGED_OUTPUT"

ffprobe -v error -show_entries format=duration -of csv=p=0 "$STAGED_OUTPUT" >/dev/null
mv -f "$STAGED_OUTPUT" "$OUTPUT"

ffmpeg -hide_banner -loglevel error -i "$OUTPUT" -f null -

duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT")"
resolution="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$OUTPUT")"

echo "VEYRA_ELEVENLABS_MASTER_RENDERED file=$OUTPUT duration=$duration resolution=$resolution voice=ryan-product-reviewer"
