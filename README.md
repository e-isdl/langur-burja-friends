# Langur Burja & Friends 🎲

Private multiplayer room server for playing Langur Burja and 9 more classic games with friends. No login, no database — create a room, share the code + link over WhatsApp, play.

## Requirements

- **Node.js 18+** (`node -v` to check)
- **cloudflared** (for sharing with friends outside your Wi-Fi)

### Install cloudflared

- **macOS:** `brew install cloudflared`
- **Windows:** download from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ (or `winget install cloudflare.cloudflared`)
- **Linux:** `wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared && chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/`

## Run

```bash
cd C:\projects\langur-burja-friends
npm install
npm start
```

Server starts on `http://localhost:3000`.

### Share with friends (second terminal)

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the `https://xxx.trycloudflare.com` URL it prints and send it to friends via WhatsApp along with your **room code** (e.g. `KQ7M2X`).

> Host + friends all open the same cloudflared URL. One person taps **Create**, everyone else taps **Join** and enters the code.

## How to play

1. Host opens the URL, enters a name → **Create Room** → gets a 6-letter code.
2. Host sends the URL + code to the WhatsApp group.
3. Friends open the URL, enter names → **Join** with the code.
4. Host picks a game and taps **Start**. Cards/dice run in the browser; the server relays moves and tracks chips.
5. When the round ends, host taps **End** — chip changes are applied to everyone's wallet.
6. Play again or switch games. Leave anytime; host role passes to the next player automatically.

## Games (10)

1. **langur-burja** — 6-dice Jhandi Munda bidding game
2. **teen-patti** — 3-card poker (chaal, blind, show)
3. **kitti** — 9-card 3×3 sets
4. **jud-patti** — draw-and-discard matching
5. **phalas** — flush-style 3-card
6. **marriage** — 21-card rummy + maal/tiplu
7. **call-break** — 4-player trick bidding (13 tricks)
8. **in-between** — card in-between two cards?
9. **roulette** — number/color wheel betting
10. **sic-bo** — 3-dice over/under betting

Game rules, cards, and dice are all client-side. Server accepts these names for `start-game` and relays everything else via `action`.

## Wallet notes

- Everyone starts with **200 chips** (host can change pre-game via `set-chips`).
- Chips are **fun credits only** — in-memory, reset when the server restarts. No real money.
- `end-game` applies host-reported deltas (`[{playerId, delta}]`), clamped so nobody goes below 0.
- If someone disconnects, their seat is held for ~30–60s — they rejoin with the same name and keep chips/seat.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Port 3000 in use` | `PORT=4000 npm start` (then tunnel `--url http://localhost:4000`), or kill the old process |
| Friends see `Room not found` | Codes are 6 chars, uppercase. Check for 0/O, 1/I confusion — the server never generates those |
| `Room full` | Max 8 connected players per room |
| WSS / mixed-content errors | Make sure everyone uses the `https://` cloudflared URL, not `http://localhost` |
| Reconnect | Same name + same code reclaims the seat. If stuck, leave and rejoin, or host kicks the ghost entry |
| Only host can start/end/kick | First player in the room is host; if host leaves, the next player auto-becomes host |

## Stop

- `Ctrl+C` in the server terminal.
- `Ctrl+C` in the cloudflared terminal (link stops working immediately — normal).
