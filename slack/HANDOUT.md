# Slack wiring: #withclaude-browseri18n → the phi-i18n session

**For: the standing Claude session working in `~/Dev/ccplayground/phi-i18n`.**
The Slack bridge (Bran, `claude-slack-bridge` container) is this channel's ears
and mouth; YOU are its brain. No `claude -p` is spawned for this channel: every
message routes to THIS one session, so the whole channel is one continuous
conversation with your full working state.

## The channel

`#withclaude-browseri18n` (`C0BN8AFQ5J8`), public, Slack-Connect shared, so
collaborators from other workspaces are expected. Threads may contain human
chitchat; the bridge only delivers what is addressed to the bot (rules at the
bottom).

## Broadcasting (you → channel)

```sh
printf '%s\n' "line 1" "line 2" | docker exec -i claude-slack-bridge \
  python /app/src/slack_notify.py --channel C0BN8AFQ5J8
```

One argument per line (never `echo "a\nb"`). To post INTO a thread, use
`bridge_notify.py --channel C0BN8AFQ5J8 --thread-ts <ts>` instead. A failed push
must never block your work. Put a SPACE before any URL or Slack drops the link.

## Incoming events (channel → you)

The handoff dir is this directory (`phi-i18n/slack/`), bind-mounted into the
bridge container at `/brain/phi-i18n`:

- `inbox/evt_<ts>.json`: one file per delivered event (atomic; never read `.tmp`).
- `outbox/<id>.reply`: your reply (see protocol below).
- `done`: your processed-id ledger (append the id after handling).

Event JSON fields: `id, channel, thread_ts, message_ts, user, user_name, is_dm,
mentioned, text, attachments, placeholder_ts, t`. `attachments` are container
paths under `/brain/phi-i18n/`; on the host, that prefix maps to THIS dir.

## Reply protocol (outbox/<id>.reply)

1. **Reply text**: the bridge posts it into the thread (Slack markdown OK).
2. **`__posted__`**: you already posted a richer message yourself via
   `bridge_notify.py` with the event's `thread_ts`.
3. **Empty file**: no reply wanted.

The bridge waits **900 s** per event, then posts "still working, will follow
up" on your behalf; a late follow-up via `bridge_notify.py` into the event's
`thread_ts` is expected and correct. Under load the inbox IS the queue: process
strictly oldest-first, one `.reply` per event. If a task will run long, reply a
one-line ack immediately and follow up when done.

## The ear (keep it armed)

Run `slack/slack_loop.sh` as a **tracked background task** at all times. It
blocks until the oldest un-done event, prints the JSON, and exits, which wakes
you. After handling an event: write the `.reply`, `echo <id> >> slack/done`,
and RE-ARM the loop as a fresh tracked background task. Singleton-locked
(`.loop.lock`), so double-arming is harmless. If the lock exists but no
`slack_loop.sh` process is alive, the lock is stale: `rmdir slack/.loop.lock`
and re-arm.

Redelivery safety: the bridge never deletes inbox events; an event stays
visible until you append its id to `done`. Crash or forget = redelivery, never
loss.

## Bridge-enforced engagement rules (FYI)

- @-mention of the bot → delivered to you. Thread follow-ups keep flowing
  without re-mention only while the thread is strictly 1:1 (bot + one human);
  once a 2nd party joins (another human OR another bot), every delivery
  requires an explicit @-mention.
- A message @-mentioning someone else is never delivered.
- The bridge acks instantly (👀 + "🧠 phi-i18n is thinking…" placeholder);
  you never need to ack, only answer.

## Slack formatting (standing rule)

`markdown_text` (what the bridge posts with) is standard Markdown: `**bold**`,
`*italic*`. Slack's legacy `text` field is the opposite (`*bold*`, `_italic_`).
`##`/`###` become header blocks, `---` a divider, `- x` a native list, `> x` a
quote block. Use them instead of faking layout with blank lines or emoji rules.
Never an em-dash or en-dash; full-width punctuation for Chinese.

## Incident note (2026-08-24): the silent-ear failure mode

After EVERY event delivery the loop EXITS and must be re-armed; handling
work is not done until `slack_loop.sh` is running again as a tracked task.
Verify with a PATH-ANCHORED check only:
`pgrep -fl "phi-i18n/slack/slack_loop.sh"`.
A bare `pgrep -f slack_loop.sh` matches other projects' loops (phicampaign,
ai-arsenal) and once produced a false "ear armed" verdict that silenced the
channel for 2.5 days (missed Fangzhou's Friday request, evt_1787310892).
Every reply/close-out must also write outbox/<id>.reply (or `__posted__`)
AND append the id to `done` in the same breath as posting.

## Standing rule (owner, 2026-08-24): sweep at every close-out

Other desks have hit the silent-ear pit too. Being busy on a task is fine;
going quiet after it is not. At the END of EVERY task (before reporting to
the owner or going idle), run `slack/sweep.sh`. It checks three things:
unledgered inbox events, channel @-mentions with no bot reply after them
(catches events the loop never captured), and whether the ear is armed.
If it reports anything owed, pipeline ALL of it: ack each thread first,
then process oldest-first. The goal is zero missed requests, mechanically,
not by memory.

## Fallback ear (2026-08-29): persistent Monitor

If the tracked slack_loop.sh background task gets repeatedly reaped by the
harness (external SIGTERM seconds after arming, observed during login
churn), switch the ear to a persistent Monitor watching `slack/inbox/` for
event files not yet in `done` (3s poll, one alert line per new event). Same
handling contract afterwards (outbox/<id>.reply + done + re-verify). The
bridge's 900s reply window and outbox pickup are independent of which ear
mechanism is armed. Never run both ears at once.
