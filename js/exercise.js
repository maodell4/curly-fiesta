// Shared helpers for lesson exercises (used by the Learn view and the lesson checker).
import { Chess } from '../vendor/chess.js';

/** Starting FEN of an exercise: an explicit FEN, or a move sequence from the start. */
export function exerciseFen(ex) {
  if (ex.fen) return ex.fen;
  const c = new Chess();
  for (const san of (ex.start || '').split(/\s+/).filter(Boolean)) c.move(san);
  return c.fen();
}

/** Number of moves the player makes in a "find" exercise. */
export function playerSteps(ex) {
  return Math.ceil((ex.line || []).length / 2);
}
