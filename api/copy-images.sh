#!/usr/bin/env bash
# The move from Supabase, images: run INSIDE the api container after deploy/cutover-load.sh (Coolify > Terminal > api):
#   bash /app/copy-images.sh
# Reads the list cutover-load.sh left in the database (through PostgREST), downloads each image from the old project's
# public storage and saves it under the same name, so the paths in the database keep working. Tries each bucket.
set -uo pipefail
OLD="${OLD_STORAGE:-https://uxvsjchdfsznyyqbjrdm.supabase.co/storage/v1/object/public}"
REST="${TOURNY_POSTGREST_URL:-http://postgrest:3000}"
ROOT="${TOURNY_STORAGE_ROOT:-/data/storage}"

list="$(curl -fsS -H 'Accept: text/csv' "$REST/zz_image_copy?select=path")" || { echo "Could not read the image list: run cutover-load.sh first." >&2; exit 1; }
copied=0; missing=0
while IFS= read -r path; do
  path="${path%\"}"; path="${path#\"}"
  [ -z "$path" ] || [ "$path" = "path" ] && continue
  found=no
  for bucket in avatars logos player-photos; do
    target="$ROOT/$bucket/$path"
    if [ -s "$target" ]; then found=yes; continue; fi
    if curl -fsS --create-dirs -o "$target.part" "$OLD/$bucket/$path" 2>/dev/null; then mv "$target.part" "$target"; found=yes; else rm -f "$target.part"; fi
  done
  if [ "$found" = yes ]; then copied=$((copied + 1)); else missing=$((missing + 1)); echo "not found anywhere: $path"; fi
done <<< "$list"
echo "Images copied: $copied, not found: $missing"
