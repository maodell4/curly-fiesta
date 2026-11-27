// Learn: curriculum, interactive exercises, your own mistakes as puzzles, and a library.
import { Chess } from '../vendor/chess.js';
import * as R from './rating.js';
import * as Store from './storage.js';
import { LEVELS, LESSONS, lessonById, lessonsForTags } from './lessons.js';
import { BOOKS, LINKS, VIDEOS, CHECKLIST, resolveRef } from './library.js';
import { exerciseFen, playerSteps } from './exercise.js';
import { makeBoard, showPosition, refresh, esc } from './board.js';
import { evaluateMove, replay } from './analysis.js';
import { explainPlayerMove } from './coach.js';
import { uciToMove, moveToUci } from './tactics.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cpOf = (s) => (s?.mate != null ? (s.mate > 0 ? 10000 - s.mate : -10000 - s.mate) : s?.cp ?? 0);

let engine;
let hooks;
let cg = null;
const X = { lesson: null, list: [], idx: 0, ex: null, chess: null, step: 0, onScript: true, done: false, busy: false, hint: 0, moves: 0, token: 0 };

export function initLearn(opts) {
  engine = opts.engine;
  hooks = opts;
  cg = makeBoard($('ex-board'), { movable: { events: { after: onExerciseMove } } });
  $('lesson-back').addEventListener('click', () => showHome());
  $('ex-hint').addEventListener('click', onHint);
  $('ex-retry').addEventListener('click', () => loadExercise(X.idx));
  $('ex-next').addEventListener('click', nextExercise);
  $('ex-flip').addEventListener('click', () => cg.toggleOrientation());
}

export function onHide() {
  cg?.setAutoShapes([]);
}

export function onShow() {
  if ($('learn-lesson').hidden) showHome();
  else refresh(cg);
}

// ---------------------------------------------------------------- home

export function showHome() {
  $('learn-lesson').hidden = true;
  $('learn-home').hidden = false;
  X.token++;
  const profile = Store.load();
  const done = Object.fromEntries(Object.entries(profile.lessons || {}).map(([k, v]) => [k, !!v.done]));
  const overall = hooks.getOverall();
  const levelId = overall < 1000 ? 'beginner' : overall < 1600 ? 'intermediate' : 'advanced';
  const level = LEVELS.find((l) => l.id === levelId);

  const tagCounts = {};
  for (const g of profile.games.slice(-15)) for (const [t, c] of Object.entries(g.tags || {})) tagCounts[t] = (tagCounts[t] || 0) + c;
  let recs = lessonsForTags(tagCounts, done).filter((l) => !done[l.id]).slice(0, 3);
  if (recs.length < 3) {
    const more = LESSONS.filter((l) => l.level === levelId && !done[l.id] && !recs.includes(l));
    recs = [...recs, ...more].slice(0, 3);
  }
  if (!recs.length) recs = LESSONS.filter((l) => !done[l.id]).slice(0, 3);
  const mistakes = mistakeExercises();
  const unsolved = mistakes.filter((m) => !profile.mistakesSolved[m.id]).length;
  const nDone = LESSONS.filter((l) => done[l.id]).length;

  const card = (l, why) => `
    <button type="button" class="lesson-card${done[l.id] ? ' done' : ''}" data-lesson="${esc(l.id)}">
      <span class="lesson-level">${esc(LEVELS.find((x) => x.id === l.level).name)}${done[l.id] ? ' · ✓ Done' : ` · ${l.exercises.length} exercise${l.exercises.length === 1 ? '' : 's'}`}</span>
      <b>${esc(l.title)}</b>
      <span class="muted">${esc(why || l.summary)}</span>
    </button>`;

  const recWhy = (l) => {
    const t = l.tags.find((x) => tagCounts[x]);
    return t ? `Recommended: this came up ${tagCounts[t]}× in your recent games.` : l.summary;
  };

  const bookList = (lv) =>
    BOOKS.filter((b) => b.level === lv)
      .map((b) => `<li><b>${esc(b.title)}</b> <span class="muted">— ${esc(b.author)}</span><br><span class="small">${esc(b.why)}</span></li>`)
      .join('');

  $('learn-home').innerHTML = `
    <div class="learn-head">
      <div>
        <h1 class="page-title">Learn</h1>
        <p class="muted">Your level: <b>${esc(level.name)}</b> (${esc(level.range)}) · ${nDone} of ${LESSONS.length} lessons done</p>
      </div>
    </div>
    <section class="learn-section">
      <h2>Recommended for you</h2>
      <div class="lesson-grid">${recs.map((l) => card(l, recWhy(l))).join('')}</div>
    </section>
    <section class="learn-section two-col">
      <div class="card">
        <h2>Practice your mistakes</h2>
        <p class="muted">${mistakes.length ? `${mistakes.length} position${mistakes.length === 1 ? '' : 's'} from your own games where a better move existed${unsolved < mistakes.length ? ` · ${mistakes.length - unsolved} solved` : ''}.` : 'Play or import a few games — your mistakes will turn into puzzles here.'}</p>
        <button id="learn-mistakes" type="button" class="btn primary" ${mistakes.length ? '' : 'disabled'}>Start practising</button>
      </div>
      <div class="card">
        <h2>Before every move</h2>
        <ol class="checklist">${CHECKLIST.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
        <p class="muted small">Based on coach Dan Heisman’s advice: no “hope chess”.</p>
      </div>
    </section>
    ${LEVELS.map(
      (lv) => `
      <section class="learn-section">
        <h2>${esc(lv.name)} <span class="muted small">${esc(lv.range)}</span></h2>
        <p class="muted small">${esc(lv.blurb)}</p>
        <div class="lesson-grid">${LESSONS.filter((l) => l.level === lv.id).map((l) => card(l)).join('')}</div>
      </section>`,
    ).join('')}
    <section class="learn-section">
      <h2>Library</h2>
      <p class="muted small">Books and free resources recommended by coaches, from first steps to advanced.</p>
      ${LEVELS.map(
        (lv) => `<details class="shelf"${lv.id === levelId ? ' open' : ''}><summary>${esc(lv.name)} books</summary><ul class="book-list">${bookList(lv.id)}</ul></details>`,
      ).join('')}
      <details class="shelf" open><summary>Free websites</summary><ul class="book-list">${LINKS.map(
        (l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a><br><span class="small">${esc(l.why)}</span></li>`,
      ).join('')}</ul></details>
      <details class="shelf"><summary>Videos</summary><ul class="book-list">${VIDEOS.map(
        (v) => `<li><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a><br><span class="small">${esc(v.why)}</span></li>`,
      ).join('')}</ul></details>
    </section>`;

  $('learn-home').querySelectorAll('[data-lesson]').forEach((b) => b.addEventListener('click', () => openLesson(b.dataset.lesson)));
  $('learn-mistakes')?.addEventListener('click', openMistakes);
}

// ---------------------------------------------------------------- lessons

export function openLesson(id) {
  const lesson = lessonById(id);
  if (!lesson) return;
  hooks.showView('learn', true);
  renderLesson(lesson, lesson.exercises);
}

function renderLesson(lesson, exercises) {
  X.lesson = lesson;
  X.list = exercises;
  $('learn-home').hidden = true;
  $('learn-lesson').hidden = false;
  const level = LEVELS.find((l) => l.id === lesson.level);
  const blocks = (lesson.body || [])
    .map((b) => {
      if (b.p) return `<p>${esc(b.p)}</p>`;
      if (b.h) return `<h3>${esc(b.h)}</h3>`;
      if (b.list) return `<ul>${b.list.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      if (b.tip) return `<p class="lesson-tip"><span class="kicker">Coach’s tip</span>${esc(b.tip)}</p>`;
      return '';
    })
    .join('');
  const further = (lesson.further || [])
    .map(resolveRef)
    .filter(Boolean)
    .map((r) =>
      r.kind === 'book'
        ? `<li><b>${esc(r.title)}</b> <span class="muted">— ${esc(r.author)}</span></li>`
        : `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a> <span class="muted small">${esc(r.why)}</span></li>`,
    )
    .join('');
  const idx = LESSONS.indexOf(lesson);
  const next = idx >= 0 ? LESSONS[idx + 1] : null;
  $('lesson-body').innerHTML = `
    <span class="lesson-level">${esc(level ? level.name : 'Practice')}</span>
    <h1 class="page-title">${esc(lesson.title)}</h1>
    <p class="lead">${esc(lesson.summary || '')}</p>
    ${blocks}
    ${further ? `<h3>Go deeper</h3><ul class="book-list">${further}</ul>` : ''}
    ${next ? `<p><button type="button" class="btn" id="lesson-next">Next lesson: ${esc(next.title)} →</button></p>` : ''}`;
  $('lesson-next')?.addEventListener('click', () => openLesson(next.id));
  $('learn-lesson').scrollIntoView?.({ block: 'start' });
  window.scrollTo?.(0, 0);
  refresh(cg);
  loadExercise(0);
}

function progressFor(lessonId) {
  const p = Store.load();
  p.lessons[lessonId] = p.lessons[lessonId] || { solved: {}, done: false };
  return p.lessons[lessonId];
}

function renderDots() {
  const solved = X.lesson.id === 'mistakes' ? Store.load().mistakesSolved : progressFor(X.lesson.id).solved;
  $('ex-dots').innerHTML = X.list
    .map((e, i) => `<button type="button" class="ex-dot${solved[e.id] ? ' solved' : ''}${i === X.idx ? ' current' : ''}" data-i="${i}" aria-label="Exercise ${i + 1}"></button>`)
    .join('');
  $('ex-dots').querySelectorAll('.ex-dot').forEach((b) => b.addEventListener('click', () => loadExercise(Number(b.dataset.i))));
}

function loadExercise(i) {
  if (!X.list.length) return;
  X.idx = Math.max(0, Math.min(X.list.length - 1, i));
  X.ex = X.list[X.idx];
  X.chess = new Chess(exerciseFen(X.ex));
  X.userColor = X.chess.turn();
  X.step = 0;
  X.onScript = true;
  X.done = false;
  X.busy = false;
  X.hint = 0;
  X.moves = 0;
  X.token++;
  cg.set({ orientation: X.userColor === 'w' ? 'white' : 'black' });
  showPosition(cg, X.chess, { movable: true });
  cg.setAutoShapes([]);
  $('ex-count').textContent = `Exercise ${X.idx + 1} of ${X.list.length}`;
  $('ex-prompt').textContent = X.ex.prompt;
  setFeedback('', '');
  $('ex-next').hidden = true;
  $('ex-hint').disabled = false;
  renderDots();
}

function nextExercise() {
  if (X.idx < X.list.length - 1) loadExercise(X.idx + 1);
  else {
    setFeedback('good', X.lesson.id === 'mistakes' ? 'All done! New mistakes from your games will appear here.' : 'Lesson complete! Pick your next lesson from the list.');
    $('ex-next').hidden = true;
  }
}

function setFeedback(kind, text) {
  const el = $('ex-feedback');
  el.className = `ex-feedback ${kind}`;
  el.textContent = text;
}

function resync() {
  showPosition(cg, X.chess, { movable: !X.done && !X.busy });
}

async function onExerciseMove(orig, dest) {
  if (X.busy || X.done) return resync();
  const piece = X.chess.get(orig);
  const promotion = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1') ? 'q' : undefined;
  let move;
  try {
    move = X.chess.move({ from: orig, to: dest, promotion });
  } catch {
    return resync();
  }
  X.busy = true;
  cg.setAutoShapes([]);
  showPosition(cg, X.chess, { lastMove: [orig, dest] });
  try {
    if (X.ex.kind === 'goal') await goalMove(move);
    else await findMove(move);
  } finally {
    X.busy = false;
  }
}

async function findMove(move) {
  const token = X.token;
  const ex = X.ex;
  const uci = moveToUci(move);
  const expected = X.onScript ? ex.line[X.step * 2] : null;
  const after = new Chess(move.after);
  let ok = false;
  let note = '';
  let a0 = null;
  let a1 = null;
  if (ex.accept && X.step === 0) ok = ex.accept.includes(uci);
  else if (uci === expected || after.isCheckmate()) ok = true;
  if (!ok) {
    setFeedback('', 'Checking…');
    a0 = await engine.analyze(move.before, { depth: 12, multipv: 2 });
    a1 = after.isGameOver() ? { lines: [] } : await engine.analyze(move.after, { depth: 12, multipv: 1 });
    if (token !== X.token) return;
    const best = a0.lines[0];
    const mine = a1.lines[0] ? R.negateScore(a1.lines[0].score) : { cp: 0 };
    const loss = cpOf(best?.score) - cpOf(mine);
    if (ex.accept && X.step === 0) {
      note = loss <= 60 ? 'Playable, but it doesn’t follow this lesson’s idea. ' : '';
    } else if ((ex.tolerance ?? 60) === 0) {
      // Still a forced mate within the moves left (this move used one of them).
      ok = mine.mate != null && mine.mate > 0 && mine.mate <= playerSteps(ex) - X.step - 1;
      if (ok) note = 'That works too! ';
    } else if (loss <= (ex.tolerance ?? 60)) {
      ok = true;
      note = 'That works too! ';
    }
    if (ok) X.onScript = false;
  }
  if (!ok) {
    let why = note;
    if (!why) {
      a0 = a0 || (await engine.analyze(move.before, { depth: 12, multipv: 2 }));
      a1 = a1 || (after.isGameOver() ? { lines: [] } : await engine.analyze(move.after, { depth: 12, multipv: 1 }));
      if (token !== X.token) return;
      const ev = evaluateMove(move, a0, a1, null);
      const exp = explainPlayerMove({ move, a0, a1, cls: ['great', 'best', 'excellent', 'good'].includes(ev.cls) ? 'inaccuracy' : ev.cls, evalAfterCp: ev.afterCp, tier: 1 });
      why = `${exp.headline} `;
    }
    setFeedback('bad', `✗ ${move.san}: ${why}Try again.`);
    await sleep(1600);
    if (token !== X.token) return;
    X.chess.undo();
    showPosition(cg, X.chess, { movable: true });
    return;
  }

  X.step++;
  if (X.step >= playerSteps(ex) || X.chess.isGameOver()) return success(note);

  // Opponent's reply: the scripted one if we're still on the main line, else Stockfish's.
  let reply = X.onScript ? ex.line[X.step * 2 - 1] : null;
  let rm = null;
  if (reply) {
    try {
      rm = X.chess.move(uciToMove(reply));
    } catch {
      rm = null;
    }
  }
  if (!rm) {
    const a = await engine.analyze(X.chess.fen(), { depth: 12, multipv: 1 });
    if (token !== X.token) return;
    if (!a.lines[0]) return success(note);
    rm = X.chess.move(uciToMove(a.lines[0].uci));
    X.onScript = false;
  }
  await sleep(350);
  if (token !== X.token) return;
  showPosition(cg, X.chess, { movable: true, lastMove: [rm.from, rm.to] });
  setFeedback('good', `✓ ${note}Good — they replied ${rm.san}. Keep going.`);
}

async function goalMove(move) {
  const token = X.token;
  const ex = X.ex;
  X.moves++;
  const c = X.chess;
  if (c.isCheckmate()) return success(ex.goal === 'mate' ? 'Checkmate! ' : '');
  if (c.isStalemate()) return fail('Stalemate — that’s a draw. Always leave the enemy king a legal move unless you’re giving checkmate.');
  if (c.isDraw()) return ex.goal === 'hold' ? success('Draw reached! ') : fail('The game is now a draw.');
  if (ex.goal === 'promote' && move.promotion) {
    const a = await engine.analyze(c.fen(), { depth: 12, multipv: 1 });
    if (token !== X.token) return;
    const userCp = -cpOf(a.lines[0]?.score);
    return userCp >= 300 ? success('Promoted! ') : fail('You promoted, but the new queen is lost. Try again.');
  }
  if (ex.goal === 'hold' && X.moves >= ex.maxMoves) return success('You held the position! ');
  if (ex.goal !== 'hold' && X.moves >= ex.maxMoves) return fail(`Out of moves (${ex.maxMoves}). Try again — use a hint if you’re stuck.`);

  setFeedback('', 'Stockfish is thinking…');
  const a = await engine.analyze(c.fen(), { depth: 12, multipv: 1 });
  if (token !== X.token) return;
  const best = a.lines[0];
  if (!best) return success('');
  const userCp = -cpOf(best.score);
  if (ex.goal === 'hold' && userCp <= -350) {
    const rm = c.move(uciToMove(best.uci));
    showPosition(cg, c, { lastMove: [rm.from, rm.to] });
    return fail(`After ${rm.san} the position is lost. ${ex.hint}`);
  }
  if ((ex.goal === 'mate' || ex.goal === 'promote') && userCp < 300) {
    return fail(`That move lets the win slip — the position is no longer winning. ${ex.hint}`);
  }
  await sleep(300);
  if (token !== X.token) return;
  const rm = c.move(uciToMove(best.uci));
  showPosition(cg, c, { movable: true, lastMove: [rm.from, rm.to] });
  if (c.isCheckmate()) return fail('You were checkmated.');
  if (c.isDraw()) return ex.goal === 'hold' ? success('Draw reached! ') : fail('The game is now a draw.');
  setFeedback('', `Stockfish played ${rm.san}. Move ${X.moves} of ${ex.maxMoves}.`);
}

function success(note = '') {
  X.done = true;
  showPosition(cg, X.chess, { movable: false, lastMove: lastMoveOf(X.chess) });
  setFeedback('good', `✓ ${note}${X.ex.explain || 'Solved!'}`);
  const p = Store.load();
  if (X.lesson.id === 'mistakes') {
    p.mistakesSolved[X.ex.id] = true;
  } else {
    const prog = progressFor(X.lesson.id);
    prog.solved[X.ex.id] = true;
    prog.done = X.lesson.exercises.every((e) => prog.solved[e.id]);
  }
  Store.save(p);
  $('ex-next').hidden = false;
  $('ex-next').textContent = X.idx < X.list.length - 1 ? 'Next exercise →' : 'Finish';
  $('ex-hint').disabled = true;
  renderDots();
  hooks.onProgress?.();
}

function fail(text) {
  X.done = true;
  showPosition(cg, X.chess, { movable: false, lastMove: lastMoveOf(X.chess) });
  setFeedback('bad', `✗ ${text}`);
}

function lastMoveOf(c) {
  const h = c.history({ verbose: true });
  const m = h[h.length - 1];
  return m ? [m.from, m.to] : undefined;
}

async function onHint() {
  if (X.done) return;
  const token = X.token;
  X.hint++;
  const ex = X.ex;
  if (X.hint === 1 && ex.hint) {
    setFeedback('', `Hint: ${ex.hint}`);
    return;
  }
  let uci = ex.kind !== 'goal' && X.onScript ? ex.line[X.step * 2] : null;
  if (ex.accept && X.step === 0) uci = ex.accept[0];
  if (!uci) {
    setFeedback('', 'Thinking…');
    const a = await engine.analyze(X.chess.fen(), { depth: 12, multipv: 1 });
    if (token !== X.token) return;
    uci = a.lines[0]?.uci;
  }
  if (!uci) return;
  const m = uciToMove(uci);
  if (X.hint <= 2) {
    cg.setAutoShapes([{ orig: m.from, brush: 'green' }]);
    setFeedback('', `Hint: move the piece on ${m.from}.`);
  } else {
    cg.setAutoShapes([{ orig: m.from, dest: m.to, brush: 'green' }]);
    setFeedback('', 'Hint: the arrow shows the move.');
  }
}

// ---------------------------------------------------------------- your mistakes

function mistakeExercises() {
  const out = [];
  for (const g of Store.games()) {
    if (!g.moves || !g.userColor) continue;
    let moves;
    try {
      moves = replay(g.moves.map((m) => m.san));
    } catch {
      continue;
    }
    g.moves.forEach((r, i) => {
      if (r.color !== g.userColor || !['mistake', 'blunder'].includes(r.cls) || !r.best) return;
      const opp = g.userColor === 'w' ? g.black : g.white;
      out.push({
        id: `${g.id}:${i}`,
        fen: moves[i].before,
        prompt: `From your game vs ${opp || 'your opponent'} (${new Date(g.date).toLocaleDateString()}): you played ${r.san} here. Find a better move.`,
        line: [r.best],
        tolerance: 60,
        hint: r.headline,
        explain: `${r.bestSan} was the best move. ${r.better && !r.better.startsWith('Better was') ? r.better : ''}`.trim(),
      });
    });
  }
  return out.slice(0, 40);
}

export function openMistakes() {
  const solved = Store.load().mistakesSolved;
  const list = mistakeExercises().sort((a, b) => (solved[a.id] ? 1 : 0) - (solved[b.id] ? 1 : 0));
  if (!list.length) return;
  hooks.showView('learn', true);
  renderLesson(
    {
      id: 'mistakes',
      level: null,
      title: 'Practice your mistakes',
      summary: 'Positions from your own games where you missed a better move. Fixing your own mistakes is one of the fastest ways to improve.',
      body: [{ p: 'Take your time: run your checklist (checks, captures, threats) before you move. If you’re stuck, the hint repeats what the coach said during the game.' }],
      exercises: list,
      further: [],
    },
    list,
  );
}

export { LESSONS };
