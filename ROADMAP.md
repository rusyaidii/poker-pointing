# Pointing Poker — Roadmap

Current state: **feature-complete** vs. the original prototype — real-time planning poker + retro board, running on Next.js (Cloudflare) + PartyServer (Durable Objects), with no race conditions and ephemeral 24h room state.

Items below are grouped by effort and tailored to the current architecture (PartyServer + Durable Objects on Cloudflare, no database yet). Most Tier 1–2 items are "a message type in `party/server.ts` + a bit of UI."

---

## Tier 1 — Quick wins (small, no new infrastructure)

- [x] **Room validation** ⭐ — Fix the known limitation where joining a non-existent code silently creates an empty room. Add an HTTP `onRequest` to the `Room`/`Retro` server that reports whether a room is initialized; the join handler checks it first.
  - Touches: `party/server.ts` (`onRequest`), landing join handlers
- [ ] **Custom decks** — Let the facilitator type comma-separated values instead of picking a preset. Store `customCards?: string[]` on `RoomState`.
  - Touches: `party/server.ts` (state + `setDeck`), room deck UI
- [ ] **Ticket ID + link per round** — A ticket field per round; history entries link out to Jira/Linear/GitHub.
  - Touches: `RoomState`, `HistoryEntry`, title row UI
- [ ] **CSV/JSON export** — Extend the existing "copy history" with CSV/JSON download (Blob + `<a download>`). Pure client.
  - Touches: room page only
- [ ] **Private rooms / password** — Optional room password set on create; `onBeforeConnect` rejects a wrong password with a 403.
  - Touches: `party/server.ts` (`onBeforeConnect`), landing/join UI

> Recommended first: **Room validation** — the one actual rough edge in what's shipped.

---

## Tier 2 — Medium (real-time UX & integrations)

- [ ] **Async voting / pending indicator** — Keep a round open across the day; show who's *still to vote* as a live pending list. Data model already supports partial vote sets — mostly UI.
  - Touches: room page, small server tweak
- [ ] **Facilitator controls** — Only the room creator can reveal / change deck / start a new round. Track `hostId` on `RoomState`; gate those messages server-side.
  - Touches: `party/server.ts` (auth checks), room UI (disable buttons)
- [ ] **"Nudge" button** — Ping people who haven't voted; a broadcast event that shakes their avatar (or a Web Notification).
  - Touches: `party/server.ts` (transient `nudge` broadcast), room UI animation
- [ ] **Emoji reactions** — Lightweight live reactions during discussion. Ephemeral broadcast, no persistence.
  - Touches: `party/server.ts`, room UI
- [ ] **Slack/Teams slash command** — `/poker JIRA-482` spins up a room and returns the link. A small extra Worker route handling the webhook.
  - Touches: new Worker route, no client change

---

## Tier 3 — Larger (needs persistence → Cloudflare D1)

Where "utility" becomes "product." Everything above stores state only in the ephemeral room object; these need a real database. **Cloudflare D1** (serverless SQLite, free tier, same ecosystem) is the fit — add a `d1_databases` binding to the worker.

- [ ] **Persistent teams** — Save a roster so names aren't retyped; recurring rooms. Requires **auth** (accounts, e.g. NextAuth) + D1.
- [ ] **Cross-session analytics** — "This team estimates 20% under actual completion time." Write each finished round to D1; build a dashboard. Needs D1 + a source of *actual* effort (Jira/Linear) to compare against. The real differentiator from the write-up.
- [ ] **Estimate-vs-actual loop** — Push final estimates back to the linked ticket, later pull actuals. Deepest integration; the "closes the loop" wedge.

---

## Non-feature hardening

- [ ] **Abuse / rate limiting** before sharing widely — cap message rate per connection in `onMessage`.
- [ ] **Reconnection polish** — auto-rejoin on reconnect (re-send `join`) so a dropped socket restores the participant cleanly.
- [ ] **Mobile pass** — deck/participant grid on small screens.

---

## Suggested sequence

1. Room validation (fixes the bug)
2. Custom decks + CSV export (easy, visible wins)
3. Facilitator controls (makes it feel "real" for teams)
4. Async voting / pending
5. When ready to commit to a niche: D1 + analytics + ticket loop

## Highest-leverage bets

- **Room validation** — correctness.
- **D1 analytics + ticket loop** — the only items here that incumbents mostly don't own.
