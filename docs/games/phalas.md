# Phalas / Dhumbal — Design Doc

> Low-card rummy. 5 cards, draw-discard, lay sets/runs, call Dhumbal when low. Lowest wins, caller risks +25 penalty!

---

## 1. Overview

- Players: 2-5 (best 4). 5 cards each.
- Goal: minimize deadwood (unmelded points). Call Dhumbal when you think you're lowest. Or go out by melding all + discard.
- Scoring: sum of others? Actually winner scores? Classic Dhumbal: caller lowest wins, gets sum of others' deadwood as points? Or losers get points? For party: losers accumulate points, elimination at 100. Lowest deadwood wins hand, others get their deadwood points. Caller if not lowest gets +25 penalty + their deadwood.
- Elimination at 100 points. Last standing wins room.
- Round: deal -> draw/discard (45s/turn) -> lay-downs -> Dhumbal call -> scoring.
- Fun: tension of calling early vs fattening, penalty drama.

---

## 2. Card Values

| Rank | Value | Notes |
|------|-------|-------|
| A | 1 | Ace low, 1 pt |
| 2-10 | face | 2=2 ... 10=10 |
| J | 0 | Jack zero! Dump high, keep Js |
| Q | 10 | Queen 10 |
| K | 10 | King 10 |

- Examples: `A+Q+J` = 1+10+0=11. `K+10+9` = 29. `J-J-5` = 5.
- Deadwood = sum of unmelded cards only. Melded sets/runs = 0.
- UI: card corner shows tiny point badge (e.g., Q `10`, J `0` green).
- Teaching: hint bar shows "Deadwood: 18" live.
- Edge: all Js hand = 0 deadwood! Instant Dhumbal bait.

---

## 3. Deal & Meld Concepts

- Deal 5 each, stock + discard (top flipped).
- Sets: 3+ same rank (e.g., `7H 7D 7C`, `K-K-K-K`).
- Runs: 3+ consecutive same suit (e.g., `4-5-6♥`, `10-J-Q-K♠`? J counts in run? Yes rank sequence, J between 10-Q).
- Pure? No pure concept, any set/run valid. Jokers? No jokers v1 (clean).
- Lay-down: on your turn after draw, you may lay one set/run to table (hand shrinks). Can lay multiple? One per turn to keep pace? Allow multiple for fast wins.
- Laid cards are locked (cannot pick back). Show in meld tray.
- Deadwood recalculates after each lay.
- Going out (Gin?): if you meld all 5 + discard? With 5 cards, draw to 6, meld 3+? Actually need to meld all? Example: draw 1 (6), lay set of 3 (3 left), discard 1 (2 left) — not out. Out when 0 left after meld+discard. Rare with 5, but possible with 2 melds? 6 cards -> two sets of 3 -> 0, no discard needed, win instantly (Big Gin!). Fun!

---

## 4. Draw + Discard vs Call Dhumbal

- On turn (45s):
- Option A: DRAW stock (mystery) or discard top (known). Hand 5->6.
- Then optionally LAY sets/runs.
- Then DISCARD 1 to end turn (hand back to 5, or fewer if laid).
- Option B: CALL DHUMBAL instead of drawing (if you think you're lowest). Ends hand immediately, goes to scoring (see §5).
- Dhumbal eligibility: only on your turn before drawing, and deadwood <=? Classic threshold e.g., <=10? Simplify: anytime, but risk penalty. Allow anytime for party chaos.
- Knock vs Dhumbal? Same. Big button "CALL DHUMBAL 📢" gold, confirm modal ("Really? Deadwood 8?").
- Edge: calling with 0 deadwood? Auto-win (Gin), bonus? Give double? V1: win + others get +10 extra? Keep simple: win normally.
- Edge: stock empty? Auto-Dhumbal showdown (lowest wins, no penalty).

---

## 5. Dhumbal Win / Penalty Logic

- When caller calls:
- All reveal hands, compute deadwood (unmelded sum, laid cards 0).
- If caller is uniquely lowest: caller WINS hand. Others get their deadwood as points (added to total). Caller gets 0.
- If tie for lowest including caller? Caller wins ties (reward courage). Others tied? They also get 0? Or get their points? Friend rule: tied lowest with caller also get 0. Document.
- If caller NOT lowest (someone lower): UNDERBID! Caller gets +25 penalty + their deadwood. Actual lowest gets 0, others get their deadwood.
- Example:
- Hari calls with 8, Sita 12, Ram 20 => Hari wins, Sita +12, Ram +20, Hari +0.
- Hari calls with 15, Sita 9, Ram 20 => penalty! Hari +40 (15+25), Sita +0, Ram +20.
- Scoring sum of others? Alternative: winner gets sum as positive? We use loser-points (golf style), lower total better, 100 out. Clearer for elimination.
- Show scoring table modal with breakdown + `win()`/`lose()`.
- Feed: "Hari called Dhumbal with 8! ✅" or "Underbid! +25 😱".

---

## 6. Scoring & Elimination at 100

- Track `totalPoints` per player across hands (persist in room, reset on new room).
- After each hand, add hand points to totals.
- Elimination at >=100: avatar 💀, spectate, toast "Ram out at 102!".
- Last alive wins room: confetti + "CHAMPION 🏆".
- Rebuy? Host can reset points or allow rebuy at 50? Optional "Second chance" button (host only) sets out player to 50. Fun for parties.
- Display: leaderboard side panel with progress bars to 100.
- Edge: all reach 100 same hand? Lowest total wins? Or play tiebreaker? Lowest wins.
- Edge: caller penalty pushes them over 100? They’re out, drama!

---

## 7. Turn Timer 45s

- 45s per turn (draw+lay+discard). Ring + `tick()` last 5s.
- Timeout: auto-draw stock, auto-discard highest deadwood, no lay (safe).
- Dhumbal call has 10s confirm window, else cancel.
- Total hand 5-10 min with 4 players. Show hand timer.
- Away: auto-discard keeps game moving, still eligible for Dhumbal? No auto-call, must be present to call.

---

## 8. Visuals

- Hand bottom fanned 5-6 cards with point badges, deadwood counter live.
- Stock/discard center, meld trays per player (mini cards).
- Leaderboard right (desktop) / collapsible top (mobile).
- Dhumbal button big gold bottom, confirm modal.
- Scoring modal: table with deadwood, penalty, totals, elimination flags.
- Mobile 375px: cards 52px, melds horizontal scroll? No h-scroll — wrap minis. Buttons 48px.
- Animations: draw slide, lay pop, discard fly, scoring count-up.

---

## 9. Messages

```json
{ "dataType":"deal5", "payload":{"handNo":3,"hands":{"Hari":["AS","QH","JD","7C","7D"]},"stockCount":27,"discardTop":"9S","totals":{"Hari":20,"Sita":35}} }
{ "dataType":"draw", "payload":{"who":"Hari","from":"stock","card":"7H"} }
{ "dataType":"lay", "payload":{"who":"Hari","meld":["7C","7D","7H"],"type":"set"} }
{ "dataType":"discard", "payload":{"who":"Hari","card":"QH","deadwood":8} }
{ "dataType":"dhumbal", "payload":{"caller":"Hari","deadwoods":{"Hari":8,"Sita":12,"Ram":20},"winner":"Hari","penalty":0,"points":{"Hari":0,"Sita":12,"Ram":20},"totals":{"Hari":20,"Sita":47,"Ram":60}} }
{ "dataType":"dhumbal_penalty", "payload":{"caller":"Hari","deadwoods":{"Hari":15,"Sita":9},"winner":"Sita","penalty":25} }
{ "dataType":"elim", "payload":{"who":"Ram","total":102} }
{ "dataType":"tick", "payload":{"who":"Hari","sec":10} }
```

---

## 10. Sounds

- `shuffle()` deal, `card()` draw/discard/lay, `coin()` lay set, `chime()` your turn + Dhumbal call horn, `win()` hand win, `lose()` penalty/underbid, `tick()` countdown.
- Dhumbal call: airhorn-ish (two-tone loud) — fun!

---

## 11. Edge Cases

- J in runs: `10-J-Q` valid run? Yes, J rank 11 for sequence, 0 for points. Document duality.
- A in runs? `A-2-3` valid, `Q-K-A` valid? Allow both (A low/high). `K-A-2` invalid.
- Laying invalid meld? Host validates, rejects with toast "Not a set/run!".
- Calling Dhumbal with laid cards? Laid 0, so low — allowed, strong.
- Stock reshuffle: keep top, shuffle rest, toast.
- Disconnect with low hand? Auto-discard, still scored if Dhumbal called by others.
- Host mis-scores? Clients compute too, mismatch shows "Check scores!" but trust host.

---

## 12. Fun Details

- Deadwood meter color: green <10, amber <20, red 20+.
- "Dhumbal chicken" badge if you never call in 5 hands 🐔.
- Underbid gets "Greedy! 😅" title.
- Gin (0 deadwood win) gets "FLAWLESS ✨" + confetti rain.
- Preset chats: "Dhumbal? 👀", "Count your points! 😂".

---

## 13. Testing

- [ ] Values A1,J0,Q/K10 correct, deadwood sums.
- [ ] Sets/runs detection including A-2-3, Q-K-A, 10-J-Q.
- [ ] Lay locks, deadwood updates live.
- [ ] Dhumbal win when lowest, tie caller wins.
- [ ] Penalty +25 when underbid, totals correct.
- [ ] Elimination at 100, rebuy works.
- [ ] 45s auto-draw/discard, no stall.
- [ ] Mobile fits, scoring modal readable.
- [ ] Stock reshuffle preserves top.

---

*Keep it low, call it bold — Dhumbal! 📢*
