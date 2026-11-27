// Checks every lesson exercise with Stockfish: legal positions, legal lines, and that the
// intended moves are (close to) the engine's best. Run: npm run verify-lessons
import { Chess } from '../vendor/chess.js';
import { LESSONS } from '../js/lessons.js';
import { exerciseFen } from '../js/exercise.js';
import { scoreToCp, negateScore } from '../js/rating.js';
import { uciToMove } from '../js/tactics.js';
import { createEngine } from './node-engine.mjs';

const engine = await createEngine();
let failures = 0;
const fail = (id, msg) => {
  failures++;
  console.log(`  ✗ ${id}: ${msg}`);
};
const ok = (id, msg) => console.log(`  ✓ ${id}: ${msg}`);

const cpOf = (s) => (s.mate != null ? (s.mate > 0 ? 10000 - s.mate : -10000 - s.mate) : s.cp);

/** Loss (cp) of playing `uci` in `fen` vs the engine's best, from the mover's view. */
async function lossOf(fen, uci) {
  const a = await engine.analyze(fen, { depth: 16, multipv: 4 });
  const best = a.lines[0];
  const c = new Chess(fen);
  c.move(uciToMove(uci));
  if (c.isCheckmate()) return { loss: 0, best, mate: true };
  if (c.isGameOver()) return { loss: Math.max(0, cpOf(best.score)), best };
  const after = await engine.analyze(c.fen(), { depth: 15, multipv: 1 });
  const mine = negateScore(after.lines[0].score);
  const loss = Math.max(0, cpOf(best.score) - cpOf(mine));
  return { loss, best, mine };
}

for (const lesson of LESSONS) {
  console.log(`${lesson.id}`);
  for (const ex of lesson.exercises) {
    let fen;
    try {
      fen = exerciseFen(ex);
      new Chess(fen);
    } catch (e) {
      fail(ex.id, `bad position: ${e.message}`);
      continue;
    }
    if ((ex.kind || 'find') === 'goal') {
      const a = await engine.analyze(fen, { depth: 18, multipv: 1 });
      const s = a.lines[0].score;
      const cp = scoreToCp(s);
      if (ex.goal === 'hold' ? Math.abs(cp) <= 120 : cp >= 400) ok(ex.id, `${ex.goal}: eval ${JSON.stringify(s)}`);
      else fail(ex.id, `${ex.goal}: eval ${JSON.stringify(s)} doesn't fit the goal`);
      continue;
    }
    // find: walk the line, checking each of the player's moves.
    const c = new Chess(fen);
    for (let i = 0; i < ex.line.length; i++) {
      const uci = ex.line[i];
      const before = c.fen();
      let m;
      try {
        m = c.move(uciToMove(uci));
      } catch {
        fail(ex.id, `illegal move ${uci} at ply ${i}`);
        break;
      }
      if (i % 2 === 1) continue; // scripted reply: only needs to be legal
      const r = await lossOf(before, uci);
      const tol = ex.accept ? 50 : Math.max(ex.tolerance ?? 60, 30);
      if (r.loss <= tol) ok(ex.id, `${m.san} (loss ${r.loss}, engine best ${r.best.uci} ${JSON.stringify(r.best.score)})`);
      else fail(ex.id, `${m.san} loses ${r.loss} vs engine best ${r.best.uci} ${JSON.stringify(r.best.score)}`);
      if (i === 0 && ex.accept) {
        for (const alt of ex.accept.filter((u) => u !== uci)) {
          const ra = await lossOf(before, alt);
          if (ra.loss > 60) fail(ex.id, `accepted alternative ${alt} loses ${ra.loss}`);
        }
      }
    }
    if (ex.tolerance === 0 && ex.line.length && !c.isCheckmate()) fail(ex.id, 'mate exercise line does not end in checkmate');
  }
}
console.log(failures ? `\n${failures} problem(s)` : '\nAll exercises verified.');
process.exitCode = failures ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
