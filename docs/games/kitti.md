# Kitti (9-Card Brag) — Design Doc

> 9 cards, 3 brags, 30 seconds of spicy arranging. Make 1+2 or 2+3 win, never 1+3. Salaami for sweeps!

---

## 1. Overview

- Players: 2-6 (best 4). Each gets 9 cards.
- Goal: arrange 9 into 3 brags (3 cards each: Brag1 top, Brag2 middle, Brag3 bottom).
- Showdown: compare brag vs brag. Need 2 brags to win? Actually need consecutive: 1+2 or 2+3 wins. 1+3 does NOT win.
- Pot: boot ante (e.g., 10). Winner takes pot. No winner -> carry-over to next round (pot grows!).
- Salaami: win all 3 brags (3/3) -> take pot + extra salaami from each player (e.g., 5 each).
- Round: deal -> 30s arrange -> showdown -> payout/carry.
- Fun: tap-swap arranging under time pressure, last-second swaps, groans.

---

## 2. Deal & Setup

- Deck: single 52. Deal 9 each, face-down to others, face-up to you for arranging.
- Boot: 10 chips each into pot. If balance < boot, sit out.
- Dealer rotates. Host shuffles via `shuffle()`.
- UI: your 9 cards in 3 rows of 3 (initial order random). Tap two cards to swap (any rows).
- Timer: 30s arrange. Ring + `tick()` last 5s. At 0s, lock arrangement as-is.
- Early lock: "Done" button when happy. When all Done or timer ends -> showdown.
- Edge: player disconnects during arrange -> keep dealt cards, auto-lock at timeout, still in showdown.
- Edge: fewer than 2 arrangers? If only 1 active, auto-win pot.
- Fun: cards wiggle when <10s left, "Hurry! 😱".

---

## 3. Arrange Interaction (Tap-Swap)

- Tap card 1 -> glows gold, `tap()`.
- Tap card 2 -> swap with flip animation 250ms, `card()`.
- Tap same card again -> deselect.
- Drag? No drag v1, tap-swap is thumb-friendly + accessible.
- Brag labels: Row1 "Brag 1", Row2 "Brag 2", Row3 "Brag 3".
- Live strength hint? Optional: show tiny badge "Pair!" per row (helps newbies). Toggleable "Hints" (on by default).
- Accessibility: rows labeled, cards have rank+suit text, not color-only.
- Mobile 375px: cards 52x72px, gap 6px, 3x3 fits without scroll. Use `clamp()`.
- Desktop: 72x100px, centered, side pot panel.
- Undo? No undo, swap back is undo. Simple.
- Confirm: no confirm, Done locks. Allow Unlock before timer ends? Yes, "Edit" until lock.

---

## 4. Brag Rankings (Per 3-Card Brag)

- Order highest to lowest:
- 1. Kitti (special): `2-3-5` offsuit (any suits, NOT same suit, NOT sequence?) Actually spec: kitti 2-3-5 offsuit highest. So `2♠ 3♥ 5♦` mixed beats even prail! If suited? Then it's flush/run? No, kitti must be offsuit to be kitti. Document.
- 2. Prail / Trail: three of a kind. `A-A-A` > `K-K-K` > ... > `2-2-2`.
- 3. Running Flush / Pure Seq: consecutive same suit. `A-2-3` highest? For kitti, use same as teen-patti: `A-2-3` highest, then `A-K-Q`. Confirm in code.
- 4. Run / Sequence: consecutive offsuit. `A-2-3` highest.
- 5. Flush: same suit, not seq. Compare high cards.
- 6. Pair: pair + kicker. Compare pair rank, then kicker.
- 7. High: compare high to low.
- Tiebreak: rank then suit S>H>D>C for final equality? Actually per-brag tie needs suit? Use same S>H>D>C for high/flush.
- Examples:
- `2H 3D 5C` (kitti) beats `AS AH AD` (prail aces) — wild!
- `Q♠ J♠ 10♠` (running flush) beats `K♥ Q♦ J♣` (run).
- `9-9-4` beats `8-8-A` (pair 9s > 8s regardless of kicker).
- Hints: show "KITTI! 🔥" badge gold pulsing when row is kitti.

---

## 5. Special Rules

### 5.1 Four-of-a-Kind Instant Win

- If your 9 cards contain four of same rank (e.g., four Kings across brags), you instantly win pot, no showdown.
- Detection: host checks on deal, broadcasts `instant_win`.
- UI: "FOUR KINGS! Instant win! 👑" + confetti + `win()`.
- Edge: two players both have four-of-kind? Rarer than lightning. Higher rank wins, if same rank? Split pot. Log it.
- Fun: reveal all 9 to prove.

### 5.2 Four Pairs Redeal

- If your 9 contains four pairs + 1 odd? Actually 9 cards can't have four pairs (needs 8) +1 = yes possible: e.g., `AA KK QQ JJ + 5`. That's four pairs.
- Rule: any player with four pairs can demand redeal before arrange ends? Or auto-redeal?
- Spec: four pairs = redeal. Host detects, announces "Four pairs! Redeal 🔄", no pot change, redeal same boot? Boot stays, no extra ante.
- Edge: multiple redeals in a row? Cap 3 redeals then force play (avoid infinite).
- UI: show pairs glowing, then shuffle animation.

### 5.3 Consecutive-Win Logic (Core!)

- Compare each brag: Brag1 vs Brag1 across all players, Brag2 vs Brag2, Brag3 vs Brag3. Determine winner per brag (best hand).
- Overall winner must win CONSECUTIVE brags:
- Wins Brag1 + Brag2 => wins pot.
- Wins Brag2 + Brag3 => wins pot.
- Wins Brag1 + Brag3 but NOT Brag2 => does NOT win! No winner.
- Wins all 3 => salaami (see below).
- If different players win different brags with no one having consecutive? E.g., P1 wins B1, P2 wins B2, P3 wins B3 => no winner => carry-over.
- If tie for a brag? Tied players share that brag win. Need consecutive shared? If P1 and P2 tie B1, P1 wins B2 outright => P1 has 1+2? Tie counts as win for both. So P1 wins. Document.
- UI: showdown table 3 rows, trophy 🏆 per brag winner, then banner "Hari wins 1+2!" or "No winner! Pot carries 🔄".

---

## 6. Salaami (Sweep Bonus)

- Condition: one player wins all 3 brags (3/3).
- Reward: pot + extra salaami from each other active player (e.g., 5 chips each, host configurable 5/10).
- Example: 4 players, boot 10, pot 40. Hari sweeps => gets 40 + 5*3=15 => 55 total.
- UI: "SALAAMI! 🤑 +15 extra!" + coin rain + `win()` long.
- Edge: balance < salaami? Clamp, pay what they have, show "Sita couldn't pay full salaami 😅".
- Fun: salaami animation: coins fly from losers to winner.

---

## 7. Carry-Over Pot (No Winner)

- If no consecutive winner, pot stays, carries to next round.
- Next round: new boot added on top of carried pot. Pot grows spicy!
- Display: "Carry 🔄 Pot 40 -> next 80!" with fire icon if >100.
- Cap? No cap, but show "MEGA POT 🔥" over 200. Fun pressure.
- History: feed shows carry count "Carry x2".
- Edge: all players leave with carry pot? Pot forfeited, reset to 0. Log.
- Edge: single player left after leavers? Gets carried pot? Yes, to keep kindness.

---

## 8. Turn / Timer Flow

```
DEAL (boot, 9 cards each, 1.5s fly)
 -> ARRANGE 30s (tap-swap, Done buttons, live hints)
 -> LOCK (timer 0 or all Done)
 -> CHECK instant wins (four-kind) / redeal (four pairs)
 -> SHOWDOWN (reveal all, compare per brag, 4s celebrate)
 -> PAYOUT (pot / salaami / carry)
 -> NEXT (host, dealer rotates)
```

- Timers: arrange 30s only timer. Showdown 5s view before Next enabled.
- Sounds: `shuffle()` deal, `tap()`/`card()` swaps, `tick()` last 5s, `win()` salaami, `coin()` normal win.

---

## 9. Visuals

- Felt table dark green, 3 brag rows labeled, pot top-center.
- Cards compact: rank+suit big, suit color red/black.
- Kitti badge pulses, pair badge blue, prail gold.
- Showdown: all players' brags revealed in grid, winning brag glows.
- Mobile: 3x3 your cards bottom, opponents collapsed to "Done ✅ / arranging..." until showdown.
- Desktop: side-by-side all? Still hide until showdown for suspense.

---

## 10. Messages

```json
{ "dataType":"deal9", "payload":{"round":1,"boot":10,"pot":40,"hands":{"Hari":["AS","2H","3D","5C","KH","KD","9S","7H","4D"]},"carry":0} }
{ "dataType":"arrange_done", "payload":{"who":"Hari","locked":true} }
{ "dataType":"tick", "payload":{"sec":12,"phase":"arrange"} }
{ "dataType":"showdown", "payload":{"arrangements":{"Hari":[["2H","3D","5C"],["AS","AH","AD"],["9S","7H","4D"]]},"bragWinners":{"1":"Hari","2":"Sita","3":"Hari"},"overall":"carry","reason":"1+3 not consecutive"} }
{ "dataType":"carry", "payload":{"pot":40,"nextPot":80} }
{ "dataType":"salaami", "payload":{"winner":"Hari","pot":40,"extra":15} }
{ "dataType":"instant_win", "payload":{"winner":"Ram","reason":"four Kings"} }
{ "dataType":"redeal", "payload":{"reason":"four pairs","by":"Sita"} }
```

---

## 11. Edge Cases

- Timer ends with no arrangement? Use dealt order as-is.
- Player arranges invalid? All arrangements valid (any 3-3-3). No invalid.
- Kitti vs kitti tie? Both have 2-3-5 offsuit? Compare suits? Highest card suit? 5 suit decides S>H>D>C. Rare, document.
- Disconnect during showdown: still wins if best, payout on reconnect.
- Host claims bad winner? All clients compute locally too, show "Mismatch, host wins?" — trust host but log.

---

## 12. Testing

- [ ] 9 cards each, 30s lock works, Done early works.
- [ ] Tap-swap all positions, no lost cards (9 invariant).
- [ ] Kitti beats prail verified.
- [ ] 1+2 wins, 2+3 wins, 1+3 carry verified with fixtures.
- [ ] Salaami 3/3 pays pot+extra.
- [ ] Carry-over adds correctly, mega pot UI.
- [ ] Four-kind instant, four-pairs redeal (mock hands).
- [ ] Mobile 3x3 fits 375px, no scroll.
- [ ] Hints correct for all ranks.

---

*Arrange fast, pray for 2-3-5! 🙏*
