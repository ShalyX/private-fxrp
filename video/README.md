# Veyra Demo Video

This directory contains the truth-gated 90-second demo-video production
package and a reproducible review-cut renderer.

`EDIT_DECISION_LIST.md` is the locked shot-level specification for timing,
motion, text, voiceover sync, sound cues, and source evidence.

## Render

Requirements:

- Bash
- ImageMagick `convert`
- FFmpeg with `libx264`, `aac`, `zoompan`, and `drawtext`

Run:

```bash
bash video/scripts/render.sh
```

Output:

```text
video/dist/veyra-90s-demo-review-cut.mp4
```

The review cut uses burned-in narration and a restrained synthesized sound bed.
Record the script in `VOICEOVER.md` before producing the submission master.

## Full production cut

Run:

```bash
bash video/scripts/render-master.sh
```

This produces `video/dist/veyra-90s-demo-submission-master.mp4` with the locked
visual edit, restrained instrumental bed, and burned-in explanatory captions.
The submission master contains no synthetic narration. `CAPTIONS.srt` remains
available as a sidecar subtitle file for upload platforms.

## Truth boundary

Read `PRODUCT_TRUTH_SHEET.md` before changing any caption or claim. The current
cut labels the successful access event as a recorded Coston2 run because the
original pass has expired and the FCC callback endpoint was unavailable during
this capture session.
