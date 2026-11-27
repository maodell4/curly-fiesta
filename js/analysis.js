// Grading and explaining moves, for live play and for full-game review.
import { Chess } from '../vendor/chess.js';
import * as R from './rating.js';
import { moveToUci, sanOf, uciToMove } from './tactics.js';
import { explainPlayerMove, moveIdea } from './coach.js';

/**
 * Grades one move from the engine analyses of the position before (a0) and after (a1).
 * `prevMove` is the move before it (to spot obvious recaptures).
 */
export function evaluateMove(move, a0, a1, prevMove) {
  const legalCount = new Chess(move.before).moves().length;
  const uci = moveToUci(move);
  const best = a0?.lines?.[0];
  const post = new Chess(move.after);
  if (!best)
    return { loss: 0, winDrop: 0, cls: 'forced', acc: 100, excluded: true, forced: true, afterCp: 0, level: null, afterScore: { cp: 0 } };
  const line = a0.lines.find((l) => l.uci === uci);
  let afterScore;
  if (post.isCheckmate()) afterScore = { mate: 1 };
  else if (post.isGameOver()) afterScore = { cp: 0 };
  else if (line) afterScore = line.score;
  else afterScore = R.negateScore(a1?.lines?.[0]?.score ?? { cp: 0 });

  const isBest = uci === best.uci;
  const bestCp = R.scoreToCp(best.score);
  const afterCp = isBest ? bestCp : R.scoreToCp(afterScore);
  const loss = isBest ? 0 : Math.max(0, bestCp - afterCp);
  const winBefore = R.winFromScore(best.score);
  const winAfter = isBest ? winBefore : R.winFromScore(afterScore);
  const winDrop = Math.max(0, winBefore - winAfter);
  const forced = legalCount === 1;
  const decided = Math.abs(bestCp) >= 900 && Math.abs(afterCp) >= 900 && Math.sign(bestCp) === Math.sign(afterCp);
  const obviousRecapture = !!(prevMove && prevMove.captured && move.captured && prevMove.to === move.to);
  const second = a0.lines[1];
  const onlyMove = isBest && !!second && winBefore - R.winFromScore(second.score) >= 20 && !obviousRecapture;
  const cls = R.classify({ winDrop, isBest: isBest || (!!line && loss === 0), onlyMove, forced });
  return {
    loss,
    winDrop,
    cls,
    acc: R.moveAccuracy(winBefore, winAfter),
    excluded: forced || decided,
    forced,
    afterCp,
    afterScore: isBest ? best.score : afterScore,
    level: R.moveLevel(loss),
  };
}

/** Eval after a move, from White's point of view, clamped to ±10 pawns (for graphs). */
export function whiteEvalAfter(move, ev) {
  const post = new Chess(move.after);
  if (post.isCheckmate()) return move.color === 'w' ? R.EVAL_CLAMP : -R.EVAL_CLAMP;
  const moverCp = R.scoreToCp(ev.afterScore);
  return move.color === 'w' ? moverCp : -moverCp;
}

/** Analyses every position of a game with the engine (cached positions are free). */
export async function analysePositions(moves, engine, { onProgress, isCancelled, depth, multipv } = {}) {
  const fens = [moves[0].before, ...moves.map((m) => m.after)];
  const out = [];
  for (let i = 0; i < fens.length; i++) {
    if (isCancelled?.()) return null;
    const c = new Chess(fens[i]);
    out.push(c.isGameOver() ? { fen: fens[i], lines: [] } : await engine.analyze(fens[i], { depth, multipv }));
    onProgress?.((i + 1) / fens.length);
  }
  return out;
}

/** Rewrites coach text written to the mover ("your knight…") for the other side's moves. */
export function toThirdPerson(text) {
  if (!text) return text;
  return text
    .replace(/Your opponent is\b/g, '\u0005')
    .replace(/Your opponent’s/g, '\u0003')
    .replace(/your opponent’s/g, '\u0004')
    .replace(/Your opponent/g, '\u0002')
    .replace(/your opponent/g, '\u0001')
    .replace(/\bYou are\b/g, 'They are')
    .replace(/\bYour\b/g, 'Their')
    .replace(/\byour\b/g, 'their')
    .replace(/\bYou’d\b/g, 'They’d')
    .replace(/\byou’d\b/g, 'they’d')
    .replace(/\bYou\b/g, 'They')
    .replace(/\byou\b/g, 'they')
    .replace(/\u0005/g, 'You are')
    .replace(/\u0003/g, 'Your')
    .replace(/\u0004/g, 'your')
    .replace(/\u0002/g, 'You')
    .replace(/\u0001/g, 'you');
}

/** Builds review records (grade + explanation for every move, both sides). */
export function buildRecords(moves, analyses, tier = 3, userColor = null) {
  return moves.map((m, i) => {
    const a0 = analyses[i];
    const a1 = analyses[i + 1];
    const ev = evaluateMove(m, a0, a1, moves[i - 1]);
    const ex = explainPlayerMove({ move: m, a0, a1, cls: ev.cls, evalAfterCp: ev.afterCp, tier, history: moves.slice(0, i) });
    const best = a0?.lines?.[0];
    const theirs = userColor && m.color !== userColor;
    const tp = (t) => (theirs ? toThirdPerson(t) : t);
    return {
      san: m.san,
      uci: moveToUci(m),
      color: m.color,
      cls: ev.cls,
      loss: Math.round(ev.loss),
      winDrop: Math.round(ev.winDrop * 10) / 10,
      acc: Math.round(ev.acc),
      excluded: ev.excluded,
      eval: Math.round(whiteEvalAfter(m, ev)),
      best: best ? best.uci : null,
      bestSan: best ? sanOf(m.before, best.uci) : null,
      bestLine: best ? best.pv.slice(0, 8) : [],
      headline: tp(ex.headline),
      text: tp(ex.text || ''),
      better: tp(ex.better || ''),
      lesson: ex.lesson || '',
      tags: ex.tags,
      arrows: ex.arrows,
    };
  });
}

/** One-line description of what a move does ("develops your knight toward the centre"). */
export function moveDescription(fenBefore, uci) {
  return moveIdea(fenBefore, uci)?.text || null;
}

/** Summary numbers for one side of a reviewed game. */
export function sideSummary(records, color, priorElo = R.NEW_PLAYER_ELO) {
  const mine = records.filter((r) => r.color === color);
  const stats = R.emptyStats();
  for (const r of mine) if (!r.excluded) R.addLoss(stats, r.loss);
  const counts = {};
  for (const r of mine) counts[r.cls] = (counts[r.cls] || 0) + 1;
  const accs = mine.filter((r) => r.cls !== 'forced').map((r) => r.acc);
  return {
    stats,
    est: R.estimate(stats, priorElo),
    acc: accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null,
    counts,
  };
}

/** The biggest swings of the game: your worst moves and the moments the advantage changed hands. */
export function keyMoments(records, color, max = 5) {
  const items = [];
  records.forEach((r, i) => {
    if (r.color === color && ['mistake', 'blunder'].includes(r.cls)) items.push({ ply: i, kind: 'your-mistake', weight: r.winDrop + 10 });
    else if (r.color !== color && ['mistake', 'blunder'].includes(r.cls)) items.push({ ply: i, kind: 'their-mistake', weight: r.winDrop });
    else if (r.cls === 'great') items.push({ ply: i, kind: 'great', weight: 15 });
  });
  return items.sort((a, b) => b.weight - a.weight).slice(0, max).sort((a, b) => a.ply - b.ply);
}

/**
 * Parses a PGN (from chess.com, Lichess, …) or a plain list of moves.
 * Returns {moves, headers} or throws an Error with a readable message.
 */
export function parseGame(text) {
  const src = String(text || '').trim();
  if (!src) throw new Error('Paste a game first.');
  const c = new Chess();
  try {
    c.loadPgn(src);
  } catch {
    // Fall back to reading bare SAN tokens.
    const body = src
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\$\d+/g, ' ')
      .replace(/\d+\.(\.\.)?/g, ' ')
      .replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, ' ');
    c.reset();
    for (const tok of body.split(/\s+/).filter(Boolean)) {
      try {
        c.move(tok.replace(/[?!]+$/, ''));
      } catch {
        throw new Error(`Couldn't read the move “${tok}”. Paste the PGN exactly as exported from chess.com or Lichess.`);
      }
    }
  }
  const moves = c.history({ verbose: true });
  if (!moves.length) throw new Error('No moves found in that game.');
  const headers = c.getHeaders ? c.getHeaders() : {};
  if (moves[0].before.split(' ')[0] !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
    throw new Error('Only games from the normal starting position are supported.');
  return { moves, headers };
}

/** Replays SAN moves from the start and returns chess.js verbose moves. */
export function replay(sans) {
  const c = new Chess();
  return sans.map((s) => c.move(s));
}

export { uciToMove };
