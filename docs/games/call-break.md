# Call Break — Design Doc

> Exactly 4 players, spades trump, bid 1-8, win tricks. Precision bidding + trick hate. 5 rounds, highest score takes room!

---

## 1. Overview

- Players: EXACTLY 4. No more, no less. Lobby enforces (Start disabled unless 4, shows "Need 4! Invite!").
- Deck: single 52, 13 each.
- Rounds: 5 rounds per game. Dealer rotates each round.
- Flow per round: bid (1-8) -> 13 tricks -> scoring -> next round. After 5, total wins.
- Goal: meet or exceed bid. Extra tricks = small bonus. Miss = negative.
- Fun: bidding mind games, trump cuts, overtrick greed.
- Bots? If <4 humans? Spec includes bot logic for solo practice / fill. V1: allow 1-3 bots to fill to 4 (host toggles). Bots play locally on host? Or server? Host simulates bots, broadcasts moves. Document.

---

## 2. Bidding 1-8

- Each player bids 1-8 tricks they think they'll win. Bid 0? Not allowed (min 1). Bid >8? Max 8 (13 tricks /4 ≈ 3 avg, 8 is bold).
- Order: left of dealer first, clockwise. No passing.
- UI: bidder sees stepper [- 3 +] + Confirm, 20s timer, auto-bid 2 if timeout (safe).
- Show all bids before play starts: "Bids: Hari 4, Sita 3, Ram 2, Gita 4 (total 13! Fight! 🔥)".
- Total =13? Means someone must break. Fun stat: show "Over/Under: 13" (13 = exact, >13 over, <13 under).
- Edge: all bid 1? Total 4, many overtricks, everyone happy.
- Sound: `tap()` stepper, `chime()` bid lock.

---

## 3. Trick Rules (Follow Suit, Must Trump If Void)

- Leader plays any card. Others must follow suit if they have it.
- If void (no cards of led suit): must trump with spade if they have spade? Rule: must play spade if void and have it? Classic Call Break: must trump if void (cannot throw off). Enforce: if void + has spade, only spades selectable (others dimmed). If void + no spade, any card (throw lowest usually).
- If follow suit: any card of that suit (higher to win, lower to duck).
- Winner: highest spade if any spade played, else highest of led suit. Aces high (A>K>Q>J>10...2).
- Lead next: trick winner leads next trick.
- UI: trick center 4 cards, your hand bottom, turn glow, valid cards bright, invalid dimmed (enforced, cannot misclick).
- Edge: revoke (break rule)? Prevented by UI dimming, host validates, rejects invalid with toast.
- Timing: 20s per play, auto-play lowest valid if timeout (kind, keeps 13 tricks moving).
- Animation: card flies to center 300ms, winner collects (slide to avatar) + `coin()` if bid met progress.

---

## 4. Scoring (Bid +0.1*Extra If Met, -Bid If Missed, 5 Rounds)

- Per round per player:
- If tricks >= bid: score = bid + 0.1 * (tricks - bid). E.g., bid 3, won 5 => 3.2.
- If tricks < bid: score = -bid. E.g., bid 4, won 2 => -4. Ouch!
- Examples table:
- Bid 2, win 2 => 2.0 ✅
- Bid 2, win 4 => 2.2 ✅ (overtricks small bonus, don't overbid? Actually bidding low + overtricking is safe but low ceiling. Bidding high risky.)
- Bid 5, win 4 => -5 ❌
- Bid 8, win 8 => 8.0 🌟 (bold!)
- Totals across 5 rounds sum. Highest total wins room pot? Pot: boot 10 each at game start (40 pot), winner takes all at end. Or per-round? Winner-takes-all at end for finale.
- Display: scoreboard with per-round + total, decimals 1 place.
- Tie after 5? Sudden-death 1 round? Or split pot? Pick: tiebreak by most successful bids (met count), then highest single round. Document.
- Fun: show "Need X more" live during tricks (e.g., "Hari needs 1 more!").

---

## 5. Bot Logic (Fill to 4)

- When: lobby <4 humans, host enables "Add bots" (1-3). Bots named `Bot Raju 🤖`.
- Bid logic: count high cards: A/K/Q of any + spades high? Simple: `bid = 1 + count(A/K in hand)/2 + spades>=J count/2`, clamp 1-4? Actually cap 1-5 for sanity. Example: `AS KS QS` => bid 4. No wild bids.
- Play logic:
- If winning trick currently (your card would be highest): play highest winning card (take it).
- Else: play lowest valid card (duck, save high).
- Lead: if have high spade? Lead highest? Or lead low? Simple: lead highest non-spade ace if have, else lowest.
- Trump handling: if must trump, trump with lowest spade that wins, else lowest spade.
- Speed: bot moves after 1.5s delay (human feel), `card()` sound.
- Edge: bots don't chat, show "🤖" avatar. Host simulates, broadcasts `play` as bot.
- Testing: bots never revoke, always valid.

---

## 6. Round & Game Flow

```
LOBBY (need 4, add bots?) -> GAME START (boot 10, pot 40, round 1/5)
 -> BID (each 20s, order, show totals)
 -> 13 TRICKS (lead, follow, trump rule, 20s/play, winner leads)
 -> ROUND SCORE (table, totals, Next Round button host)
 -> ... x5
 -> FINAL (champion, pot, confetti, Play Again)
```

- Dealer rotates each round (dealer leads? Actually left of dealer bids first, dealer? First lead by left of dealer? Pick: dealer leads first trick? Or bidder? Use: player left of dealer leads first trick. Document.)
- Next Round: host button, 5s celebrate before enabled.
- Reconnect: hand + bids + tricks restore (broadcast state). Bot takes over disconnected human after 30s? Optional: auto-bot on away (kind). Document as enabled.

---

## 7. Visuals

- Table: 4 seats N/E/S/W, you always South (rotate view). Trick center 4 slots.
- Cards: 13 hand fanned, valid bright, invalid 40% opacity + lock icon.
- Bids badges on avatars, tricks-won counters "3/4" live with progress ring.
- Scoreboard toggle top, live totals.
- Mobile 375px: hand 13 minis? 13*28px overlap fan, fits. Trick cards 48px. Bids stepper big 48px buttons.
- Desktop: larger, side scoreboard.
- Animations: bid lock pop, play fly, trick collect slide, round score count-up.

---

## 8. Messages

```json
{ "dataType":"cb_start", "payload":{"rounds":5,"boot":10,"pot":40,"dealer":"Hari"} }
{ "dataType":"bid", "payload":{"who":"Sita","bid":3,"order":["Sita","Ram","Gita","Hari"]} }
{ "dataType":"bids_done", "payload":{"bids":{"Hari":4,"Sita":3,"Ram":2,"Gita":4},"total":13} }
{ "dataType":"play", "payload":{"who":"Hari","card":"AS","trickNo":1,"leadSuit":"S"} }
{ "dataType":"trick", "payload":{"no":1,"cards":{"Hari":"AS","Sita":"KS","Ram":"2S","Gita":"5H"},"winner":"Hari","leadSuit":"S"} }
{ "dataType":"round_score", "payload":{"round":1,"tricks":{"Hari":5,"Sita":3,"Ram":2,"Gita":3},"scores":{"Hari":4.1,"Sita":3.0},"totals":{"Hari":4.1}} }
{ "dataType":"final", "payload":{"totals":{"Hari":12.4,"Sita":8.1},"champion":"Hari","pot":40} }
{ "dataType":"tick", "payload":{"who":"Ram","sec":8,"phase":"play"} }
```

---

## 9. Timers

- Bid 20s each, auto 2.
- Play 20s each, auto lowest valid.
- Trick collect 1.2s view before next lead (let them see).
- Round score 5s before Next enabled.
- Total game ~20-25 min. Show progress "Round 3/5".

---

## 10. Sounds

- `shuffle()` + `card()` deal, `tap()` bid stepper, `chime()` bid lock + your turn, `card()` play, `coin()` trick win that meets bid progress, `win()` round met, `lose()` missed bid, `tick()` last 5s, final `win()` long + confetti.

---

## 11. Edge Cases

- Exactly 4 enforced: Start blocked, invite link copy button.
- Player leaves mid-round: bot takes over (cards known? Yes broadcast, bot continues). Score goes to original on reconnect? Yes if returns within round, else bot keeps? Simplify: leaver forfeits round score to bot? Actually credit to seat, leaver gets it on return. Document.
- Host leaves: new host continues (state was broadcast).
- Invalid play attempt: rejected, toast "Must follow ♠️!".
- All pass? No passing in tricks, must play.
- Bids total 13 drama: highlight "Someone must break! 👀".

---

## 12. Fun Details

- "Trump cut! ✂️♠️" shout when spade cuts.
- Overtrick greed meter.
- Champion title "Call Break King 👑".
- Preset chats: "Hukum! ♠️", "Bid bold! 😎", "Oops 😅".

---

## 13. Testing

- [ ] Start blocked unless 4 (humans+bots).
- [ ] Bids 1-8 enforced, auto 2 on timeout.
- [ ] Follow-suit enforced, must-trump-if-void enforced, UI dims.
- [ ] Winner logic spade > led suit, A high.
- [ ] Scoring met +0.1/extra, missed -bid, 5 rounds totals.
- [ ] Tiebreak met-count then high round.
- [ ] Bots bid sane, never revoke, 1.5s delay.
- [ ] Leaver -> bot takeover, return restores.
- [ ] Mobile 13 cards fit, no h-scroll.
- [ ] Reconnect restores hand/bids/tricks.

---

*Bid it, trump it, take it — 13 tricks, no mercy! ♠️*
