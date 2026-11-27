// Unit tests for the coaching/rating logic. Run with: npm test  (or: node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../vendor/chess.js';
import * as T from '../js/tactics.js';
import * as R from '../js/rating.js';
import { chooseBotMove, slipChance } from '../js/bot.js';
import { explainPlayerMove, preMoveTips, hintFor, moveIdea, gameSummary } from '../js/coach.js';
import { detectOpening } from '../js/openings.js';

// Builds a fake engine analysis: lines = [[uci pv..., score], ...]
const analysis = (...lines) => ({
  lines: lines.map(([pv, score], i) => ({ multipv: i + 1, uci: pv.split(' ')[0], pv: pv.split(' '), score })),
});

test('captureGain: undefended piece is free, defended piece attacked by pawn still loses', () => {
  // White knight on e5 attacked by black pawn d6, defended by d4 pawn.
  const c = new Chess('4k3/8/3p4/4N3/3P4/8/8/4K3 b - - 0 1');
  assert.equal(T.captureGain(c, 'e5', 'b'), 2); // pawn takes knight (3), pawn recaptures (1) => +2
  // Undefended rook
  const c2 = new Chess('4k3/8/8/3r4/8/8/3Q4/4K3 w - - 0 1');
  assert.equal(T.captureGain(c2, 'd5', 'w'), 5);
  // Defended pawn attacked by queen: not worth it
  const c3 = new Chess('4k3/4p3/3p4/8/8/8/3Q4/4K3 w - - 0 1');
  assert.equal(T.captureGain(c3, 'd6', 'w'), 0);
});

test('hangingPieces finds loose pieces most valuable first', () => {
  const c = new Chess('4k3/8/8/3q4/8/2N5/8/3RK3 b - - 0 1'); // black queen on d5 attacked by rook & knight
  const hp = T.hangingPieces(c, 'b');
  assert.equal(hp[0].square, 'd5');
  assert.equal(hp[0].type, 'q');
});

test('mateThreats detects back-rank threat', () => {
  // Black to move; White threatens Re8#.
  const c = new Chess('6k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1');
  const mt = T.mateThreats(c);
  assert.ok(mt.some((m) => m.san === 'Re8#'));
});

test('forkTargets sees a knight fork of king and rook', () => {
  const c = new Chess('r3k3/8/8/8/8/8/8/4K3 w - - 0 1');
  c.put({ type: 'n', color: 'w' }, 'c7');
  const targets = T.forkTargets(c, 'c7');
  assert.deepEqual(targets.map((t) => t.type).sort(), ['k', 'r']);
});

test('rating formula and estimate behave sensibly', () => {
  assert.ok(Math.abs(R.eloFromAcpl(R.expectedAcpl(1200)) - 1200) < 1);
  const stats = (n, losses) => {
    const st = R.emptyStats();
    for (let i = 0; i < n; i++) R.addLoss(st, losses[i % losses.length]);
    return st;
  };
  const strong = R.estimate(stats(100, [0, 10, 20, 0, 120]), 800); // ACPL 30
  const weak = R.estimate(stats(100, [0, 50, 300, 20, 530]), 800); // ACPL 180
  assert.ok(strong.mean > 1700, `strong ${strong.mean}`);
  assert.ok(weak.mean < 600, `weak ${weak.mean}`);
  assert.ok(strong.lo < strong.mean && strong.mean < strong.hi);
  // More moves => narrower range
  const few = R.estimate(stats(10, [0, 100, 200]), 800);
  const many = R.estimate(stats(200, [0, 100, 200]), 800);
  assert.ok(many.hi - many.lo < few.hi - few.lo);
  // A few perfect opening moves shouldn't send a 600 player past ~900
  const early = R.estimate(stats(3, [0]), 600);
  assert.ok(early.mean < 900, `early ${early.mean}`);
  // A single huge blunder hurts but doesn't collapse a long good game
  const game = stats(30, [0, 20, 40, 10]);
  const before = R.estimate(game, 1000).mean;
  R.addLoss(game, 1500);
  const after = R.estimate(game, 1000).mean;
  assert.ok(after < before && before - after < 400, `${before} -> ${after}`);
});

test('overall rating weights recent games more', () => {
  const games = [
    { n: 30, S: 30 * 200, Q: 30 * 200 * 200 * 3 },
    { n: 30, S: 30 * 200, Q: 30 * 200 * 200 * 3 },
    { n: 30, S: 30 * 80 },
    { n: 30, S: 30 * 80 },
  ];
  const improving = R.overallFromGames(games);
  const declining = R.overallFromGames([...games].reverse());
  assert.ok(improving.mean > declining.mean);
});

test('classification thresholds', () => {
  assert.equal(R.classify({ winDrop: 0, isBest: true }), 'best');
  assert.equal(R.classify({ winDrop: 1 }), 'excellent');
  assert.equal(R.classify({ winDrop: 7 }), 'inaccuracy');
  assert.equal(R.classify({ winDrop: 15 }), 'mistake');
  assert.equal(R.classify({ winDrop: 35 }), 'blunder');
  assert.equal(R.classify({ winDrop: 0, isBest: true, onlyMove: true }), 'great');
});

test('tier hysteresis', () => {
  assert.equal(R.tierFor(500), 1);
  assert.equal(R.tierFor(710, 1), 1); // within margin, stay
  assert.equal(R.tierFor(760, 1), 2);
  assert.equal(R.tierFor(980, 3), 3);
});

test('bot: low ratings slip more, high ratings pick the best move', () => {
  assert.ok(slipChance(400) > slipChance(1500));
  const c = new Chess();
  const legal = c.moves({ verbose: true });
  const lines = [
    { uci: 'e2e4', cp: 40 },
    { uci: 'd2d4', cp: 35 },
    { uci: 'g1f3', cp: 30 },
    { uci: 'a2a4', cp: -60 },
  ];
  let bestCount = 0;
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) if (chooseBotMove({ legal, lines, elo: 2400, rng }).uci === 'e2e4') bestCount++;
  assert.ok(bestCount > 120, `strong bot picked best ${bestCount}/400`);
  let slips = 0;
  for (let i = 0; i < 400; i++) if (chooseBotMove({ legal, lines, elo: 300, rng }).kind === 'slip') slips++;
  assert.ok(slips > 150, `weak bot slipped ${slips}/400`);
});

test('coach explains a hung piece', () => {
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 ... simpler: white plays Bc4-?? Let's hang a bishop: Bb5 in a position where a6 pawn takes? Use a direct one.
  const c = new Chess('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  const move = c.move('Ba6'); // bishop to a6, can be taken by the b7 pawn or knight
  const a0 = analysis(['g1f3 b8c6', { cp: 40 }]);
  const a1 = analysis(['b7a6 g1f3', { cp: 300 }]);
  const ex = explainPlayerMove({ move, a0, a1, cls: 'blunder', evalAfterCp: -300, tier: 1, history: [] });
  assert.match(ex.headline, /bishop on a6 isn’t safe/);
  assert.ok(ex.tags.includes('hung-moved-piece'));
  assert.ok(ex.lesson);
  assert.equal(ex.arrows[0].brush, 'red');
});

test('coach explains an allowed mate', () => {
  // Fool's mate setup: 1.f3 e5 2.g4?? Qh4#
  const c = new Chess();
  c.move('f3');
  c.move('e5');
  const move = c.move('g4');
  const a0 = analysis(['e2e4 d8h4', { cp: -50 }]);
  const a1 = analysis(['d8h4', { mate: 1 }]);
  const ex = explainPlayerMove({ move, a0, a1, cls: 'blunder', evalAfterCp: -1000, tier: 1, history: [] });
  assert.match(ex.headline, /checkmate in one/);
  assert.match(ex.text, /Qh4#/);
});

test('coach explains a missed free piece', () => {
  // Rook on a5 is attacked by the queen on d2 and undefended; White plays a quiet king move instead.
  const c = new Chess('4k3/8/8/r7/8/8/3Q4/4K3 w - - 0 1');
  const move = c.move('Kf2');
  const a0 = analysis(['d2a5 e8f7', { cp: 900 }]);
  const a1 = analysis(['a5a2 f2f3', { cp: 0 }]);
  const ex = explainPlayerMove({ move, a0, a1, cls: 'blunder', evalAfterCp: 0, tier: 2, history: [] });
  assert.equal(ex.headline, 'You missed a free rook!');
  assert.ok(ex.tags.includes('missed-capture'));
});

test('coach explains ignoring an attacked piece', () => {
  // Black rook on d5 attacks the white queen on d2 (defended only by the king): White ignores it.
  const c = new Chess('4k3/8/8/3r4/8/8/3Q4/4K3 w - - 0 1');
  const move = c.move('Kf2');
  const a0 = analysis(['d2d5 e8f7', { cp: 900 }]);
  const a1 = analysis(['d5d2 f2e3', { cp: 400 }]);
  const ex = explainPlayerMove({ move, a0, a1, cls: 'blunder', evalAfterCp: -400, tier: 2, history: [] });
  assert.equal(ex.headline, 'Your queen on d2 was under attack.');
  assert.ok(ex.tags.includes('ignored-threat'));
});

test('coach praises good moves with a reason', () => {
  const c = new Chess('4k3/8/8/3r4/8/8/3Q4/4K3 w - - 0 1');
  const move = c.move('Qxd5');
  const a0 = analysis(['d2d5', { cp: 900 }]);
  const ex = explainPlayerMove({ move, a0, a1: analysis(['e8f8', { cp: -900 }]), cls: 'best', evalAfterCp: 900, tier: 1 });
  assert.equal(ex.headline, 'Best move!');
  assert.match(ex.text, /wins a free rook/);
});

test('pre-move tips warn about hanging pieces and mate threats for beginners only', () => {
  const c = new Chess('6k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1');
  const tips = preMoveTips({ chess: c, a0: analysis(['h7h6', { cp: -100 }]), tier: 1 });
  assert.ok(tips.some((t) => t.kind === 'danger' && /checkmate/.test(t.text)));
  const none = preMoveTips({ chess: c, a0: analysis(['h7h6', { cp: -100 }]), tier: 4 });
  assert.equal(none.length, 0);
  const forced = preMoveTips({ chess: c, a0: analysis(['h7h6', { cp: -100 }]), tier: 4, warnings: 'always' });
  assert.ok(forced.length > 0);
});

test('hints escalate', () => {
  const c = new Chess('4k3/8/8/3r4/8/8/3Q4/4K3 w - - 0 1');
  const a0 = analysis(['d2d5', { cp: 900 }]);
  assert.match(hintFor(1, { chess: c, a0 }).text, /win material/);
  assert.deepEqual(hintFor(2, { chess: c, a0 }).squares, ['d2']);
  assert.match(hintFor(3, { chess: c, a0 }).text, /Qxd5/);
});

test('moveIdea recognises castling and development', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  assert.equal(moveIdea(fen, 'e1g1').tag, 'castle');
  assert.equal(moveIdea('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'g8f6').tag, 'develop');
});

test('openings are detected by longest prefix', () => {
  assert.equal(detectOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']).name, 'Giuoco Piano');
  assert.equal(detectOpening(['d4', 'Nf6', 'c4', 'g6']).name, "King's Indian Defense");
  assert.equal(detectOpening(['h4']), null);
});

test('game summary counts tags from mistakes', () => {
  const s = gameSummary([
    { cls: 'blunder', tags: ['hung-moved-piece'] },
    { cls: 'mistake', tags: ['hung-moved-piece'] },
    { cls: 'best', tags: [] },
    { cls: 'inaccuracy', tags: ['positional'] },
  ]);
  assert.equal(s.top[0].tag, 'hung-moved-piece');
  assert.equal(s.top[0].count, 2);
  assert.equal(s.counts.best, 1);
});

// ---------------------------------------------------------------- analysis, lessons, library
import { parseGame, buildRecords, keyMoments, sideSummary, evaluateMove } from '../js/analysis.js';
import { LESSONS as CURRICULUM, lessonsForTags } from '../js/lessons.js';
import { resolveRef, BOOKS, LINKS } from '../js/library.js';
import { exerciseFen } from '../js/exercise.js';
import { explainOpponentMove } from '../js/coach.js';

test('parseGame reads chess.com style PGN with clock comments and plain move lists', () => {
  const pgn = `[Event "Live Chess"]
[White "me"]
[Black "you"]
[Result "1-0"]

1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:09:57]} 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7# 1-0`;
  const g = parseGame(pgn);
  assert.equal(g.moves.length, 7);
  assert.equal(g.headers.White, 'me');
  assert.equal(parseGame('1. d4 d5 2. c4').moves.length, 3);
  assert.throws(() => parseGame('1. e4 Qxz9'), /Couldn/);
});

test('buildRecords grades both sides and keyMoments finds the blunder', () => {
  const { moves } = parseGame('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#');
  const fake = (best, score) => ({ lines: [{ uci: best, pv: [best], score }] });
  const analyses = [
    fake('e2e4', { cp: 30 }),
    fake('e7e5', { cp: -30 }),
    fake('g1f3', { cp: 30 }),
    fake('g8f6', { cp: -20 }),
    fake('d1h5', { cp: 0 }),
    fake('g7g6', { cp: -10 }), // Black should play g6; Nf6 allows mate
    fake('h5f7', { mate: 1 }),
    { lines: [] },
  ];
  const recs = buildRecords(moves, analyses, 1);
  assert.equal(recs.length, 7);
  assert.equal(recs[5].cls, 'blunder');
  assert.match(recs[5].headline, /checkmate in one/);
  const km = keyMoments(recs, 'b');
  assert.equal(km[0].ply, 5);
  assert.equal(km[0].kind, 'your-mistake');
  const s = sideSummary(recs, 'w');
  assert.ok(s.acc > 80);
});

test('every lesson exercise has a legal start position and the library refs resolve', () => {
  for (const l of CURRICULUM) {
    assert.ok(l.exercises.length > 0, l.id);
    for (const ex of l.exercises) {
      const fen = exerciseFen(ex);
      assert.doesNotThrow(() => new Chess(fen), ex.id);
      if ((ex.kind || 'find') === 'find') assert.ok(ex.line.length > 0, ex.id);
    }
    for (const ref of l.further || []) assert.ok(resolveRef(ref), `${l.id} -> ${ref}`);
  }
  for (const link of LINKS) assert.match(link.url, /^https:\/\//);
  assert.ok(BOOKS.length >= 15);
});

test('lessons are recommended from the mistakes you make', () => {
  const recs = lessonsForTags({ 'allowed-fork': 3, 'opening-principles': 1 });
  assert.equal(recs[0].id, 'forks');
  assert.ok(recs.some((l) => l.id === 'opening'));
});

test('opponent moves are explained', () => {
  const c = new Chess();
  c.move('e4');
  c.move('e5');
  c.move('Nf3');
  c.move('Nc6');
  c.move('Bc4');
  const m = c.move('Nf6');
  const ex = explainOpponentMove(m);
  assert.equal(ex.text, 'Nf6 attacks your pawn on e4.');
  assert.equal(ex.threat, true);
});

test('evaluateMove marks the engine move as best', () => {
  const c = new Chess();
  const m = c.move('e4');
  const ev = evaluateMove(m, { lines: [{ uci: 'e2e4', pv: ['e2e4'], score: { cp: 30 } }] }, { lines: [{ uci: 'e7e5', pv: [], score: { cp: -30 } }] });
  assert.equal(ev.cls, 'best');
  assert.equal(ev.loss, 0);
});

import { toThirdPerson } from '../js/analysis.js';
test('opponent move explanations are rewritten in the third person for review', () => {
  assert.equal(toThirdPerson('Your knight on d5 isn’t safe there. Nothing protects it, so your opponent can simply take it with exd5.'),
    'Their knight on d5 isn’t safe there. Nothing protects it, so you can simply take it with exd5.');
  assert.equal(toThirdPerson('Your opponent is slightly better.'), 'You are slightly better.');
  assert.equal(toThirdPerson('You missed a free rook!'), 'They missed a free rook!');
});
