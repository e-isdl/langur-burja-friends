# Teen Patti — Design Doc

> Indian poker, 3 cards, big bluffs. Blind vs seen, chaal vs pack, sideshow drama. Best with 4-7 friends shouting.

---

## 1. Overview

- Players: 3-7 (best 5). Dealer/host shuffles, deals clockwise.
- Goal: win pot with best 3-card hand or last standing via bluff.
- Boot: fixed ante, e.g., 5 chips from each. Pot starts `boot * n`.
- Loop: blind/chaal -> fold/show/sideshow -> showdown.
- Round time: 3-6 min. 45s per turn soft timer, auto-fold if away.
- Fun: blind all-in rushing, sideshow rejections, "show me!" moments.
- Mobile: cards big, pot center, action bar sticky bottom.

---

## 2. Boot & Stake Rules

- Boot amount: host sets 5/10/15 in lobby (default 10).
- Ante auto-deducted on deal. If balance < boot, must sit out or top-up.
- Stakes:
- Blind (unseen cards): bet 1x current stake (e.g., 5). Can play blind whole game.
- Seen/Chaal: bet 2x blind stake to stay (e.g., 10 if blind is 5).
- Stake doubles when? Classic: chaal is double blind. If all blind, stake stays. Once someone sees, seen stake = 2x.
- Max stake cap: 10x boot (e.g., boot 10 -> max 100). Prevents whale bullying.
- Pot limit: optional 10x? Actually allow infinite but show pot loudly.
- Show cost: seen player pays 2x to show vs last blind? Simplified: show costs 1x stake + goes to pot.
- Edge: player with 0 balance mid-hand: all-in, no further bets, eligible for pot until showdown.
- Sitting-out: toggle in lobby, skipped in deal rotation.

---

## 3. Actions: Blind / Chaal / Fold / Show / Sideshow

### 3.1 Blind

- Condition: you have NOT seen cards (cards face-down).
- Cost: current blind stake (starts at boot, doubles on raises? Simplified: blind = base, chaal = 2x base).
- Can stay blind forever. Fun chaos.
- UI: "BLIND 5" big button, cards show back, eye icon to see (turns you seen).

### 3.2 Chaal (Seen Bet)

- Condition: you HAVE seen cards (tap eye).
- Cost: 2x blind amount.
- Effect: pot += amount, turn passes.
- UI: "CHAAL 10" gold button. Shows your cards mini to you only.

### 3.3 Fold / Pack

- Drop out, lose ante/bets. Cards dim, avatar grey.
- Free anytime on your turn. No cost.
- Sound: soft `lose()` + card slide away.
- Edge: accidental tap? Confirm? No confirm for speed, but require double-tap? Single tap + undo 2s? Keep single tap, show toast "Packed".

### 3.4 Show

- Condition: only when 2 players left.
- Cost: pay stake (blind pays 1x, seen pays 2x?) Simplified: pay current stake.
- Effect: both hands revealed, higher wins pot instantly.
- If tie: show-er wins? Or split? Rule: challenger wins tie to encourage shows? Actually classic: if tie, player who asked for show loses? Let's pick: tie -> pot split. Friendlier.
- UI: "SHOW" appears only when 2 left. Big red button.

### 3.5 Sideshow / Compromise

- Condition: your turn, you are seen, previous player is seen, >2 players remain.
- Flow: request -> previous player gets popup Accept/Reject (15s).
- If accept: compare privately, loser folds (only winner stays, no reveal to table).
- If reject: you must chaal/fold, play continues. Feed shows "Rejected! 👀".
- Cost: 1x stake to request (goes to pot regardless).
- Fun: rejection drama + chat. Sound `chime()` on request, `win()`/`lose()` private.
- Edge: previous player away -> auto-reject after 15s.
- Edge: blind vs blind cannot sideshow. Must be seen-seen.

---

## 4. Hand Rankings (Highest to Lowest) with Examples

### 4.1 Trail / Trio (Three of a Kind)

- Example: `A-A-A`, `K-K-K`, `2-2-2`.
- Highest trail: AAA > KKK > ... > 222.
- Beats everything. Rare, scream moment.

### 4.2 Pure Sequence / Straight Flush

- Three consecutive same suit.
- Example: `Q-J-10♠`, `4-3-2♥`.
- Special: `A-2-3` is HIGHEST pure seq (not lowest). So `A-2-3♠` > `Q-J-10♠`.
- Second: `A-K-Q` is second highest.
- Tiebreak: rank then suit S>H>D>C? Actually same rank different suit? Pure seq rank decides, suit only if identical rank? Use suit order.

### 4.3 Sequence / Straight (Offsuit)

- Consecutive, mixed suits. Example: `K-Q-J` mixed, `5-4-3`.
- `A-2-3` highest here too (per spec).
- Pure beats seq always, even if seq higher ranks? Yes: any pure > any seq.

### 4.4 Flush / Colour

- Same suit, not sequence. Example: `A-9-4♥`, `K-10-7♠`.
- Compare: highest card, then second, then third.
- Example: `A-K-2` beats `A-Q-10`.

### 4.5 Pair

- Two same rank + kicker. Example: `Q-Q-9`, `5-5-A`.
- Compare: pair rank first, then kicker. `A-A-2` > `K-K-A`.
- Fun: pair + ace kicker tension.

### 4.6 High Card

- Nothing. Example: `A-K-J`, `10-8-3`.
- Compare high to low, then suit if all equal? Use suit order for final tie.

### 4.7 Tiebreak Suit Order S>H>D>C

- If ranks identical (e.g., both `K-Q-J` mixed but different suits? Actually need suit compare for flush/high).
- Order: Spades > Hearts > Diamonds > Clubs.
- Example: `A-K-J♠` beats `A-K-J♥`.
- Showdown UI highlights winning cards + reason "Flush, Ace high".

---

## 5. Turn Flow Diagram

```
DEAL (boot deducted, 3 cards each, blind by default)
  -> Player left of dealer starts
  -> On turn:
     [see cards?] -> Blind: BLIND/FOLD (+SEE to become seen)
                    Seen: CHAAL/FOLD/SIDESHOW (if eligible)/SHOW (if 2 left)
     -> 30s ring + chime on turn start
     -> timeout 45s -> auto-fold (or auto-blind 1x if host enables lenient?)
  -> Next alive player
  -> Until 1 left (wins pot) or SHOW decides
  -> SHOWDOWN reveal + winner flash + pot fly
  -> Host NEXT -> new deal, dealer rotates
```

- Dealer button rotates clockwise each round. Visual 🃏 token.
- Turn glow: avatar ring gold + pulsing, cards lift.
- Auto-action: pre-select Blind/Chaal? Optional checkbox "Auto-blind". Fun for fast rounds.
- Away grace: if turn player disconnects, 20s wait then auto-fold, kept in grace.

---

## 6. Pot Growth & Limits

- Pot display center, coin stack grows visually (scale with amount).
- Pot = sum boots + all blinds/chaals/shows.
- Max stake 10x boot per action. E.g., boot 10, single chaal max 100.
- If pot exceeds 10x boot * players? No cap, but show "BIG POT 🔥" over 200.
- Side pots? No side pots v1 — all-in player eligible for main pot only? Simplified: all-in wins max what they contributed * players? Keep simple: no side pot, all-in still wins full (friends rule).
- Scoring: winner gets pot, wallet update broadcast, feed "Hari wins 120 with Trail!".
- Carry-over? No, pot resets each hand unlike kitti.

---

## 7. Visuals & Layout

- Table: oval felt, pot center with coin pile (CSS + emoji 🪙 or three coin stack).
- Cards: 64x90px mobile, 80x112 desktop, rounded 8px, back pattern (gold paisley on maroon).
- Your cards bottom, big, tap eye to peek (flip animation 300ms).
- Opponents: face-down mini cards + name + stake badge + blind/seen eye icon.
- Winner: cards flip up, gold flash, confetti, `win()`.
- Losers: cards fade.
- Action bar: [FOLD] [BLIND/CHAAL] [SHOW/SIDESHOW] — 48px tall, thumb zone.
- History feed right/bottom: "Sita blind 5", "Ram chaal 10", "Sideshow rejected!".
- Mobile 375px: cards overlap slightly, pot 24px font, action bar 3 buttons max, sideshow in overflow `...`.

---

## 8. Messages (dataTypes)

```json
{ "dataType":"deal", "payload":{"round":2,"dealer":"Hari","boot":10,"hands":{"Hari":["AS","KH","2D"]},"order":["Hari","Sita","Ram"]} }
{ "dataType":"turn", "payload":{"who":"Sita","sec":30,"stakeBlind":5,"stakeSeen":10,"pot":45} }
{ "dataType":"action", "payload":{"who":"Sita","action":"blind","amount":5,"pot":50} }
{ "dataType":"action", "payload":{"who":"Ram","action":"chaal","amount":10,"pot":60} }
{ "dataType":"action", "payload":{"who":"Sita","action":"fold"} }
{ "dataType":"sideshow_req", "payload":{"from":"Sita","to":"Ram"} }
{ "dataType":"sideshow_res", "payload":{"from":"Ram","accept":false} }
{ "dataType":"show", "payload":{"from":"Hari","to":"Sita","winner":"Hari","reason":"Pair Qs"} }
{ "dataType":"winner", "payload":{"winner":"Hari","pot":120,"hand":["QH","QS","9D"],"rank":"Pair"} }
{ "dataType":"tick", "payload":{"who":"Sita","sec":12} }
```

- Hands sent privately? v1 sends all hands to all (trust friends) but client only reveals yours + showdown. Note in security: acceptable, log "cards visible in ws, friends only".
- Better: host sends each hand via whisper? `ws` broadcast only, so include all, hide via UI. Document.

---

## 9. Timers

- Turn: 30s ring, 45s auto-fold. `tick()` last 5s.
- Sideshow response: 15s, auto-reject.
- Showdown celebrate: 5s before Next enabled (let them gloat).
- Deal animation: 1.5s card fly from dealer.

---

## 10. Sounds

- `shuffle()` on deal, `card()` per card.
- `tap()` buttons, `coin()` on pot add, `chime()` on your turn + sideshow req.
- `win()` showdown winner, `lose()` fold.
- Mute top-right.

---

## 11. Edge Cases

- All fold except one: instant win, no reveal (mystery! "Hari bluffed? 👀").
- Both show tie: split pot, both `win()`, feed "Split! Friends forever".
- Player leaves mid-hand: auto-fold, bets stay in pot.
- Host leaves: new host continues, needs hands? Hands were broadcast, so ok.
- Balance < boot: sit out with toast, can top-up via lobby +100.
- 3x consecutive blind wins? Show badge "Blind King 😎".
- Mis-click fold: no undo, embrace pain, feed joke.

---

## 12. Fun Details

- Blind streak counter 🔥.
- Emoji reactions floating (😂, 😱) on show.
- Winner title: "Patti Raja 👑" if trail, "Bluff Master 🕶️" if blind win.
- Chat presets: "Show me!", "Blind chal!", "Pack? 😅".

---

## 13. Testing Checklist

- [ ] Boot deducts, pot correct.
- [ ] Blind 1x, chaal 2x enforced, max 10x boot blocked.
- [ ] Sideshow accept/reject flows, auto-reject on timeout.
- [ ] Show only with 2 left, tie split works.
- [ ] Rankings: trail > pure (A-2-3 highest) > seq > flush > pair > high verified with unit tests on deck.js.
- [ ] Suit tiebreak S>H>D>C tested.
- [ ] Auto-fold on 45s timeout.
- [ ] Mobile action bar reachable, no misclicks.
- [ ] Reconnect mid-hand restores cards + pot.

---

*Say it loud: blind chal, dil se! 🃏*
