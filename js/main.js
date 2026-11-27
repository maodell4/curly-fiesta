import { Chess } from '../vendor/chess.js';
import { makeBoard, refresh } from './board.js';
import { Engine } from './engine.js';
import * as R from './rating.js';
import * as T from './tactics.js';
import * as Coach from './coach.js';
import { chooseBotMove } from './bot.js';
import { detectOpening } from './openings.js';
import * as Store from './storage.js';
import { evaluateMove as gradeMove, analysePositions } from './analysis.js';
import { initReview, open as openReview, onShow as reviewShown, onHide as reviewHidden, buildGameRecord } from './review.js';
import { initLearn, onShow as learnShown, onHide as learnHidden, openLesson, openMistakes, showHome as learnHome } from './learn.js';
import { LESSONS, lessonsForTags } from './lessons.js';
import { CHECKLIST } from './library.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const engine = new Engine();
let cg = null;

const S = {
  chess: new Chess(),
  me: 'w',
  phase: 'loading', // loading | player | thinking | bot | await-takeback | over
  records: [], // current line: one record per ply
  playerMoves: [], // every player move this game, including taken-back ones
  rated: R.emptyStats(),
  accs: [],
  timeline: [],
  botRated: R.emptyStats(),
  overall: null,
  gameEst: null,
  tier: 1,
  botElo: 600,
  botAnnounced: 600,
  hintLevel: 0,
  assisted: false,
  retry: false,
  viewPly: null,
  gid: 0,
  profile: Store.load(),
  opening: null,
  pendingBot: null,
  takebacks: 0,
  saved: false,
  result: null,
};

// ---------------------------------------------------------------- setup

async function init() {
  S.overall = R.overallFromGames(S.profile.games);
  S.gameEst = R.estimate(R.emptyStats(), S.overall.mean);
  S.tier = R.tierFor(S.overall.mean);
  cg = makeBoard($('board'), { fen: S.chess.fen(), orientation: 'white', movable: { events: { after: onUserMove } } });
  bindUI();
  initReview({
    engine,
    getTier: () => S.tier,
    getOverall: () => S.overall.mean,
    openLesson: (id) => openLesson(id),
    lessonForTag: (tag) => lessonsForTags({ [tag]: 1 })[0] || null,
    onGameArchived: addImportedGame,
  });
  initLearn({ engine, getTier: () => S.tier, getOverall: () => S.overall.mean, showView, onProgress: () => {} });
  $('checklist').innerHTML = CHECKLIST.map((c) => `<li>${esc(c)}</li>`).join('');
  $('checklist-card').open = S.profile.games.length < 5;
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  window.addEventListener('hashchange', () => showView(hashView()));
  showView(hashView());
  Store.onChange(onStoreChange);
  Store.connectCloud();
  S.overall = R.overallFromGames(S.profile.games);
  S.gameEst = R.estimate(R.emptyStats(), S.overall.mean);
  S.tier = R.tierFor(S.overall.mean);
  applyDisplaySettings();
  renderAll();

  try {
    const spec = await engine.init();
    $('loading').hidden = true;
    engine.worker.addEventListener('error', () => fatal('The chess engine crashed. Reload the page to continue.'));
    if (spec.name.includes('compatibility'))
      addMsg({ kind: 'info', title: 'Compatibility mode', body: 'Your browser blocked the fast engine, so a slower one is being used. Moves may take a few seconds to analyse.' });
  } catch (e) {
    fatal(`Couldn't start the chess engine (${e.message}). Use a recent Chrome, Edge, Firefox or Safari, and open the app through a web server rather than as a file — see the README.`);
    return;
  }

  welcome();
  newGame(true);
}

function fatal(text) {
  $('loading').hidden = false;
  $('loading').querySelector('.spinner').hidden = true;
  $('loading-text').textContent = text;
  setStatus(text);
}

function welcome() {
  const games = S.profile.games.length;
  if (!games) {
    addMsg({
      kind: 'tip',
      title: 'Hi! I’m your chess coach.',
      body:
        'Here’s how this works: before your move I’ll point out dangers and chances, after every move I’ll tell you how good it was and why, and I’ll keep an estimate of the level you’re playing at. Your opponent adjusts to you. ' +
        'Stuck? Press Hint — each press gives a bigger clue.',
    });
  } else {
    addMsg({
      kind: 'tip',
      title: 'Welcome back!',
      body: `Your rating estimate is ≈ ${S.overall.mean} after ${games} game${games === 1 ? '' : 's'}. Coach mode: ${R.tierInfo(S.tier).name}.`,
    });
  }
}

function bindUI() {
  $('btn-new').addEventListener('click', async () => {
    if (inProgress() && !(await askConfirm('Start a new game?', 'This game will be saved as unfinished.', 'New game'))) return;
    newGame();
  });
  $('btn-hint').addEventListener('click', onHint);
  $('btn-undo').addEventListener('click', () => takeBack());
  $('btn-flip').addEventListener('click', () => {
    cg.toggleOrientation();
    $('evalbar').classList.toggle('flipped', cg.state.orientation === 'black');
  });
  $('btn-resign').addEventListener('click', async () => {
    if (!inProgress()) return;
    if (await askConfirm('Resign this game?', 'It will count as a loss. Your moves so far still count toward your rating.', 'Resign')) endGame('resign');
  });
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-live').addEventListener('click', () => setView(null));
  $('btn-prev').addEventListener('click', () => stepView(-1));
  $('btn-next').addEventListener('click', () => stepView(1));
  $('btn-over-new').addEventListener('click', () => {
    $('dlg-over').close();
    newGame();
  });
  $('btn-over-review').addEventListener('click', async () => {
    $('dlg-over').close();
    const id = await S.archivePromise;
    showView('review');
    openReview(id || undefined);
  });
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, dialog[open]') || $('view-play').hidden) return;
    if (e.key === 'ArrowLeft') stepView(-1);
    else if (e.key === 'ArrowRight') stepView(1);
    else if (e.key === 'Escape' && S.viewPly != null) setView(null);
  });
  const range = $('fixedElo');
  range.addEventListener('input', () => ($('fixedEloOut').textContent = range.value));
  $('btn-reset').addEventListener('click', async () => {
    if (!(await askConfirm('Reset all progress?', 'This erases your saved games and rating history in this browser.', 'Erase everything'))) return;
    S.profile = Store.reset();
    $('dlg-settings').close();
    renderProgress();
    S.overall = R.overallFromGames([]);
    S.tier = R.tierFor(S.overall.mean);
    addMsg({ kind: 'info', title: 'Progress reset', body: 'Starting fresh.' });
    newGame();
  });
  $('settings-form').addEventListener('submit', (e) => {
    if (e.submitter?.value === 'save') saveSettings();
  });
}

const inProgress = () => ['player', 'thinking', 'bot', 'await-takeback'].includes(S.phase) && S.playerMoves.length > 0;

// ---------------------------------------------------------------- game flow

async function newGame(first = false) {
  if (!first && inProgress()) saveGame('unfinished', null);
  S.gid++;
  const st = S.profile.settings;
  S.me = st.playAs === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : st.playAs;
  Object.assign(S, {
    chess: new Chess(),
    records: [],
    playerMoves: [],
    rated: R.emptyStats(),
    accs: [],
    timeline: [],
    botRated: R.emptyStats(),
    hintLevel: 0,
    assisted: false,
    retry: false,
    viewPly: null,
    opening: null,
    pendingBot: null,
    takebacks: 0,
    saved: false,
    result: null,
  });
  S.overall = R.overallFromGames(S.profile.games);
  S.gameEst = R.estimate(R.emptyStats(), S.overall.mean);
  S.tier = R.tierFor(S.overall.mean, S.tier);
  S.botElo = computeBotElo();
  S.botAnnounced = S.botElo;

  cg.set({ orientation: S.me === 'w' ? 'white' : 'black' });
  cg.setAutoShapes([]);
  cg.setShapes([]);
  $('evalbar').classList.toggle('flipped', S.me === 'b');
  setEval({ cp: 30 }, 'w');
  setView(null);
  addMsg({
    kind: 'divider',
    body: `New game — you’re ${S.me === 'w' ? 'White (you move first)' : 'Black'} vs Coach Bot ≈ ${S.botElo}`,
  });
  renderAll();

  const gid = S.gid;
  S.phase = 'thinking';
  await engine.newGame();
  if (gid !== S.gid) return;
  if (S.chess.turn() === S.me) startPlayerTurn();
  else botTurn();
}

function computeBotElo() {
  const st = S.profile.settings;
  if (st.opponent === 'fixed') return Number(st.fixedElo);
  const w = Math.min(0.5, S.rated.n / 40);
  const base = (1 - w) * S.overall.mean + w * S.gameEst.mean;
  return Math.round(R.clamp(base + Number(st.challenge), 250, 2600) / 10) * 10;
}

async function startPlayerTurn() {
  const gid = S.gid;
  S.phase = 'player';
  S.hintLevel = 0;
  S.assisted = S.retry;
  syncBoard();
  updateButtons();
  const lastMine = S.playerMoves[S.playerMoves.length - 1];
  setStatus(lastMine && S.records.includes(lastMine) ? `Your move · last move: ${R.CLASSES[lastMine.cls].label}` : 'Your move');
  const fen = S.chess.fen();
  const a0 = await engine.analyze(fen);
  if (gid !== S.gid) return;
  ratePendingBot(a0);
  if (S.chess.fen() !== fen || S.phase !== 'player') return;
  setEval(a0.lines[0]?.score, S.chess.turn());
  const tips = Coach.preMoveTips({
    chess: S.chess,
    a0,
    tier: S.tier,
    warnings: S.profile.settings.warnings,
    prevMove: S.records[S.records.length - 1]?.move,
    playerMoveCount: S.records.filter((r) => r.by === 'player').length,
  });
  const shapes = [];
  for (const tip of tips) {
    addMsg({ kind: tip.kind, kicker: tipTitle(tip.kind), body: tip.text });
    if (tip.specific) S.assisted = true;
    for (const a of tip.arrows || []) shapes.push(a);
    for (const sq of tip.squares || []) shapes.push({ orig: sq, brush: tip.kind === 'danger' ? 'red' : 'green' });
  }
  if (shapes.length) cg.setAutoShapes(shapes);
}

function tipTitle(kind) {
  return { danger: 'Careful', chance: 'Opportunity', tip: 'Coach tip' }[kind] || '';
}

async function onUserMove(orig, dest) {
  if (S.phase !== 'player' || S.viewPly != null) return syncBoard();
  const piece = S.chess.get(orig);
  let promotion;
  if (piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1')) promotion = await askPromotion();
  let move;
  try {
    move = S.chess.move({ from: orig, to: dest, promotion });
  } catch {
    syncBoard();
    return;
  }
  handlePlayerMove(move);
}

async function handlePlayerMove(move) {
  const gid = S.gid;
  const assisted = S.assisted;
  S.assisted = false;
  S.retry = false;
  S.phase = 'thinking';
  cg.setAutoShapes([]);
  const rec = pushRecord(move, 'player');
  syncBoard();
  updateButtons();
  renderMoves();
  setStatus('Coach is checking your move', true);

  const a0 = await engine.analyze(move.before);
  if (gid !== S.gid) return;
  ratePendingBot(a0);
  const over = S.chess.isGameOver();
  const a1 = over ? null : await engine.analyze(move.after);
  if (gid !== S.gid) return;
  if (a1) setEval(a1.lines[0]?.score, S.chess.turn());
  else if (S.chess.isCheckmate()) setEval({ mate: 0 }, S.chess.turn());

  const prevOpp = S.records.length >= 2 ? S.records[S.records.length - 2].move : null;
  const ev = gradeMove(move, a0, a1, prevOpp);
  Object.assign(rec, ev);
  const prev = S.gameEst;
  rec.assisted = assisted;
  rec.rated = !ev.excluded && !assisted;
  if (rec.rated) R.addLoss(S.rated, ev.loss);
  if (!ev.forced) S.accs.push(ev.acc);
  S.gameEst = R.estimate(S.rated, S.overall.mean);
  rec.delta = rec.rated ? S.gameEst.mean - prev.mean : 0;
  if (rec.rated) S.timeline.push({ mean: S.gameEst.mean, lo: S.gameEst.lo, hi: S.gameEst.hi });

  rec.ex = Coach.explainPlayerMove({
    move,
    a0,
    a1,
    cls: ev.cls,
    evalAfterCp: ev.afterCp,
    tier: S.tier,
    history: S.records.slice(0, -1).map((r) => r.move),
  });
  rec.tags = rec.ex.tags;
  S.playerMoves.push(rec);

  showFeedback(rec);
  cg.setAutoShapes(rec.ex.arrows);
  updateOpening();
  adapt();
  renderAll();

  if (over) return endGame();
  if (offerTakebackFor(ev.cls)) return offerTakeback(rec);
  botTurn();
}

function ratePendingBot(aNext) {
  const p = S.pendingBot;
  if (!p || p.fenAfter !== aNext.fen) return;
  S.pendingBot = null;
  const best = p.aBefore.lines[0];
  if (!best) return;
  const line = p.aBefore.lines.find((l) => l.uci === p.uci);
  const afterScore = line ? line.score : R.negateScore(aNext.lines[0]?.score ?? { cp: 0 });
  const bestCp = R.scoreToCp(best.score);
  const afterCp = R.scoreToCp(afterScore);
  const loss = p.uci === best.uci ? 0 : Math.max(0, bestCp - afterCp);
  const decided = Math.abs(bestCp) >= 900 && Math.abs(afterCp) >= 900 && Math.sign(bestCp) === Math.sign(afterCp);
  if (p.legalCount > 1 && !decided) R.addLoss(S.botRated, loss);
}

async function botTurn() {
  const gid = S.gid;
  S.phase = 'bot';
  updateButtons();
  setStatus('Coach Bot is thinking', true);
  const fen = S.chess.fen();
  const t0 = performance.now();
  const a = await engine.analyze(fen);
  if (gid !== S.gid) return;
  const legal = S.chess.moves({ verbose: true });
  const lines = a.lines.map((l) => ({
    uci: l.uci,
    cp: R.scoreToCp(l.score) + (l.score.mate > 0 ? 100 - l.score.mate : 0),
    mateIn: l.score.mate,
  }));
  const choice = chooseBotMove({ legal, lines, elo: S.botElo });
  await sleep(Math.max(0, 500 + Math.random() * 700 - (performance.now() - t0)));
  if (gid !== S.gid || S.phase !== 'bot') return;
  const move = S.chess.move(T.uciToMove(choice.uci));
  const rec = pushRecord(move, 'bot');
  rec.kind = choice.kind;
  S.pendingBot = { aBefore: a, uci: choice.uci, fenAfter: move.after, legalCount: legal.length };
  cg.setAutoShapes([]);
  syncBoard();
  updateOpening();
  renderMoves();
  if (S.chess.isGameOver()) return endGame();
  explainBotMove(move);
  startPlayerTurn();
}

/** Says what the bot's move does. Threats are left to the pre-move warnings, so this never gives the answer away. */
function explainBotMove(move) {
  if (!S.profile.settings.explainOpponent) return;
  const ex = Coach.explainOpponentMove(move);
  if (!ex || (ex.threat && !move.san.includes('+'))) return;
  addMsg({ kind: 'opp', kicker: 'Opponent', body: `Coach Bot played ${ex.san} — it ${ex.what}.` });
}

function pushRecord(move, by) {
  const rec = { move, by, ply: S.records.length };
  S.records.push(rec);
  return rec;
}

/** Adjusts coaching tier and opponent strength to how you're playing right now. */
function adapt() {
  const w = Math.min(0.6, S.rated.n / 30);
  const blended = (1 - w) * S.overall.mean + w * S.gameEst.mean;
  const t = R.tierFor(blended, S.tier);
  if (t !== S.tier) {
    const info = R.tierInfo(t);
    addMsg({
      kind: 'info',
      kicker: 'Coach mode',
      title: t > S.tier ? 'You’re playing well!' : 'Let’s slow down a little',
      body: `Coach mode is now “${info.name}”: ${info.blurb}`,
    });
    S.tier = t;
  }
  S.botElo = computeBotElo();
  if (S.profile.settings.opponent === 'adaptive' && Math.abs(S.botElo - S.botAnnounced) >= 100) {
    addMsg({
      kind: 'info',
      title: S.botElo > S.botAnnounced ? 'Opponent getting tougher' : 'Opponent easing off',
      body: `Coach Bot now plays at ≈ ${S.botElo} to match how you’re playing.`,
    });
    S.botAnnounced = S.botElo;
  }
}

function offerTakebackFor(cls) {
  if (S.tier <= 2) return cls === 'mistake' || cls === 'blunder';
  if (S.tier === 3) return cls === 'blunder';
  return false;
}

function offerTakeback() {
  const gid = S.gid;
  S.phase = 'await-takeback';
  updateButtons();
  setStatus('Take that move back?');
  const el = addMsg({
    kind: 'prompt',
    title: 'Want to try that move again?',
    body: 'Taking back is one of the best ways to learn. (The original move still counts toward your rating, which keeps it honest.)',
    actions: [
      { label: '↩ Take it back', primary: true, run: () => takeBack() },
      {
        label: 'Keep playing',
        run: () => {
          if (gid === S.gid && S.phase === 'await-takeback') botTurn();
        },
      },
    ],
  });
  el.dataset.gid = gid;
}

function takeBack() {
  if (S.phase === 'await-takeback') {
    S.chess.undo();
    S.records.pop();
  } else if (S.phase === 'player' && S.viewPly == null) {
    if (!S.records.some((r) => r.by === 'player')) return;
    while (S.records.length) {
      const r = S.records.pop();
      S.chess.undo();
      if (r.by === 'player') break;
    }
  } else return;
  disableOldActions();
  S.takebacks++;
  S.retry = true;
  S.pendingBot = null;
  cg.setAutoShapes([]);
  updateOpening();
  addMsg({ kind: 'info', title: 'Move taken back', body: 'Have another look. What does your opponent threaten? Which of your pieces are unprotected?' });
  renderMoves();
  startPlayerTurn();
}

function endGame(how) {
  if (S.phase === 'over') return;
  S.gid++; // cancels any pending async work for this game
  const ch = S.chess;
  let result;
  let reason;
  if (how === 'resign') {
    result = S.me === 'w' ? '0-1' : '1-0';
    reason = 'You resigned';
  } else if (ch.isCheckmate()) {
    result = ch.turn() === 'w' ? '0-1' : '1-0';
    reason = 'Checkmate';
  } else {
    result = '1/2-1/2';
    reason = ch.isStalemate()
      ? 'Stalemate'
      : ch.isThreefoldRepetition()
        ? 'Draw by repetition'
        : ch.isInsufficientMaterial()
          ? 'Draw — not enough pieces left to checkmate'
          : 'Draw by the 50-move rule';
  }
  const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (S.me === 'w') ? 1 : 0;
  S.phase = 'over';
  S.result = { result, reason, score };
  syncBoard();
  updateButtons();
  setStatus(`${score === 1 ? 'You won' : score === 0 ? 'You lost' : 'Draw'} — ${reason}`);
  const change = saveGame(result, score);
  renderAll();
  showGameOver(reason, score, change);
}

function saveGame(result, score) {
  if (S.saved || S.playerMoves.length < 3) return null;
  S.saved = true;
  const summary = Coach.gameSummary(S.playerMoves);
  const before = S.overall;
  const botEst = R.estimate(S.botRated, S.botElo, 5);
  const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  S.archivePromise = archiveGame(id, result, score === null ? null : result);
  S.profile.games.push({
    id,
    source: 'play',
    date: new Date().toISOString(),
    result,
    score,
    color: S.me,
    n: S.rated.n,
    S: Math.round(S.rated.S),
    Q: Math.round(S.rated.Q),
    perf: S.rated.n ? S.gameEst.mean : null,
    acc: S.accs.length ? Math.round(S.accs.reduce((a, b) => a + b, 0) / S.accs.length) : null,
    moves: S.playerMoves.length,
    botElo: S.botElo,
    botPerf: S.botRated.n >= 5 ? botEst.mean : null,
    counts: summary.counts,
    tags: summary.tagCounts,
    opening: S.opening?.name || null,
    takebacks: S.takebacks,
  });
  if (S.profile.games.length > 300) S.profile.games.splice(0, S.profile.games.length - 300);
  Store.save(S.profile);
  S.overall = R.overallFromGames(S.profile.games);
  return { before, after: S.overall, summary, botEst: S.botRated.n >= 5 ? botEst : null };
}

/** Stores the full game (every move graded and explained) for the Review screen. */
async function archiveGame(id, result) {
  const moves = S.chess.history({ verbose: true });
  if (!moves.length) return null;
  const me = S.me;
  const reason = S.result?.reason || (result === 'unfinished' ? 'Unfinished' : '');
  const botElo = S.botElo;
  const tier = S.tier;
  const prior = S.overall.mean;
  try {
    const analyses = await analysePositions(moves, engine);
    const record = buildGameRecord({
      moves,
      analyses,
      userColor: me,
      white: me === 'w' ? 'You' : `Coach Bot (${botElo})`,
      black: me === 'b' ? 'You' : `Coach Bot (${botElo})`,
      result: result === 'unfinished' ? '*' : result,
      reason,
      source: 'play',
      tier,
      priorElo: prior,
      extra: { id, botElo },
    });
    Store.addGame(record);
    return id;
  } catch (e) {
    console.warn('Could not archive game', e);
    return null;
  }
}

/** Adds an imported game to your rating history. */
function addImportedGame(record) {
  const tags = {};
  for (const r of record.moves) {
    if (r.color !== record.userColor || !['mistake', 'blunder'].includes(r.cls)) continue;
    for (const t of r.tags || []) tags[t] = (tags[t] || 0) + 1;
  }
  const counts = {};
  for (const r of record.moves) if (r.color === record.userColor) counts[r.cls] = (counts[r.cls] || 0) + 1;
  S.profile.games.push({
    id: record.id,
    source: 'import',
    date: record.date,
    result: record.result,
    score: record.userScore,
    color: record.userColor,
    n: record.n,
    S: record.S,
    Q: record.Q,
    perf: record.perf,
    acc: record.acc,
    moves: record.moves.filter((r) => r.color === record.userColor).length,
    botElo: null,
    counts,
    tags,
    opening: record.opening,
  });
  Store.save(S.profile);
  S.overall = R.overallFromGames(S.profile.games);
  S.tier = R.tierFor(S.overall.mean, S.tier);
  renderRating();
}

function onStoreChange() {
  S.profile = Store.load();
  S.overall = R.overallFromGames(S.profile.games);
  if (!inProgress()) {
    S.gameEst = R.estimate(S.rated, S.overall.mean);
    S.tier = R.tierFor(S.overall.mean, S.tier);
  }
  applyDisplaySettings();
  renderRating();
  if (!$('view-progress').hidden) renderProgress();
}

// ---------------------------------------------------------------- navigation

const VIEWS = ['play', 'review', 'learn', 'progress'];
function hashView() {
  const h = (location.hash || '').slice(1);
  return VIEWS.includes(h) ? h : 'play';
}

function showView(name, keepSub = false) {
  if (!VIEWS.includes(name)) name = 'play';
  const already = !$(`view-${name}`).hidden;
  for (const v of VIEWS) {
    const leaving = v !== name && !$(`view-${v}`).hidden;
    if (leaving && v === 'play') cg.setAutoShapes([]);
    if (leaving && v === 'review') reviewHidden();
    if (leaving && v === 'learn') learnHidden();
    $(`view-${v}`).hidden = v !== name;
  }
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.view === name;
    t.classList.toggle('active', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  if (location.hash.slice(1) !== name) {
    try {
      history.replaceState(null, '', `#${name}`);
    } catch {
      /* some embedded viewers disallow it */
    }
  }
  if (name === 'play') refresh(cg);
  else if (name === 'review') reviewShown();
  else if (name === 'learn' && !keepSub) (already ? learnHome() : learnShown());
  else if (name === 'progress') renderProgress();
}

// ---------------------------------------------------------------- coach actions

function onHint() {
  if (S.phase !== 'player' || S.viewPly != null) return;
  const fen = S.chess.fen();
  const gid = S.gid;
  S.hintLevel = Math.min(3, S.hintLevel + 1);
  const level = S.hintLevel;
  if (level >= 2) S.assisted = true;
  engine.analyze(fen).then((a0) => {
    if (gid !== S.gid || S.chess.fen() !== fen) return;
    const h = Coach.hintFor(level, { chess: S.chess, a0 });
    addMsg({ kind: 'chance', kicker: `Hint ${level} of 3`, body: h.text.replace(/^Hint: /, ''), note: level >= 2 ? 'This move will be marked as assisted (not rated).' : null });
    const shapes = [...(h.arrows || []), ...(h.squares || []).map((sq) => ({ orig: sq, brush: 'green' }))];
    if (shapes.length) cg.setAutoShapes(shapes);
  });
}

async function askPromotion() {
  const dlg = $('dlg-promo');
  return new Promise((resolve) => {
    const done = (p) => {
      dlg.querySelectorAll('.promo').forEach((b) => (b.onclick = null));
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(p);
    };
    dlg.querySelectorAll('.promo').forEach((b) => (b.onclick = () => done(b.dataset.piece)));
    dlg.onclose = () => done('q');
    dlg.showModal();
  });
}

// ---------------------------------------------------------------- rendering

function syncBoard() {
  const live = S.viewPly == null;
  const rec = live ? S.records[S.records.length - 1] : S.records[S.viewPly];
  const ch = live ? S.chess : new Chess(rec.move.after);
  const turn = ch.turn() === 'w' ? 'white' : 'black';
  const canMove = live && S.phase === 'player';
  const dests = new Map();
  if (canMove) {
    for (const m of ch.moves({ verbose: true })) {
      if (!dests.has(m.from)) dests.set(m.from, []);
      dests.get(m.from).push(m.to);
    }
  }
  cg.set({
    fen: ch.fen(),
    turnColor: turn,
    check: ch.inCheck() ? turn : false,
    lastMove: rec ? [rec.move.from, rec.move.to] : undefined,
    movable: { color: canMove ? turn : undefined, dests },
  });
}

function setEval(score, stm) {
  if (!score) return;
  const white = stm === 'w' ? score : R.negateScore(score);
  const pct = R.winFromScore(white);
  const bar = $('evalbar');
  bar.querySelector('.fill').style.height = `${pct}%`;
  bar.querySelector('.label').textContent = R.formatEval(white).replace('+', '');
  bar.classList.toggle('black-better', pct < 50);
}

function setStatus(text, thinking = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('thinking', thinking);
}

function updateButtons() {
  const live = S.viewPly == null;
  $('btn-hint').disabled = !(S.phase === 'player' && live);
  $('btn-undo').disabled = !(
    live &&
    (S.phase === 'await-takeback' || (S.phase === 'player' && S.records.some((r) => r.by === 'player')))
  );
  $('btn-resign').disabled = !inProgress();
}

function applyDisplaySettings() {
  $('evalbar').classList.toggle('hidden', !S.profile.settings.evalBar);
}

function renderAll() {
  renderRating();
  renderMoves();
  updateButtons();
}

function renderRating() {
  const g = S.gameEst;
  const o = S.overall;
  const hasMoves = S.rated.n > 0;
  $('rating-label').textContent = hasMoves ? 'You’re playing at (this game)' : o.games ? 'Your rating estimate' : 'Starting estimate';
  $('rating-now').textContent = hasMoves ? `≈ ${g.mean}` : o.games ? `≈ ${o.mean}` : '≈ 600';
  $('rating-range').textContent = hasMoves
    ? `likely ${g.lo}–${g.hi} · ${S.rated.n} rated move${S.rated.n === 1 ? '' : 's'}`
    : o.games
      ? `likely ${o.lo}–${o.hi}`
      : 'make a move to get rated';
  const last = [...S.playerMoves].reverse().find((r) => r.rated);
  const d = $('rating-delta');
  if (last && hasMoves) {
    d.textContent = last.delta > 0 ? `▲ +${last.delta}` : last.delta < 0 ? `▼ ${last.delta}` : '± 0';
    d.className = `delta ${last.delta > 0 ? 'up' : last.delta < 0 ? 'down' : ''}`;
  } else {
    d.textContent = '';
    d.className = 'delta';
  }
  $('rating-overall').textContent = o.games ? `Overall ≈ ${o.mean} (${o.games} game${o.games === 1 ? '' : 's'})` : 'Overall: no rated games yet';
  $('coach-mode').textContent = `Coach mode: ${R.tierInfo(S.tier).name}`;
  $('coach-mode').title = R.tierInfo(S.tier).blurb;
  $('opp-elo').textContent = `≈ ${S.botElo}${S.profile.settings.opponent === 'adaptive' ? ' · adaptive' : ''}`;
  $('you-elo').textContent = hasMoves ? `≈ ${g.mean}` : o.games ? `≈ ${o.mean}` : 'new';
  renderSpark();
}

function renderSpark() {
  const svg = $('spark');
  const pts = S.timeline;
  if (pts.length < 2) {
    svg.innerHTML = '';
    return;
  }
  const W = 300;
  const H = 52;
  const lo = Math.min(...pts.map((p) => p.lo));
  const hi = Math.max(...pts.map((p) => p.hi));
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - 3 - ((v - lo) / Math.max(1, hi - lo)) * (H - 6);
  const band = pts.map((p, i) => `${x(i)},${y(p.hi)}`).join(' ') + ' ' + pts.map((p, i) => `${x(i)},${y(p.lo)}`).reverse().join(' ');
  const line = pts.map((p, i) => `${x(i)},${y(p.mean)}`).join(' ');
  svg.innerHTML = `<polygon class="band" points="${band}"/><polyline class="line" points="${line}"/>`;
}

function renderMoves() {
  const ol = $('movelist');
  ol.innerHTML = '';
  if (!S.records.length) {
    ol.innerHTML = '<li><span class="empty">No moves yet.</span></li>';
    return;
  }
  const startsBlack = S.records[0].move.color === 'b';
  let li = null;
  S.records.forEach((r, i) => {
    const white = r.move.color === 'w';
    if (white || i === 0) {
      li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = `${Math.floor((i + (startsBlack ? 1 : 0)) / 2) + 1}.`;
      li.appendChild(num);
      if (!white) {
        const pad = document.createElement('span');
        pad.textContent = '…';
        pad.className = 'muted';
        li.appendChild(pad);
      }
      ol.appendChild(li);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `mv${S.viewPly === i ? ' active' : ''}`;
    const tone = r.by === 'player' && r.cls ? R.CLASSES[r.cls].tone : '';
    b.innerHTML = `<span class="dot ${tone ? `tone-${tone}` : ''}"></span>${esc(r.move.san)}`;
    if (r.by === 'player' && r.cls) b.title = R.CLASSES[r.cls].label;
    b.addEventListener('click', () => setView(i));
    li.appendChild(b);
  });
  const active = ol.querySelector('.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
  else ol.scrollTop = ol.scrollHeight;
}

function showFeedback(rec) {
  const c = R.CLASSES[rec.cls];
  const ex = rec.ex;
  const meta = [];
  meta.push(`<span class="badge tone-${c.tone}">${c.symbol} ${c.label}</span>`);
  meta.push(`<span>${esc(moveLabel(rec))}</span>`);
  if (rec.rated && ['good', 'inaccuracy', 'mistake', 'blunder'].includes(rec.cls))
    meta.push(`<span title="A move this accurate is typical of players around this rating">move level ≈ ${rec.level >= 2200 ? '2200+' : rec.level}</span>`);
  if (rec.rated && rec.delta) meta.push(`<span class="delta ${rec.delta > 0 ? 'up' : 'down'}">rating ${rec.delta > 0 ? '▲ +' : '▼ '}${rec.delta}</span>`);
  let html = `<div class="meta">${meta.join('')}</div><div class="title">${esc(ex.headline)}</div>`;
  if (ex.text) html += `<p>${esc(ex.text)}</p>`;
  if (ex.better) html += `<p class="better">${esc(ex.better)}</p>`;
  if (ex.lesson) html += `<p class="lesson"><span class="kicker">Remember</span>${esc(ex.lesson)}</p>`;
  if (rec.assisted) html += `<p class="note">Assisted move — not counted toward your rating.</p>`;
  else if (rec.excluded && !rec.forced) html += `<p class="note">The game is already decided here, so this move isn’t rated.</p>`;
  addMsg({ kind: `move cls-${rec.cls}`, html });
}

function moveLabel(rec) {
  const fullmove = parseInt(rec.move.before.split(' ')[5], 10);
  return `${fullmove}${rec.move.color === 'w' ? '.' : '...'}${rec.move.san}`;
}

function addMsg({ kind, kicker, title, body, html, note, actions }) {
  const feed = $('feed');
  const el = document.createElement('div');
  el.className = `msg ${kind}`;
  if (html) el.innerHTML = html;
  else {
    if (kicker) el.insertAdjacentHTML('beforeend', `<div class="kicker">${esc(kicker)}</div>`);
    if (title) el.insertAdjacentHTML('beforeend', `<div class="title">${esc(title)}</div>`);
    if (body) el.insertAdjacentHTML('beforeend', `<p>${esc(body)}</p>`);
    if (note) el.insertAdjacentHTML('beforeend', `<p class="note">${esc(note)}</p>`);
  }
  if (actions) {
    const row = document.createElement('div');
    row.className = 'actions';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn small${a.primary ? ' primary' : ''}`;
      b.textContent = a.label;
      b.addEventListener('click', () => {
        row.querySelectorAll('button').forEach((x) => (x.disabled = true));
        a.run();
      });
      row.appendChild(b);
    }
    el.appendChild(row);
  }
  feed.prepend(el);
  while (feed.children.length > 80) feed.lastElementChild.remove();
  feed.scrollTop = 0;
  return el;
}

function disableOldActions() {
  $('feed')
    .querySelectorAll('.actions button')
    .forEach((b) => (b.disabled = true));
}

function updateOpening() {
  const sans = S.records.map((r) => r.move.san);
  const op = sans.length ? detectOpening(sans) : null;
  const generic = op && (op.moves.length < 2 || /Pawn (Opening|Game)$|^Indian Defense$/.test(op.name));
  if (op && !generic && op.name !== S.opening?.name && sans.length <= 14) {
    addMsg({ kind: 'tip', kicker: 'Opening', title: op.name, body: op.idea });
  }
  if (op || sans.length === 0) S.opening = op;
  $('opening').textContent = S.opening ? S.opening.name : '';
}

// ---------------------------------------------------------------- review mode

function setView(i) {
  if (i != null && (i < 0 || i >= S.records.length)) return;
  if (i === S.records.length - 1 && S.phase !== 'over') i = null;
  S.viewPly = i;
  const box = $('review');
  if (i == null) {
    box.hidden = true;
    syncBoard();
    cg.setAutoShapes([]);
  } else {
    const r = S.records[i];
    box.hidden = false;
    $('review-label').textContent = moveLabel(r);
    const note = $('review-note');
    if (r.by === 'player' && r.ex) {
      const c = R.CLASSES[r.cls];
      note.innerHTML = `<span class="badge tone-${c.tone}">${c.symbol} ${c.label}</span> <b>${esc(r.ex.headline)}</b> ${esc(r.ex.text || '')} ${r.ex.better ? `<br><b>${esc(r.ex.better)}</b>` : ''}`;
      syncBoard();
      cg.setAutoShapes(r.ex.arrows || []);
    } else {
      note.textContent = r.by === 'bot' ? `Coach Bot played ${r.move.san}.` : '';
      syncBoard();
      cg.setAutoShapes([]);
    }
  }
  renderMoves();
  updateButtons();
}

function stepView(delta) {
  if (!S.records.length) return;
  const cur = S.viewPly == null ? S.records.length - 1 : S.viewPly;
  const next = cur + delta;
  if (next < 0) return;
  if (next >= S.records.length - 1 && S.phase !== 'over') return setView(null);
  if (next >= S.records.length) return;
  setView(next);
}

// ---------------------------------------------------------------- dialogs

/** In-page replacement for confirm(), which embedded viewers block. */
function askConfirm(title, text, okLabel) {
  const dlg = $('dlg-confirm');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-ok').textContent = okLabel;
  return new Promise((resolve) => {
    dlg.onclose = () => {
      dlg.onclose = null;
      resolve(dlg.returnValue === 'ok');
    };
    dlg.returnValue = '';
    dlg.showModal();
  });
}

function showGameOver(reason, score, change) {
  const title = score === 1 ? '🎉 You won!' : score === 0 ? 'You lost — but you learned something' : 'Draw';
  const g = S.gameEst;
  const acc = S.accs.length ? Math.round(S.accs.reduce((a, b) => a + b, 0) / S.accs.length) : null;
  const summary = change?.summary || Coach.gameSummary(S.playerMoves);
  const order = ['great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const chips = order
    .filter((k) => summary.counts[k])
    .map((k) => `<span class="badge tone-${R.CLASSES[k].tone}">${R.CLASSES[k].symbol} ${summary.counts[k]} ${R.CLASSES[k].label}</span>`)
    .join('');
  const top = summary.top[0];
  const lesson = top
    ? `<div class="lesson-box"><b>Work on this next: ${esc(top.title)}</b><p>${esc(top.tip)}</p></div>`
    : `<div class="lesson-box"><b>No big mistakes this game!</b><p>Keep scanning for checks, captures and threats every move.</p></div>`;
  const overallTxt = change
    ? `${change.before.games ? change.before.mean : '—'} → ${change.after.mean}`
    : `${S.overall.mean}`;
  $('over-body').innerHTML = `
    <p class="result-title">${title}</p>
    <p class="muted">${esc(reason)} · ${S.playerMoves.length} moves by you</p>
    <div class="stats">
      <div class="stat"><b>${S.rated.n ? `≈ ${g.mean}` : '—'}</b><span>Level this game${S.rated.n ? ` (${g.lo}–${g.hi})` : ''}</span></div>
      <div class="stat"><b>${acc != null ? acc + '%' : '—'}</b><span>Accuracy</span></div>
      <div class="stat"><b>${overallTxt}</b><span>Overall rating</span></div>
    </div>
    <div class="chips">${chips}</div>
    ${lesson}
    <p class="muted small">${change?.botEst ? `Coach Bot was set to ≈ ${S.botElo} and actually played at ≈ ${change.botEst.mean} this game. ` : ''}${
      S.playerMoves.length < 3 ? 'Games with fewer than 3 moves aren’t saved.' : `Based on ${S.rated.n} rated moves.`
    }</p>`;
  $('dlg-over').showModal();
}

function openSettings() {
  const st = S.profile.settings;
  const f = $('settings-form');
  f.playAs.value = st.playAs;
  f.opponent.value = st.opponent;
  f.challenge.value = String(st.challenge);
  f.fixedElo.value = st.fixedElo;
  $('fixedEloOut').textContent = st.fixedElo;
  f.warnings.value = st.warnings;
  f.evalBar.checked = st.evalBar;
  f.explainOpponent.checked = st.explainOpponent !== false;
  $('dlg-settings').showModal();
}

function saveSettings() {
  const f = $('settings-form');
  const st = S.profile.settings;
  st.playAs = f.playAs.value;
  st.opponent = f.opponent.value;
  st.challenge = Number(f.challenge.value);
  st.fixedElo = Number(f.fixedElo.value);
  st.warnings = f.warnings.value;
  st.evalBar = f.evalBar.checked;
  st.explainOpponent = f.explainOpponent.checked;
  Store.save(S.profile);
  applyDisplaySettings();
  S.botElo = computeBotElo();
  S.botAnnounced = S.botElo;
  renderRating();
}

function renderProgress() {
  const games = S.profile.games;
  const o = S.overall;
  const body = $('progress-body');
  const doneLessons = LESSONS.filter((l) => S.profile.lessons?.[l.id]?.done).length;
  const storage = Store.status.cloud
    ? 'Saved privately to your Claude account — it follows you between devices.'
    : 'Saved in this browser.';
  if (!games.length) {
    body.innerHTML = `<h1 class="page-title">Your progress</h1>
      <p class="muted">Finish a game (3+ moves) or import one, and your rating history, accuracy and the things to work on will show up here.</p>
      <p class="muted small">${esc(storage)} Lessons completed: ${doneLessons} of ${LESSONS.length}.</p>${howItWorks()}`;
    return;
  }
  const wins = games.filter((g) => g.score === 1).length;
  const losses = games.filter((g) => g.score === 0).length;
  const draws = games.filter((g) => g.score === 0.5).length;
  const history = games.map((_, i) => R.overallFromGames(games.slice(0, i + 1)));
  const tagTotals = {};
  for (const g of games.slice(-15)) for (const [t, c] of Object.entries(g.tags || {})) tagTotals[t] = (tagTotals[t] || 0) + c;
  const weakTags = Object.entries(tagTotals).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const weak = weakTags
    .map(([t, c]) => {
      const l = lessonsForTags({ [t]: 1 })[0];
      return `<li><b>${esc(Coach.LESSONS[t]?.title || t)}</b> (${c}× recently)<br><span class="muted">${esc(Coach.LESSONS[t]?.tip || '')}</span>${
        l ? `<br><button type="button" class="btn small" data-lesson="${esc(l.id)}">Lesson: ${esc(l.title)} →</button>` : ''
      }</li>`;
    })
    .join('');
  const archived = new Set(Store.games().map((g) => g.id));
  const rows = games
    .slice(-12)
    .reverse()
    .map(
      (g) => `<tr><td>${new Date(g.date).toLocaleDateString()}</td><td>${g.source === 'import' ? 'Imported' : `vs ${g.botElo}`}</td><td>${g.color === 'w' ? 'White' : 'Black'}</td><td>${
        g.score === 1 ? 'Win' : g.score === 0 ? 'Loss' : g.score === 0.5 ? 'Draw' : 'Unfinished'
      }</td><td>${g.perf ?? '—'}</td><td>${g.acc != null ? g.acc + '%' : '—'}</td><td>${
        g.id && archived.has(g.id) ? `<button type="button" class="btn small" data-review="${esc(g.id)}">Review</button>` : ''
      }</td></tr>`,
    )
    .join('');
  body.innerHTML = `
    <h1 class="page-title">Your progress</h1>
    <div class="stats">
      <div class="stat"><b>≈ ${o.mean}</b><span>Rating (likely ${o.lo}–${o.hi})</span></div>
      <div class="stat"><b>${games.length}</b><span>Games · ${wins}W ${losses}L ${draws}D</span></div>
      <div class="stat"><b>${doneLessons}/${LESSONS.length}</b><span>Lessons done · ${esc(R.tierInfo(S.tier).name)}</span></div>
    </div>
    <div class="card chart-card">${chartSvg(games, history)}
    <div class="legend"><span><i></i>Overall rating</span><span><i class="dot-l"></i>Level in each game</span></div></div>
    <h2 class="section-head">What to work on</h2>
    ${weak ? `<ol class="weak-list">${weak}</ol>` : '<p class="muted">No repeated mistakes recently — nice.</p>'}
    <p><button type="button" class="btn" id="pg-mistakes">Practise positions from your mistakes</button></p>
    <h2 class="section-head">Recent games</h2>
    <div class="table-wrap"><table class="games"><thead><tr><th>Date</th><th>Opponent</th><th>Side</th><th>Result</th><th>Level</th><th>Accuracy</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small">${esc(storage)}</p>
    ${howItWorks()}`;
  body.querySelectorAll('[data-lesson]').forEach((b) => b.addEventListener('click', () => openLesson(b.dataset.lesson)));
  body.querySelectorAll('[data-review]').forEach((b) =>
    b.addEventListener('click', () => {
      showView('review');
      openReview(b.dataset.review);
    }),
  );
  $('pg-mistakes').addEventListener('click', () => openMistakes());
}

function chartSvg(games, history) {
  const W = 700;
  const H = 220;
  const pad = { l: 40, r: 10, t: 10, b: 22 };
  const perfs = games.map((g) => g.perf).filter((v) => v != null);
  const vals = [...history.map((h) => h.lo), ...history.map((h) => h.hi), ...perfs];
  let lo = Math.floor((Math.min(...vals) - 50) / 100) * 100;
  let hi = Math.ceil((Math.max(...vals) + 50) / 100) * 100;
  if (hi - lo < 300) hi = lo + 300;
  lo = Math.max(0, lo);
  const n = games.length;
  const x = (i) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  let grid = '';
  const step = hi - lo > 1200 ? 400 : hi - lo > 600 ? 200 : 100;
  for (let v = lo; v <= hi; v += step) grid += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const band = history.map((h, i) => `${x(i)},${y(h.hi)}`).join(' ') + ' ' + history.map((h, i) => `${x(i)},${y(h.lo)}`).reverse().join(' ');
  const line = history.map((h, i) => `${x(i)},${y(h.mean)}`).join(' ');
  const dots = games.map((g, i) => (g.perf != null ? `<circle class="perf" cx="${x(i)}" cy="${y(g.perf)}" r="3.5"><title>Game ${i + 1}: ≈${g.perf}</title></circle>` : '')).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rating history">${grid}${n > 1 ? `<polygon class="band" points="${band}"/>` : ''}<polyline class="overall" points="${line}"/>${dots}${
    n === 1 ? `<circle cx="${x(0)}" cy="${y(history[0].mean)}" r="4" fill="var(--accent)"/>` : ''
  }<text class="axis" x="${pad.l}" y="${H - 4}">first game</text><text class="axis" x="${W - pad.r}" y="${H - 4}" text-anchor="end">latest</text></svg>`;
}

function howItWorks() {
  return `<h2 class="section-head">How your rating is calculated</h2>
  <p class="muted small">After every move, Stockfish works out how much worse your move was than the best move (the “centipawn loss”). Stronger players lose fewer centipawns on average. Your estimate uses a common rule of thumb — rating ≈ 3100 × e<sup>−ACPL/100</sup> — inside a statistical model that also gives a likely range. A single game is noisy, so the range is wide at first and narrows as you play more. Recent games count more, so the number follows you as you improve. Moves made with a hint, right after a takeback, or after a specific coach warning don’t count. Treat it as a guide to your level (roughly comparable to online rapid ratings), not an official rating.</p>`;
}

// Exposed for debugging and automated tests.
window.__chessCoach = { state: S, engine, board: () => cg, store: Store };

init();
