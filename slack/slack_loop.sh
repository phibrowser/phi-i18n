#!/bin/sh
# phi-i18n ear: block until the oldest un-done Slack event, print it, exit.
# Run as a TRACKED BACKGROUND TASK inside the phi-i18n session; its exit wakes
# the session with the event JSON as output. Re-arm after handling each event.
# Contract: HANDOUT.md in this directory.
DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir "$DIR/.loop.lock" 2>/dev/null || exit 0          # singleton
trap 'rmdir "$DIR/.loop.lock"' EXIT
touch "$DIR/done"
while true; do
  for f in $(ls "$DIR"/inbox/evt_*.json 2>/dev/null | sort); do
    id=$(basename "$f" .json)
    grep -qx "$id" "$DIR/done" || { cat "$f"; exit 0; }
  done
  sleep 2
done
