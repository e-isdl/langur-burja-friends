# Langur Burja & Friends v2

Rebuilt from scratch. Server-authoritative (the server rolls dice, deals cards, and computes every
payout - clients only render and send intents), one socket per tab with token-based reconnect, bots
fill empty seats and take over on disconnect, and a khata (ledger) tracks wins/losses across hands.

## Run it
Double-click `start.bat` (or `npm run live`). It starts the server, opens the
game, builds a public link, and waits until the link answers before telling
you to share it.

**Friends on your WiFi:** open the `Friends on your WiFi join at:
http://192.168.x.x:3000` address printed by the server. No tunnel needed.
(First run: Windows Firewall asks about Node.js - click Allow.)

**Friends anywhere:** send them the `SEND THIS TO FRIENDS` link
(`https://xxx.trycloudflare.com`). They open it, type a name and your room
code (or tap your `/r/CODE` invite link), and they are seated. No sign up.

```
npm install
npm start                    # http://localhost:3000
```

## Games
- **Call Break** - bid your tricks, spades trump, 5 rounds
- **Teen Patti** - blind/seen, side shows, pot limit
- **Kitti** - nine cards, three brags, win two in a row
- **Phalas** (Dhumbal) - dump sets, stay low, call Show
- **Jud Patti** - lay sets, joker wild, empty your hand first
- **Marriage** - three decks, 21 cards, the marathon finale (real declare validator, not host-trust)
- **In-Between** - bet the third card lands between the first two

## Tests
```
node test/sim.js              # bot-vs-bot rules engine fuzzing for every game, thousands of hands
node test/room.test.js        # real WebSocket integration test: join, reconnect, bots, full match
node test/_mp2.js             # multiplayer: host creates, friend joins by code, both play a hand
node test/_mp2ui.js           # multiplayer in real browsers: invite link, lobby, deal, friend acts
node test/_tunnel2.js           # internet path: real tunnel, public URL serves game, WS join works (slow)
node test/shots.js <gameId>   # headless-Chromium screenshot smoke test
```

## Structure
- `server/room.js` - the game loop: turns, timers, disconnect/reconnect, bot takeover, khata
- `server/games/*.js` - one file per game: pure functions (create/act/bot/result), no I/O
- `public/js/table.js` - shared table chrome (seats, dock, results); `public/js/games/*.js` render each game's center/hand/actions
- `public/js/games/marriage.js` + the `canDeclare` solver in `server/games/marriage.js` - a real bounded
  backtracking partition check for the 22-card declare, not a trust-the-client rule

## What's different from the old repo
No duplicate-socket join bug, no negative-EV Langur Burja math, real reconnect, real bot fallback, a
tested economy for every game (bot-vs-bot simulated for zero-sum payouts and sane game length), and a
UI built for one hand on a phone instead of three stacked network layers patched over each other.
