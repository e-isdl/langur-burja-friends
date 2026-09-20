# Jud Patti — Design Doc

> Odd-card rummy-ish pairing game. 7 cards, joker wild, draw-discard, pair up and go out. First to 0 cards wins!

---

## 1. Overview

- Players: 2-5 (best 3-4). Odd cards each: 7.
- Deck: single 52 + joker rank wild (see below).
- Goal: meld pairs/sets and discard until 0 cards in hand. First out wins pot.
- Loop: draw (stock or discard) -> auto-detect pairs glow -> optionally meld? Actually pairs stay in hand until discard? Simplified: pairs auto-highlight, you discard one card per turn. Win when 0 left? Need pairing logic.
- Simplified rule v1: 7 cards, on turn draw 1 (8), then discard 1 (7). Pairs in hand glow but stay. Win by discarding last card after pairing? Hmm need going-out condition: when you can lay all as pairs + 1 discard? With 7 odd, you need 3 pairs +1? Let's define: win when after discard you have 0 cards? That requires melding pairs out. So add meld action: lay pairs to table, reduces hand. Then discard. First to meld all + discard wins.
- Pot: boot 10 each. Winner takes all.
- Fun: joker wild chaos, glow pairs, "Uno!"-like 1-card warning.

---

## 2. Setup & Deal

- Boot 10, pot = boot * n.
- Deal 7 each, rest = stock pile face-down, flip top stock to start discard pile.
- Dealer rotates. Host shuffles.
- UI: your hand bottom fanned, stock + discard center, opponents counts + melds.
- Timer: 30s per turn? Actually 20s draw+discard, auto-discard random if timeout (kind, keeps game moving).

---

## 3. Joker Rank Wild

- Before deal, host reveals joker rank: random rank e.g., `7`. All 4 suits of that rank are wild (like marriage jokers).
- Example: joker rank 4 => `4S 4H 4D 4C` wild, can be any card for pairing.
- Display: joker banner "Joker: 4s 🃏" top-center gold, joker cards get rainbow border + glow.
- Edge: joker rank A? Then aces wild, strong. Fun!
- No printed jokers used? Use rank-wild only, simpler with single deck.
- Pair with joker: `K + Joker` counts as pair of Ks. Two jokers = pair of anything (prail-ish).
- UI: joker cards wiggle + `chime()` when drawn.

---

## 4. Turn Flow

```
Your turn (20s):
 1. DRAW: tap Stock (mystery) or Discard top (known). Hand 7->8. Sound card().
 2. AUTO-DETECT: pairs glow (see §5). No action needed, just highlight.
 3. MELD (optional): tap pair to lay to table (hand -2). Can meld multiple pairs per turn? Yes, meld any number before discard. Sound coin().
 4. DISCARD: tap hand card to discard to pile (hand -1). Must discard to end turn (unless going out? Still discard last? Win when 0 left after discard/meld).
 5. WIN CHECK: if hand 0 -> win! Reveal, pot, confetti.
  -> Next player. 20s ring, auto: auto-draw stock + auto-discard highest if timeout.
```

- Diagram: DRAW -> MELD* -> DISCARD -> CHECK -> NEXT.
- 1-card warning: when 1 left, avatar "1! 🔥" + `chime()` to table. Like Uno.
- Edge: stock empty? Reshuffle discard (except top) into stock, `shuffle()` sound + toast.
- Edge: discard pile only 1 card and stock empty? Rare, declare draw, split pot? Or redeal. Pick split.

---

## 5. Auto Pair Detection Glow

- After every draw/meld, client scans hand for pairs (same rank, or joker-assisted).
- Logic:
- Group by rank. Any rank count>=2 => glow those cards blue.
- Joker assist: if single `K` + joker => glow both as "Pair Ks (joker)".
- Two jokers => glow as wild pair.
- Three of a kind? Glow as set, meldable as 3? Allow meld 2 or 3 (3 = stronger, show "Set!").
- Visual: glow `box-shadow: 0 0 12px gold`, pulse 1s. Pair badge "Pair!".
- Sound: soft `tap()` when new pair forms.
- No auto-meld — player chooses when to lay (strategy: hold or dump?).
- Hints: show "Meld?" button when pairs exist.
- Accessibility: glow + text badge, not color-only.

---

## 6. Discard Rules

- Must discard 1 per turn to end turn (standard rummy).
- Cannot discard just-drawn stock card immediately? Allow? Yes allow (fast play). No restriction v1.
- Discard pile top visible to all, feeds strategy (avoid feeding pairs).
- Cannot pick up discard and discard same card same turn? Prevent loop: if drew from discard, must not discard same card. Enforce.
- Win when 0 cards left: must end with discard? If you meld to 1 then discard last => 0 wins. If you meld to 0 directly (meld last pair)? Also win (no discard needed). Both count.
- Show discard animation: card flies to center pile 300ms.

---

## 7. Winning

- First to 0 cards takes pot.
- Reveal: show melds + last hand, feed "Hari goes out with Joker pair! 🃏".
- Payout: pot to winner, wallet update, `win()`.
- No partial scoring v1 (no points for leftovers). Simple, party-friendly.
- Edge: two players go out same round? Impossible sequential, first wins.
- Edge: player leaves with melds? Their melds stay? Remove, continue. Pot stays.

---

## 8. Visuals & Layout

- Table felt, stock (back pattern) + discard (face-up) center 2 piles.
- Your hand: fanned 7-8 cards, 56x78px mobile, overlap, tap to select, big Discard button.
- Opponents: card backs count + melds mini rows + "1!" badge.
- Joker banner gold top.
- Meld area: your laid pairs row above hand, small 40px cards.
- Mobile 375px: hand scroll? No h-scroll — fan with negative margin, fits 8 cards. Discard/Meld buttons sticky bottom 48px.
- Desktop: wider fan, side feed.
- Animations: draw slide, discard fly, meld pop, win confetti.

---

## 9. Timers

- Turn 20s: ring around avatar, `tick()` last 5s.
- Auto-action at 0s: draw stock, meld if obvious? Actually auto-meld largest pair? Keep simple: auto-discard random non-joker, no auto-meld (kind to strategy? But prevents stall? Meld optional, so stall ok, game still progresses via discards).
- Total round 5-8 min. Show round timer top.
- Arrange? No arrange phase, immediate play.

---

## 10. Messages

```json
{ "dataType":"deal7", "payload":{"round":1,"boot":10,"pot":30,"jokerRank":"4","hands":{"Hari":["4S","KS","KD","7H","9D","2C","10S"]},"stockCount":31,"discardTop":"5H"} }
{ "dataType":"draw", "payload":{"who":"Hari","from":"stock","card":"3D","handCount":8} }
{ "dataType":"draw", "payload":{"who":"Hari","from":"discard","card":"5H"} }
{ "dataType":"meld", "payload":{"who":"Hari","cards":["KS","KD"],"asRank":"K","withJoker":false} }
{ "dataType":"discard", "payload":{"who":"Hari","card":"9D","handCount":5,"discardTop":"9D"} }
{ "dataType":"win_claim", "payload":{"winner":"Hari","hand":[],"melds":[[ "KS","KD"]] } }
{ "dataType":"tick", "payload":{"who":"Hari","sec":8} }
{ "dataType":"reshuffle", "payload":{"stockCount":15} }
```

- Hands broadcast (trust friends), UI hides others.
- Stock cards: host owns stock order, sends `draw` with card. Clients decrement stockCount.
- Discard validation: host checks "same card" rule, rejects with `error`.

---

## 11. Sounds

- `shuffle()` deal, `card()` draw/discard, `coin()` meld, `chime()` pair formed + 1-card warning, `win()` go-out, `lose()`? No lose until end, folded? No folds here.
- Mute persists.

---

## 12. Edge Cases Matrix

- Stock out -> reshuffle discard (keep top), toast.
- Joker drawn -> glow + chime, feed "Joker! 🃏".
- All jokers in one hand? 4 jokers = 2 pairs, strong, fun.
- Disconnect with 1 card? Auto-discard keeps them in game within grace.
- Host leaves? New host needs stock order — was broadcast via draws, reconstruct remaining? Simplify: new host reshuffles remaining unknown? Actually hands known, discard known, stock unknown remainder -> new host generates new stock from remaining deck (cards not in hands/discards/melds). Document.
- Misclick discard joker? Allow, but confirm? Show "Discard Joker? Really?" confirm modal (only for joker).
- 7 cards odd + joker wild balance: jokers make going out fast, rounds 3-5 min, good.

---

## 13. Fun Details

- Pair glow pulse, joker rainbow shimmer.
- "1 card!" Uno shout button (fun, optional, plays `chime()` to all).
- Winner title: "Jod Master 🧩" or "Joker King 🃏" if won with joker meld.
- Feed jokes: "Hari is hoarding Ks 👀".

---

## 14. Testing Checklist

- [ ] 7 each, stock/discard correct counts.
- [ ] Joker rank wild detection for all ranks.
- [ ] Pair glow including joker-assisted, 3-of-kind.
- [ ] Draw stock/discard, same-card discard blocked.
- [ ] Meld reduces hand, multiple melds per turn.
- [ ] Win at 0 via discard or meld.
- [ ] Stock reshuffle preserves top.
- [ ] 20s auto-draw+discard works.
- [ ] Mobile fan fits 8 cards, buttons reachable.
- [ ] Reconnect restores hand + melds.

---

*Pair it, lay it, dump it — zero cards, hero! 🃏*
