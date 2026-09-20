# GAMEPLAY UX — Effortless Fun Principles

> If grandma can't play on a cracked 375px phone in 10 seconds, we failed. Fun > rules. Thumb > mouse. Sound + glow > tutorial.

---

## 1. Design Pillars

1. Effortless: zero tutorial, one-thumb, big buttons, instant feedback.
2. Party: loud, colorful, jokes in feed, winner gloating, loser titles.
3. Forgiving: no harsh punishes, undo where cheap, auto-actions on timeout, reconnect safe.
4. Fast: <1.5s paint, <100ms relay, 30s max wait, skippable animations.
5. Mobile-first: 375px baseline, 44px targets, no h-scroll, dark cozy.
6. Trust: host-authoritative but transparent feed, validator hints, no hidden steals.

---

## 2. Visual System

### 2.1 Colors

- Bg gradient: `#04070a` top -> `#0a0f18` bottom. Never pure black (soft).
- Felt: `#1e8c52` center -> `#073520` edge. Wood rim `#5a3a1e`, brass `#c9a227`.
- Gold primary: `#e8b923` (buttons, winners, pot). Gold dim `#8a6d1a` for borders.
- Text: `#f5f1e6` main, `#a8b0bd` muted, `#ff6b6b` danger, `#51cf66` success.
- Card: `#fff8e7` ivory, back maroon `#6b1d2a` + gold paisley.
- Red suits `#d6336c`, black suits `#212529` on ivory (contrast 8:1).
- Focus ring: 2px gold offset 2px. Never remove outline without replacement.

### 2.2 Typography

- Body: Outfit 16px/1.5, 14px small, 12px min labels.
- Display: Playfair Display for winner banners, pot numbers, room codes (festive serif).
- Mono: system mono for room codes? Actually Playfair for codes too (fun). Nonce/timers tabular-nums.
- Scale: `clamp(16px,4vw,20px)` for titles, `clamp(12px,3vw,14px)` for labels.
- Line length max 60ch. Feed 14px.

### 2.3 Spacing & Shape

- Radius: 12px cards, 10px buttons, 999px pills/chips.
- Gap 8px min, 12px sections, 16px page padding mobile.
- Shadows: soft `0 4px 20px rgba(0,0,0,0.5)`, gold glow `0 0 16px rgba(232,185,35,0.4)` for winners.
- Borders: 1px `rgba(232,185,35,0.2)` subtle, 2px gold for selected.

---

## 3. Touch & Mobile Layout

- Baseline 375x667 (iPhone SE). Test 360x640 Android too.
- Targets: min 44x44px. Exceptions documented per game (roulette board 32px, marriage minis 34px) with mitigations (spacing, confirm, zoom).
- Thumb zone: primary CTA bottom sticky 56-64px bar, safe-area inset.
- No h-scroll: `overflow-x:hidden`, grids wrap, boards vertical stack on mobile.
- Sticky: top bar (back, code, wallet, mute) 56px + bottom action bar. Game area scrolls between.
- One-hand: chips + bet buttons within bottom 1/3. Top is view-only.
- Landscape: letterbox + "Rotate for best 📱" hint, still playable.
- Reduce motion: `@media (prefers-reduced-motion: reduce)` disables tumble/spin/confetti, shows instant results.
- Dark keyboard: `color-scheme: dark`.

---

## 4. Turn System: Glow + 30s Ring + Chime + Auto-Action

- Turn glow: avatar ring gold pulsing 1.2s + cards lift 4px + table spotlight.
- 30s ring: SVG circle countdown around avatar, color green->amber->red last 10s.
- Chime: `chime()` 880+1320Hz on your turn + vibration `navigator.vibrate(20)` (Android).
- Banner: "Your turn! 🎯" top slide-down, auto-dismiss on action.
- Auto-action on timeout (per game):
- Langur/sic-bo/roulette/in-between: auto-lock (no action needed, bets stay).
- Teen-patti: auto-fold. Kitti: auto-lock arrange. Jud: auto-draw+discard. Phalas/marriage/call-break: auto-discard/play lowest.
- Away: avatar greys + "away 😴" + auto-actions keep game moving. Rejoin resumes.
- Pre-select? Optional "Auto-blind" checkbox for teen-patti fast tables.

---

## 5. Sound Cues (sound.js)

- `tap()` 600Hz 40ms — every button/chip/card select.
- `card()` snap 1200Hz — deal/draw/discard/play.
- `dice()` noise rattle — langur/sic-bo shake + bounces.
- `shuffle()` noise 300ms — deal/reshuffle.
- `coin()` 900->1400Hz — pot add, small win, meld.
- `win()` arpeggio C-E-G-C 1.2s — hand/round win, 4+ dice, straight, salaami, triple.
- `lose()` 300->120Hz — fold, miss, underbid, edge.
- `chime()` 880+1320Hz — your turn, pair formed, joker drawn, 1-card warning.
- `tick()` 1000Hz 20ms — last 5s countdowns.
- `spin()` loop — roulette/suspense.
- Dhumbal horn: loud two-tone (custom).
- Rules: <0.5s except win, throttle bounces 100ms, lazy AudioContext on first gesture, iOS resume on every tap, mute persists `localStorage.muted`, mute button always top-right 44px.

---

## 6. Animations: Chip Slide, Winner Flash, Coin Fly

- Chip slide: wallet -> bet spot 400ms easeOut, stack grows. CSS transform, not layout.
- Card fly: hand -> center 300ms, flip 300ms (rotateY). Use `transform` + `opacity` only (60fps).
- Dice tumble: fake physics lerp, 6-8s, skippable after 2-3s (tap bowl).
- Winner flash: gold overlay pulse 3x 600ms + confetti burst (InstancedMesh or CSS).
- Coin fly: 5 coins from pot to winner avatar 800ms staggered, wallet count-up 1s.
- Loser: grey fade + funny title ("Frog 🐸", "Dry Day 🏜️").
- Durations: micro 150ms, standard 300ms, celebrate 1-2s, never block input >300ms.
- Perf: `will-change: transform`, DPR clamp 2, pause rAF hidden, 200 confetti max mobile.

---

## 7. Navigation & Shell UX

- Hash routes: `#/` landing, `#/lobby`, `#/game/<slug>`. No reloads.
- Landing: name input (persist), big [Create Room] gold + [Join] + code input (auto-uppercase). "How to play" collapsible 30s video? Actually 3 bullets per game.
- Lobby: member avatars row, game grid 2 cols (10 cards with emoji + 1-line pitch + players), wallet seed + sitting-out toggles, chat/feed, Start (host, disabled until valid e.g., 4 for call-break with hint).
- Game: top bar [←][CODE][wallet][mute], game area, bottom actions. Back asks "Leave hand? Bets stay!" if mid-hand? Actually allow spectate-safe back to lobby (socket stays, just view changes). Leave room only from lobby.
- Room code: 4-char, big Playfair, tap to copy + share link `?room=XXXX` (Web Share API on mobile).
- Reconnect banner: amber "Reconnecting... bets safe! 🛟" top, retry count, [Leave] option.
- Empty states: "No bets yet, be first! 🍀", "Waiting for host...".
- Errors: toasts bottom 3s, never alerts. E.g., "Not enough coins!", "Must follow ♠️!".

---

## 8. Game-Specific UX Notes

- Langur: 3x2 symbol grid 84px, chips row, result top-left (never cover dice), Next host sticky.
- Teen-patti: eye to peek, blind/chaal big, sideshow popup 15s with Accept/Reject 48px.
- Kitti: 3x3 tap-swap, hints badges, Done/Edit toggle, showdown table trophies.
- Jud: fan 8 cards, joker rainbow, meld/discard mode tabs, joker discard confirm.
- Phalas: deadwood meter color, Dhumbal confirm modal with deadwood, scoring table modal.
- Marriage: compact 34px minis + zoom modal, MELD/DISCARD tabs, validator checklist, Declare confirm.
- Call-break: valid bright/invalid dim, tricks "3/4" progress, bid stepper 48px.
- In-between: gap pill pulses, BET IN-BETWEEN gold, win green glow.
- Roulette: chip tray + Undo/Clear, max-win hint, history dots.
- Sic-bo: sections stacked, triple skull warning for Small/Big.

---

## 9. Mute, Back, Reconnect

- Mute: top-right 44px 🔊/🔇, persists, stops all except? Stops all. Show toast "Muted".
- Back: game -> lobby (stay in room), lobby -> landing (send leave, clear). Never orphan socket.
- Reconnect: exponential 1s,2s,4s,8s max 15s, banner, restore seat/wallet/hand via `joined` + snapshot. Bets safe message critical for trust.
- Host claim: "Host left, Claim?" button after 15s. First claims, gets controls.

---

## 10. Accessibility

- Contrast 4.5:1 text, 3:1 large. Never color-only (suit text, rank text, badges).
- Focus visible gold ring, tab order: actions -> cards -> nav. Esc closes modals.
- Screen reader: buttons labeled ("Bet 10 on Heart"), live region for turn/result/pot (`aria-live="polite"`).
- Touch: 44px, spacing 8px, no tiny close icons (min 32px with padding to 44).
- Motion: respect reduced-motion, provide instant results + text lists for dice/cards.
- Language: simple English + emoji, no jargon. Numbers tabular.
- Colorblind: red/black suits also have symbols ♣♦♥♠ + labels, not hue-only. Felt green + gold distinct.

---

## 11. Dark Theme Tokens (CSS)

```css
:root{
 --bg0:#04070a; --bg1:#0a0f18;
 --felt1:#1e8c52; --felt2:#073520;
 --gold:#e8b923; --gold-dim:#8a6d1a;
 --ink:#f5f1e6; --muted:#a8b0bd;
 --danger:#ff6b6b; --good:#51cf66;
 --card:#fff8e7; --back:#6b1d2a;
 --r:12px; --tap:44px;
 --font-body:Outfit,system-ui; --font-disp:Playfair Display,serif;
}
```

- Buttons: primary gold bg black text 16px bold 52px height, ghost transparent gold border.
- Cards: ivory bg radius 8-12px shadow.
- Top bar blur `backdrop-filter: blur(8px)` over dark.

---

## 12. Copy & Fun Voice

- Buttons: "SHAKE IT! 🎲", "CALL DHUMBAL 📢", "BET IN-BETWEEN 🔥", "No more bets! 🙅".
- Feed jokes: "Hari is feeling lucky 🍀", "Sita needs a loan 😅", "House eats tonight 🏠".
- Loser titles: "Frog 🐸", "Dry Day 🏜️", "Greedy! 😅", "Blind King 😎".
- Winner titles: "Patti Raja 👑", "Joker King 🃏", "SNIPER 🎯", "LEGEND! 🤯".
- Empty: "No bets, just vibes ✨".
- Keep it kind, never mock balance. Celebrate all wins, even small.

---

## 13. Testing Checklist (UX)

- [ ] 375px no h-scroll on all 10 games + lobby + landing.
- [ ] 44px targets pass thumb test (no misclicks 95%+).
- [ ] Turn glow+ring+chime+vibrate all fire.
- [ ] Auto-actions keep game moving with 1 away player.
- [ ] Sounds correct per action, mute persists.
- [ ] Chip slide + winner flash + coin fly smooth 60fps on mid Android.
- [ ] Back never orphans, reconnect banner shows, bets safe.
- [ ] Reduced-motion shows instant results.
- [ ] Contrast 4.5:1, focus rings, aria-live announces wins.
- [ ] Copy link + share works via tunnel URL.
- [ ] Confetti doesn't block Next button (pointer-events none).

---

*Thumb first, laughs always, no one lost — that's UX! 📱✨*
