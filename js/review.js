// Game review: step through any saved or imported game with the coach's comments.
import { Chess } from '../vendor/chess.js';
import * as R from './rating.js';
import * as Store from './storage.js';
import { makeBoard, showPosition, setEvalBarCp, refresh, esc } from './board.js';
import { analysePositions, buildRecords, evaluateMove, keyMoments, parseGame, replay, sideSummary, moveDescription, toThirdPerson } from './analysis.js';
import { explainPlayerMove } from './coach.js';
import { detectOpening } from './openings.js';
import { uciToMove } from './tactics.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let engine;
let hooks;
let cg = null;
const V = {
  game: null,
  moves: [], // chess.js verbose moves
  ply: -1, // index of the move just played on the board (-1 = start position)
  mode: 'view', // view | best | practice | line
  token: 0,
};

export function initReview(opts) {
  engine = opts.engine;
  hooks = opts;
  cg = makeBoard($('rv-board'), { movable: { events: { after: onPracticeMove } } });
  $('rv-first').addEventListener('click', () => go(-1));
  $('rv-prev').addEventListener('click', () => go(V.ply - 1));
  $('rv-next').addEventListener('click', () => go(V.ply + 1));
  $('rv-last').addEventListener('click', () => go(V.moves.length - 1));
  $('rv-best').addEventListener('click', showBest);
  $('rv-line').addEventListener('click', playBestLine);
  $('rv-practice').addEventListener('click', startPractice);
  $('rv-flip').addEventListener('click', () => cg.toggleOrientation());
  $('rv-game').addEventListener('change', (e) => open(e.target.value));
  $('rv-import').addEventListener('click', openImport);
  $('rv-import-empty').addEventListener('click', openImport);
  $('import-go').addEventListener('click', runImport);
  $('import-cancel').addEventListener('click', () => {
    V.importCancelled = true;
    $('dlg-import').close();
  });
  $('import-pgn').addEventListener('input', previewImport);
  $('rv-graph').addEventListener('click', onGraphClick);
  document.addEventListener('keydown', (e) => {
    if (!isVisible() || e.target.closest('input, textarea, select, dialog[open]')) return;
    if (e.key === 'ArrowLeft') go(V.ply - 1);
    else if (e.key === 'ArrowRight') go(V.ply + 1);
  });
}

function isVisible() {
  return !$('view-review').hidden;
}

/** Shows the review screen for a game (latest game if no id). */
export function open(id) {
  const list = Store.games();
  renderPicker(list, id);
  const game = (id && Store.gameById(id)) || list[0] || null;
  $('rv-empty').hidden = !!game;
  $('rv-main').hidden = !game;
  if (!game) return;
  V.game = game;
  V.moves = replay(game.moves.map((m) => m.san));
  V.mode = 'view';
  $('rv-game').value = game.id;
  cg.set({ orientation: game.userColor === 'b' ? 'black' : 'white' });
  refresh(cg);
  renderSummary();
  renderMoves();
  const first = keyMoments(game.moves, game.userColor)[0];
  go(first ? first.ply : -1);
}

export function onShow() {
  if (!V.game) open();
  else {
    refresh(cg);
    go(V.ply);
  }
}

/** Arrows on a hidden board can't be measured, so clear them when leaving the screen. */
export function onHide() {
  V.token++;
  cg?.setAutoShapes([]);
}

function renderPicker(list, selected) {
  const sel = $('rv-game');
  sel.innerHTML = list
    .map((g) => {
      const d = new Date(g.date).toLocaleDateString();
      const res = g.userScore === 1 ? 'Win' : g.userScore === 0 ? 'Loss' : g.userScore === 0.5 ? 'Draw' : 'Unfinished';
      const opp = g.userColor === 'w' ? g.black : g.white;
      return `<option value="${esc(g.id)}">${esc(d)} · vs ${esc(opp || 'opponent')} · ${res}</option>`;
    })
    .join('');
  if (selected) sel.value = selected;
}

function renderSummary() {
  const g = V.game;
  const me = g.userColor;
  const s = sideSummary(g.moves, me, g.priorElo || R.NEW_PLAYER_ELO);
  const opp = sideSummary(g.moves, me === 'w' ? 'b' : 'w', 1200);
  const order = ['great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const chips = order
    .filter((k) => s.counts[k])
    .map((k) => `<span class="badge tone-${R.CLASSES[k].tone}">${R.CLASSES[k].symbol} ${s.counts[k]} ${R.CLASSES[k].label}</span>`)
    .join('');
  const oppName = me === 'w' ? g.black : g.white;
  $('rv-summary').innerHTML = `
    <div class="mini-stats">
      <div><b>${s.stats.n ? `≈ ${s.est.mean}` : '—'}</b><span>Your level</span></div>
      <div><b>${s.acc != null ? s.acc + '%' : '—'}</b><span>Your accuracy</span></div>
      <div><b>${opp.acc != null ? opp.acc + '%' : '—'}</b><span>${esc(oppName || 'Opponent')}</span></div>
    </div>
    <div class="chips">${chips}</div>
    <p class="muted small">${esc(g.white || 'White')} vs ${esc(g.black || 'Black')} · ${esc(g.result || '')} ${g.reason ? '· ' + esc(g.reason) : ''}${g.opening ? ' · ' + esc(g.opening) : ''}</p>`;
  renderMoments();
  renderGraph();
}

function renderMoments() {
  const g = V.game;
  const km = keyMoments(g.moves, g.userColor);
  const label = { 'your-mistake': 'Your mistake', 'their-mistake': 'Their mistake', great: 'Great move' };
  $('rv-moments').innerHTML = km.length
    ? km
        .map((k) => {
          const r = g.moves[k.ply];
          return `<button type="button" class="moment ${k.kind}" data-ply="${k.ply}"><b>${esc(moveLabel(k.ply))}</b> ${label[k.kind]} <span class="muted">${R.CLASSES[r.cls].symbol}</span></button>`;
        })
        .join('')
    : '<p class="muted small">No big swings in this game.</p>';
  $('rv-moments').querySelectorAll('.moment').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.ply))));
}

function moveLabel(ply) {
  const m = V.moves[ply];
  if (!m) return 'Start';
  const n = parseInt(m.before.split(' ')[5], 10);
  return `${n}${m.color === 'w' ? '.' : '…'}${m.san}`;
}

const GW = 600;
const GH = 120;
function renderGraph() {
  const recs = V.game.moves;
  const n = recs.length;
  const x = (i) => (n <= 1 ? GW / 2 : ((i + 1) / n) * GW);
  const y = (cp) => GH - (R.winPercent(cp) / 100) * GH;
  const pts = [`0,${y(20)}`, ...recs.map((r, i) => `${x(i).toFixed(1)},${y(r.eval).toFixed(1)}`)];
  const area = `M0,${GH} L${pts.join(' L')} L${GW},${GH} Z`;
  const marks = recs
    .map((r, i) => {
      if (!['mistake', 'blunder'].includes(r.cls)) return '';
      const mine = r.color === V.game.userColor;
      return `<circle class="mark ${r.cls}${mine ? ' mine' : ''}" cx="${x(i).toFixed(1)}" cy="${y(r.eval).toFixed(1)}" r="${mine ? 5 : 3.5}"><title>${esc(moveLabel(i))}: ${R.CLASSES[r.cls].label}</title></circle>`;
    })
    .join('');
  $('rv-graph').innerHTML = `<rect class="bg" x="0" y="0" width="${GW}" height="${GH}"/><path class="adv" d="${area}"/><line class="mid" x1="0" x2="${GW}" y1="${GH / 2}" y2="${GH / 2}"/>${marks}<line id="rv-cursor" class="cursor" x1="0" x2="0" y1="0" y2="${GH}"/>`;
}

function onGraphClick(e) {
  if (!V.game) return;
  const box = $('rv-graph').getBoundingClientRect();
  const n = V.game.moves.length;
  const i = Math.round(((e.clientX - box.left) / box.width) * n) - 1;
  go(Math.max(-1, Math.min(n - 1, i)));
}

function renderMoves() {
  const ol = $('rv-moves');
  ol.innerHTML = '';
  let li = null;
  V.moves.forEach((m, i) => {
    if (m.color === 'w' || i === 0) {
      li = document.createElement('li');
      li.innerHTML = `<span class="num">${parseInt(m.before.split(' ')[5], 10)}.</span>${m.color === 'b' ? '<span class="muted">…</span>' : ''}`;
      ol.appendChild(li);
    }
    const r = V.game.moves[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mv';
    b.dataset.ply = i;
    b.innerHTML = `<span class="dot tone-${R.CLASSES[r.cls].tone}"></span>${esc(m.san)}`;
    b.title = R.CLASSES[r.cls].label;
    b.addEventListener('click', () => go(i));
    li.appendChild(b);
  });
}

function go(ply) {
  if (!V.game) return;
  ply = Math.max(-1, Math.min(V.moves.length - 1, ply));
  V.ply = ply;
  V.mode = 'view';
  V.token++;
  const m = V.moves[ply];
  const chess = new Chess(m ? m.after : V.moves[0].before);
  showPosition(cg, chess, { lastMove: m ? [m.from, m.to] : undefined });
  const r = V.game.moves[ply];
  cg.setAutoShapes(r && r.arrows ? r.arrows.filter((a) => a.brush === 'red') : []);
  setEvalBarCp($('rv-evalbar'), r ? r.eval : 20);
  $('rv-moves').querySelectorAll('.mv').forEach((b) => b.classList.toggle('active', Number(b.dataset.ply) === ply));
  $('rv-moves').querySelector('.mv.active')?.scrollIntoView({ block: 'nearest' });
  const cursor = $('rv-cursor');
  if (cursor) {
    const n = V.moves.length;
    const cx = ply < 0 ? 0 : ((ply + 1) / n) * GW;
    cursor.setAttribute('x1', cx);
    cursor.setAttribute('x2', cx);
  }
  renderComment();
  updateButtons();
}

function updateButtons() {
  const r = V.game?.moves[V.ply];
  const notBest = !!(r && r.best && r.best !== r.uci);
  $('rv-best').disabled = !notBest;
  $('rv-line').disabled = !(r && r.bestLine && r.bestLine.length);
  $('rv-practice').disabled = !(r && r.color === V.game.userColor && ['inaccuracy', 'mistake', 'blunder'].includes(r.cls));
  $('rv-prev').disabled = V.ply < 0;
  $('rv-first').disabled = V.ply < 0;
  $('rv-next').disabled = V.ply >= V.moves.length - 1;
  $('rv-last').disabled = V.ply >= V.moves.length - 1;
}

function renderComment() {
  const el = $('rv-comment');
  const r = V.game.moves[V.ply];
  if (!r) {
    el.innerHTML = `<div class="kicker">Start</div><p>Use the arrows (or tap the graph) to step through the game. Coloured dots mark mistakes; big dots are yours.</p>`;
    $('rv-status').textContent = '';
    return;
  }
  const c = R.CLASSES[r.cls];
  const mine = r.color === V.game.userColor;
  const who = mine ? 'Your move' : 'Opponent’s move';
  const rawIdea = ['great', 'best', 'excellent', 'good'].includes(r.cls) && !r.text ? moveDescription(V.moves[V.ply].before, r.uci) : null;
  const idea = rawIdea && !mine ? toThirdPerson(rawIdea) : rawIdea;
  el.innerHTML = `
    <div class="meta"><span class="badge tone-${c.tone}">${c.symbol} ${c.label}</span><span>${esc(moveLabel(V.ply))}</span><span class="muted">${who}</span></div>
    <div class="title">${esc(r.headline)}</div>
    ${r.text ? `<p>${esc(r.text)}</p>` : idea ? `<p>${esc(r.san)} ${esc(idea)}.</p>` : ''}
    ${r.better ? `<p class="better">${esc(r.better)}</p>` : r.best && r.best !== r.uci && !['great', 'best'].includes(r.cls) ? `<p class="better">Best was ${esc(r.bestSan)}.</p>` : ''}
    ${mine && r.lesson ? `<p class="lesson"><span class="kicker">Remember</span>${esc(r.lesson)}</p>` : ''}
    ${mine && r.tags?.length && ['mistake', 'blunder'].includes(r.cls) ? lessonLink(r.tags[0]) : ''}`;
  el.querySelectorAll('[data-lesson]').forEach((b) => b.addEventListener('click', () => hooks.openLesson(b.dataset.lesson)));
  $('rv-status').textContent = '';
}

function lessonLink(tag) {
  const l = hooks.lessonForTag(tag);
  return l ? `<button type="button" class="btn small" data-lesson="${esc(l.id)}">Lesson: ${esc(l.title)} →</button>` : '';
}

function showBest() {
  const r = V.game.moves[V.ply];
  if (!r || !r.best) return;
  V.mode = 'best';
  const before = new Chess(V.moves[V.ply].before);
  const prev = V.moves[V.ply - 1];
  showPosition(cg, before, { lastMove: prev ? [prev.from, prev.to] : undefined });
  const bm = uciToMove(r.best);
  const pm = uciToMove(r.uci);
  cg.setAutoShapes([
    { orig: bm.from, dest: bm.to, brush: 'green' },
    { orig: pm.from, dest: pm.to, brush: 'paleRed' },
  ]);
  $('rv-status').textContent = `Green: the best move (${r.bestSan}). Red: what was played (${r.san}).`;
}

async function playBestLine() {
  const r = V.game.moves[V.ply];
  if (!r || !r.bestLine?.length) return;
  const token = ++V.token;
  V.mode = 'line';
  const c = new Chess(V.moves[V.ply].before);
  showPosition(cg, c);
  cg.setAutoShapes([]);
  const sans = [];
  $('rv-status').textContent = 'Best line…';
  for (const u of r.bestLine.slice(0, 6)) {
    await sleep(750);
    if (token !== V.token) return;
    let m;
    try {
      m = c.move(uciToMove(u));
    } catch {
      break;
    }
    sans.push(m.san);
    showPosition(cg, c, { lastMove: [m.from, m.to] });
    $('rv-status').textContent = `Best line: ${sans.join(' ')}`;
  }
}

function startPractice() {
  const r = V.game.moves[V.ply];
  if (!r) return;
  V.mode = 'practice';
  V.token++;
  const c = new Chess(V.moves[V.ply].before);
  V.practice = { chess: c, tries: 0 };
  const prev = V.moves[V.ply - 1];
  showPosition(cg, c, { movable: true, lastMove: prev ? [prev.from, prev.to] : undefined });
  cg.setAutoShapes([]);
  $('rv-status').textContent = `You played ${r.san} here. Find a better move.`;
}

async function onPracticeMove(orig, dest) {
  if (V.mode !== 'practice') return;
  const token = V.token;
  const c = V.practice.chess;
  const fen = c.fen();
  const piece = c.get(orig);
  const promotion = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1') ? 'q' : undefined;
  let move;
  try {
    move = c.move({ from: orig, to: dest, promotion });
  } catch {
    showPosition(cg, c, { movable: true });
    return;
  }
  showPosition(cg, c, { lastMove: [orig, dest] });
  $('rv-status').textContent = 'Checking…';
  const a0 = await engine.analyze(fen);
  const a1 = c.isGameOver() ? null : await engine.analyze(c.fen());
  if (token !== V.token) return;
  const ev = evaluateMove(move, a0, a1, V.moves[V.ply - 1]);
  if (ev.winDrop < 5 || ['great', 'best', 'excellent'].includes(ev.cls)) {
    $('rv-status').textContent = `✓ ${move.san} — ${R.CLASSES[ev.cls].label}! ${ev.cls === 'best' || ev.cls === 'great' ? 'That’s the best move.' : ''}`;
    V.mode = 'view';
    return;
  }
  const ex = explainPlayerMove({ move, a0, a1, cls: ev.cls, evalAfterCp: ev.afterCp, tier: hooks.getTier() });
  V.practice.tries++;
  $('rv-status').textContent = `✗ ${move.san}: ${ex.headline} Try again${V.practice.tries >= 2 ? ' — or press “Show best move”' : ''}.`;
  await sleep(1400);
  if (token !== V.token) return;
  c.undo();
  showPosition(cg, c, { movable: true });
}

// ---------------------------------------------------------------- import

function openImport() {
  $('import-pgn').value = '';
  $('import-error').textContent = '';
  $('import-progress').hidden = true;
  $('import-go').disabled = false;
  $('import-sides').innerHTML = '';
  $('dlg-import').showModal();
}

function previewImport() {
  const text = $('import-pgn').value;
  $('import-error').textContent = '';
  let parsed = null;
  try {
    parsed = parseGame(text);
  } catch {
    $('import-sides').innerHTML = '';
    return;
  }
  const h = parsed.headers || {};
  const w = h.White || 'White';
  const b = h.Black || 'Black';
  $('import-sides').innerHTML = `<legend>Which side were you?</legend>
    <label><input type="radio" name="import-side" value="w" checked> White (${esc(w)})</label>
    <label><input type="radio" name="import-side" value="b"> Black (${esc(b)})</label>
    <p class="hint-text">${parsed.moves.length} moves found.</p>`;
}

async function runImport() {
  let parsed;
  try {
    parsed = parseGame($('import-pgn').value);
  } catch (e) {
    $('import-error').textContent = e.message;
    return;
  }
  const side = document.querySelector('input[name="import-side"]:checked')?.value || 'w';
  V.importCancelled = false;
  $('import-go').disabled = true;
  $('import-progress').hidden = false;
  const bar = $('import-bar');
  const analyses = await analysePositions(parsed.moves, engine, {
    depth: Math.min(engine.spec?.depth ?? 12, 12),
    multipv: 3,
    isCancelled: () => V.importCancelled,
    onProgress: (f) => {
      bar.style.width = `${Math.round(f * 100)}%`;
      $('import-pct').textContent = `Analysing… ${Math.round(f * 100)}%`;
    },
  });
  if (!analyses) return;
  const h = parsed.headers || {};
  const record = buildGameRecord({
    moves: parsed.moves,
    analyses,
    userColor: side,
    white: h.White || 'White',
    black: h.Black || 'Black',
    result: h.Result && h.Result !== '*' ? h.Result : resultOf(parsed.moves),
    reason: h.Termination || '',
    source: 'import',
    tier: hooks.getTier(),
    priorElo: hooks.getOverall(),
  });
  Store.addGame(record);
  hooks.onGameArchived(record);
  $('dlg-import').close();
  open(record.id);
}

function resultOf(moves) {
  const c = new Chess(moves[moves.length - 1].after);
  if (c.isCheckmate()) return c.turn() === 'w' ? '0-1' : '1-0';
  if (c.isDraw()) return '1/2-1/2';
  return '*';
}

/** Turns a finished (or imported) game into an archive record. */
export function buildGameRecord({ moves, analyses, userColor, white, black, result, reason, source, tier, priorElo, extra = {} }) {
  const recs = buildRecords(moves, analyses, tier, userColor);
  const s = sideSummary(recs, userColor, priorElo);
  const userScore = result === '1/2-1/2' ? 0.5 : result === '1-0' ? (userColor === 'w' ? 1 : 0) : result === '0-1' ? (userColor === 'b' ? 1 : 0) : null;
  return {
    id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    date: new Date().toISOString(),
    source,
    userColor,
    white,
    black,
    result,
    reason,
    userScore,
    opening: detectOpening(moves.map((m) => m.san))?.name || null,
    priorElo,
    n: s.stats.n,
    S: Math.round(s.stats.S),
    Q: Math.round(s.stats.Q),
    perf: s.stats.n ? s.est.mean : null,
    acc: s.acc,
    moves: recs,
    ...extra,
  };
}
