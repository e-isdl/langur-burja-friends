# Bug Audit — 2026-09-20

Live server + static + WS relay tested. All `.js` pass `node --check`.

## Critical (fixed)
1. **Card games offline-only (teen-patti, kitti, jud-patti, phalas + marriage/call-break/in-between/roulette/sic-bo)** — `WSClient.connect/send/relay/on` used only `BroadcastChannel`, so rooms synced same-device tabs but NOT across internet. Langur Burja already had a direct server WS; others didn't.
   - Fix: `public/shared/ws-client.js` static layer now bridges to live server (`/` + `join`/`action`) while keeping BroadcastChannel. `isHost()` prefers server `hostId`. `connect()`/`rejoin()` open server WS; `send()/relay()` write to both; `on()` listens to both.
2. **Broken direct sockets in 4 games** — `teen-patti/kitti/jud-patti/phalas` opened `new WebSocket(host + '/ws?code=…')` and sent `{type:'rejoin'}`. Server has no `/ws` route and no `rejoin` type → `Unknown message type`, upgrade wasted, errors in console.
   - Fix: removed direct blocks; bridge in (1) covers online. Files: `public/games/{teen-patti,kitti,jud-patti,phalas}.js`.

## Major (fixed)
3. **Teen Patti tiebreak ignored suit order** — `DeckLib.compareHands` returned `0` on equal rank+tiebreak, spec requires `S>H>D>C`.
   - Fix: `public/shared/deck.js` now compares best `(value,suit)` triplet when raw 3-card arrays are passed.

## Minor (noted, low risk)
4. `shell.js validName` requires 2+ chars; `server.js cleanName` allows 1. A 1-char name is rejected client-side but would be accepted via raw WS. Cosmetic; keep client stricter.
5. Three.js version split: `langur-burja` uses `0.160` ES modules + addons; `roulette/sic-bo` use `0.158` global build. Both load; duplicates CDN cache (~600KB extra). Unify to 0.160 later if desired.
6. `theme.css` vs `shell.css`: card games split across both (`call-break/in-between/marriage` → theme, others → shell). Both exist so no 404, but styling drifts. Unify later.
7. Langur Burja settles chips per-round locally and only calls `end-game` when host closes the table (by design, to avoid clearing `room.game` mid-session). Lobby chips look stale mid-session; acceptable for friends, document in README.
8. Sounds: `marriage/call-break/in-between` wrap `window.Sound` via compat shims (no direct `Sound.` refs) — works, just harder to grep.

## Verified
- `node --check`: server, shell, ws-client, deck, sound, three-env, 9 game JS — all OK.
- Static: `/health 200 {ok:true}`, `langur-burja.html 200`, `teen-patti.html 200`, `shared/ws-client.js 200`.
- Live WS (two `ws` clients): create `JQZ9KS` → join (2 players) → `game-start langur-burja` → `action {t:bet}` relayed → `end-game` chips `190/220` — PASS.
- No `TODO/FIXME/placeholder` strings in `public/` (only input `placeholder=` attributes).

## How to re-test
```
cd C:\projects\langur-burja-friends
npm start
# second terminal:
cloudflared tunnel --url http://localhost:3000
# open URL on phone + desktop, create room, join, start Langur Burja, bet, roll.
```
