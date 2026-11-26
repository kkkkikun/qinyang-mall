#!/usr/bin/env bash
# Resumable parallel downloader for the CLIP weights (slow proxy -> 24 ranges).
set -u
BASE="https://hf-mirror.com/openai/clip-vit-base-patch32/resolve/main/pytorch_model.bin"
OUT="/home/kikun/MyProject/clothing-mall-miniapp/.cache/clip-vit-base-patch32/pytorch_model.bin"
TMPDIR_DL="/home/kikun/MyProject/clothing-mall-miniapp/.cache/clip-vit-base-patch32/parts"
URL="$1"
mkdir -p "$TMPDIR_DL"
TOTAL=$(curl -sIL "$URL" | tr -d '\r' | awk 'tolower($1)=="content-length:"{v=$2} END{print v}')
echo "total bytes: ${TOTAL:-unknown}"
if [ -z "${TOTAL:-}" ] || [ "$TOTAL" = "0" ]; then echo "no content-length"; exit 1; fi
CHUNK=$(( (TOTAL + 23) / 24 ))
for attempt in 1 2 3 4 5 6 7 8; do
  pids=()
  for i in $(seq 0 23); do
    start=$(( i * CHUNK )); end=$(( start + CHUNK - 1 )); [ $end -ge $TOTAL ] && end=$(( TOTAL - 1 ))
    f="$TMPDIR_DL/part_$(printf %02d $i)"
    want=$(( end - start + 1 ))
    have=$( [ -f "$f" ] && stat -c %s "$f" || echo 0 )
    [ "$have" -ge "$want" ] && continue
    ( curl -sL --max-time 3500 --retry 5 --retry-delay 3 -C - -r "${start}-${end}" -o "$f" "$URL" ) &
    pids+=($!)
  done
  for p in "${pids[@]}"; do wait $p; done
  sz=$(cat "$TMPDIR_DL"/part_* 2>/dev/null | wc -c)
  echo "attempt $attempt: have $sz / $TOTAL bytes"
  [ "$sz" -ge "$TOTAL" ] && break
done
sz=$(cat "$TMPDIR_DL"/part_* 2>/dev/null | wc -c)
if [ "$sz" -ge "$TOTAL" ]; then
  cat "$TMPDIR_DL"/part_* > "$OUT"
  echo "assembled: $(stat -c %s "$OUT") bytes"
  rm -rf "$TMPDIR_DL"
else
  echo "incomplete: $sz / $TOTAL"
  exit 2
fi
