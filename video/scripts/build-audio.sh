#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AUDIO_DIR="$VIDEO_DIR/build/audio"
VOICE_DIR="$AUDIO_DIR/voice"
CUE_DIR="$AUDIO_DIR/cues"
BED="$AUDIO_DIR/bed.wav"
OUTPUT="$VIDEO_DIR/build/veyra-final-mix.wav"

command -v ffmpeg >/dev/null || { echo "FFMPEG_REQUIRED" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "FFPROBE_REQUIRED" >&2; exit 1; }

mkdir -p "$VOICE_DIR" "$CUE_DIR"

voice_texts=(
  "Protocols often need to know whether a wallet meets jurisdiction, risk, or investor requirements."
  "They should not need the underlying credential. Veyra separates private eligibility from public enforcement."
  "An authorized issuer signs a wallet-bound credential containing the applicant's jurisdiction, category, risk score, and expiry."
  "In the browser, Veyra retrieves the registered TEE public key and encrypts the full request before it leaves the device."
  "Flare Confidential Compute decrypts it inside the confidential boundary, verifies the issuer and committed policy, and evaluates the private fields."
  "Only a narrow result leaves: account, policy, eligibility, approved limit, expiry, and nonce."
  "AccessRegistry verifies the registered signer, policy commitment, issuer, expiry, and replay state before recording the pass."
  "A recorded Coston2 run issued the access pass through FCC,"
  "with the TEE registered as production."
  "The reference FXRP vault requires that pass before accepting deposits and enforces the approved dollar exposure limit with FTSOv2 pricing."
  "Applications consume the authorization, not the private credential."
  "Veyra. Prove eligibility. Not identity. Try it at veyra-fxrp dot web dot app."
)

voice_starts=(400 6200 14200 24200 32200 44200 52200 61200 72100 76200 81300 84100)
voice_slots=(5.5 7.5 9.5 7.5 11.4 7.4 8.5 7.4 3.7 5.0 2.5 5.6)

for index in "${!voice_texts[@]}"; do
  number="$(printf '%02d' "$((index + 1))")"
  text_file="$VOICE_DIR/$number.txt"
  raw_file="$VOICE_DIR/$number-raw.wav"
  voice_file="$VOICE_DIR/$number.wav"

  printf '%s\n' "${voice_texts[$index]}" > "$text_file"

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "flite=textfile='$text_file':voice=slt" \
    -ar 48000 -ac 1 -c:a pcm_s16le "$raw_file"

  raw_duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$raw_file")"
  tempo="$(awk -v duration="$raw_duration" -v slot="${voice_slots[$index]}" 'BEGIN {
    if (duration > slot) {
      factor = duration / slot;
      if (factor > 2.0) factor = 2.0;
      printf "%.4f", factor;
    } else {
      print "1.0000";
    }
  }')"

  ffmpeg -hide_banner -loglevel error -y \
    -i "$raw_file" \
    -af "atempo=$tempo,highpass=f=85,lowpass=f=7800,equalizer=f=220:t=q:w=1.1:g=-2,equalizer=f=3200:t=q:w=1.0:g=1.5,acompressor=threshold=0.10:ratio=2.2:attack=8:release=90:makeup=1.2,loudnorm=I=-18:TP=-3:LRA=5,aresample=48000" \
    -ar 48000 -ac 1 -c:a pcm_s16le "$voice_file"
done

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "sine=frequency=55:duration=90:sample_rate=48000" \
  -f lavfi -i "sine=frequency=110:duration=90:sample_rate=48000" \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.010:duration=90:sample_rate=48000" \
  -filter_complex "[0:a]volume=0.018[a0];[1:a]volume=0.010[a1];[2:a]lowpass=f=1100,highpass=f=90,volume=0.070[a2];[a0][a1][a2]amix=inputs=3:normalize=0,afade=t=in:st=0:d=2,afade=t=out:st=87:d=3,loudnorm=I=-34:TP=-9:LRA=4,aresample=48000[bed]" \
  -map "[bed]" -ar 48000 -ac 1 -c:a pcm_s16le "$BED"

make_tone() {
  local output="$1"
  local frequency="$2"
  local duration="$3"
  local volume="$4"
  local fade_start
  local fade_duration

  fade_start="$(awk -v d="$duration" 'BEGIN { printf "%.3f", d * 0.45 }')"
  fade_duration="$(awk -v d="$duration" 'BEGIN { printf "%.3f", d * 0.55 }')"

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=frequency=$frequency:duration=$duration:sample_rate=48000" \
    -af "volume=$volume,afade=t=in:st=0:d=0.02,afade=t=out:st=$fade_start:d=$fade_duration" \
    -ar 48000 -ac 1 -c:a pcm_s16le "$output"
}

make_tone "$CUE_DIR/opening.wav" 70 0.55 0.16
make_tone "$CUE_DIR/reveal.wav" 260 0.38 0.11
make_tone "$CUE_DIR/confirm.wav" 620 0.28 0.08
make_tone "$CUE_DIR/tick.wav" 880 0.10 0.055
make_tone "$CUE_DIR/success.wav" 440 0.62 0.11
make_tone "$CUE_DIR/proof.wav" 520 0.20 0.07
make_tone "$CUE_DIR/reject.wav" 120 0.42 0.10
make_tone "$CUE_DIR/brand.wav" 330 0.90 0.12

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.12:duration=0.70:sample_rate=48000" \
  -af "highpass=f=350,lowpass=f=3200,volume=0.11,afade=t=in:st=0:d=0.10,afade=t=out:st=0.35:d=0.35" \
  -ar 48000 -ac 1 -c:a pcm_s16le "$CUE_DIR/sweep.wav"

mix_inputs=(-i "$BED")
mix_filter="[0:a]volume=1.0[bed];"
mix_labels="[bed]"
input_index=1
mix_count=1

for index in "${!voice_starts[@]}"; do
  number="$(printf '%02d' "$((index + 1))")"
  mix_inputs+=(-i "$VOICE_DIR/$number.wav")
  mix_filter+="[$input_index:a]adelay=${voice_starts[$index]}|${voice_starts[$index]},volume=1.0[v$index];"
  mix_labels+="[v$index]"
  input_index=$((input_index + 1))
  mix_count=$((mix_count + 1))
done

cue_files=(
  opening reveal confirm sweep
  tick tick tick tick
  confirm success
  proof proof proof
  reject
  tick tick tick tick
  brand
)
cue_starts=(
  0 6000 14000 24000
  34200 36200 38200 40200
  44200 62000
  69200 71200 73200
  76200
  80300 81100 81900 82700
  84000
)

for index in "${!cue_files[@]}"; do
  cue_name="${cue_files[$index]}"
  mix_inputs+=(-i "$CUE_DIR/$cue_name.wav")
  mix_filter+="[$input_index:a]adelay=${cue_starts[$index]}|${cue_starts[$index]}[c$index];"
  mix_labels+="[c$index]"
  input_index=$((input_index + 1))
  mix_count=$((mix_count + 1))
done

mix_filter+="$mix_labels amix=inputs=$mix_count:normalize=0,alimiter=limit=0.92:attack=5:release=80,loudnorm=I=-16:TP=-1.5:LRA=7,atrim=0:90,aresample=48000[mix]"

ffmpeg -hide_banner -loglevel error -y \
  "${mix_inputs[@]}" \
  -filter_complex "$mix_filter" \
  -map "[mix]" -t 90 -ar 48000 -ac 1 -c:a pcm_s16le "$OUTPUT"

duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT")"
echo "VEYRA_FINAL_AUDIO_READY file=$OUTPUT duration=$duration voice=flite-slt"
