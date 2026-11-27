// Board-reading helpers used by the coach to explain *why* a move is good or bad.
// The engine decides how good a move is; these functions only describe what happened
// in human terms (hanging pieces, forks, mate threats, material swings).

import { Chess } from '../vendor/chess.js';

export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export const other = (c) => (c === 'w' ? 'b' : 'w');
export const colorName = (c) => (c === 'w' ? 'White' : 'Black');

export function uciToMove(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

export function moveToUci(m) {
  return m.from + m.to + (m.promotion || '');
}

/** All pieces on the board as {square, type, color}, optionally filtered by color. */
export function allPieces(chess, color) {
  const out = [];
  for (const row of chess.board()) {
    for (const p of row) if (p && (!color || p.color === color)) out.push(p);
  }
  return out;
}

/** Material balance in pawns from `color`'s point of view (kings excluded). */
export function material(chess, color) {
  let sum = 0;
  for (const p of allPieces(chess)) {
    if (p.type === 'k') continue;
    sum += p.color === color ? VALUE[p.type] : -VALUE[p.type];
  }
  return sum;
}

// Static exchange evaluation (swap-off). `att`/`def` are piece values sorted ascending.
function swap(targetValue, att, def) {
  if (!att.length) return 0;
  const gain = [targetValue];
  let onSquare = att[0];
  let ai = 1;
  let di = 0;
  let side = 1; // 1 = defenders to capture next
  let d = 0;
  for (;;) {
    const list = side ? def : att;
    const idx = side ? di : ai;
    if (idx >= list.length) break;
    d++;
    gain[d] = onSquare - gain[d - 1];
    onSquare = list[idx];
    if (side) di++;
    else ai++;
    side ^= 1;
  }
  for (; d > 0; d--) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
  return gain[0];
}

/**
 * Material (in pawns) that `byColor` wins by starting a capture sequence on `square`.
 * Returns 0 when there is nothing to win. Ignores pins and x-rays: good enough for explanations.
 */
export function captureGain(chess, square, byColor) {
  const target = chess.get(square);
  if (!target || target.color === byColor || target.type === 'k') return 0;
  const val = (s) => VALUE[chess.get(s).type];
  const att = chess.attackers(square, byColor).map(val).sort((a, b) => a - b);
  if (!att.length) return 0;
  const def = chess.attackers(square, target.color).map(val).sort((a, b) => a - b);
  return Math.max(0, swap(VALUE[target.type], att, def));
}

/** Pieces of `color` that the opponent could win right now, most valuable first. */
export function hangingPieces(chess, color) {
  const out = [];
  for (const p of allPieces(chess, color)) {
    if (p.type === 'k') continue;
    const gain = captureGain(chess, p.square, other(color));
    if (gain > 0) {
      const attackers = chess.attackers(p.square, other(color));
      const defended = chess.attackers(p.square, color).length > 0;
      const cheapest = attackers.map((s) => chess.get(s)).sort((a, b) => VALUE[a.type] - VALUE[b.type])[0];
      out.push({ square: p.square, type: p.type, gain, defended, attacker: cheapest });
    }
  }
  return out.sort((a, b) => b.gain - a.gain || VALUE[b.type] - VALUE[a.type]);
}

/** A copy of the position with the other side to move (a "null move"), or null if illegal. */
export function passTurn(chess) {
  if (chess.inCheck()) return null;
  const c = new Chess(chess.fen());
  try {
    if (!c.setTurn(other(chess.turn()))) return null;
  } catch {
    return null;
  }
  return c;
}

/** Moves the opponent could checkmate with if the side to move did nothing. */
export function mateThreats(chess) {
  const c = passTurn(chess);
  if (!c) return [];
  const res = [];
  for (const m of c.moves({ verbose: true })) {
    c.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (c.isCheckmate()) res.push(m);
    c.undo();
  }
  return res;
}

/** Mate-in-one moves available to the side to move. */
export function matesInOne(chess) {
  const c = new Chess(chess.fen());
  const res = [];
  for (const m of c.moves({ verbose: true })) {
    c.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (c.isCheckmate()) res.push(m);
    c.undo();
  }
  return res;
}

/**
 * Valuable targets attacked by the piece on `square`: the enemy king (check), enemy pieces
 * worth more than the attacker, and undefended enemy pieces.
 */
export function forkTargets(chess, square) {
  const p = chess.get(square);
  if (!p) return [];
  const targets = [];
  for (const q of allPieces(chess, other(p.color))) {
    if (!chess.attackers(q.square, p.color).includes(square)) continue;
    if (q.type === 'k') targets.push(q);
    else if (VALUE[q.type] > VALUE[p.type] || chess.attackers(q.square, q.color).length === 0) targets.push(q);
  }
  return targets.sort((a, b) => VALUE[b.type] - VALUE[a.type]);
}

/**
 * Plays an engine line (UCI moves) from `fen` and reports the material balance for `pov`
 * once the captures settle (two quiet plies in a row, or `maxPlies`).
 */
export function lineOutcome(fen, uciMoves, pov, maxPlies = 8) {
  const c = new Chess(fen);
  const start = material(c, pov);
  const sans = [];
  let settled = start;
  let quiet = 0;
  for (let i = 0; i < Math.min(uciMoves.length, maxPlies); i++) {
    let m;
    try {
      m = c.move(uciToMove(uciMoves[i]));
    } catch {
      break;
    }
    sans.push(m.san);
    if (m.captured || m.promotion) quiet = 0;
    else quiet++;
    settled = material(c, pov);
    if (quiet >= 2) break;
  }
  return { start, end: settled, change: settled - start, sans, mate: c.isCheckmate() };
}

/** SAN for a UCI move in a position, or the UCI string if it can't be parsed. */
export function sanOf(fen, uci) {
  try {
    return new Chess(fen).move(uciToMove(uci)).san;
  } catch {
    return uci;
  }
}

/** Formats a SAN line with move numbers, e.g. "12...Nxe4 13.Qxe4 d5". */
export function formatLine(fen, sans) {
  const parts = fen.split(' ');
  let moveNo = parseInt(parts[5], 10) || 1;
  let white = parts[1] === 'w';
  const out = [];
  sans.forEach((s, i) => {
    if (white) out.push(`${moveNo}.${s}`);
    else out.push(i === 0 ? `${moveNo}...${s}` : s);
    if (!white) moveNo++;
    white = !white;
  });
  return out.join(' ');
}

export function gamePhase(chess) {
  const fullmove = parseInt(chess.fen().split(' ')[5], 10);
  let nonPawn = 0;
  for (const p of allPieces(chess)) if (p.type !== 'p' && p.type !== 'k') nonPawn += VALUE[p.type];
  if (nonPawn <= 26) return 'endgame';
  if (fullmove <= 10) return 'opening';
  return 'middlegame';
}

/** Minor pieces of `color` still on their starting squares. */
export function undevelopedMinors(chess, color) {
  const home = color === 'w' ? { b1: 'n', g1: 'n', c1: 'b', f1: 'b' } : { b8: 'n', g8: 'n', c8: 'b', f8: 'b' };
  return Object.entries(home)
    .filter(([sq, t]) => {
      const p = chess.get(sq);
      return p && p.type === t && p.color === color;
    })
    .map(([sq]) => sq);
}

export function canStillCastle(chess, color) {
  const r = chess.getCastlingRights(color);
  return !!(r.k || r.q);
}
