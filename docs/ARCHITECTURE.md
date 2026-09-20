# ARCHITECTURE — Langur Burja Friends

> Fun-first party game shell. Host-authoritative. In-memory. Mobile-first. No DB. No auth. Just vibes + cards + dice.

---

## 1. System Overview

- Stack: Node.js + Express + `ws` WebSocket server.
- Single process, in-memory state. No database.
- Host-authoritative relay: host client owns game logic, server relays messages.
- Static hosting: `public/` served by Express.
- Tunnel: `cloudflared tunnel` exposes localhost to internet for friends.
- Protocol auto-detect: `ws://` locally, `wss://` when over HTTPS tunnel.
- Deployment mental model: one laptop = server + host, friends join via tunnel URL.
- No login. Name + room code only.
- Wallet is per-room, per-socket, ephemeral. Refresh = reset.
- Games are pluggable: `public/games/<slug>/host.js` + `player.js` + `style.css`.
- Shell handles: landing, lobby, room, wallet, navigation, sound, ws-client, three-env.
- Fun goal: <10s from link -> playing. Zero tutorial needed.
- Edge: server restart wipes all rooms. Acceptable for party. Show "Room gone, make new one".
- Edge: host tab close = game freezes. Non-hosts see "Host left, waiting..." + auto-promote option.
- Scale target: 2-9 players per room, 1 room per tunnel, <50 concurrent sockets.
- Performance budget: <1.5s first paint on 4G, <100ms ws relay p99 LAN, 60fps dice on mid Android.
- Dark theme everywhere: `#04070a` to `#0a0f18`, gold `#e8b923`, felt greens.
- All UI touch-first: 44px min targets, 375px baseline, no horizontal scroll.

---

## 2. High-Level Diagram

```
[Player Phone] --wss--> [cloudflared] --> [Node:Express+ws :3000]
[Host Laptop ] --ws---> [Node:Express+ws :3000] (same process)
                         |
                    public/*.html
                    public/games/*/*.js
                    in-memory rooms Map
```

- Express serves static + `/healthz` + `/room-info`.
- `ws` server on same HTTP server, path `/ws?room=XXXX&name=Y&isHost=1`.
- Server does NOT validate game rules. Only relays + tracks presence + wallet deltas.
- Host sends `type:data` game messages. Server broadcasts to room.
- Fun factor: host is dealer + showman. Animations run locally on each client, seeded by host result.

---

## 3. Room Lifecycle State Machine

### 3.1 States

```
LOBBY -> BETTING/DEALING -> PLAYING -> RESULT -> LOBBY (next round)
   |          |               |           |
   +-----> AWAY_GRACE <-------+-----------+
   |
 CLOSED (empty or host left >90s)
```

### 3.2 Detailed Transitions

1. `CREATED`: host POSTs or ws `create`. Room code 4-char (e.g., `K4P2`). Uppercase, no `0/O/1/I`.
2. `LOBBY`: waiting. Shows member list, game picker grid, wallet seed button, Start button (host only).
3. `LOCKED`: host pressed Start. No new joins mid-hand (joiners spectate until next round).
4. `IN_GAME`: sub-state owned by game (e.g., `bet`, `shake`, `tumble`, `payout` for langur).
5. `RESULT`: winner banner + payout applied + `Next` button visible to host.
6. `NEXT_ROUND`: host clicks Next -> broadcast `restart` -> all clients reset to BETTING/LOBBY.
7. `AWAY_GRACE`: player `disconnect` -> 60s grace. Avatar greyed, "reconnecting...". Auto-fold / skip turn if their turn.
8. `CLOSED`: last socket leaves or host leaves + 90s timeout. Memory freed.

### 3.3 Timers

- Lobby heartbeat: 15s ping/pong.
- Away grace: 60s.
- Host-leave grace: 90s with "Host left, elect new host?" prompt.
- Game timers owned by host (e.g., 30s bet). Server does not enforce.
- Reconnect window: same name + same room code within grace = restore wallet + seat.

### 3.4 Edge Cases

- Duplicate names: auto-suffix `Ram(2)`.
- Room full (9 max): reject with `room_full`, suggest new room.
- Host refresh: if host rejoins within 30s with `isHost=1` + same name, restore host flag.
- Two hosts: first wins, second demoted to player with toast.
- Rapid rejoin spam: rate-limit 5 joins/10s per IP.
- Tunnel drop: clients show reconnect banner, exponential backoff 1s,2s,4s,8s max 15s.

---

## 4. WebSocket Protocol

### 4.1 Envelope

```json
{ "type": "join", "name": "Sita", "room": "K4P2", "isHost": false }
{ "type": "data", "dataType": "bet", "payload": { "symbol": "club", "stake": 10 } }
{ "type": "presence", "members": [...] }
{ "type": "wallet", "balances": { "Sita": 90, "Ram": 110 } }
{ "type": "system", "msg": "Ram left", "code": "leave" }
{ "type": "ping", "t": 123456 }
```

### 4.2 Message Types Table

| type | dir | payload | example |
|------|-----|---------|---------|
| join | c->s | name, room, isHost | `{"type":"join","room":"AB12","name":"Hari"}` |
| joined | s->c | yourId, members, balances | `{"type":"joined","yourId":"s_9","members":["Hari","Sita"]}` |
| presence | s->all | members[], hostName | `{"type":"presence","members":["Hari"],"hostName":"Hari"}` |
| data | c->s->all | dataType, payload, from | `{"type":"data","dataType":"roll","payload":{}}` |
| wallet | s->all | balances map | `{"type":"wallet","balances":{"Hari":100}}` |
| system | s->all | msg, code | `{"type":"system","msg":"Next round","code":"restart"}` |
| ping/pong | both | t | keepalive |
| error | s->c | code, msg | `{"type":"error","code":"room_full","msg":"Room full"}` |
| leave | c->s | — | voluntary |

### 4.3 Game DataTypes (host-authoritative)

- Langur: `bet`, `roll`, `result`, `restart`, `tick`.
- Teen-patti: `deal`, `turn`, `action:blind/chaal/fold/show/sideshow`, `winner`.
- Kitti: `deal9`, `arrange_done`, `showdown`, `carry`.
- Jud-patti: `deal7`, `draw`, `discard`, `win_claim`.
- Phalas: `deal5`, `draw`, `discard`, `dhumbal`, `score`.
- Marriage: `deal21`, `phase`, `declare`.
- Call-break: `bid`, `play`, `trick`, `score`.
- In-between: `bet`, `flip`, `result`.
- Roulette: `bet`, `spin`, `no_more_bets`, `payout`.
- Sic-bo: `bet`, `shake`, `result`.

### 4.4 Sequence: Join + Bet + Result (langur)

```
Player->Server: join
Server->All: presence + joined + wallet
Player->Server(data): bet {symbol,stake}
Server->All(data): bet (echo, for live feed)
Host->Server(data): roll {nonce}
Server->All(data): roll (clients animate)
Host->Server(data): result {faces:[...], payouts:{...}}
Server->All(data): result
Server->All: wallet (updated)
Host->Server(data): restart
Server->All(data): restart
```

### 4.5 Reconnect Flow

```
disconnect -> client shows banner "Reconnecting..."
  -> ws onclose, backoff retry with same room+name+token
  -> server if within grace: restore seat, send joined + last game snapshot (if host cached)
  -> else: treat as new join, wallet reset to seed
```

---

## 5. Wallet Flow

- Seed: default 100 on join. Host can `+100` / reset via lobby button.
- Store: `rooms.get(code).wallets = Map<socketId, {name,balance}>`.
- Keyed by name lowercased for reconnect grace, not socketId.
- Updates: host computes payouts, sends `wallet` delta or full map via server helper.
- Client renders coin pill top-right, animated count-up, red flash on loss, gold burst on win.
- No persistence. Refresh = reseed. Intentional for party fun.
- Negative guard: clamp at 0, show "Out of coins! Tap +100 (host) or rejoin".
- Max cap 9999 to avoid overflow jokes.
- Edge: bet > balance -> reject locally with shake animation + "Not enough coins".
- Edge: host edits wallet mid-hand -> broadcast immediately, log in chat feed.
- Fun: coin sound `coin()` on win, `thud()` on loss.

---

## 6. Shell Navigation

- Routes (hash-based, no reload):
- `#/` landing: big Play button, How to play, Name input, Room create/join.
- `#/lobby?room=XXXX`: member avatars, game cards grid (10 games), wallet row, chat/feed, Start.
- `#/game/<slug>?room=XXXX`: game canvas + top bar (back, room code, wallet, mute) + bottom action bar.
- Back button: game -> lobby (spectate safe), lobby -> landing (leave room).
- Mobile: bottom nav 56px, thumb-reachable primary CTA.
- Desktop: centered 480px column + side feed.
- Guards: direct `#/game` without join -> redirect to landing with toast.
- Fun: page transitions 180ms slide, confetti on room create.

---

## 7. Shared Modules

### 7.1 `public/shared/sound.js`

- WebAudio, no assets. Lazy AudioContext on first tap.
- Functions:
- `ensure()` — create/resume ctx.
- `tap()` — 600Hz blip 40ms.
- `coin()` — two-tone 900->1400Hz.
- `dice()` — noise burst + 3 rattles.
- `shuffle()` — filtered noise 300ms.
- `card()` — snap 1200Hz 30ms.
- `win()` — arpeggio C-E-G-C.
- `lose()` — descending 300->120Hz.
- `chime()` — turn notify 880Hz + 1320Hz.
- `tick()` — 1000Hz 20ms for countdown last 5s.
- `spin()` — roulette loop.
- `muteToggle()` — persist `localStorage.muted`.
- Edge: iOS requires user gesture — call `ensure()` on every button.
- Mute button top-right always visible.

### 7.2 `public/shared/deck.js`

- API:
- `makeDeck(n=1)` — returns array `{suit:'S|H|D|C', rank:'A|2..10|J|Q|K', id}`.
- `shuffle(a, rng=Math.random)` — Fisher-Yates.
- `sortHand(cards)` — by rank then suit S>H>D>C.
- `rankKey(card)` — numeric 1-13.
- `isTrail(hand3)`, `isPureSeq(hand3)`, `isSeq(hand3)`, `isFlush(hand3)`, `isPair(hand3)`.
- `comparePatti(a,b)` — returns 1/-1/0 with suit tiebreak.
- `faceValue(card)` — for phalas: A1,2-10 face,J0,Q10,K10.
- `slug(card)` — e.g., `AS`, `10H` for compact UI.
- Pure functions, no DOM. Testable in Node.

### 7.3 `public/shared/ws-client.js`

- API:
- `connect({room,name,isHost,onMessage,onPresence,onWallet,onSystem})` — returns handle.
- `sendData(dataType,payload)` — wraps `{type:'data',...}`.
- `sendTick(sec)` — host countdown broadcast.
- `reconnect()` — backoff loop.
- `disconnect()` — clean leave.
- `getState()` — `{connected, room, name, retryCount}`.
- Auto ws/wss: `location.protocol==='https:' ? 'wss' : 'ws'`.
- Handles ping/pong internally.
- Exposes `onclose` banner hook.

### 7.4 `public/shared/three-env.js`

- API:
- `initScene(canvas, opts)` — renderer, ACES tone, shadows, fog.
- `makeFelt(size, c1,c2)` — radial gradient table texture.
- `makeLights()` — hemi + key spot + rim.
- `makeCamera(pos, look)` — perspective 45deg.
- `resize(handler)` — ResizeObserver.
- `confettiBurst(scene,pos)` — instanced quads.
- Used by langur, sic-bo, roulette for consistent look.
- Fallback: if WebGL missing, show 2D emoji grid.

---

## 8. File Structure

```
C:\projects\langur-burja-friends\
  server.js
  package.json
  docs\
    ARCHITECTURE.md
    GAMEPLAY_UX.md
    games\*.md (10 files)
  public\
    index.html
    style.css
    app.js
    shared\
      sound.js
      deck.js
      ws-client.js
      three-env.js
    games\
      langur-burja\host.js,player.js,style.css
      teen-patti\...
      kitti\...
      jud-patti\...
      phalas\...
      marriage\...
      call-break\...
      in-between\...
      roulette\...
      sic-bo\...
```

- Each game folder self-contained. Shell lazy-loads via `<script type=module>`.
- Host logic in `host.js`, player rendering in `player.js`. Small games share file.
- CSS scoped with `#game-<slug>` prefix to avoid bleed.

---

## 9. Error Handling / Reconnect / Away

- All ws sends wrapped try/catch. Queue if `readyState!==1`, flush on open.
- Countdowns: host `setInterval`, broadcast `tick`. Clients render ring. If tick gap >3s, show "Host lag...".
- Away: no `bet` within 30s -> auto-skip, keep wallet. Avatar dims.
- Host away mid-tumble: clients finish animation, wait for `result`. After 15s show "Waiting for host..." + `Claim host` button.
- Claim host: first clicker becomes host, gets Start/Next controls.
- Refresh: localStorage saves name+room, one-tap rejoin on landing.
- Tunnel sleep: cloudflared idle -> 502. Show "Ask host to wake laptop".

---

## 10. Security Notes (Trust Host)

- No auth. Room codes unguessable enough for friends (36^4 combos).
- Trust host: host can send any payout. Acceptable: friends, visible feed.
- Server validates: message size <16KB, rate <20/s per socket, name length <20, no HTML (escape on render).
- No XSS: use `textContent`, never `innerHTML` with names.
- No secrets in client. No DB. No PII.
- Abuse: kick button (host only) sends `system:kick:<name>`.
- Future (not now): HMAC host token, server-side payout verify, profanity filter.

---

## 11. Mobile-First Responsive Strategy

- Baseline 375x667 (iPhone SE). No h-scroll. `meta viewport`.
- Layout: flex column, game area `min-height: 60vh`, action bar sticky bottom.
- Targets: min 44x44px, gap 8px, thumb zone bottom 1/3.
- Type: Outfit body 16px, Playfair display for winner. Min 12px labels.
- Dice/cards scale with `clamp()`: e.g., `width: clamp(48px,14vw,84px)`.
- Tables: felt + grid uses CSS grid, wraps on <360px.
- Landscape: letterbox, show "Rotate for best fun" hint, still playable.
- Reduce motion: `prefers-reduced-motion` disables tumble/confetti, shows instant result.
- Battery: cap DPR at 2, pause rAF when hidden.

---

## 12. Testing Checklist

- [ ] Create room, copy link, join from 2 phones via tunnel.
- [ ] Kill host tab, reclaim host, Next round works.
- [ ] Airplane toggle 10s, reconnect restores wallet + seat.
- [ ] Bet > balance blocked with shake.
- [ ] 30s timer auto-locks betting, no late bets accepted.
- [ ] Result payouts sum correctly (house edge positive).
- [ ] Mute persists across games.
- [ ] 375px no h-scroll, 44px targets pass tap test.
- [ ] WebGL off fallback shows emoji grid, still playable.
- [ ] 9 players spam bets, no lag, feed stays ordered.
- [ ] Rapid Next clicks don't double-pay (idempotence nonce).
- [ ] Cloudflared URL uses wss, local uses ws.
- [ ] Confetti + win sound on 6x, lose sound on 0-match.
- [ ] Back button never orphans socket (sends leave).

---

## 13. Fun Factors (Do Not Remove)

- Pulse glow on winnable symbols during tumble.
- Result panel top-left, never covers dice.
- Coin fly animation to wallet on win.
- Host "SHAKE IT!" button big + haptic `navigator.vibrate(20)`.
- Feed jokes: "Hari is feeling lucky 🍀", "Sita needs a loan 😅".
- Loser gets funny title: "Frog 🐸", "Dry Day 🏜️".

---

*End of ARCHITECTURE. Keep it fun, keep it fast, keep host happy.*
