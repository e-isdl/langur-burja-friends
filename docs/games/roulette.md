# Roulette (European Single-0) — Design Doc

> Spin the wheel, chase the ball, stack the chips. 10 bet types, 30s betting, slow-mo ball drop. Casino night on phones!

---

## 1. Overview

- Variant: European single-0 (37 pockets: 0-36). House edge 2.7%. No double-0 (friendlier).
- Players: 2-9 simultaneous betting vs house. No turns.
- Loop: 30s betting -> No more bets -> spin + ball -> payout -> Next.
- Round ~50s. Epic finale game.
- Fun: chip stacking, ball rattle, "Red! Red! Red!" shouting.
- Mobile: compact board, chip selector, tap to stack.

---

## 2. Wheel & Table Spec

- Pockets: 0 (green) + 1-36 (red/black alternating European order: 0-32-15-19-4-21-2-25-17-34-6-27-13-36-11-30-8-23-10-5-24-16-33-1-20-14-31-9-22-18-29-7-28-12-35-3-26).
- Colors: Red: 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36. Black rest. 0 green.
- 3D wheel: cylinder + pockets ring + ball sphere + center spindle. Spec §6.
- 2D board: standard grid 3 rows x12 cols + 0 top + outside bets (red/black, odd/even, 1-18/19-36, dozens, columns).
- History: last 10 numbers strip with color dots.

---

## 3. All 10 Bet Types with Payouts

| # | Bet | Covers | Payout (profit) | Example (10 chips) |
|---|-----|--------|-----------------|---------------------|
| 1 | Straight | 1 number | 35:1 | 10 on 7 => 350+10=360 |
| 2 | Split | 2 adjacent | 17:1 | 10 on 7/8 => 170+10 |
| 3 | Street | 3 in row | 11:1 | 10 on 7-8-9 => 110+10 |
| 4 | Corner | 4 block | 8:1 | 10 on 7-8-10-11 => 80+10 |
| 5 | Line (6) | 6 (2 streets) | 5:1 | 10 => 50+10 |
| 6 | Dozen | 12 (1-12,13-24,25-36) | 2:1 | 10 => 20+10=30 |
| 7 | Column | 12 in column | 2:1 | 10 => 30 |
| 8 | Red/Black | 18 | 1:1 | 10 => 20 |
| 9 | Odd/Even | 18 (0 loses) | 1:1 | 10 => 20 |
| 10 | High/Low (1-18/19-36) | 18 (0 loses) | 1:1 | 10 => 20 |

- 0: only straight/split/street/corner including 0 win (outside all lose on 0). House edge moment!
- Multi-bets allowed: stack chips on many spots (e.g., 5 on red + 10 on 7). Each resolves independently.
- Limits: min 5 per spot, max 50 per spot, max 200 total per player per round (prevent whales + perf).
- UI: tap spot to place selected chip (5/10/25?). Chips: 5/10/25 (higher for roulette). Tap again to remove? Or long-press clear? Tap stacks (+), X to clear all? Provide Undo + Clear.
- Edge: 0 hits: outside bets groan "Zero! 💚".

---

## 4. Betting Phase 30s

- 30s timer, board enabled, chips selectable.
- Show "Bets: 3 spots, 25 total" live + potential max win? Fun: "Max win 360!".
- Last 5s `tick()` + "Final bets!" pulse. At 0, lock, show "No more bets! 🙅".
- Late taps blocked with shake.
- Host spins (button enabled after lock). Actually auto-spin after 2s lock to keep pace? Host taps SPIN (big). Nudge if idle.
- Balance checks per tap, total cap enforced.
- Fun: chip stack grows visually per spot (height = amount).

---

## 5. Spin / Ball Physics & Payout Phase

```
BET 30s -> LOCK 2s (No more bets) -> SPIN 8s (wheel spins, ball whirls opposite, rattle) -> SLOW-MO 2s (ball drops, bounces) -> SETTLE (number banner) -> PAYOUT 5s (chips fly, winners flash) -> NEXT
```

- Host RNG: `winning = floor(rand*37)`. Sends `spin{winning, nonce}`. Clients animate to land on winning (deterministic angle + bounce noise local).
- Wheel angle: `target = pocketAngle(winning) + 5*360` (5 spins). Ball opposite.
- Payout: host computes per player per bet, sums, sends `payouts`. Clients animate.
- Example: Hari 10 straight 7 + 10 red. Win 7 red => 360 +20 =380 total. Show breakdown modal.
- Sounds: `spin()` loop, ball clicks, `win()` big, `lose()` small.
- Confetti on straight win (35:1) massive!

---

## 6. 3D Wheel Spec

- Renderer via three-env.js, ACES, shadows.
- Wheel: torus rim wood `#5a3a1e`, inner cylinder felt? Actually wheel: outer bowl static, inner rotating disc with 37 pockets (boxes with number textures via CanvasTexture).
- Ball: sphere 0.15 radius white, orbit radius 3.2 -> spiral to 2.4 pocket.
- Lights: key spot + gold rim, pocket emissive on win.
- Cameras: bet `(0,8,10)` sees board overlay + wheel; spin `(0,6,6)` close; settle top `(0,10,2)`.
- Perf: 37 textures ok, DPR clamp 2, pause when hidden.
- Fallback 2D: emoji wheel + number banner (still playable).
- Confetti on big wins.

---

## 7. Chip UI

- Chips: 5 (blue), 10 (green), 25 (black/gold). Selected glows.
- Board: CSS grid. Numbers 36px cells mobile (3x12 fits 375px? 12*28px=336 fits with 2px gaps). Outside bets full-width rows.
- Tap spot: chip flies from tray, stacks. Show amount badge if >1 chip.
- Undo (remove last), Clear (all). Confirm? No, lock is confirm.
- Opponent bets? Show counts per spot? Light dots "3 bets" to avoid clutter. Your bets highlighted.
- Accessibility: numbers + color labels (R/B), not color-only. Min 32px cells <44px — mitigate with zoom? Board exception, provide +/- zoom? Actually allow pinch? Keep 32px but require confirm? No, single tap is core. Note exception, ensure spacing 4px to reduce misclicks.

---

## 8. Messages

```json
{ "dataType":"ru_bet", "payload":{"who":"Hari","spot":"straight_7","stake":10} }
{ "dataType":"ru_bet", "payload":{"who":"Hari","spot":"red","stake":10} }
{ "dataType":"tick", "payload":{"sec":10,"phase":"ru_bet"} }
{ "dataType":"no_more_bets", "payload":{} }
{ "dataType":"spin", "payload":{"winning":7,"color":"red","nonce":"sp_9"} }
{ "dataType":"payout", "payload":{"winning":7,"payouts":{"Hari":380,"Sita":0},"breakdown":{"Hari":[{"spot":"straight_7","win":360},{"spot":"red","win":20}]}} }
{ "dataType":"restart", "payload":{"round":2} }
```

- Spots slug: `straight_0..36`, `split_7_8`, `street_7_8_9`, `corner_7_8_10_11`, `line_1_6`, `dozen_1`, `col_1`, `red/black/odd/even/low/high`.

---

## 9. Timers

- Bet 30s, lock 2s, spin 10s (8+2 slow), payout 5s. Total ~47s.
- Auto-spin if host idle 10s after lock? Yes to keep party moving.
- Next enabled after payout 3s (gloat time).

---

## 10. Sounds

- `tap()` chip/spot, `coin()` stack, `tick()` last 5s, `spin()` wheel loop + ball rattle, `win()` payout (pitch by amount), `lose()` zero/outside loss, `chime()` straight hit.

---

## 11. Edge Cases

- No bets: spin for fun, no payouts.
- Balance < min: sit out, toast.
- Total cap 200 hit: block with "Max 200!".
- 0 win: outside all lose, inside on 0 celebrate.
- Disconnect after bet: bets stay, payout on return.
- Double spin clicks: nonce idempotence.
- WebGL fail: 2D board + banner, same payouts.

---

## 12. Fun Details

- "Red! Red!" chant feed during spin (max 3).
- Hot/cold numbers from history (most/least frequent last 20).
- Big win titles: "Straight! 🎯", "Zero hero! 💚".
- Chip rain on 35:1.

---

## 13. Testing

- [ ] 37 pockets, colors correct, order European.
- [ ] All 10 payouts correct with fixtures (esp 0 edge).
- [ ] Multi-bets sum correctly.
- [ ] Caps min5/max50/spot/max200 enforced.
- [ ] 30s lock blocks late.
- [ ] Spin lands on winning, nonce prevents double.
- [ ] Mobile board fits, no h-scroll, misclick <5%.
- [ ] Sounds + mute.
- [ ] History updates.

---

*No more bets — round and round she goes! 🎡*
