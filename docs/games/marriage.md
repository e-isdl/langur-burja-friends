# Marriage (Mal) — Design Doc

> The marathon Nepali rummy. 3 decks, 21 cards, pure sequences, tiplu jokers, dublees. Simplified for phones without losing soul.

---

## 1. Overview

- Players: 2-5 (best 4). Long game: 15-30 min per deal. Party finale!
- Decks: 3 full decks shuffled together = 156 cards (with duplicate copies).
- Deal: 21 cards each. Rest stock, one discard flipped.
- Goal: complete required sets and declare. Points decide pot (or winner-takes per simplified).
- Simplified v1: declare-win with host verify (no auto points calc for all combos? Actually compute basic, host confirms).
- Pot: boot 20 each (higher, finale feel). Winner takes pot.
- Fun: tiplu reveal drama, dublee collecting, tunnel excitement.

---

## 2. Deck & Deal Spec

- `makeDeck(3)` = 156 cards. Each `{suit,rank,id: suit+rank+#}` to distinguish duplicates.
- Shuffle Fisher-Yates, `shuffle()` sound long.
- Deal 21 each animated in batches (7-7-7) to avoid jank, 2s total.
- Stock huge (~70+ left with 4 players). Discard pile single top visible + count.
- UI: compact hand! 21 cards cannot fan full-size on phone. Use compact rows: 2 rows of 10-11 mini cards (40x56px), tap to select, long-press to sort? Auto-sort by suit/rank with `sortHand()`.
- Group hints: color-code potential sets (pure green, tunnel gold).
- Desktop: 3 rows, larger, side meld area.
- Edge: deal animation skip button.
- Edge: stock empty mid-game? Reshuffle discards (keep top), toast. Rare with 156.

---

## 3. Set Types

### 3.1 Pure Sequence (Chokho)

- 3+ consecutive same suit, no jokers. E.g., `4-5-6♥`, `10-J-Q-K♠`.
- Required: need 3 pures before jokers unlock? See phases.
- Display green underline.

### 3.2 Tunnel / Trial? Clarify

- Tunnel: three same rank same suit? With 3 decks, you can have `7H 7H 7H` (three copies same card). That's Tunnel (or Trial?). Special, high value.
- Trial: three same rank different suits? E.g., `K♠ K♥ K♦`. Also valid set.
- In 3-deck marriage, Tunnel (identical) > Trial? Document: Tunnel beats Trial for tiebreak.
- UI: Tunnel gets gold trigger "TUNNEL! ✨".

### 3.3 Dublee (Pair of Same Card)

- Two identical cards: `9♠ 9♠` (same suit+rank, different deck copies). That's a Dublee.
- Need 7 dublees + 1 set of 3? Actually win condition variant: 7 dublees + 1 set (3+4? Let's spec: 7 dublees (14 cards) + 1 set of 7? Hmm 21 cards = 7 dublees (14) + 7-card set? Simplify: 7 dublees + 1 pure seq of 3? That's 14+3=17, need 4 more? Let's define canonical simplified win paths below, not strict classic.
- Simplified win paths (v1):
- Path A (Standard): 3 pures + rest sets/runs with jokers (total 21 in valid sets, 1 discard to go out? Actually 21 + draw 1 =22, meld all + discard 1).
- Path B (Dublee win): 7 dublees + 1 set of 3+ (total 14+3=17, plus? Need 21... 7 dublees=14, need 7 more as set(s). So "7 dublees + 1 set of 7"? Or "7 dublees + remaining 7 as valid sets"? Let's say: 7 dublees + rest (7 cards) in valid sets. Document as "Dublee game".
- For phone simplicity: allow Declare with either, host verifies.
- Dublee UI: identical cards stack with "x2" badge, purple.

---

## 4. Three Phases

### Phase 1: 3 Pure Before Joker

- Must complete 3 pure sequences before jokers active.
- Jokers (tiplu etc.) cannot be used until 3 pures laid? Or in hand but not meldable? Rule: you cannot meld joker sets until pures done. Hand hints show lock 🔒 on joker melds.
- UI: progress "Pures 1/3" top bar, confetti on 3rd.
- Edge: player never gets 3 pures? Game stalls? Allow declare via Dublee path which bypasses? Yes Dublee bypasses pure requirement (alternative win).
- Timer: no phase timer, turn 45s each.

### Phase 2: Jokers — Tiplu / Alter / Man

- After pures? Actually tiplu determined at start? Classic: tiplu = card under? Simplified: host flips tiplu rank at deal (e.g., `8`). All `8`s wild. Alter = one up/down? Let's define:
- Tiplu: revealed rank wild (all suits). E.g., Tiplu `5` => all 5s wild.
- Alter: same rank? Actually alter = tiplu of other? Simplify: Alter = two joker ranks? Or printed jokers? With 3 decks no printed jokers? Use: Tiplu (main wild) + Alter (second wild = Tiplu+1 rank) + Man (??). Let's define for v1:
- Tiplu: rank T wild.
- Alter: rank T+1 wild.
- Man: rank T-1? Or `A`? Let's say Man = rank T-1 wild? Or keep Man as duplicate Tiplu? Simpler: 3 wild ranks: T-1, T, T+1. Call them Man, Tiplu, Alter. Fun trio!
- Example: Tiplu `7` => wilds = `6,7,8` (all suits, all deck copies). That's 3 ranks *4 suits*3 decks = 36 wilds! Very wild, matches marriage chaos.
- UI: banner "Wilds: 6-7-8 🃏" gold, wild cards rainbow border.
- Edge: wild flood makes pures trivial after unlock — intended, late game fast.

### Phase 3: 7 Dublees + 1 Set Win (or Standard)

- Standard win: all 21 (+1 drawn=22) in valid sets (pure + joker sets + tunnels/trials) + discard 1 to 0? Actually meld all, discard last.
- Dublee win: 7 dublees + remaining 7 in valid set(s). Declare immediately, no discard needed? Require discard? Keep: meld all, win.
- Declare button appears when hints think you're ready (all cards grouped). Tap -> host verify.

---

## 5. Simplified Fallback: Declare-Win Host Verify

- Problem: full auto-validate of 21-card wild sets is complex. Solution: client hints + host human verify.
- Flow:
- Player taps DECLARE (only on turn after draw).
- Client sends arrangement (groups).
- All see groups revealed.
- Host sees VERIFY ✅ / REJECT ❌ buttons (host only).
- If ✅ -> winner, pot, `win()`.
- If ❌ -> penalty? +10 points? Or continue play with 30s penalty (skip next turn)? Pick: false declare = skip next 2 turns + toast "False declare! 😅". Keeps honest but kind.
- Edge: host is declarer? Then second player (next) verifies? Or auto-accept if hints pass? Auto-accept if client validator passes, else need unanimous? Simplify: if host declares, auto-verify via client validator only.
- Client validator: checks pures count, sets/runs with wild substitution (greedy). Good enough for hints + host aid. Show "Validator: 3 pures ✅, sets 6/7" to host.

---

## 6. Turn Flow

```
Draw stock/discard (hand 21->22) -> optionally lay pures/sets (multiple) -> discard 1 (hand back to 21 or fewer if laid) -> next
-> Declare instead of discard if ready
45s timer, auto-discard highest deadwood if timeout
```

- Laying: tap cards to select (multi-select), tap "Lay Set" if valid (validator checks). Laid locked.
- Sorting: auto-sort button + manual tap-swap? Provide Sort + tap-select for lay. No drag (21 too many).
- Discard: single tap to discard after deselect? Two modes: Select for meld vs Discard? Use toggle tabs [MELD] [DISCARD] to avoid misclicks with 21 minis.

---

## 7. Compact Card UI (Critical!)

- 21 cards on 375px: 2 rows, each 11 minis, 34x48px, 2px gap, rank 12px, suit 10px. Selected lifts + gold border.
- Zoom: tap laid set to enlarge modal. Pinch? No, tap-zoom.
- Group colors: pure green dot, wild rainbow, dublee purple badge, ungrouped grey.
- Meld tray: horizontal wrap minis 28px, collapsible.
- Pot + wild banner sticky top, action bar sticky bottom [Draw][Lay][Discard][Declare].
- Desktop: 3 rows 60px cards, side panel with validator checklist.
- Accessibility: text labels, not color-only. Minimum 34px still <44px target — mitigate with zoom modal + confirm. Note exception, Declares require confirm.
- Performance: 21 DOM nodes fine, avoid 3D here (2D cards for perf).

---

## 8. Messages

```json
{ "dataType":"deal21", "payload":{"boot":20,"pot":80,"tiplu":"7","wilds":["6","7","8"],"hands":{"Hari":[...21...]},"stockCount":72,"discardTop":"KD"} }
{ "dataType":"draw", "payload":{"who":"Hari","from":"stock","card":"6S"} }
{ "dataType":"lay", "payload":{"who":"Hari","group":["4H","5H","6H"],"type":"pure"} }
{ "dataType":"declare", "payload":{"who":"Hari","groups":[[...],[...]],"path":"standard"}} }
{ "dataType":"verify", "payload":{"by":"Host","accept":true,"winner":"Hari"} }
{ "dataType":"tick", "payload":{"who":"Hari","sec":15} }
```

---

## 9. Timers & Sounds

- Turn 45s, `tick()` last 5s, auto-discard on timeout.
- Declare verify: host 30s to decide, else auto-accept if validator passes.
- Sounds: `shuffle()` long deal, `card()` draw/discard, `coin()` lay pure/tunnel, `chime()` tiplu reveal + 3rd pure, `win()` declare accepted, `lose()` false declare.

---

## 10. Edge Cases

- Duplicate copies confusion: IDs distinguish `7H#1` vs `7H#2`. Dublee requires same suit+rank (any copies). Tunnel requires 3 copies same card.
- Wild + pure? Pure must be no wilds. Validator enforces.
- False declare spam: 2-turn skip + cooldown.
- Stock out: reshuffle discards (keep top), toast. With 156 rarely.
- Disconnect with 21? Grace + auto-discard, melds stay.
- Host verify bias? Show validator score to all, feed transparent.

---

## 11. Fun Details

- Tiplu reveal animation + horn.
- Tunnel "JACKPOT ✨" flash.
- Dublee counter "Dublees 4/7" with purple progress.
- Winner title "Marriage Raja 👑".
- Long-game snacks reminder "Break? 😂" every 10 min.

---

## 12. Testing

- [ ] 156 deck, 21 each, counts correct.
- [ ] Wilds 3 ranks, rainbow UI.
- [ ] Pure detection no-wild enforced, 3/3 progress.
- [ ] Tunnel vs trial distinction with duplicate IDs.
- [ ] Dublee detection, 7 count.
- [ ] Validator passes valid, rejects invalid.
- [ ] Declare + host verify accept/reject + penalty.
- [ ] Compact UI fits 375px, no h-scroll, zoom works.
- [ ] 45s auto works, reshuffle works.

---

*21 cards, 3 wilds, 1 glory — marry the win! 💒*
