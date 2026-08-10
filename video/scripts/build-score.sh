#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCORE_DIR="$VIDEO_DIR/build/score"
SECTION_DIR="$SCORE_DIR/sections"
OUTPUT="$SCORE_DIR/veyra-score.wav"

command -v ffmpeg >/dev/null || { echo "FFMPEG_REQUIRED" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "FFPROBE_REQUIRED" >&2; exit 1; }

mkdir -p "$SECTION_DIR"

make_pad() {
  local name="$1"
  local duration="$2"
  local root="$3"
  local third="$4"
  local fifth="$5"
  local gain="$6"
  local fade_out

  fade_out="$(awk -v duration="$duration" 'BEGIN { printf "%.3f", duration - 1.2 }')"

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=frequency=$root:duration=$duration:sample_rate=48000" \
    -f lavfi -i "sine=frequency=$third:duration=$duration:sample_rate=48000" \
    -f lavfi -i "sine=frequency=$fifth:duration=$duration:sample_rate=48000" \
    -f lavfi -i "anoisesrc=color=pink:amplitude=0.006:duration=$duration:sample_rate=48000" \
    -filter_complex "[0:a]volume=$gain,tremolo=f=0.18:d=0.10[r];[1:a]volume=$gain,tremolo=f=0.15:d=0.08[t];[2:a]volume=$gain,tremolo=f=0.12:d=0.07[f];[3:a]lowpass=f=1400,highpass=f=180,volume=0.035[n];[r][t][f][n]amix=inputs=4:normalize=0,lowpass=f=2600,aecho=0.75:0.32:70|145:0.18|0.08,afade=t=in:st=0:d=1.0,afade=t=out:st=$fade_out:d=1.2,pan=stereo|c0=c0|c1=c0,haas=left_delay=3.5:right_delay=6.5:right_phase=false:side_gain=0.35[pad]" \
    -map "[pad]" -ar 48000 -ac 2 -c:a pcm_s16le "$SECTION_DIR/$name.wav"
}

make_pulse() {
  local name="$1"
  local duration="$2"
  local frequency="$3"
  local rate="$4"
  local gain="$5"
  local fade_out

  fade_out="$(awk -v duration="$duration" 'BEGIN { printf "%.3f", duration - 0.8 }')"

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=frequency=$frequency:duration=$duration:sample_rate=48000" \
    -af "tremolo=f=$rate:d=0.82,volume=$gain,lowpass=f=520,afade=t=in:st=0:d=0.5,afade=t=out:st=$fade_out:d=0.8,pan=stereo|c0=0.82*c0|c1=c0" \
    -ar 48000 -ac 2 -c:a pcm_s16le "$SECTION_DIR/$name.wav"
}

make_pad intro 8 110.00 130.81 164.81 0.040
make_pad reveal 20 87.31 110.00 130.81 0.045
make_pad privacy 20 73.42 87.31 110.00 0.043
make_pad fcc 22 82.41 98.00 123.47 0.048
make_pad decision 18 130.81 164.81 196.00 0.046
make_pad proof 17 220.00 261.63 329.63 0.026
make_pad payoff 12 87.31 110.00 130.81 0.046
make_pad resolve 8 130.81 164.81 220.00 0.052

make_pulse reveal-pulse 18 55.00 2.0 0.085
make_pulse fcc-pulse 37 73.42 2.0 0.072
make_pulse payoff-pulse 14 65.41 2.0 0.082

section_files=(
  intro reveal privacy fcc decision proof payoff resolve
  reveal-pulse fcc-pulse payoff-pulse
)
section_starts=(
  0 5000 23000 31000 43000 60000 75000 82000
  6000 24000 76000
)

mix_inputs=()
mix_filter=""
mix_labels=""

for index in "${!section_files[@]}"; do
  mix_inputs+=(-i "$SECTION_DIR/${section_files[$index]}.wav")
  mix_filter+="[$index:a]adelay=${section_starts[$index]}|${section_starts[$index]}[s$index];"
  mix_labels+="[s$index]"
done

mix_filter+="$mix_labels amix=inputs=${#section_files[@]}:normalize=0,highpass=f=45,lowpass=f=4800,afade=t=out:st=87:d=3,loudnorm=I=-20:TP=-3:LRA=8,alimiter=limit=0.70:attack=5:release=100:level=false,aresample=48000,apad=pad_dur=1,atrim=end=90[score]"

ffmpeg -hide_banner -loglevel error -y \
  "${mix_inputs[@]}" \
  -filter_complex "$mix_filter" \
  -map "[score]" -t 90 -ar 48000 -ac 2 -c:a pcm_s16le "$OUTPUT"

duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT")"
echo "VEYRA_SCORE_READY file=$OUTPUT duration=$duration"
