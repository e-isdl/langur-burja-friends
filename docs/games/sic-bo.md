# Sic Bo — Design Doc

> Three pip dice, nine ways to win. Small/Big, triples 150:1, doubles, totals, combos. Reuses langur bowl, 3x1 settle grid!

---

## 1. Overview

- Dice: 3 standard pip dice (1-6 pips, white ivory, black pips, red 1/4? Classic: 1 and 4 red).
- Players: 2-9 simultaneous vs house. No turns.
- Loop: 30s betting -> shake 2s -> tumble 6s -> 3x1 settle -> payout -> Next. Total ~45s.
- Reuse langur bowl + felt + cameras (smaller bowl? Same, fewer dice).
- Goal: pick from 9 bet types. Multiple bets allowed.
- Fun: triple tension, "Small! Small!" chants, 150:1 dreams.

---

## 2. Dice & Scene Reuse

- Dice: 3x BoxGeometry 1x1, pip textures via CanvasTexture (1-6). Ivory `#fff8e7`.
- Bowl: same brass-rim bowl as langur (import from three-env + langur assets). Felt same.
- Settle grid: 3x1 row center (vs langur 3x2). Positions x [-2,0,2], z 0, y 0.5.
- Cameras: bet `(0,9.2,13.5)`, shake `(0,15.2,0.9)`, settle `(0,11.5,3.5)` — same as langur for consistency.
- Physics: same fake bounce, 3 dice lighter, faster settle (6s tumble vs 8s).
- Sounds: same `dice()` rattle, `win()`/`lose()`.
- Fallback 2D: ⚀⚁⚂ dice emoji.

---

## 3. All 9 Bet Types with Payouts

| # | Bet | Wins When | Payout (profit) | Example 10 |
|---|-----|-----------|-----------------|------------|
| 1 | Small (4-10) | total 4-10, LOSES on any triple | 1:1 | 10=>20 |
| 2 | Big (11-17) | total 11-17, LOSES on any triple | 1:1 | 10=>20 |
| 3 | Specific Triple | exact triple e.g., 4-4-4 | 150:1 | 10=>1510! |
| 4 | Any Triple | any triple 1-1-1..6-6-6 | 24:1 | 10=>250 |
| 5 | Double (specific) | at least two of rank e.g., 5-5-x | 8:1 | 10=>90 |
| 6 | Total (specific number) | total = N (4-17). Payout varies 6:1-50:1 | see §4 | — |
| 7 | Single (number appears) | rank appears 1/2/3 times => 1:1 / 2:1 / 3:1? Actually 1:1 if once, 2:1 if twice, 3:1? Spec: single 1:1/2:1 (once 1:1, twice 2:1, triple? triple also? But triple already pays? Allow stack). | 1:1 or 2:1 | 10=>20 or 30 |
| 8 | Two-Combo | two specific ranks appear (e.g., 3+5) | 5:1 | 10=>60 |
| 9 | Three-Combo | three specific ranks? Actually single roll has 3 dice, combo of? E.g., 1-2-3? Or any? Spec: three-combo 30:1? Likely specific triple-combo? Let's define: pick 3 ranks? Hmm 3 dice = 3 ranks, so three-combo = exact set? E.g., 2-4-6 in any order => 30:1. Document. | 30:1 | 10=>310 |

- Notes:
- Small/Big exclude triples: `4-4-4` (total 12) would be Big but LOSES for Big/Small. Critical! Show "Triple kills Small/Big! 💀".
- Specific triple 150:1 huge, confetti storm.
- Single: if you bet `4` and roll `4-4-2` => twice => 2:1 (30 total). If `4-2-6` => once => 1:1 (20). If `4-4-4` => triple => still 2:1? Or 3:1? Spec says 1:1/2:1, so cap at 2:1. Document.
- Totals payouts vary by probability (see §4).
- Multi-bets: e.g., 10 Small + 5 Any Triple hedge. Each resolves.

---

## 4. Totals Payout Table (Bet Type 6)

| Total | Combos | Payout (profit) | Example 10 |
|-------|--------|-----------------|------------|
| 4 | 1 (1-1-2) | 50:1 | 510 |
| 5 | 2 | 30:1? Actually classic 18:1? Let's use spec range 6:1-50:1: assign 4:50,5:30,6:18,7:12,8:8,9:6,10:6,11:6,12:6,13:8,14:12,15:18,16:30,17:50. Symmetric. | — |
| 6 | 3 | 18:1 | 190 |
| 7 | 6 | 12:1 | 130 |
| 8 | 10 | 8:1 | 90 |
| 9 | 15 | 6:1 | 70 |
| 10 | 18 | 6:1 | 70 |
| 11 | 18 | 6:1 | 70 |
| 12 | 15 | 6:1 | 70 |
| 13 | 10 | 8:1 | 90 |
| 14 | 6 | 12:1 | 130 |
| 15 | 3 | 18:1 | 190 |
| 16 | 2 | 30:1 | 310 |
| 17 | 1 (6-6-5) | 50:1 | 510 |

- Triples 3 and 18? Actually 3 (1-1-1) and 18 (6-6-6) are triples, not in Small/Big range? Totals 3 and 18 auto-lose for Small/Big? Small 4-10, Big 11-17, so 3/18 out anyway. For total bets, 3/18 only winnable via Specific/Any Triple, not total. Document: total bets only 4-17.
- UI: total row shows payout per number live.

---

## 5. Betting Phase 30s

- Chips 5/10/25? Actually 5/10/15 to match langur? Use 5/10/25 for sic-bo (higher variance). Pick 5/10/25, document.
- Board: sections for Small/Big, Triples (6 specific + Any), Doubles (6), Totals (14 numbers), Singles (6), Combos (15 two-combos? Actually C(6,2)=15, show grid).
- Tap to place, tap again to stack? Or select chip then tap? Chip-select then tap spots (stacks). Undo + Clear.
- Caps: min 5/spot, max 50/spot, max 200 total.
- Live: "Bets: 4 spots, 35 total".
- Lock at 0, "No more bets!".
- Fun: chip stacks grow, hot totals highlighted from history.

---

## 6. Roll Timeline (Reuse Langur)

```
BET 30s -> SHAKE 2s (rattle) -> TUMBLE 6s (3 dice bounce) -> SETTLE 3x1 row -> PAYOUT 5s -> NEXT
```

- Host RNG 3x `1-6`, sends `shake{faces}` + `result{payouts}`.
- Clients animate to faces.
- Skippable after 2s.
- Reduced motion instant.

---

## 7. Visuals & Board Layout

- Top: 3D bowl 35vh. Bottom: board scroll vertical (no h-scroll). Sections collapsible? Small/Big big buttons top, triples row, totals grid.
- Mobile 375px: board vertical stack, cards 44px targets, totals 36px cells (exception with spacing).
- Desktop: side board + 3D left.
- Result banner: dice pips + total + "SMALL! 🎉" / "TRIPLE 4s! 🤯 150:1!".
- Winners flash green, losers dim.
- History: last 10 totals + triples dots.

---

## 8. Messages

```json
{ "dataType":"sb_bet", "payload":{"who":"Hari","spot":"small","stake":10} }
{ "dataType":"sb_bet", "payload":{"who":"Hari","spot":"triple_4","stake":5} }
{ "dataType":"sb_bet", "payload":{"who":"Sita","spot":"total_10","stake":10} }
{ "dataType":"tick", "payload":{"sec":8,"phase":"sb_bet"} }
{ "dataType":"shake", "payload":{"faces":[4,4,4],"nonce":"sb_3"} }
{ "dataType":"result", "payload":{"faces":[4,4,4],"total":12,"isTriple":true,"payouts":{"Hari":755},"nonce":"sb_3"} }
```

- Spots: `small/big`, `triple_1..6`, `any_triple`, `double_1..6`, `total_4..17`, `single_1..6`, `combo_3_5` (two), `combo3_2_4_6` (three).

---

## 9. Sounds

- Same as langur: `tap()`, `dice()`, `tick()`, `coin()` small wins, `win()` triples/totals big, `lose()` miss. Mute.

---

## 10. Edge Cases

- Triple kills Small/Big even if total in range — show skull + toast.
- Specific triple vs Any triple both win? If `4-4-4` and you bet both specific 4 + any => both pay (stack! 150:1+24:1). Fun hedge!
- Double + Single + Total can all win same roll (e.g., `5-5-2`: double5 wins, single5 2:1 wins, total12 wins). Stack all!
- No bets: shake for fun.
- Balance caps enforced.
- Reshuffle? No deck, dice infinite.
- Double shake nonce idempotence.

---

## 11. Fun Details

- "Small! Small!" chant feed.
- Triple 150:1 gets full-screen flash + rain + "LEGEND! 🤯".
- Any triple 24:1 gets "Triple! 🎲🎲🎲".
- Preset chats: "Big! 💪", "Triple hunt! 🎯".

---

## 12. Testing

- [ ] 3 dice 1-6 RNG, 3x1 settle readable.
- [ ] Small/Big 1:1 excl triples verified (4-4-4 loses Big!).
- [ ] Specific 150:1, any 24:1, double 8:1, single 1:1/2:1, two-combo 5:1, three-combo 30:1, totals 6:1-50:1 all fixtures.
- [ ] Stacking wins sum correctly.
- [ ] 30s lock, caps enforced.
- [ ] Reuse bowl no regression on langur.
- [ ] Mobile board no h-scroll.
- [ ] Sounds + mute.

---

*Small or Big, Triple dream — shake it! 🎲*
