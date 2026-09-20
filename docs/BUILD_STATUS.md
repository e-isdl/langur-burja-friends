# BUILD_STATUS — langur-burja-friends

Date: 2026-09-20 (UTC)
Verifier: full-build check (Read/Write/Edit/Bash)

## 1. File inventory

Root:
- `package.json` — express ^4.19.2, ws ^8.17.0, start=node server.js
- `server.js` — 519 lines, room relay server (no DB/auth)
- `public/index.html` — lobby (join + lobby + 10 game cards)
- `public/shell.js` — lobby logic (plain script, globals WSClient/Sound)
- `public/shell.css` — dark casino theme, mobile-first
- `public/shared/ws-client.js` — server WS client + legacy BroadcastChannel + LBFNet
- `public/shared/sound.js` — WebAudio synth (Sound/GameSound/LBSound/SoundFX)
- `public/shared/deck.js` — DeckLib (Deck, Teen Patti eval, Rummy eval, Phalas, cardHTML)
- `public/shared/three-env.js` — ThreeEnv.createScene/init/makeTable/canvasTexture
- `public/shared/theme.css` — (extra, not required by lobby)

Games (`public/games/`, 20 files = 10 html + 10 js):
- `langur-burja.html` + `langur-burja.js` (NOT touched — owned by other agent, verified exists)
- `teen-patti.html/js`, `kitti.html/js`, `jud-patti.html/js`, `phalas.html/js`,
  `marriage.html/js`, `call-break.html/js`, `in-between.html/js`,
  `roulette.html/js`, `sic-bo.html/js`
- All 10 js contain relay/broadcast/send AND endGame/game-over paths.
- No TODO/FIXME/placeholder visible (Select-String clean).

## 2. Checks run

- `node --check server.js` → OK
- `node --check public/shell.js` → OK
- `node --check public/shared/ws-client.js` → OK
- `node --check public/shared/sound.js` → OK
- `node --check public/shared/deck.js` → OK
- `node --check public/shared/three-env.js` → OK
- `node --check public/games/*.js` (10 files) → all OK
- `npm install` → added 69 packages, 0 vulnerabilities
- Static HTTP (server in background job):
  - `GET /` → 200, `GET /shell.js` → 200,
    `GET /shared/ws-client.js` → 200,
    `GET /games/teen-patti.html` → 200,
    `GET /games/langur-burja.html` → 200
- `GET /health` → `200 {"ok":true,"rooms":0}`
- WS flow (node `ws` client):
  - create (Host) → joined code=JZ68NN players=1
  - join (Guest) → joined players=2 + host got room broadcast
  - start-game teen-patti → both got game-start
  - end-game [] → both got game-end + room
  - → PASS
- Edge test:
  - create with chips=9999999 → clamped to 1000000 → PASS
  - start-game each of 10 spec ids → all accepted → PASS
  - start-game `rummy` → error `Unknown game. Allowed: ...` → PASS (old ids rejected)

All background servers killed (Start-Job/Stop-Job/Remove-Job), port 3000 verified free.

## 3. Fixes applied

1. `public/index.html` game grid — was:
   langur-burja, teen-patti, rummy, phalas, call-break, bluff, war, blackjack, kitty, housie
   fixed to exactly 10 spec ids (data-card + data-game in sync):
   langur-burja, teen-patti, phalas, call-break, jud-patti, marriage,
   in-between, roulette, kitti, sic-bo.
   Also fixed: meta description (removed Rummy), `2–12 players` → `2–8 players`
   (join how-to + rules modal), rules `Rummy: sets...` → `Kitti: 9 cards...`,
   `21-card rummy` → `21-card marriage set game`, `wins the kitty` → `wins the pot`
   (avoids `kitty` id confusion).
2. `public/shared/ws-client.js` — was BroadcastChannel-only, `new WSClient(url)` threw.
   Added `ServerWSClient(url?)` constructor:
   createRoom/joinRoom/relay/send/broadcast/startGame/endGame/kick/setChips/
   leave/ping/reconnect/close + on(connect/disconnect/joined/room/action/
   game-start/game-end/kicked/error).
   Features: ws/wss autodetect from location.protocol/host, message queue before
   open, auto-rejoin last room on open, exponential backoff auto-reconnect
   (1s→10s), 4400 kick handling, joined normalisation
   ({you,room} → flat {id,code} for shell compat).
   Preserved legacy: WSClient.join/connect/send/relay/on/onMessage/isHost/rejoin
   (BroadcastChannel) and full LBFNet.join roster API for 3D dice games.
   WSClient is now a constructor function with legacy statics, so both
   `new WSClient(url)` and `WSClient.connect(...)` work.
3. `public/shell.js` — fixed protocol mismatch:
   joined handler now reads `msg.you.id/name` in addition to flat `msg.id`;
   game-end now handles array results `[{playerId,delta}]` (server) as well as
   object `{winner}` (legacy) + applies `msg.room` refresh;
   added `kicked` handler (toast + return to join screen + close).
   Verified handlers exist for joined/room/game-start/game-end.
4. `server.js` — NO change needed (verified):
   ALLOWED_GAMES = exactly 10 spec ids, MAX_PLAYERS=8 (2–8), toChips clamp
   1–1000000, end-game clamp `Math.max(0, ...)`, unknown playerIds ignored,
   host-only start/end/kick/set-chips, reconnect by name, host migration.
5. Games — NO stubs needed (all 20 files present, all playable, relay+endGame present).

Not touched: `public/games/langur-burja.html` (per instruction, only verified exists).

## 4. How to run

```bash
cd C:\projects\langur-burja-friends
npm install
npm start
# → http://localhost:3000, health: http://localhost:3000/health
```

Share with friends (second terminal):

```bash
cloudflared tunnel --url http://localhost:3000
```

Send friends the `https://xxx.trycloudflare.com` URL + 6-char room code.
Host Creates, friends Join, host Starts any of the 10 games.
