#!/usr/bin/env bash
# Checks a rendered film: specs, full decode, sync and loudness.
# Usage: ./check.sh [video]   (default media/formica-fx6.mp4)
set -u
V=${1:-media/formica-fx6.mp4}
[ -f ~/.local/opt/env.sh ] && . ~/.local/opt/env.sh
fail=0
ok()  { echo "PASS  $1"; }
bad() { echo "FAIL  $1"; fail=1; }
[ -s "$V" ] || { echo "FAIL  missing $V"; exit 1; }
v=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_read_frames,duration -of csv=p=0 "$V")
IFS=, read -r w h fps vd n <<<"$v"
[ "$w x $h" = "1920 x 1080" ] && ok "1920x1080" || bad "size $w x $h"
[ "$fps" = "60/1" ] && ok "60 fps" || bad "fps $fps"
[ "$n" = "1716" ] && ok "1716 frames" || bad "frames $n (want 1716)"
ad=$(ffprobe -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 "$V")
awk -v a="$ad" -v b="$vd" 'BEGIN{exit !(a-b<0.05 && b-a<0.05)}' && ok "audio $ad s = video $vd s" || bad "audio $ad s vs video $vd s"
ffmpeg -v error -i "$V" -f null - 2>&1 | grep -q . && bad "decode errors" || ok "full decode clean"
L=$(ffmpeg -nostats -i "$V" -af ebur128=peak=true -f null - 2>&1 | awk '/I:/{i=$2} /Peak:/{p=$2} END{print i, p}')
read -r lufs peak <<<"$L"
awk -v x="$lufs" 'BEGIN{exit !(x>=-15 && x<=-13)}' && ok "loudness $lufs LUFS" || bad "loudness $lufs LUFS (want -14 ±1)"
awk -v x="$peak" 'BEGIN{exit !(x<=-1)}' && ok "true peak $peak dBTP" || bad "true peak $peak dBTP (want ≤ -1)"
exit $fail
