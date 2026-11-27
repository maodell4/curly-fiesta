// Books, free websites and videos, grouped by level. Links are to pages whose
// addresses were confirmed while researching; video channels use YouTube searches so
// the links keep working if a channel changes its address.

export const BOOKS = [
  // Beginner
  { id: 'fischer', level: 'beginner', title: 'Bobby Fischer Teaches Chess', author: 'Bobby Fischer, Stuart Margulies & Donn Mosenfelder', why: 'Hundreds of one-question pages, mostly about back-rank mates. Perfect as a very first book.' },
  { id: 'pandolfini', level: 'beginner', title: 'Let’s Play Chess: A Step by Step Guide for New Players', author: 'Bruce Pandolfini', why: 'A gentle, clear introduction to the rules and first tactics.' },
  { id: 'steps-1', level: 'beginner', title: 'Learning Chess Workbook – Step 1 & Step 2', author: 'Rob Brunia & Cor van Wijgerden', why: 'The Steps Method, the official method of the Dutch chess federation: lots of small exercises, one idea at a time.' },
  { id: 'chernev', level: 'beginner', title: 'Logical Chess: Move by Move', author: 'Irving Chernev', why: 'Complete games where every single move is explained in plain language.' },
  { id: 'polgar', level: 'beginner', title: 'Chess: 5334 Problems, Combinations and Games', author: 'László Polgár', why: 'A huge collection of mate-in-one and mate-in-two drills — build pattern recognition a page at a time.' },
  // Intermediate
  { id: 'heisman-guide', level: 'intermediate', title: 'A Guide to Chess Improvement', author: 'Dan Heisman', why: 'How to think during a game: “hope chess”, blunder checks and good habits.' },
  { id: 'yusupov-1', level: 'intermediate', title: 'Build Up Your Chess 1: The Fundamentals', author: 'Artur Yusupov', why: 'The first (orange, under ~1500) level of an award-winning nine-book course; every chapter ends with a test.' },
  { id: 'weteschnik', level: 'intermediate', title: 'Chess Tactics from Scratch', author: 'Martin Weteschnik', why: 'Explains why tactics work, not just what they are.' },
  { id: 'silman-endgame', level: 'intermediate', title: 'Silman’s Complete Endgame Course', author: 'Jeremy Silman', why: 'Organised by rating — read only the chapters for your level.' },
  { id: 'seirawan-strategies', level: 'intermediate', title: 'Winning Chess Strategies', author: 'Yasser Seirawan', why: 'Readable introduction to plans, pawn structure and piece activity.' },
  { id: 'steps-3', level: 'intermediate', title: 'Learning Chess Workbook – Steps 3 & 4', author: 'Rob Brunia & Cor van Wijgerden', why: 'Pins, threats, key squares and first strategy, in the same exercise-heavy style.' },
  // Advanced
  { id: 'yusupov-2', level: 'advanced', title: 'Build Up Your Chess 2 & 3 (Beyond the Basics, Mastery)', author: 'Artur Yusupov', why: 'The blue (~1800) and green (~2100) levels of the same course.' },
  { id: 'silman-reassess', level: 'advanced', title: 'How to Reassess Your Chess', author: 'Jeremy Silman', why: 'Teaches you to plan from the position’s imbalances.' },
  { id: 'nimzowitsch', level: 'advanced', title: 'My System', author: 'Aron Nimzowitsch', why: 'The classic on positional ideas: open files, outposts, blockade and prophylaxis.' },
  { id: 'de-la-villa', level: 'advanced', title: '100 Endgames You Must Know', author: 'Jesús de la Villa', why: 'The theoretical endgames that come up again and again, Lucena and Philidor included.' },
  { id: 'flores-rios', level: 'advanced', title: 'Chess Structures: A Grandmaster Guide', author: 'Mauricio Flores Rios', why: 'Plans for the most common pawn structures.' },
  { id: 'dvoretsky', level: 'advanced', title: 'Dvoretsky’s Endgame Manual', author: 'Mark Dvoretsky', why: 'The endgame reference for strong players — save it for later.' },
];

export const LINKS = [
  { id: 'lichess-learn', level: 'beginner', title: 'Lichess Learn', url: 'https://lichess.org/learn', why: 'Free interactive lessons on how the pieces move, checkmate and basic rules.' },
  { id: 'intro2chess', level: 'beginner', title: 'Intro to Chess', url: 'https://intro2chess.github.io', why: 'A free animated course for absolute beginners, with practice tasks.' },
  { id: 'lichess-practice', level: 'beginner', title: 'Lichess Practice', url: 'https://lichess.org/practice', why: 'Free interactive drills: checkmate patterns, tactics and endgames.' },
  { id: 'lichess-themes', level: 'beginner', title: 'Lichess Puzzle Themes', url: 'https://lichess.org/training/themes', why: 'Free puzzles sorted by idea — pick “Fork”, “Pin”, “Back rank mate” and so on to drill each lesson.' },
  { id: 'chesscom-lessons', level: 'beginner', title: 'Chess.com Lessons', url: 'https://www.chess.com/lessons', why: 'Short video lessons with practice positions, by level.' },
  { id: 'chesscom-plans', level: 'beginner', title: 'Chess.com study plans by rating', url: 'https://www.chess.com/article/study-plan-directory', why: 'Coaches’ study guides for 0–600, 600–1000, 1000–1400 and beyond.' },
  { id: 'heisman-hope', level: 'beginner', title: 'Passive vs Basic Hope Chess — Dan Heisman', url: 'https://www.chess.com/article/view/passive-vs-basic-hope-chess', why: 'Why beginners blunder, and the habit that stops it.' },
  { id: 'chesscom-tactics', level: 'beginner', title: 'Chess Tactics: 38 Definitions and Examples', url: 'https://www.chess.com/article/view/chess-tactics', why: 'A glossary of every tactical motif with diagrams.' },
  { id: 'steps-blog', level: 'intermediate', title: 'The Steps Method for learning and teaching chess', url: 'https://lichess.org/@/HanSchut/blog/the-steps-method-for-learning-and-teaching-chess/L74I4Ihq', why: 'How the Dutch Steps Method is structured, and why it works.' },
  { id: 'lichess-endgame-guide', level: 'intermediate', title: 'The complete U2000 guide to theoretical endgames', url: 'https://lichess.org/@/elementalmaster1/blog/the-complete-u2000-guide-to-theoretical-endgames/Hlht1BY0', why: 'The endgames worth memorising below 2000, in one place.' },
  { id: 'chesscom-rook-endings', level: 'advanced', title: 'The Two Rook Endings You Must Know', url: 'https://www.chess.com/article/view/the-two-rook-endings-you-must-know', why: 'Lucena and Philidor explained step by step.' },
];

const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export const VIDEOS = [
  { title: 'GothamChess', url: yt('GothamChess how to play chess beginners'), why: 'Entertaining beginner and intermediate lessons; often recommended for new players.' },
  { title: 'Daniel Naroditsky — speedrun series', url: yt('Naroditsky speedrun'), why: 'A grandmaster plays opponents of every level and explains his thinking out loud.' },
  { title: 'Hanging Pawns', url: yt('Hanging Pawns opening explained'), why: 'Calm, clear explanations of openings and ideas.' },
  { title: 'John Bartholomew — Chess Fundamentals', url: yt('John Bartholomew chess fundamentals'), why: 'A classic series on the basics: piece activity, pawn play, simple endgames.' },
  { title: 'ChessDojo', url: yt('ChessDojo training program'), why: 'Structured training plans by rating.' },
];

export function resolveRef(ref) {
  if (ref.startsWith('book:')) {
    const b = BOOKS.find((x) => x.id === ref.slice(5));
    return b ? { kind: 'book', ...b } : null;
  }
  const l = LINKS.find((x) => x.id === ref);
  return l ? { kind: 'link', ...l } : null;
}

/** Heisman-style move checklist shown in the Play view. */
export const CHECKLIST = [
  'What did my opponent’s last move do? What does it attack or threaten?',
  'Are any of my pieces unprotected or attacked by something cheaper?',
  'What are my checks, captures and threats?',
  'Pick a move, then blunder-check it: what are their checks, captures and threats after it?',
];
