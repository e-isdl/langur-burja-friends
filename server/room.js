'use strict';
const crypto = require('crypto');
const { make: makeRng } = require('./lib/rng');
const { GameError } = require('./lib/util');
const games = require('./games');

const BOT_NAMES = ['Ramesh', 'Sita', 'Bikash', 'Anita', 'Prakash', 'Sunita', 'Dipesh', 'Gita', 'Suman', 'Nabin', 'Rita', 'Kiran', 'Manoj', 'Puja', 'Hari', 'Maya'];
const MAX_PLAYERS = 10;           // humans + bots in a room
const REACTIONS = new Set(['wah', 'haha', 'oh', 'fire', 'jaldi', 'chiya', 'clap', 'sad']);

const now = () => Date.now();
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);

class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.players = new Map();     // pid -> player
    this.hostPid = null;
    this.phase = 'lobby';         // 'lobby' | 'game'
    this.pick = { game: 'teenpatti', opts: {} };
    this.g = null;                // running game
    this.colorUsed = new Set();
    this.rng = makeRng(opts.seed);
    this.fast = !!opts.fast;      // tests: shrink delays
    this.lastActive = now();
    this.handsPlayed = 0;
    this.onEmpty = opts.onEmpty || (() => {});
  }

  // ---------- players ----------
  pid() { return crypto.randomBytes(6).toString('hex'); }
  nextColor() { for (let i = 0; i < 10; i++) if (!this.colorUsed.has(i)) { this.colorUsed.add(i); return i; } return this.players.size % 10; }
  uniqueName(name, skipPid) {
    let n = cleanName(name) || 'Guest', k = 2; const taken = () => [...this.players.values()].some((p) => !p.left && p.pid !== skipPid && p.name.toLowerCase() === n.toLowerCase());
    const base = n; while (taken()) n = base.slice(0, 13) + ' ' + k++;
    return n;
  }
  addHuman(name, token) {
    const p = { pid: this.pid(), token, name: this.uniqueName(name), bot: false, ws: null, online: false, lastSeen: now(), khata: 0, color: this.nextColor(), left: false, away: 0, auto: false, joinedAt: now() };
    this.players.set(p.pid, p);
    if (!this.hostPid) this.hostPid = p.pid;
    return p;
  }
  addBot(temp = false) {
    const used = new Set([...this.players.values()].filter((p) => !p.left).map((p) => p.name));
    const pool = BOT_NAMES.filter((n) => !used.has(n));
    const name = pool.length ? this.rng.pick(pool) : 'Bot ' + (this.players.size + 1);
    const p = { pid: 'b' + this.pid(), token: null, name, bot: true, ws: null, online: true, lastSeen: now(), khata: 0, color: this.nextColor(), left: false, away: 0, auto: false, temp, joinedAt: now() };
    this.players.set(p.pid, p);
    return p;
  }
  live() { return [...this.players.values()].filter((p) => !p.left); }
  humans() { return this.live().filter((p) => !p.bot); }
  onlineHumans() { return this.humans().filter((p) => p.online); }
  seatOf(pid) { return this.g ? this.g.seats.indexOf(pid) : -1; }

  attach(p, ws) {
    if (p.ws && p.ws !== ws) { try { p.ws.close(4001, 'replaced'); } catch (_) {} }
    p.ws = ws; p.online = true; p.lastSeen = now(); p.away = 0; p.auto = false;
    ws.pid = p.pid; ws.roomCode = this.code;
    this.lastActive = now();
    this.sendRoom();
    if (this.g) { this.sendState(p); this.advance(); }
  }
  detach(p, ws) {
    if (p.ws !== ws) return;
    p.ws = null; p.online = false; p.lastSeen = now();
    this.sendRoom();
    if (p.pid === this.hostPid) { const t = setTimeout(() => this.checkHost(), this.fast ? 5 : 20000); if (t.unref) t.unref(); }
    if (this.g && this.onlineHumans().length === 0) this.clearTimers();
  }
  removePlayer(pid, kicked = false) {
    const p = this.players.get(pid); if (!p || p.left) return;
    if (kicked && p.ws) { this.send(p, { t: 'kicked' }); try { p.ws.close(4400, 'kicked'); } catch (_) {} }
    p.left = true; p.online = false;
    if (p.ws) { p.ws.roomCode = null; p.ws.pid = null; p.ws = null; }
    this.colorUsed.delete(p.color);
    if (p.bot) this.players.delete(pid);
    if (this.g) {
      const seat = this.g.seats.indexOf(pid);
      if (seat >= 0) {                         // hand the seat to a bot so the table keeps moving
        const b = this.addBot(true); b.name = p.name; this.g.seats[seat] = b.pid;
        this.pruneLeft();
      }
    }
    this.checkHost();
    if (this.humans().length === 0) { this.dispose(); this.onEmpty(this); return; }
    this.sendRoom();
    if (this.g) { this.sendStateAll(); this.advance(); }
  }
  pruneLeft() { /* keep left humans for the ledger; nothing to do */ }
  checkHost() {
    const host = this.players.get(this.hostPid);
    if (host && !host.left && host.online) return;
    const next = this.humans().filter((p) => p.online).sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next && next.pid !== this.hostPid) { this.hostPid = next.pid; this.sendRoom(); }
  }

  // ---------- messaging ----------
  send(p, msg) { if (p.ws && p.ws.readyState === 1) { try { p.ws.send(JSON.stringify(msg)); } catch (_) {} } }
  broadcast(msg) { const s = JSON.stringify(msg); for (const p of this.humans()) if (p.ws && p.ws.readyState === 1) { try { p.ws.send(s); } catch (_) {} } }
  info() {
    const seats = this.g ? this.g.seats : null;
    return {
      code: this.code, hostPid: this.hostPid, phase: this.phase, pick: this.pick,
      game: this.g ? { id: this.g.id, name: this.g.mod.name, hand: this.g.hand } : null,
      seats,
      players: [...this.players.values()].filter((p) => !p.left || p.khata !== 0).map((p) => ({
        pid: p.pid, name: p.name, bot: p.bot, online: p.online, khata: p.khata, color: p.color, left: p.left, auto: !p.bot && (p.auto || (this.g && !p.online)) && seats && seats.includes(p.pid),
      })),
      hands: this.handsPlayed,
    };
  }
  sendRoom() { this.broadcast({ t: 'room', room: this.info() }); }
  error(p, message) { this.send(p, { t: 'error', message }); }

  // ---------- lobby actions ----------
  doPick(p, m) {
    if (p.pid !== this.hostPid || this.phase !== 'lobby') return;
    const mod = games[m.game]; if (!mod) return;
    const opts = {}; if (m.opts && typeof m.opts === 'object') for (const k of Object.keys(m.opts)) if (['unit', 'variant'].includes(k)) opts[k] = m.opts[k];
    this.pick = { game: m.game, opts };
    this.sendRoom();
  }
  doAddBot(p) {
    if (p.pid !== this.hostPid || this.phase !== 'lobby') return;
    if (this.live().length >= MAX_PLAYERS) return this.error(p, 'Table is full');
    this.addBot(false); this.sendRoom();
  }
  doRemoveBot(p, m) {
    if (p.pid !== this.hostPid || this.phase !== 'lobby') return;
    const b = this.players.get(m.pid); if (b && b.bot) { this.players.delete(b.pid); this.colorUsed.delete(b.color); this.sendRoom(); }
  }

  startGame(p, m) {
    if (p.pid !== this.hostPid) return this.error(p, 'Only the host can deal');
    if (this.phase !== 'lobby') return;
    const mod = games[m.game || this.pick.game]; if (!mod) return this.error(p, 'Unknown game');
    const opts = Object.assign({}, this.pick.opts, m.opts || {});
    let members = this.live().filter((x) => x.bot || x.online);
    if (members.length > mod.max) return this.error(p, mod.name + ' seats at most ' + mod.max + '. Remove a bot or wait for the next game.');
    // Humans first, then bots. Pad with temporary bots up to the minimum.
    members = [...members.filter((x) => !x.bot), ...members.filter((x) => x.bot)];
    const seats = members.map((x) => x.pid);
    while (seats.length < mod.min) seats.push(this.addBot(true).pid);
    this.rng.shuffle(seats);                         // random seating order
    this.phase = 'game';
    this.g = { mod, id: mod.id, opts, seats, hand: 0, state: null, epoch: 0, tk: null, deadline: null, timers: [], seq: 0, result: null, resultAt: 0, resultTimer: null, botFails: 0 };
    this.newHand(null);
  }
  newHand(prev) {
    const g = this.g;
    g.hand++; g.result = null; g.resultAt = 0;
    const seatInfo = g.seats.map((pid) => { const q = this.players.get(pid); return { name: q ? q.name : '?', bot: !!(q && q.bot) }; });
    g.state = g.mod.create({ seats: seatInfo, opts: g.opts, rng: this.rng, prev, hand: g.hand });
    g.state.ev = g.state.ev || [];
    this.sendRoom();
    this.afterChange();
  }
  endTable(p) {
    if (p && p.pid !== this.hostPid) return;
    if (!this.g) return;
    this.clearTimers();
    for (const pid of this.g.seats) { const q = this.players.get(pid); if (q && q.bot && q.temp) { this.players.delete(pid); this.colorUsed.delete(q.color); } }
    this.g = null; this.phase = 'lobby';
    this.broadcast({ t: 'lobby' });
    this.sendRoom();
  }
  takeSeat(p, m) {
    if (!this.g || this.seatOf(p.pid) >= 0) return;
    const seat = m.seat | 0; const pid = this.g.seats[seat]; const b = this.players.get(pid);
    if (!b || !b.bot) return this.error(p, 'That seat is taken');
    this.g.seats[seat] = p.pid;
    if (b.temp) { this.players.delete(b.pid); this.colorUsed.delete(b.color); }
    this.sendRoom(); this.sendStateAll(); this.advance();
  }

  // ---------- game loop ----------
  clearTimers() { if (!this.g) return; for (const t of this.g.timers) clearTimeout(t); this.g.timers = []; if (this.g.resultTimer) { clearTimeout(this.g.resultTimer); this.g.resultTimer = null; } }
  later(fn, ms) {
    const g = this.g; const epoch = g.epoch;
    const t = setTimeout(() => { if (!this.g || this.g !== g || g.epoch !== epoch) return; try { fn(); } catch (e) { console.error('[room ' + this.code + '] timer error', e); } }, this.fast ? Math.min(ms, 5) : ms);
    if (t.unref) t.unref();
    g.timers.push(t);
  }
  drainEv() { const s = this.g.state; const e = s.ev || []; s.ev = []; return e; }
  seatPlayer(seat) { return this.players.get(this.g.seats[seat]); }

  // Called after every state mutation.
  afterChange(evs) {
    const g = this.g; if (!g) return;
    if (g.result) {                               // hand already settled: never settle twice
      this.sendStateAll([]);
      if (!g.resultTimer) this.afterResult();
      return;
    }
    g.epoch++;
    this.clearTimers();
    const events = evs || this.drainEv();
    if (g.mod.over(g.state)) return this.finishHand(events);
    const actors = g.mod.actors(g.state);
    // A deadline window only restarts when a new turn window begins (state.tk changes).
    const tk = g.mod.turnKey ? g.mod.turnKey(g.state) : String(g.state.tk);
    if (tk !== g.tk) { g.tk = tk; g.deadline = null; }
    const humanWaiting = actors.some((seat) => this.isHumanTurn(seat)) && this.onlineHumans().length > 0;
    if (humanWaiting) { if (!g.deadline) g.deadline = now() + (g.mod.turnMs ? g.mod.turnMs(g.state) : 30000); }
    else g.deadline = null;
    this.sendStateAll(events);
    this.schedule(actors, humanWaiting);
  }
  advance() { if (this.g) this.afterChange([]); }

  isHumanTurn(seat) {
    const p = this.seatPlayer(seat);
    return !!p && !p.bot && p.online && !p.auto && p.away < 2;
  }
  schedule(actors, humanWaiting) {
    const g = this.g;
    if (this.onlineHumans().length === 0) return;             // nobody watching: freeze
    if (actors.length === 0) {
      const d = g.mod.tickDelay ? g.mod.tickDelay(g.state) : 0;
      if (!d) { console.error('[room ' + this.code + '] stuck: no actors and no tick', g.id); return this.forceEnd(); }
      this.later(() => { g.mod.tick(g.state); this.afterChange(); }, d);
      return;
    }
    for (const seat of actors) {
      if (this.isHumanTurn(seat)) continue;
      const p = this.seatPlayer(seat);
      const offline = p && !p.bot && !p.online;
      const think = offline
        ? 4500
        : (g.mod.botThink ? g.mod.botThink(g.state, seat, this.rng) : 600 + this.rng.int(900));
      // Nobody is deciding: don't dawdle, move in a blink.
      this.later(() => this.botMove(seat), !humanWaiting && !offline ? Math.min(think, 1500) : think);
    }
    if (humanWaiting) this.later(() => this.timeout(actors), Math.max(0, g.deadline - now()) + 50);
  }
  botMove(seat) {
    const g = this.g; if (!g || g.mod.over(g.state)) return;
    if (!g.mod.actors(g.state).includes(seat)) return this.advance();
    let a;
    try { a = g.mod.bot(g.state, seat, this.rng); g.mod.act(g.state, seat, a); g.botFails = 0; }
    catch (e) {
      console.error('[room ' + this.code + '] bot error in ' + g.id, e && e.message, JSON.stringify(a));
      try { a = g.mod.auto(g.state, seat); g.mod.act(g.state, seat, a); }
      catch (e2) { console.error('  auto fallback failed too', e2 && e2.message); if (++g.botFails > 3) return this.forceEnd(); }
    }
    this.afterChange();
  }
  timeout(actors) {
    const g = this.g; if (!g) return;
    const cur = g.mod.actors(g.state);
    for (const seat of actors) {
      if (!cur.includes(seat)) continue;
      const p = this.seatPlayer(seat);
      if (p && !p.bot) { p.away++; if (p.away >= 2) p.auto = true; }
      try { g.mod.act(g.state, seat, g.mod.auto(g.state, seat)); }
      catch (e) { console.error('[room ' + this.code + '] auto error in ' + g.id, e && e.message); }
    }
    g.deadline = null;
    this.afterChange();
  }
  forceEnd() { console.error('[room ' + this.code + '] force-ending stuck game ' + (this.g && this.g.id)); this.broadcast({ t: 'toast', message: 'Something went wrong with that hand. Back to the lobby.' }); this.endTable(null); }

  finishHand(events) {
    const g = this.g;
    const res = g.mod.result(g.state);
    const deltas = res.deltas;
    let total = 0; deltas.forEach((d) => { total += d; });
    if (total !== 0) console.error('[room ' + this.code + '] ' + g.id + ' deltas not zero-sum', deltas);
    deltas.forEach((d, seat) => { const q = this.seatPlayer(seat); if (q) q.khata += d; });
    this.handsPlayed++;
    g.result = { deltas, summary: res.summary || null, final: !!res.final };
    g.resultAt = now();
    g.deadline = null;
    this.sendRoom();
    this.sendStateAll(events);
    const wait = g.mod.resultMs ? g.mod.resultMs(g.state) : 9000;
    g.resultTimer = setTimeout(() => this.afterResult(), this.fast ? 5 : wait);
    if (g.resultTimer.unref) g.resultTimer.unref();
  }
  afterResult() {
    const g = this.g; if (!g || !g.result) return;
    g.resultTimer = null;
    if (this.onlineHumans().length === 0) return;
    if (g.result.final) return this.endTable(null);
    this.newHand(g.state);
  }
  skipResult(p) { if (this.g && this.g.result && p.pid === this.hostPid) { clearTimeout(this.g.resultTimer); this.g.resultTimer = null; this.afterResult(); } }

  sendStateAll(evs) { for (const p of this.humans()) if (p.ws) this.sendState(p, evs); }
  sendState(p, evs) {
    const g = this.g; if (!g) return;
    const seat = g.seats.indexOf(p.pid);
    let v;
    try { v = g.mod.view(g.state, seat); } catch (e) { console.error('[room ' + this.code + '] view error', g.id, e); return; }
    const actors = g.result ? [] : g.mod.actors(g.state);
    this.send(p, {
      t: 'state', g: g.id, hand: g.hand, seat, seq: ++g.seq, v, actors, evs: evs || [],
      deadline: g.deadline && !g.result ? g.deadline : null, now: now(),
      turnMs: g.mod.turnMs ? g.mod.turnMs(g.state) : 30000,
      result: g.result ? { deltas: g.result.deltas, summary: g.result.summary, final: g.result.final, nextIn: Math.max(0, (g.mod.resultMs ? g.mod.resultMs(g.state) : 9000) - (now() - g.resultAt)) } : null,
      seatPids: g.seats,
    });
  }

  handleAct(p, action) {
    const g = this.g; if (!g) return;
    if (g.result) return this.error(p, 'Hand is over');
    const seat = g.seats.indexOf(p.pid);
    if (seat < 0) return this.error(p, 'You are watching this hand');
    if (!g.mod.actors(g.state).includes(seat) && !(g.mod.offTurn && g.mod.offTurn(g.state, seat, action))) return this.error(p, 'Not your turn');
    try { g.mod.act(g.state, seat, action); }
    catch (e) {
      if (e instanceof GameError) return this.error(p, e.message);
      console.error('[room ' + this.code + '] act error', g.id, e); return this.error(p, 'That move failed');
    }
    p.away = 0; p.auto = false;
    this.afterChange();
  }

  react(p, e) {
    if (!REACTIONS.has(e)) return;
    const t = now(); if (p.lastReact && t - p.lastReact < 700) return; p.lastReact = t;
    this.broadcast({ t: 'react', pid: p.pid, e });
  }

  dispose() { this.clearTimers(); this.g = null; }
}

module.exports = { Room, REACTIONS };
