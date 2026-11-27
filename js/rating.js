// Rating model.
//
// Every move you make is scored by Stockfish as a "centipawn loss" (how much worse your
// move was than the engine's best move, in hundredths of a pawn). Stronger players lose
// fewer centipawns on average. We use the widely quoted rule of thumb
//
//     rating ≈ 3100 · e^(−ACPL / 100)
//
// (ACPL = average centipawn loss). Your ACPL is estimated with a little statistical care:
//  - it starts from a prior (your overall rating, or 600 for a new player) worth 15 moves,
//    so three easy opening moves can't send the number to the moon;
//  - the likely range comes from the actual spread of your move losses, so it is wide
//    after a few moves and narrows as you play more.
// One game is noisy; many games are much more reliable.

export const MIN_ELO = 100;
export const MAX_ELO = 2800;
export const EVAL_CLAMP = 1000; // evals beyond ±10 pawns are treated as "decided"
export const LOSS_CAP = 1000; // a single move can't count for more than this
// The prior counts as this many moves played at your previous level.
const PRIOR_MOVES = 15;
// Move losses are heavy-tailed: their standard deviation is roughly 1.6× their mean.
const SPREAD = 1.6;
const Z80 = 1.2816; // central 80% interval

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function expectedAcpl(elo) {
  return 100 * Math.log(3100 / clamp(elo, MIN_ELO, MAX_ELO));
}

export function eloFromAcpl(acpl) {
  return clamp(3100 * Math.exp(-acpl / 100), MIN_ELO, MAX_ELO);
}

/** UCI score object ({cp} or {mate}) -> clamped centipawns from the mover's view. */
export function scoreToCp(score) {
  if (!score) return 0;
  if (score.mate != null) {
    if (score.mate === 0) return -EVAL_CLAMP; // side to move is checkmated
    return score.mate > 0 ? EVAL_CLAMP : -EVAL_CLAMP;
  }
  return clamp(score.cp, -EVAL_CLAMP, EVAL_CLAMP);
}

export function negateScore(score) {
  if (!score) return score;
  return score.mate != null ? { mate: -score.mate } : { cp: -score.cp };
}

/** Lichess' win-probability curve (0-100) for a centipawn eval. */
export function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function winFromScore(score) {
  if (!score) return 50;
  if (score.mate != null) {
    if (score.mate === 0) return 0;
    return score.mate > 0 ? 100 : 0;
  }
  return winPercent(score.cp);
}

/** Lichess-style accuracy (0-100) for a single move from the win% before/after. */
export function moveAccuracy(winBefore, winAfter) {
  const drop = Math.max(0, winBefore - winAfter);
  return clamp(103.1668 * Math.exp(-0.04354 * drop) - 3.1669 + 1, 0, 100);
}

export const CLASSES = {
  great: { label: 'Great find', symbol: '!!', tone: 'great' },
  best: { label: 'Best move', symbol: '★', tone: 'best' },
  excellent: { label: 'Excellent', symbol: '✓', tone: 'excellent' },
  good: { label: 'Good', symbol: '✓', tone: 'good' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', tone: 'inaccuracy' },
  mistake: { label: 'Mistake', symbol: '?', tone: 'mistake' },
  blunder: { label: 'Blunder', symbol: '??', tone: 'blunder' },
  forced: { label: 'Only legal move', symbol: '□', tone: 'forced' },
};

/** Move classification from the drop in winning chances (percentage points). */
export function classify({ winDrop, isBest, onlyMove, forced }) {
  if (forced) return 'forced';
  if (isBest && onlyMove) return 'great';
  if (isBest) return 'best';
  if (winDrop < 2) return 'excellent';
  if (winDrop < 5) return 'good';
  if (winDrop < 10) return 'inaccuracy';
  if (winDrop < 20) return 'mistake';
  return 'blunder';
}

/** Rough "this move looked like a ~X player's move" for a single move. Very noisy by nature. */
export function moveLevel(cpLoss) {
  return Math.round(clamp(eloFromAcpl(cpLoss / Math.LN2), MIN_ELO, 2200) / 50) * 50;
}

/** Adds one move's loss to running stats {n, S, Q}. */
export function addLoss(stats, loss) {
  const L = Math.min(loss, LOSS_CAP);
  stats.n += 1;
  stats.S += L;
  stats.Q += L * L;
  return stats;
}

export const emptyStats = () => ({ n: 0, S: 0, Q: 0 });

/**
 * Rating estimate from move-loss stats {n, S (sum), Q (sum of squares)} and a prior rating.
 * Returns {mean, lo, hi, acpl, n}; lo/hi bound the central 80% range.
 */
export function estimate({ n, S, Q }, priorElo, priorMoves = PRIOR_MOVES) {
  const mu0 = expectedAcpl(priorElo);
  const sd0 = SPREAD * mu0;
  const k = priorMoves;
  const N = k + n;
  const acpl = (k * mu0 + S) / N;
  const dataMean = n ? S / n : mu0;
  const ssData = n ? Math.max(0, Q - (S * S) / n) : 0;
  const ss = k * sd0 * sd0 + ssData + ((n * k) / N) * (dataMean - mu0) ** 2;
  const sd = Math.sqrt(ss / Math.max(1, N - 1));
  const se = sd / Math.sqrt(N);
  const round10 = (x) => Math.round(x / 10) * 10;
  return {
    mean: round10(eloFromAcpl(acpl)),
    lo: round10(eloFromAcpl(acpl + Z80 * se)),
    hi: round10(eloFromAcpl(Math.max(1, acpl - Z80 * se))),
    acpl,
    n,
  };
}

export const NEW_PLAYER_ELO = 600;

/**
 * Overall rating from past games. Recent games count more (each older game weighs 0.85×
 * the one after it), so the number follows you as you improve.
 */
export function overallFromGames(games) {
  const recent = games.filter((g) => g.n > 0).slice(-20);
  const st = emptyStats();
  let w = 1;
  for (let i = recent.length - 1; i >= 0; i--) {
    const g = recent[i];
    const Q = g.Q ?? ((g.S * g.S) / g.n) * (1 + SPREAD * SPREAD);
    st.n += w * g.n;
    st.S += w * g.S;
    st.Q += w * Q;
    w *= 0.85;
  }
  return { ...estimate(st, NEW_PLAYER_ELO), games: recent.length };
}

export const TIERS = [
  { id: 1, max: 700, name: 'Learning the basics', blurb: 'Detailed tips, threat warnings, takebacks on mistakes.' },
  { id: 2, max: 1000, name: 'Beginner', blurb: 'Threat warnings and takebacks on mistakes.' },
  { id: 3, max: 1300, name: 'Developing', blurb: 'Warnings only for big dangers, takebacks on blunders.' },
  { id: 4, max: 1700, name: 'Club player', blurb: 'No warnings — feedback after each move, hints on request.' },
  { id: 5, max: Infinity, name: 'Advanced', blurb: 'Short feedback, you are on your own.' },
];

/** Coaching tier for a rating, with a little hysteresis so it doesn't flicker. */
export function tierFor(elo, prevId) {
  const raw = TIERS.find((t) => elo < t.max).id;
  if (!prevId || raw === prevId) return raw;
  const margin = 40;
  if (raw > prevId && elo < TIERS[prevId - 1].max + margin) return prevId;
  if (raw < prevId && elo >= TIERS[prevId - 2].max - margin) return prevId;
  return raw;
}

export function tierInfo(id) {
  return TIERS[id - 1];
}

/** Plain-English description of an eval from one side's view. */
export function describeEval(cp) {
  const a = Math.abs(cp);
  const side = cp > 0 ? 'you' : 'your opponent';
  if (a < 50) return 'The position is about equal.';
  if (a < 150) return `${cap(side)} ${cp > 0 ? 'are' : 'is'} slightly better.`;
  if (a < 350) return `${cap(side)} ${cp > 0 ? 'are' : 'is'} clearly better (about ${(a / 100).toFixed(1)} pawns).`;
  if (a < 900) return `${cap(side)} ${cp > 0 ? 'are' : 'is'} winning (about ${(a / 100).toFixed(1)} pawns ahead).`;
  return `${cap(side)} ${cp > 0 ? 'are' : 'is'} completely winning.`;
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

export function formatEval(score) {
  if (!score) return '0.0';
  if (score.mate != null) return score.mate === 0 ? '#' : `${score.mate > 0 ? '' : '-'}M${Math.abs(score.mate)}`;
  const v = score.cp / 100;
  if (Math.abs(v) < 0.05) return '0.0';
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}
