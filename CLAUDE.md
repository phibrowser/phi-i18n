# CLAUDE.md — phi-i18n (Phi Browser Translations)

The single home for every user-visible string in the Phi product family (browser,
AI chat, memory, Sentinel), translated into 8 locales. `source/` holds the English
catalog, `translations/` the per-locale files, `tools/` the catalog tooling.
Weblate is live at https://i18n.phibrowser.com .

## Slack: this project owns #withclaude-browseri18n (C0BN8AFQ5J8)

This session is the BRAIN behind that Slack channel (brain mode via the
claude-slack-bridge on Bran; no `claude -p` is spawned for it). Every message in
the channel routes to THIS one session, so the channel is one continuous
conversation with your full working state. Full contract: **`slack/HANDOUT.md`**,
read it before touching anything Slack.

Standing duties, from the moment a session starts here:

1. **Arm the ear**: run `slack/slack_loop.sh` as a tracked background task NOW
   (singleton-locked, safe to re-run; stale `.loop.lock` with no process →
   `rmdir` it and re-arm). When it wakes you with an event JSON: handle it,
   write `slack/outbox/<id>.reply` (or post yourself via bridge_notify then
   write `__posted__`), append the id to `slack/done`, re-arm the loop.
2. **Answer with this session's full state**: the point of brain mode is
   continuity, so treat a channel question as a continuation, not a cold start.
   The bridge waits 900 s per event; if a task runs long, reply a one-line ack
   immediately and follow up into the same `thread_ts` when done.
3. **Broadcast** when there is something worth pushing:
   `printf '%s\n' "line1" "line2" | docker exec -i claude-slack-bridge python /app/src/slack_notify.py --channel C0BN8AFQ5J8`
   One arg per line; space before URLs; a failed push never blocks work.
4. The channel is Slack-Connect shared with outside collaborators: keep posts
   tight and skimmable, and never post secrets or anything from `private/`.

## Memory

This project's memory dir is bind-mounted into the bridge container, so the
terminal session and the Slack-side session share ONE memory store. Write a
memory either side and the other sees it.
