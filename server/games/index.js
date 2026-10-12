'use strict';
// Registry. A game that fails to load is skipped (and logged) so the rest keep working.
const ORDER = ['langur', 'teenpatti', 'callbreak', 'kitti', 'phalas', 'judpatti', 'marriage', 'inbetween'];
const games = {};
for (const id of ORDER) {
  try { games[id] = require('./' + id); }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes("'./" + id + "'")) console.error('[games] failed to load', id, e); }
}
module.exports = games;
module.exports.ORDER = ORDER.filter((id) => games[id]);
