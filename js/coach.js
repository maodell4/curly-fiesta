// The coach: turns engine numbers into plain-English advice for a beginner.

import { Chess } from '../vendor/chess.js';
import {
  VALUE,
  NAME,
  other,
  uciToMove,
  moveToUci,
  captureGain,
  hangingPieces,
  mateThreats,
  matesInOne,
  forkTargets,
  lineOutcome,
  sanOf,
  formatLine,
  material,
  gamePhase,
  undevelopedMinors,
  canStillCastle,
} from './tactics.js';
import { describeEval } from './rating.js';

export const LESSONS = {
  'hung-moved-piece': {
    title: 'Putting pieces where they can be taken',
    tip: 'Before you let go of a piece, look at its new square: can an enemy piece capture it? If so, is it protected — and is the attacker worth more than it?',
  },
  'ignored-threat': {
    title: "Missing your opponent's threats",
    tip: 'After every enemy move, ask: "What does that move attack?" Deal with threats before carrying on with your own plan.',
  },
  'removed-defender': {
    title: 'Moving a piece that was guarding another',
    tip: 'Before you move a piece, check what it was protecting. If it leaves, is that piece still safe?',
  },
  'missed-threat': {
    title: 'Loose pieces',
    tip: 'Every turn, check which of your pieces are unprotected. Loose pieces are easy targets.',
  },
  'allowed-mate': {
    title: 'King safety',
    tip: "Before each move, look at every check your opponent could give — especially near your king. Checks can turn into checkmate fast.",
  },
  'missed-mate': {
    title: 'Missing checkmates',
    tip: 'Start every turn by looking at all of your checks. Sometimes one of them is checkmate.',
  },
  'missed-capture': {
    title: 'Missing free material',
    tip: 'Look at every capture you can make, every turn. Winning free pieces is the fastest way to win games as a beginner.',
  },
  'allowed-fork': {
    title: 'Forks against you',
    tip: 'Watch for enemy knights and queens that could jump to a square attacking two of your pieces at once.',
  },
  'missed-fork': {
    title: 'Missing forks',
    tip: 'Look for moves that attack two things at once (two pieces, or the king and a piece). Knights are especially good at this.',
  },
  'allowed-tactic': {
    title: 'Tactics against you',
    tip: "Before you move, imagine your opponent's most forcing replies: checks, captures and threats.",
  },
  'opening-principles': {
    title: 'Opening principles',
    tip: "In the opening: control the centre, develop knights and bishops, castle early, and don't move the same piece twice without a good reason.",
  },
  positional: {
    title: 'Piece activity',
    tip: 'When nothing tactical is happening, find your least active piece and give it a better square.',
  },
  stalemate: {
    title: 'Stalemate',
    tip: "When you're winning, make sure the enemy king always has a legal move — unless you are giving checkmate. No legal moves and no check is a draw.",
  },
};

const pieceWord = (t) => NAME[t];

function materialWords(pawns) {
  const v = Math.round(Math.abs(pawns));
  if (v >= 9) return 'about a queen’s worth of material';
  if (v >= 5) return 'about a rook’s worth of material';
  if (v >= 3) return 'about a piece (3 pawns’ worth)';
  if (v === 2) return 'about two pawns’ worth of material';
  return 'a pawn';
}

function listNames(pieces) {
  const names = pieces.map((p) => `${pieceWord(p.type)} on ${p.square}`);
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function lineSans(fen, pv, plies) {
  const c = new Chess(fen);
  const out = [];
  for (const u of pv.slice(0, plies)) {
    try {
      out.push(c.move(uciToMove(u)).san);
    } catch {
      break;
    }
  }
  return out;
}

const HOME_RANK = { w: '1', b: '8' };
const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);

/**
 * What a move accomplishes, in a few words ("wins a free knight", "castles to safety").
 * Returns {text, tag} or null if nothing stands out.
 */
export function moveIdea(fen, uci) {
  const pre = new Chess(fen);
  const me = pre.turn();
  const opp = other(me);
  const post = new Chess(fen);
  let m;
  try {
    m = post.move(uciToMove(uci));
  } catch {
    return null;
  }
  if (post.isCheckmate()) return { text: 'is checkmate', tag: 'mate' };

  if (!pre.inCheck() && mateThreats(pre).length && !matesInOne(post).length)
    return { text: 'stops your opponent’s checkmate threat', tag: 'stopmate' };

  if (m.captured) {
    const defended = pre.attackers(m.to, opp).length > 0;
    if (!defended) return { text: `wins a free ${pieceWord(m.captured)}`, tag: 'win' };
    if (VALUE[m.captured] > VALUE[m.piece])
      return { text: `wins material — your ${pieceWord(m.piece)} takes a more valuable ${pieceWord(m.captured)}`, tag: 'win' };
  }

  const targets = forkTargets(post, m.to);
  if (targets.length >= 2 && captureGain(post, m.to, opp) === 0)
    return { text: `attacks the ${listNames(targets)} at the same time (a fork)`, tag: 'fork' };

  const before = hangingPieces(pre, me);
  if (before.length) {
    const after = hangingPieces(post, me);
    const top = before[0];
    const stillLoose = after.some((h) => h.square === top.square || (m.from === top.square && h.square === m.to));
    if (!stillLoose) return { text: `saves your ${pieceWord(top.type)} that was under attack`, tag: 'save' };
  }

  if (m.promotion) return { text: `promotes your pawn to a ${pieceWord(m.promotion)}`, tag: 'promote' };
  if (m.isKingsideCastle() || m.isQueensideCastle()) return { text: 'castles your king to safety and activates a rook', tag: 'castle' };
  if (m.captured && VALUE[m.captured] === VALUE[m.piece]) return { text: `trades ${pieceWord(m.piece)}s evenly`, tag: 'trade' };
  if (m.san.includes('+')) return { text: 'gives check', tag: 'check' };
  const phase = gamePhase(pre);
  if (phase === 'opening' && (m.piece === 'n' || m.piece === 'b') && m.from[1] === HOME_RANK[me])
    return { text: `develops your ${pieceWord(m.piece)} toward the centre`, tag: 'develop' };
  if (phase === 'opening' && m.piece === 'p' && CENTER.has(m.to)) return { text: 'claims space in the centre', tag: 'center' };
  if (m.captured) return { text: `captures a ${pieceWord(m.captured)}`, tag: 'capture' };
  return null;
}

function openingPrinciple(move, history) {
  const before = new Chess(move.before);
  if (gamePhase(before) !== 'opening') return null;
  const me = move.color;
  const undeveloped = undevelopedMinors(before, me).length;
  if (move.piece === 'k' && !move.isKingsideCastle() && !move.isQueensideCastle())
    return {
      headline: 'Moving your king this early gives up castling.',
      text: 'In the opening, keep your king safe by castling instead of walking it around.',
    };
  if (move.piece === 'q' && undeveloped >= 2)
    return {
      headline: 'Bringing your queen out early is risky.',
      text: 'Your opponent can attack the queen while developing their own pieces, gaining time. Develop knights and bishops first.',
    };
  const mine = history.filter((h) => h.color === me);
  if (!move.captured && undeveloped >= 2 && mine.some((h) => h.to === move.from) && move.piece !== 'p')
    return {
      headline: 'You moved the same piece twice.',
      text: 'In the opening, try to bring a new piece into the game with each move.',
    };
  if (move.piece === 'n' && (move.to[0] === 'a' || move.to[0] === 'h'))
    return {
      headline: 'A knight on the edge controls fewer squares.',
      text: '"A knight on the rim is dim" — knights are strongest near the centre.',
    };
  if (move.piece === 'p' && ['f', 'g', 'h'].includes(move.from[0]) && canStillCastle(before, me))
    return {
      headline: 'Pawn moves near your king can weaken it.',
      text: 'Those pawns are your king’s shelter. Develop pieces instead.',
    };
  if (move.piece === 'p' && ['a', 'b', 'g', 'h'].includes(move.from[0]) && undeveloped >= 2)
    return {
      headline: 'Edge pawn moves don’t help your development.',
      text: 'Bring out your knights and bishops first — they need to join the fight.',
    };
  return null;
}

/**
 * Explains the player's move.
 * @returns {{headline, text, better, lesson, tags, arrows}}
 */
export function explainPlayerMove({ move, a0, a1, cls, evalAfterCp, tier, history = [] }) {
  const me = move.color;
  const opp = other(me);
  const before = new Chess(move.before);
  const after = new Chess(move.after);
  const uci = moveToUci(move);
  const best = a0?.lines?.[0];
  const bestSan = best ? sanOf(move.before, best.uci) : null;
  const out = { headline: '', text: '', better: null, lesson: null, tags: [], arrows: [] };
  const arrow = (fen, u, brush) => {
    const m = uciToMove(u);
    out.arrows.push({ orig: m.from, dest: m.to, brush });
  };

  if (after.isCheckmate()) {
    out.headline = 'Checkmate! You won the game.';
    out.text = 'Your opponent’s king is attacked and has no escape.';
    return out;
  }

  const goodClasses = ['great', 'best', 'excellent', 'good', 'forced'];
  if (goodClasses.includes(cls)) {
    const idea = moveIdea(move.before, uci);
    out.headline = {
      great: 'Great find! This was the only good move.',
      best: 'Best move!',
      excellent: 'Excellent move.',
      good: 'Good move.',
      forced: 'Your only legal move.',
    }[cls];
    if (idea) out.text = `${move.san} ${idea.text}.`;
    else if (cls === 'best') out.text = 'That’s exactly what the engine would play.';
    if (cls === 'good' && best && best.uci !== uci) {
      const bi = moveIdea(move.before, best.uci);
      out.better = `${bestSan} was a little stronger${bi ? ` — it ${bi.text}` : ''}.`;
    }
    return out;
  }

  // ---- Inaccuracies, mistakes and blunders: find the reason. ----
  if (after.isStalemate()) {
    out.headline = 'Stalemate — the game is a draw.';
    out.text = 'Your opponent has no legal moves but isn’t in check, so it’s a draw instead of a win.';
    out.tags.push('stalemate');
  } else if (after.isDraw()) {
    out.headline = 'This lets the game end in a draw.';
    out.text = 'You were better — avoid repeating moves when you’re winning.';
    out.tags.push('positional');
  }

  const reply = a1?.lines?.[0];
  const replySan = reply ? sanOf(move.after, reply.uci) : null;

  if (out.tags.length) {
    // already explained (draw)
  } else if (reply && reply.score.mate != null && reply.score.mate > 0) {
    const n = reply.score.mate;
    const sans = lineSans(move.after, reply.pv, n * 2 - 1);
    out.headline = n === 1 ? 'This allows checkmate in one!' : `This allows a forced checkmate in ${n}!`;
    out.text = `Your opponent can play ${formatLine(move.after, sans)}.`;
    out.tags.push('allowed-mate');
    arrow(move.after, reply.uci, 'red');
  } else if (best && best.score.mate != null && best.score.mate > 0 && best.uci !== uci) {
    const n = best.score.mate;
    out.headline = n === 1 ? `You missed checkmate in one: ${bestSan}!` : `You had a forced checkmate in ${n}, starting with ${bestSan}.`;
    if (n > 1) out.text = `The full line: ${formatLine(move.before, lineSans(move.before, best.pv, n * 2 - 1))}.`;
    out.tags.push('missed-mate');
    arrow(move.before, best.uci, 'green');
  } else {
    const replyOutcome = reply ? lineOutcome(move.after, reply.pv, me) : null;
    const bestOutcome = best ? lineOutcome(move.before, best.pv, me) : null;
    const lostVsBefore = replyOutcome ? material(before, me) - replyOutcome.end : 0;

    if (replyOutcome && replyOutcome.change <= -1 && lostVsBefore >= 1) {
      const p1 = new Chess(move.after);
      const rm = p1.move(uciToMove(reply.uci));
      const line = formatLine(move.after, replyOutcome.sans.slice(0, 5));
      if (rm.captured) {
        const capSq = rm.to;
        if (capSq === move.to) {
          const movedType = after.get(move.to)?.type || move.piece;
          const defended = after.attackers(move.to, me).length > 0;
          out.headline = `Your ${pieceWord(movedType)} on ${move.to} isn’t safe there.`;
          out.text = defended
            ? `It is protected, but it’s attacked by a cheaper piece, so you lose material after ${line}.`
            : `Nothing protects it, so your opponent can simply take it with ${replySan}.`;
          out.tags.push('hung-moved-piece');
        } else if (captureGain(before, capSq, opp) > 0) {
          out.headline = `Your ${pieceWord(rm.captured)} on ${capSq} was under attack.`;
          out.text = `You didn’t move it or protect it, so your opponent can take it: ${line}.`;
          out.tags.push('ignored-threat');
        } else if (before.attackers(capSq, me).includes(move.from)) {
          out.headline = `This leaves your ${pieceWord(rm.captured)} on ${capSq} unprotected.`;
          out.text = `Your ${pieceWord(move.piece)} on ${move.from} was guarding it. Now your opponent wins it: ${line}.`;
          out.tags.push('removed-defender');
        } else {
          out.headline = 'This lets your opponent win material.';
          out.text = `After ${line}, you come out ${materialWords(lostVsBefore)} down.`;
          out.tags.push('allowed-tactic');
        }
      } else {
        const targets = forkTargets(p1, rm.to);
        if (targets.length >= 2) {
          out.headline = `This allows a fork: ${replySan}.`;
          out.text = `Your opponent’s ${pieceWord(rm.piece)} would attack your ${listNames(targets)} at the same time — you can’t save everything.`;
          out.tags.push('allowed-fork');
        } else {
          out.headline = 'This lets your opponent win material.';
          out.text = `After ${line}, you come out ${materialWords(lostVsBefore)} down.`;
          out.tags.push('allowed-tactic');
        }
      }
      arrow(move.after, reply.uci, 'red');
    } else if (best && best.uci !== uci && bestOutcome && bestOutcome.change >= 1) {
      const bm = new Chess(move.before).move(uciToMove(best.uci));
      const targets = forkTargets(new Chess(bm.after), bm.to);
      if (bm.captured && before.attackers(bm.to, opp).length === 0) {
        out.headline = `You missed a free ${pieceWord(bm.captured)}!`;
        out.text = `${bestSan} would have captured it for nothing.`;
        out.tags.push('missed-capture');
      } else if (targets.length >= 2 && !bm.captured) {
        out.headline = `You missed a fork: ${bestSan}.`;
        out.text = `It attacks your opponent’s ${listNames(targets)} at once.`;
        out.tags.push('missed-fork');
      } else {
        out.headline = `You missed a way to win material: ${bestSan}.`;
        out.text = `After ${formatLine(move.before, bestOutcome.sans.slice(0, 5))}, you’d be ${materialWords(bestOutcome.change)} up.`;
        out.tags.push('missed-capture');
      }
      arrow(move.before, best.uci, 'green');
    } else {
      const pr = openingPrinciple(move, history);
      if (pr) {
        out.headline = pr.headline;
        out.text = pr.text;
        out.tags.push('opening-principles');
      } else {
        out.headline = cls === 'inaccuracy' ? 'Not the most accurate move.' : 'This makes your position noticeably worse.';
        out.text = describeEval(evalAfterCp);
        out.tags.push('positional');
      }
      if (best) arrow(move.before, best.uci, 'green');
    }
  }

  const explainedBest = out.tags.some((t) => ['missed-mate', 'missed-capture', 'missed-fork'].includes(t));
  if (best && best.uci !== uci && !explainedBest) {
    const bi = moveIdea(move.before, best.uci);
    out.better = `Better was ${bestSan}${bi ? ` — it ${bi.text}` : ''}.`;
  }
  if (tier <= 3 && out.tags.length && cls !== 'inaccuracy') out.lesson = LESSONS[out.tags[0]]?.tip || null;
  return out;
}

/**
 * Live tips shown before you move. How much the coach says depends on your level:
 * tier 1-2 get specific warnings, tier 3 only big dangers, tier 4-5 nothing unless asked.
 * Tips marked `specific` point at a concrete threat/opportunity, so the move you play
 * afterwards is treated as "assisted" and doesn't count toward your rating.
 */
export function preMoveTips({ chess, a0, tier, warnings = 'auto', prevMove, playerMoveCount = 0 }) {
  const level = warnings === 'always' ? 1 : warnings === 'off' ? 9 : tier;
  const tips = [];
  const me = chess.turn();
  const opp = other(me);

  if (chess.inCheck() && level <= 2) {
    tips.push({
      kind: 'danger',
      text: 'You’re in check! Get out of it by moving your king, blocking the attack, or capturing the attacking piece.',
      specific: false,
    });
  }

  if (level <= 3) {
    const mt = mateThreats(chess);
    if (mt.length) {
      tips.push({
        kind: 'danger',
        text:
          level === 1
            ? `Danger! Your opponent is threatening checkmate with ${mt[0].san}. Find a way to stop it.`
            : 'Danger — your opponent is threatening checkmate next move!',
        arrows: level === 1 ? [{ orig: mt[0].from, dest: mt[0].to, brush: 'red' }] : [],
        specific: true,
      });
    }
  }

  if (level <= 3) {
    const hp = hangingPieces(chess, me).filter((h) => level <= 2 || VALUE[h.type] >= 5);
    if (hp.length) {
      const h = hp[0];
      const why = h.defended
        ? `it’s attacked by a ${pieceWord(h.attacker.type)}, which is worth less`
        : 'it’s attacked and nothing protects it';
      tips.push({
        kind: 'danger',
        text: `Your ${pieceWord(h.type)} on ${h.square} is in danger — ${why}.${hp.length > 1 ? ' Other pieces are loose too.' : ''}`,
        squares: [h.square],
        specific: true,
      });
    }
  }

  const best = a0?.lines?.[0];
  if (level <= 3 && best && best.score.mate === 1) {
    tips.push({ kind: 'chance', text: 'You have checkmate in one move! Look at every check you can give.', specific: true });
  } else if (level <= 2) {
    const loose = hangingPieces(chess, opp);
    if (loose.length && best) {
      const bm = new Chess(chess.fen()).move(uciToMove(best.uci));
      // Only point it out if winning it is actually good according to the engine.
      if (bm.captured) {
        tips.push({
          kind: 'chance',
          text:
            level === 1
              ? `Your opponent’s ${pieceWord(loose[0].type)} on ${loose[0].square} isn’t safe. Can you win it?`
              : 'Your opponent left something loose — look for a capture that wins material.',
          specific: true,
        });
      }
    }
  }

  if (!tips.length && level <= 2) {
    const g = generalTip(chess, prevMove, playerMoveCount);
    if (g) tips.push({ kind: 'tip', text: g, specific: false });
  }
  return tips.slice(0, 2);
}

function generalTip(chess, prevMove, count) {
  const me = chess.turn();
  const phase = gamePhase(chess);
  if (prevMove && prevMove.captured && chess.attackers(prevMove.to, me).length)
    return 'Your opponent just captured. Can you recapture? Count who wins the trade first.';
  if (phase === 'opening') {
    if (count === 0)
      return me === 'w'
        ? 'Good first moves fight for the centre — e4 or d4 are classic choices.'
        : 'Answer in the centre too — …e5 or …d5 are classic replies.';
    const undeveloped = undevelopedMinors(chess, me).length;
    const king = me === 'w' ? 'e1' : 'e8';
    const kp = chess.get(king);
    if (undeveloped <= 1 && kp && kp.type === 'k' && canStillCastle(chess, me))
      return 'Your king is still in the middle. Castling soon will tuck it away safely.';
    if (undeveloped >= 2 && count % 2 === 1)
      return 'Develop your knights and bishops toward the centre — every piece should join the game.';
  }
  if (phase === 'endgame' && count % 4 === 0)
    return 'In the endgame your king is a fighter — bring it toward the centre. Passed pawns should be pushed!';
  if (count % 3 === 2) return 'Before you move: look for Checks, Captures and Threats — for you and for your opponent.';
  return null;
}

/** Escalating hints: 1 = idea, 2 = which piece, 3 = the move. */
export function hintFor(level, { chess, a0 }) {
  const best = a0?.lines?.[0];
  if (!best) return { text: 'The coach is still thinking — try again in a second.' };
  const fen = chess.fen();
  let m;
  try {
    m = new Chess(fen).move(uciToMove(best.uci));
  } catch {
    return { text: 'No hint available.' };
  }
  const idea = moveIdea(fen, best.uci);
  if (level === 1) {
    const text =
      {
        mate: 'There’s a checkmate! Check every check you can give.',
        stopmate: 'Your opponent is threatening checkmate. Find a defence first.',
        win: 'You can win material. Look carefully at every capture.',
        fork: 'Look for a move that attacks two things at once.',
        save: 'One of your pieces is in danger. Save it!',
        castle: 'Think about your king’s safety.',
        develop: 'Bring a new piece into the game.',
        center: 'Fight for the centre with a pawn.',
        check: 'A forcing check is strong here.',
        promote: 'Your pawn can become a queen!',
        trade: 'A trade is a good idea here.',
        capture: 'Look at your captures.',
      }[idea?.tag] || 'Find your least active piece, or stop what your opponent wants to do.';
    return { text: `Hint: ${text}` };
  }
  if (level === 2) return { text: `Hint: move your ${pieceWord(m.piece)} on ${m.from}.`, squares: [m.from] };
  return {
    text: `The best move is ${m.san}${idea ? ` — it ${idea.text}` : ''}.`,
    arrows: [{ orig: m.from, dest: m.to, brush: 'green' }],
  };
}

/** End-of-game summary and the one thing to work on next. */
export function gameSummary(playerRecords) {
  const counts = {};
  const tagCounts = {};
  for (const r of playerRecords) {
    counts[r.cls] = (counts[r.cls] || 0) + 1;
    for (const t of r.tags || []) {
      if (r.cls === 'mistake' || r.cls === 'blunder') tagCounts[t] = (tagCounts[t] || 0) + 1;
    }
  }
  const top = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count, ...(LESSONS[tag] || { title: tag, tip: '' }) }));
  return { counts, tagCounts, top };
}
