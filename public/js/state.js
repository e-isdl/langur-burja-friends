export const S = {
  pid: null, code: null, room: null, catalog: [], game: null, connected: false, needName: null, replaced: false,
  settings: { fourColor: false, hints: true },
  ui: {},               // per-game local UI state, reset on new hand
};
try { const s = JSON.parse(localStorage.getItem('lbf_settings') || '{}'); Object.assign(S.settings, s); } catch (_) {}
export function saveSettings() { try { localStorage.setItem('lbf_settings', JSON.stringify(S.settings)); } catch (_) {} document.documentElement.classList.toggle('four-color', !!S.settings.fourColor); }
document.documentElement.classList.toggle('four-color', !!S.settings.fourColor);

export const player = (pid) => (S.room ? S.room.players.find((p) => p.pid === pid) : null);
export const me = () => player(S.pid);
export const isHost = () => !!(S.room && S.room.hostPid === S.pid);
export const gameInfo = (id) => S.catalog.find((g) => g.id === id);
