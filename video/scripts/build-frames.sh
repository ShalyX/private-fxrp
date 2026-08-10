#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CAPTURE_DIR="$VIDEO_DIR/assets/captures"
GRAPHIC_DIR="$VIDEO_DIR/assets/graphics"
FRAME_DIR="$VIDEO_DIR/build/frames"
LOGO="$VIDEO_DIR/../web/public/veyra-mark.png"

mkdir -p "$FRAME_DIR"

for graphic in problem encryption fcc decision recorded-proof consumer cta; do
  ffmpeg -hide_banner -loglevel error -y \
    -i "$GRAPHIC_DIR/$graphic.svg" \
    -frames:v 1 "$FRAME_DIR/$graphic.png"
done

convert "$FRAME_DIR/cta.png" \
  \( "$LOGO" -resize 80x80 \) \
  -geometry +170+165 -composite \
  "$FRAME_DIR/cta.png"

make_ui_frame() {
  local source="$1"
  local output="$2"
  local crop_geometry="$3"
  local label="$4"
  local caption="$5"

  local staged="$FRAME_DIR/.staged-$output.png"
  local caption_image="$FRAME_DIR/.caption-$output.png"

  convert "$CAPTURE_DIR/$source" \
    -crop "$crop_geometry" +repage \
    -resize '1700x790^' \
    -gravity center -extent 1700x790 \
    -bordercolor '#ffffff' -border 8 \
    "$staged"

  convert -background none -fill '#ffffff' \
    -font '/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf' \
    -pointsize 34 -size 1660x115 \
    "caption:$caption" \
    "$caption_image"

  convert -size 1920x1080 xc:'#f2f5f7' \
    "$staged" -gravity north -geometry +0+35 -composite \
    -fill '#111820' -draw 'rectangle 0,860 1920,1080' \
    -font '/usr/share/fonts/opentype/urw-base35/NimbusSans-Bold.otf' \
    -pointsize 22 -fill '#f16a8f' -gravity southwest \
    -annotate +130+165 "$label" \
    "$caption_image" -gravity south -geometry +0+18 -composite \
    "$FRAME_DIR/$output.png"
}

make_ui_frame \
  'landing-hero.jpg' 'landing' '1363x760+0+0' \
  'LIVE WEB APP' \
  'Veyra separates private eligibility from public onchain enforcement.'

make_ui_frame \
  'issuer-workspace.jpg' 'issuer' '1363x760+0+0' \
  'ISSUER WORKFLOW' \
  'An authorized issuer signs a wallet-bound credential for private delivery.'

make_ui_frame \
  'access-workspace.jpg' 'access' '1348x666+0+260' \
  'IMPLEMENTED ACCESS FLOW' \
  'AccessRegistry verifies the signer, policy, expiry, and replay state before recording the pass.'

make_ui_frame \
  'network-production.jpg' 'network' '1363x660+0+100' \
  'RECORDED DEPLOYMENT EVIDENCE' \
  'FCC extension 65835 reached PRODUCTION in the recorded Coston2 registration evidence.'

make_ui_frame \
  'fxrp-vault.jpg' 'vault' '1363x720+0+0' \
  'REFERENCE INTEGRATION' \
  'The FXRP vault requires an active access pass before deposits can proceed.'

rm -f "$FRAME_DIR"/.staged-*.png "$FRAME_DIR"/.caption-*.png

echo "VEYRA_VIDEO_FRAMES_READY dir=$FRAME_DIR"
