#!/bin/sh
# sweep.sh: find Slack requests we owe a response to. Run at EVERY task
# close-out and any time the session wakes. Two independent checks:
#   1. local ledger: inbox events not yet in done
#   2. channel truth: @-mentions in the last 7 days whose thread has no
#      bot reply after the mention (catches events the loop never captured,
#      the failure mode of the 2026-08-24 silent-ear incident)
# Exit 0 with "SWEEP CLEAN" or print the pending items (still exit 0; the
# caller decides what to do). Nonzero only on infrastructure failure.
SLACK_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "== ledger check"
PENDING=0
for f in "$SLACK_DIR"/inbox/evt_*.json; do
  [ -e "$f" ] || continue
  id=$(basename "$f" .json)
  if ! grep -q "^$id$" "$SLACK_DIR/done" 2>/dev/null; then
    echo "UNHANDLED: $id"
    PENDING=1
  fi
done
[ "$PENDING" = 0 ] && echo "ledger clean"

echo "== channel check (mentions without bot reply, last 7 days)"
docker exec -i claude-slack-bridge python - <<'PYEOF'
import os, json, time, urllib.request, urllib.parse
tok = os.environ.get('SLACK_BOT_TOKEN')
def api(method, **params):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f'https://slack.com/api/{method}?{qs}',
                                 headers={'Authorization': f'Bearer {tok}'})
    return json.load(urllib.request.urlopen(req))
me = api('auth.test')['user_id']
oldest = time.time() - 7 * 86400
hist = api('conversations.history', channel='C0BN8AFQ5J8', oldest=oldest, limit=100)
owed = []
for m in hist.get('messages', []):
    if f'<@{me}>' not in (m.get('text') or ''):
        continue
    thread = m.get('thread_ts', m['ts'])
    replies = api('conversations.replies', channel='C0BN8AFQ5J8', ts=thread, limit=50)
    answered = any(r.get('user') == me and float(r['ts']) > float(m['ts'])
                   for r in replies.get('messages', []))
    if not answered:
        owed.append((m['ts'], (m.get('text') or '')[:80].replace('\n', ' ')))
if owed:
    for ts, txt in owed:
        print(f'OWED: ts={ts} | {txt}')
else:
    print('channel clean')
PYEOF
echo "== ear check"
if pgrep -f "phi-i18n/slack/slack_loop.sh" > /dev/null; then
  echo "ear armed"
else
  echo "EAR DOWN: re-arm slack_loop.sh as a tracked background task NOW"
fi
