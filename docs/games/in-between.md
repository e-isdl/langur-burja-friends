# In-Between — Design Doc

> Two boundary cards, one destiny card. Bet it lands in-between! Consecutive = instant death. Gap = payout!

---

## 1. Overview

- Players: 2-9. Simultaneous betting, no turns. Fast 40s rounds.
- Deck: single 52, host draws.
- Flow: host reveals 2 boundary cards -> 30s betting (in-between or side?) Actually core bet: will 3rd card rank fall strictly between the two? -> reveal 3rd -> payout.
- Boundary ranks sorted low-high. Aces? A low (1) or high (14)? Pick: A high (14) always for gaps? Or A can be low/high? Simplify: A=14 high only. K=13...2=2. Document.
- Consecutive boundaries (e.g., 7-8): auto-lose if you bet in-between (no gap). Show "No gap! 😱" and refund? No, lose (or block bets? Block with warning). Spec: consecutive auto-lose (if bet placed, lose). Better UX: block in-between bets when consecutive, only allow side bets? V1: block + toast, prevent feel-bad.
- Payouts variable by gap (see §4). Narrow gaps pay huge.
- Fun: shouting "IN! IN! IN!" as card flips, groans on edges.

---

## 2. Boundary Cards & Ranks

- Ranks: 2=2,3=3,...,10=10,J=11,Q=12,K=13,A=14. Suits irrelevant for win (only rank).
- Draw 2 boundaries: e.g., `5♦` and `Q♠` => low 5, high 12.
- Gap = high - low -1 = number of winning ranks. Example 5-12 => gap 6 (6,7,8,9,10,J win).
- Same rank pair? E.g., `9-9`? Gap 0, plus pair special? Treat as consecutive (no gap), auto-lose for in-between. Optionally offer "Pair bonus 11:1 if 3rd matches rank?" Fun variant! V1: if boundaries pair, 3rd same rank pays 11:1 (like 1-gap). Else lose. Document as variant on.
- Display: two big cards left/right, gap badge center "GAP 6 • Pays 1:1".
- Edge: A-K boundaries? Gap 0 (14-13-1=0) consecutive, block.
- Edge: A-2? Gap 11 (14-2-1=11) huge, pays 1:1 but almost always wins. Fun freebie!

---

## 3. Betting (30s Simultaneous)

- Stakes: 5/10/15 chips. One bet per player per round? Allow one in-between bet + optional side? Keep one bet for speed: tap [IN-BETWEEN] + stake, or [PASS].
- Actually allow bet amount only on in-between. No outside bets v1? Spec says "bet in-between exclusive" — yes only in-between. Pass = sit out round.
- Timer 30s, ring, `tick()` last 5s. Lock at 0, host flips.
- Balance check, chip slide animation to center.
- Show live bet feed + total pool? No pool, house pays (like langur). Show count "6 in!".
- Late bets ignored after lock.
- Edge: no bettors? Host still flips for fun, "No bets, just vibes".
- Edge: disconnect after bet: bet stays, payout on reconnect.

---

## 4. Variable Payouts by Gap

| Gap (winning ranks) | Example Boundaries | Payout (profit) | Total Return (stake+payout) | Hit Chance* |
|---------------------|--------------------|-----------------|-----------------------------|-------------|
| 1 gap | 7-9 (only 8 wins) | 11:1 | 12x (10=>120) | ~7.7% |
| 2 gaps | 7-10 (8,9 win) | 5:1 | 6x (10=>60) | ~15% |
| 3 gaps | 6-10 (7,8,9 win) | 4:1? Spec says 4:1 | 5x? Wait spec: 3gaps 4:1 | ~23% |
| 4+ gaps | 5-Q (6 ranks) | 1:1 | 2x (10=>20) | 30%+ |

- Spec exact: 1gap 11:1, 2gaps 5:1, 3gaps 4:1, 4+ 1:1. Use profit notation (11:1 means win 110 + stake back? Or total 110? Define: total = stake*(mult+1). So 10 at 11:1 => 120 total. Document clearly in UI as "WIN 110 + stake".
- Examples:
- Bet 10, boundaries 8-10? Actually 8-J? Let's do 7-9 (gap1, only 8): 3rd is 8♥ => win 110 profit, total 120. 3rd is 7/9 (edge hit?) Lose! Edges lose (must be strictly between). Pair? Lose.
- Bet 15, 5-K? Gap? K13-5=8-1=7 gaps => 1:1 => win 15 profit, total 30.
- Consecutive 7-8: no gap, in-between bets blocked, if somehow placed auto-lose (lose stake).
- Pair 9-9: variant pays 11:1 if 3rd is 9 (any suit). Else lose.
- House edge: payouts slightly below true odds, keeps wallet churning. Show "House pays!".

---

## 5. Flip Animation & Sequence Timeline

```
T+0s BOUNDARIES revealed (host draws 2, 0.8s flip each, gap badge pops)
T+0-30s BETTING (cards idle tilt, gap badge pulses, bet buttons enabled)
T+30s LOCK (buttons dim, "No more bets!" + spin sound)
T+30-32s SUSPENSE (3rd card back wiggles, camera pushes, "IN! IN!" chant feed)
T+32s REVEAL (flip 600ms, win/lose flash)
T+32-37s PAYOUT (coins fly, winner flash, feed results)
T+37s NEXT (host, new boundaries)
```

- Total ~40s. Fast!
- Skippable suspense? Tap to flip instantly after 1s.
- Reduced motion: instant flip, no wiggle.
- Camera (2D cards, no 3D needed): CSS flip. Optional three-env felt background.
- Sound: `card()` boundaries, `tick()` countdown, `spin()` suspense, `win()` in-win, `lose()` edge miss.

---

## 6. Win Logic Details

- Win if `low < thirdRank < high` (strict). Suits ignore.
- Lose if third <=low or >=high (edges lose!). Painful Q on Q-high? Lose.
- Consecutive (gap0): always lose for in-between (no winning rank). Block upfront.
- Pair boundaries: win only if thirdRank == pairRank (variant 11:1), else lose.
- Ace handling: A=14 high. So `K-A` consecutive? 13-14 gap0 block. `A-2`? Low 2 high 14 gap11 huge. Third A? Edge (==high) lose. Third K? Win (2<13<14). Fun!
- Multiple winners: all in-bettors win/lose independently vs house (not vs each other). No split.

---

## 7. Visuals & Layout

- Center: [Boundary1] [GAP badge] [Boundary2] + [???] third face-down during betting, flips on reveal.
- Cards 72x100px mobile, 90x126 desktop, rounded 10px, flip CSS 3D.
- Gap badge: "GAP 6 • 1:1" gold pill, pulses. Red "NO GAP" when consecutive.
- Bet bar bottom: stake chips 5/10/15 + big [BET IN-BETWEEN] gold + [PASS] ghost.
- Result: winning card glows green + "IN! 🎉", losing greys + "Edge! 😭" or "Miss!".
- Pot? No pot, house. Show wallet deltas.
- Mobile 375px: 3 cards fit row (72px + gaps), bet bar sticky, no scroll.
- Desktop: larger + side feed + history (last 10 gaps).

---

## 8. Messages

```json
{ "dataType":"ib_bound", "payload":{"round":4,"low":{"rank":"5","suit":"D"},"high":{"rank":"Q","suit":"S"},"gap":6,"payout":"1:1"} }
{ "dataType":"ib_bet", "payload":{"who":"Hari","stake":10,"side":"in"} }
{ "dataType":"tick", "payload":{"sec":12,"phase":"ib_bet"} }
{ "dataType":"ib_lock", "payload":{} }
{ "dataType":"ib_reveal", "payload":{"third":{"rank":"9","suit":"H"},"winners":["Hari"],"losers":["Sita"],"gap":6} }
{ "dataType":"ib_payout", "payload":{"payouts":{"Hari":20},"gap":6} }
{ "dataType":"restart", "payload":{"round":5} }
```

---

## 9. Sounds

- `card()` each boundary + reveal, `tap()` chip/bet, `tick()` last 5s, `spin()` suspense loop 2s, `win()` in, `lose()` edge/miss, `coin()` payout.

---

## 10. Edge Cases

- Boundaries same suit? Irrelevant, ignore.
- Deck exhaustion? Single deck, 3 cards/round => 17 rounds. Reshuffle when <10 left, `shuffle()` + toast.
- All pass? Show flip for fun, no payouts.
- Bet > balance blocked with shake.
- Host delay flipping? Nudge after 15s, claim host after 60s.
- Rapid Next: nonce per round, ignore double.
- Gap display when pair: "PAIR! Hit 9 for 11:1 🔥".

---

## 11. Fun Details

- Chant feed auto: "IN! IN! IN!" spam during suspense (fun, 3 messages max).
- Edge miss gets "So cruel! 😭" title.
- 1-gap win gets "SNIPER 🎯 11:1!" + confetti rain.
- History strip: last gaps with W/L dots.
- Preset chats: "Gap big! 💪", "Risky! 😱".

---

## 12. Testing

- [ ] Gap calc all pairs incl A=14, pair, consecutive.
- [ ] Payouts 11:1,5:1,4:1,1:1 correct for 5/10/15 stakes.
- [ ] Edges lose (third == boundary loses).
- [ ] Consecutive blocks bets with toast.
- [ ] 30s lock, late bets ignored.
- [ ] Flip animation readable on 375px.
- [ ] Sounds + mute.
- [ ] Reshuffle at <10 cards.
- [ ] Reconnect mid-bet keeps bet.

---

*Feel the gap, take the leap — IN! 🃏*
