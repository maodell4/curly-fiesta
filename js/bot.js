// Adaptive opponent.
//
// Stockfish can't play below ~1300 on its own, which would crush a beginner, so the bot
// picks among Stockfish's candidate moves like a human of the target rating would:
//  - usually a good move, chosen with randomness that grows as the target rating drops
//    (softmax over the engine's candidates, temperature tied to that rating's expected ACPL)
//  - occasionally a "slip": a natural-looking but unchecked move, the way real beginners
//    hang pieces. Slips get rarer as the target rating rises.

import { clamp, expectedAcpl } from './rating.js';

// Calibrated by self-play (see README): with these settings the bot's average centipawn
// loss lands close to the ACPL the rating model expects for its target rating.
// Fitted from ~3,300 self-play moves: a slip costs ~367 centipawns on average, the softmax
// choice among the engine's top candidates ~6.
const SLIP_COST = 367;
const BASE_COST = 6;

export function slipChance(elo) {
  return clamp((expectedAcpl(elo) - BASE_COST) / SLIP_COST, 0.01, 0.55);
}

export function temperature(elo) {
  return Math.max(10, 0.9 * expectedAcpl(elo));
}

/**
 * @param {object} p
 * @param {Array} p.legal   chess.js verbose legal moves
 * @param {Array} p.lines   engine candidates [{uci, cp}] with cp from the bot's view, best first
 * @param {number} p.elo    target playing strength
 * @param {Function} [p.rng]
 * @returns {{uci: string, kind: 'engine'|'slip'}}
 */
export function chooseBotMove({ legal, lines, elo, rng = Math.random }) {
  const toUci = (m) => m.from + m.to + (m.promotion || '');
  if (!lines.length) {
    const m = legal[Math.floor(rng() * legal.length)];
    return { uci: toUci(m), kind: 'slip' };
  }
  const best = lines[0];
  // Even weak bots take a mate in one most of the time; strong ones always do.
  const mateNow = lines.find((l) => l.mateIn === 1);
  if (mateNow && rng() < clamp(0.55 + elo / 2000, 0, 1)) return { uci: mateNow.uci, kind: 'engine' };

  if (legal.length > 1 && rng() < slipChance(elo)) {
    const pool = legal.filter((m) => toUci(m) !== best.uci);
    const weights = pool.map((m) => {
      let w = 1;
      if (m.captured) w += 2;
      if (m.san.includes('+')) w += 1;
      if (m.piece === 'k' && !m.san.startsWith('O-O')) w *= 0.3;
      return w;
    });
    const pick = weightedPick(pool, weights, rng);
    if (pick) return { uci: toUci(pick), kind: 'slip' };
  }

  const t = temperature(elo);
  const weights = lines.map((l) => Math.exp(-(best.cp - l.cp) / t));
  const pick = weightedPick(lines, weights, rng);
  return { uci: pick.uci, kind: 'engine' };
}

function weightedPick(items, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!items.length || total <= 0) return items[0];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
