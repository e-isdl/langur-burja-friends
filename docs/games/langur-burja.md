# Langur Burja — Design Doc

> Nepali crown-and-anchor party dice. Bet a symbol, shake the bowl, scream at dice. 6 symbols, 6 dice, pure joy.

---

## 1. Overview & Fun Pitch

- Players: 2-9 per room. One host shakes.
- Vibe: street fair + casino. Loud, fast, 45s per round.
- Loop: bet -> shake -> tumble -> settle -> payout -> again!
- No skill, all luck, all shouting. Perfect icebreaker.
- Fun factor 10/10 when bowl tumbles in 3D with brass rim glint.
- Edge: everyone bets same symbol? Payout still per-count, house can bleed. Cap total stake per symbol at 100 to protect fun.
- Mobile: one-thumb betting, big symbol grid, Next button thumb-reachable.

---

## 2. Symbols Table

| # | Symbol | Emoji / Face | Color | Payout Key | Fun Name |
|---|--------|--------------|-------|------------|----------|
| 1 | langur (monkey) | 🐒 | brown | langur | Monkey Business |
| 2 | burja (flag) | 🚩 | red | burja | Flag Frenzy |
| 3 | club (paan) | ♣️ | black/green | club | Lucky Leaf |
| 4 | diamond (eeta) | ♦️ | red | diamond | Shiny Brick |
| 5 | heart (dil) | ♥️ | red | heart | Dil Deal |
| 6 | spade (hukum) | ♠️ | black | spade | Hukum King |

- Dice faces: custom texture per symbol, ivory background `#fff8e7`, engraved look.
- Grid order: [langur, burja, club, diamond, heart, spade] — 3x2 on desktop, 3x2 compact on mobile.
- Accessibility: symbol + text label, never color-only. Contrast 4.5:1.
- Fallback 2D: emoji 48px if WebGL fails.
- Sound per symbol? No, single `dice()` + `win()` if your symbol hits 2+.

---

## 3. Betting Rules

- Stakes: 5 / 10 / 15 chips. Toggle chips, then tap symbols to place.
- Multi-symbol allowed: e.g., 10 on heart + 5 on spade.
- Toggle-off players: lobby toggle "sitting out" — grey avatar, cannot bet, skipped in payouts.
- Min 5, max 15 per symbol per player per round? Actually allow stack: tap twice = 2x stake? Spec: single tap places selected stake, tap again removes. Simpler, prevents misclick debt.
- Balance check: if stake > balance, shake button + toast "Not enough coins!".
- Timer: 30s betting. Ring countdown top-center. Last 5s `tick()` + red pulse.
- Late bets: host locks at 0s, ignores `bet` after `roll`. Client disables grid.
- Host can extend +10s once per round ("Wait for Sita!" button).
- All bets visible live in feed: "Hari 10 on ♥️".
- Edge: player disconnects after betting — bet stays, payout still credited on reconnect within grace.
- Edge: host sits out? Host can also bet like others. Yes.
- Fun: chip slide animation from wallet to symbol, stack grows.

---

## 4. Roll Sequence Timeline (Total ~40s)

```
T+0s   BET phase starts, 30s timer, grid enabled, Host sees SHAKE button disabled until lock? Actually enabled.
T+30s  BET locks, grid disabled, Host taps SHAKE IT! (big gold button)
T+30-32s SHAKE (2s): bowl lifts slightly, dice rattle inside (sound dice()), camera pushes in
T+32-40s TUMBLE (8s): dice fly out, physics bounce on felt, pulse glow on symbols that players bet on
T+40s  SETTLE: dice snap to 3x2 grid positions, camera top-down, result computed by host RNG
T+40-45s PAYOUT (5s): result panel top-left, winner flash, coin fly, feed lists wins
T+45s  NEXT button (host) -> restart -> BET again
```

- Host authority: host generates `faces[6]` via `Math.random`, sends `roll` then `result`.
- Clients animate with same faces (deterministic settle positions + random bounce seed local).
- Skippable: tap bowl to fast-forward tumble after 3s (for impatient friends).
- Reduced motion: skip tumble, fade to grid.
- Edge: host never presses SHAKE -> after 20s idle, show nudge "Host, shake it!". After 60s, allow any player to Claim Host.
- Edge: double SHAKE clicks -> nonce idempotence, second ignored.

---

## 5. Payout Table

| Match Count | Multiplier | Net Example (10 stake) | Result Text |
|-------------|------------|------------------------|-------------|
| 0 | lose (0x, -stake) | -10 | "Dry Day 🏜️" |
| 1 | lose (0x, -stake) | -10 | "So close! 🥲" (house rule: 1 still loses to keep party fast) |
| 2 | 2x (profit + stake? Actually 2x total) | +20 (net +10) | "Double! 🎉" |
| 3 | 3x | +30 (net +20) | "Triple Treat! 🔥" |
| 4 | 4x | +40 (net +30) | "Mega! 💰" |
| 5 | 5x | +50 (net +40) | "Ultra! 🚀" |
| 6 | 6x | +60 (net +50) | "JACKPOT MONKEY! 🐒👑" |

- Formula: `payout = stake * count if count>=2 else 0`. Net = payout - stake? Or payout includes stake? Define: total returned = stake*count. So 2 matches on 10 = 20 returned.
- Examples:
- Bet 10 heart, faces [heart,heart,spade,club,diamond,langur] => 2 hearts => get 20.
- Bet 15 spade, faces [spade x4, heart, club] => 4 => 60.
- Bet 5+5 on two symbols, one hits 3, other 0 => 15 -5 = net +10? Show per-symbol breakdown.
- House edge: with 1=lose, edge high, keeps wallet churning, more re-seeds, more laughs.
- Alternative fun variant (optional toggle): 1 match = refund 1x. Off by default.
- Display: result panel lists "♥️ x3", your win "+20", balance animate.
- Sound: 0-1 `lose()`, 2-3 `coin()`, 4+ `win()` + confetti.
- Edge: bet 0? Not allowed. Min chip 5.

---

## 6. 3D Scene Spec (three-env.js)

- Renderer: WebGLRenderer antialias, ACESFilmic, shadowMap PCFSoft, DPR clamp 2.
- Table: circle felt `radius 9`, gradient `#1e8c52` center -> `#073520` edge, wood rim torus `#5a3a1e`.
- Bowl: lathe/cylinder, brass rim `#c9a227` metalness 0.9 roughness 0.25, dark interior.
- Dice: BoxGeometry 1x1x1 rounded (use RoundedBox if available else Box + bevel texture), ivory `#fff8e7`, symbol decals via CanvasTexture per face.
- Physics (fake): velocity + gravity + bounce damping 0.5, felt friction. No cannon.js — hand-tuned lerp for perf.
- Lights: hemi 0.7, key SpotLight (5,10,5) castShadow, rim PointLight gold.
- Fog: `new THREE.Fog(0x04070a, 18, 40)`.
- Cameras:
- Bet cam: `(0,9.2,13.5)` look `(0,0,0)` — sees bowl + grid overlay.
- Shake cam: `(0,15.2,0.9)` look `(0,0,0)` — top-down rattle.
- Settle cam: `(0,11.5,3.5)` look `(0,0,0)` — 3x2 grid readable.
- Lerp between cams 1.2s easeInOut.
- Grid settle positions: x in [-2.2,0,2.2], z in [-1.1,1.1], y=0.5, random rotY.
- Pulse glow: bet symbols get emissive pulse during tumble — `MeshStandardMaterial.emissiveIntensity = 0.5+0.5*sin(t*6)`.
- Confetti: InstancedMesh 200 quads on 4+ win.
- Mobile perf: 60fps target, pause when tab hidden, reduce shadow to 512px on <liśmy.

---

## 7. Sounds

- `tap()` on chip select + symbol tap.
- `dice()` on shake + each bounce (throttled 100ms).
- `coin()` on 2-3 match win.
- `win()` + confetti pop on 4+.
- `lose()` low thud on 0-1.
- `tick()` last 5s betting.
- `chime()` when result panel shows your win.
- Mute persists. All sounds <0.5s except win (1.2s).

---

## 8. Host Authority Messages

```json
// player bet
{ "type":"data", "dataType":"bet", "payload":{"symbol":"heart","stake":10,"name":"Hari"} }
// host starts roll
{ "type":"data", "dataType":"roll", "payload":{"nonce":"r_123","faces":["heart","spade","heart","club","diamond","langur"]} }
// host result with payouts
{ "type":"data", "dataType":"result", "payload":{"faces":["heart","spade","heart","club","diamond","langur"],"counts":{"heart":2,"spade":1},"payouts":{"Hari":20,"Sita":0},"nonce":"r_123"} }
// tick
{ "type":"data", "dataType":"tick", "payload":{"sec":12,"phase":"bet"} }
// restart
{ "type":"data", "dataType":"restart", "payload":{"round":3} }
```

- Server relays verbatim, no validation except size.
- Clients ignore `bet` after `roll` nonce seen.
- `result` nonce must match `roll` nonce, else ignore (prevents double-pay).
- Wallet update follows `result` as separate `wallet` broadcast from server (host sends wallet map).

---

## 9. UX Flows & Layouts

- Desktop: left 3D canvas (60%), right bet panel (40%) with symbol grid 3x2, chip selector, feed.
- Mobile 375px: top bar (back, code, wallet, mute), 3D 38vh, chip row horizontal scroll? No h-scroll — wrap. Symbol grid 3 cols, 2 rows, 84px cells, 44px tap.
- Result panel: absolute top-left, 220px card, never covers dice center. Shows faces mini + your win.
- Next button: host only, bottom sticky, gold, 52px height. Non-host sees "Waiting for host...".
- Sitting-out toggle: lobby switch + in-game avatar long-press.
- Reconnect banner: amber top strip "Reconnecting... bets safe!".
- Accessibility: buttons labeled, dice results also as text list.

---

## 10. Edge Cases Matrix

- No bets placed: host can still roll for fun? Yes, shows "No bets, just vibes".
- All lose: show funny "House eats tonight 🏠".
- Balance 0: show "+100" request button (host approves or auto if host enabled auto-refill).
- Rapid taps: debounce 200ms, prevent double-bet.
- Orientation change: re-fit camera, keep bets.
- WebGL fail: emoji grid + same timers/payouts.
- Tunnel lag 2s: bets timestamped, host lock uses host clock, late echo ignored gracefully.

---

## 11. Testing Checklist (Langur)

- [ ] 30s timer locks, late tap blocked with shake.
- [ ] 2s shake + 8s tumble feel right, skippable.
- [ ] 3x2 settle readable on 375px.
- [ ] Payouts 0,1,2,3,4,5,6 all correct with 5/10/15 stakes.
- [ ] Sounds + mute work.
- [ ] Result top-left never overlaps dice on small screen.
- [ ] Next resets bets, wallet persists.
- [ ] Sitting-out player cannot bet, not in payout.
- [ ] Reconnect mid-tumble resumes at result.

---

*Fun mantra: bet fast, shout louder, monkey bless! 🐒*
