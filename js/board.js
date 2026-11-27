// Shared chessboard helpers (all boards in the app use chessground).
import { Chessground } from '../vendor/chessground/chessground.min.js';
import * as R from './rating.js';

export function makeBoard(el, extra = {}) {
  const { movable, ...rest } = extra;
  return Chessground(el, {
    coordinates: true,
    autoCastle: true,
    animation: { enabled: true, duration: 220 },
    highlight: { lastMove: true, check: true },
    movable: { free: false, color: undefined, showDests: true, ...(movable || {}) },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    drawable: { enabled: true, visible: true, eraseOnClick: true },
    ...rest,
  });
}

export function destsOf(chess) {
  const dests = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  }
  return dests;
}

/** Shows a chess.js position on a board. `movable` lets the side to move play. */
export function showPosition(cg, chess, { movable = false, lastMove } = {}) {
  const turn = chess.turn() === 'w' ? 'white' : 'black';
  cg.set({
    fen: chess.fen(),
    turnColor: turn,
    check: chess.inCheck() ? turn : false,
    lastMove: lastMove || undefined,
    movable: { color: movable ? turn : undefined, dests: movable ? destsOf(chess) : new Map() },
  });
}

/** Updates an eval bar element from a score for the side to move (`stm`). */
export function setEvalBar(bar, score, stm) {
  if (!bar || !score) return;
  const white = stm === 'w' ? score : R.negateScore(score);
  const pct = R.winFromScore(white);
  bar.querySelector('.fill').style.height = `${pct}%`;
  bar.querySelector('.label').textContent = R.formatEval(white).replace('+', '');
  bar.classList.toggle('black-better', pct < 50);
}

/** Same, from a White-point-of-view centipawn number. */
export function setEvalBarCp(bar, cpWhite) {
  setEvalBar(bar, { cp: cpWhite }, 'w');
}

/** Chessground measures itself when shown; call after a hidden board becomes visible. */
export function refresh(cg) {
  if (cg) cg.redrawAll();
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
