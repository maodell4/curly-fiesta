// Lesson curriculum. The order follows what chess coaches' study plans agree on:
// under ~1000 stop losing pieces and learn basic tactics, mates and opening principles;
// 1000-1600 deeper tactics and essential endgames; 1600+ strategy, theoretical endgames
// and calculation. Every exercise position and solution is checked with Stockfish by
// tests/verify-lessons.mjs.
//
// Exercise kinds:
//   find  - find the best move (or a short line). `line` is the main line in UCI
//           (your moves and the scripted replies). Any move within `tolerance`
//           centipawns of the engine's best is accepted unless `accept` lists the
//           only moves that count.
//   goal  - play the position out against Stockfish: `goal` is 'mate', 'promote'
//           or 'hold' (don't lose for `maxMoves` moves).

export const LEVELS = [
  { id: 'beginner', name: 'Beginner', range: 'about 0–1000', blurb: 'Stop losing pieces, spot simple tactics, give checkmate, open the game well.' },
  { id: 'intermediate', name: 'Intermediate', range: 'about 1000–1600', blurb: 'Deeper tactics, essential endgames and mating patterns.' },
  { id: 'advanced', name: 'Advanced', range: 'about 1600+', blurb: 'Theoretical rook endgames, strategy and calculation.' },
];

export const LESSONS = [
  {
    id: 'safety',
    level: 'beginner',
    title: 'Is it safe? Counting attackers and defenders',
    summary: 'The habit that wins the most games at every level below 1200.',
    tags: ['hung-moved-piece', 'ignored-threat', 'removed-defender', 'missed-threat', 'missed-capture'],
    body: [
      { p: 'Most games between beginners are decided by pieces left where they can be taken for free. The fix is a habit: before you let go of a piece, ask “Is it safe?”' },
      { h: 'Piece values' },
      { list: ['Pawn = 1', 'Knight = 3, Bishop = 3', 'Rook = 5', 'Queen = 9', 'The king is priceless — it can never be captured.'] },
      { p: 'A square is safe for your piece when the opponent can’t win material by capturing there. Count the attackers and defenders of the square:' },
      { list: [
        'No enemy piece attacks it → safe.',
        'It’s attacked by a cheaper piece (a pawn attacking your knight) → not safe, even if defended.',
        'Attacked more times than it’s defended → usually not safe.',
        'Defended at least as often, and every attacker is worth at least as much → usually safe.',
      ] },
      { p: 'Use the same counting the other way to win material: if one of their pieces is attacked more times than it’s defended, capture it.' },
      { tip: 'Every move, check two things: is the piece I’m moving safe on its new square, and did moving it leave something else unprotected?' },
    ],
    exercises: [
      { id: 'safety-1', fen: '6k1/5ppp/8/3n4/8/8/5PPP/3R2K1 w - - 0 1', prompt: 'White to move. Count attackers and defenders — can you win something for free?', line: ['d1d5'], tolerance: 60, hint: 'Look at the knight on d5. What protects it?', explain: 'Rxd5 wins a whole knight: nothing defends it.' },
      { id: 'safety-2', fen: '4r1k1/5ppp/8/8/4p3/5N2/5PPP/3R2K1 w - - 0 1', prompt: 'White to move. Your knight is attacked by a pawn. Move it to a safe square.', line: ['f3d4'], tolerance: 80, hint: 'Avoid e5 — the rook on e8 looks straight down the e-file.', explain: 'A pawn attacking a knight wins material, so the knight must move. d4, d2, g5, h4 and e1 are all safe; e5 is not (the rook takes it).' },
      { id: 'safety-3', fen: '3r2k1/5ppp/8/3p4/8/8/3R1PPP/3R2K1 w - - 0 1', prompt: 'White to move. The d5 pawn is defended once. You attack it twice. Win it.', line: ['d2d5', 'd8d5', 'd1d5'], tolerance: 60, hint: 'Two attackers beat one defender.', explain: 'Rxd5 Rxd5 Rxd5: two attackers against one defender means you come out a pawn ahead.' },
    ],
    further: ['lichess-themes', 'heisman-hope', 'book:heisman-guide', 'book:steps-1'],
  },
  {
    id: 'routine',
    level: 'beginner',
    title: 'Your thinking routine: checks, captures, threats',
    summary: 'Stop playing “hope chess”: look at what your opponent can do before you move.',
    tags: ['allowed-mate', 'allowed-tactic', 'ignored-threat'],
    body: [
      { p: 'Coach Dan Heisman calls it “hope chess” when you make a move and simply hope your opponent has nothing dangerous in reply. Almost every beginner blunder comes from it. The cure is a short routine you run every single move.' },
      { h: 'Every move' },
      { list: [
        '1. What did my opponent’s last move do? What does it attack now? Does it threaten checkmate?',
        '2. Look for your forcing moves first: checks, captures and threats (CCT).',
        '3. Pick a candidate move.',
        '4. Blunder check: imagine you’ve played it. What are their checks, captures and threats? Can they win something or mate you?',
        '5. Only then play it.',
      ] },
      { p: 'It feels slow at first. After a few dozen games it becomes automatic, and you’ll stop losing games in one move.' },
      { tip: 'When you find a good move, look for a better one — but when you see danger, deal with it first.' },
    ],
    exercises: [
      { id: 'routine-1', start: 'e4 e5 Bc4 Nc6 Qh5', prompt: 'Black to move. What is White threatening? Stop it.', line: ['g7g6'], tolerance: 70, hint: 'The queen and bishop both aim at f7.', explain: 'White threatens Qxf7# (Scholar’s Mate). …g6 blocks the queen and attacks it; …Qe7 or …Qf6 also defend f7.' },
      { id: 'routine-2', fen: '4r1k1/3R1ppp/8/8/8/8/5PPP/6K1 w - - 0 1', prompt: 'White to move. Black has a deadly threat. Find a safe move.', line: ['h2h3'], tolerance: 80, hint: 'What happens after …Re1+?', explain: 'Black threatens …Re1#, a back-rank mate. Giving your king an escape square (h3, g3, h4) or covering the back rank (Rd1) stops it.' },
    ],
    further: ['heisman-hope', 'book:heisman-guide', 'book:chernev'],
  },
  {
    id: 'opening',
    level: 'beginner',
    title: 'Opening principles',
    summary: 'Five rules that give you a good position without memorising lines.',
    tags: ['opening-principles'],
    body: [
      { p: 'You don’t need to memorise openings yet. Follow these principles and you’ll reach a good middlegame almost every game:' },
      { list: [
        'Fight for the centre (e4, d4, e5, d5) with pawns and pieces.',
        'Develop knights and bishops toward the centre — a new piece every move.',
        'Castle early to get your king safe and connect your rooks.',
        'Don’t bring your queen out early: it gets chased and you lose time.',
        'Don’t move the same piece twice without a reason, and don’t grab pawns at the cost of development.',
      ] },
      { p: 'Simple setups to try: as White, 1.e4 then Nf3, Bc4, O-O (the Italian Game). As Black against 1.e4, reply 1…e5 and develop the same way.' },
      { tip: 'If your opponent plays an early Qh5 or Qf3 aiming at f7, defend f7 calmly and develop with tempo by attacking their queen.' },
    ],
    exercises: [
      { id: 'opening-1', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', prompt: 'Make a strong first move that follows the opening principles.', line: ['e2e4'], accept: ['e2e4', 'd2d4', 'g1f3', 'c2c4'], hint: 'Claim the centre.', explain: '1.e4, 1.d4, 1.Nf3 and 1.c4 are the classic first moves: they fight for the centre and open lines for your pieces.' },
      { id: 'opening-2', start: 'e4 e5 Nf3 Nc6', prompt: 'White to move. Develop a piece toward the centre.', line: ['f1c4'], accept: ['f1c4', 'f1b5', 'b1c3', 'd2d4'], hint: 'Your kingside bishop hasn’t moved yet.', explain: 'Bc4 (Italian Game), Bb5 (Ruy Lopez), Nc3 and d4 all develop or fight for the centre.' },
      { id: 'opening-3', start: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6', prompt: 'White to move. Your knight and bishop are out. What now?', line: ['e1g1'], accept: ['e1g1'], hint: 'Your king is still in the centre.', explain: 'Castle! O-O tucks the king away and brings the rook toward the centre.' },
    ],
    further: ['lichess-learn', 'book:fischer', 'book:chernev'],
  },
  {
    id: 'mates',
    level: 'beginner',
    title: 'Basic checkmates',
    summary: 'The back-rank mate, mating with a queen, and how not to stalemate.',
    tags: ['allowed-mate', 'missed-mate', 'stalemate'],
    body: [
      { p: 'Checkmate means the king is attacked and has no way out: it can’t move to a safe square, the attack can’t be blocked, and the attacker can’t be captured.' },
      { h: 'The back-rank mate' },
      { p: 'A king behind its own unmoved pawns has no escape squares. A rook or queen on the back rank then gives mate. Protect yourself by making “luft” (a pawn move like h3) when you have time.' },
      { h: 'King and queen against king' },
      { list: [
        'Use the queen to box the king in — a knight’s move away from it is a good distance.',
        'Shrink the box until the king is on the edge.',
        'Bring your own king up to support the queen.',
        'Deliver mate with the queen next to the enemy king, protected by your king.',
      ] },
      { tip: 'Stalemate (no legal moves, not in check) is a draw! Before every move near the end, check that the enemy king still has a move.' },
    ],
    exercises: [
      { id: 'mates-1', fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', prompt: 'White to move. Checkmate in one.', line: ['d1d8'], tolerance: 0, hint: 'Black’s king is trapped behind its pawns.', explain: 'Rd8# — the classic back-rank mate.' },
      { id: 'mates-2', fen: '7k/1Q6/6K1/8/8/8/8/8 w - - 0 1', prompt: 'White to move. Checkmate in one.', line: ['b7g7'], tolerance: 0, hint: 'Your king protects the squares next to it.', explain: 'Qg7# (or Qh7#, Qb8#): the queen attacks the king and your king protects her.' },
      { id: 'mates-3', kind: 'goal', goal: 'mate', maxMoves: 20, fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1', prompt: 'Checkmate with king and queen. Stockfish defends. Careful: don’t stalemate!', hint: 'Keep the queen a knight’s move from the king and push it to the edge, then bring your king.', explain: 'Box the king in, walk your own king up, then mate on the edge.' },
    ],
    further: ['lichess-practice', 'book:fischer', 'book:polgar'],
  },
  {
    id: 'forks',
    level: 'beginner',
    title: 'Forks: attacking two things at once',
    summary: 'The most common tactic. Knights are especially good at it.',
    tags: ['allowed-fork', 'missed-fork'],
    body: [
      { p: 'A fork is one piece attacking two (or more) enemy pieces at the same time. Your opponent can only save one.' },
      { list: [
        'Knight forks are the hardest to see because knights jump.',
        'Pawn forks win a piece for a pawn.',
        'A check plus an attack (a “royal fork”) is the strongest: they must deal with the check first.',
      ] },
      { p: 'To find forks, look for squares that attack two of their pieces — especially undefended ones and the king. To avoid forks, check which of your pieces stand a knight’s jump apart.' },
      { tip: 'Loose pieces (undefended ones) are the usual targets of forks. Keep your pieces protected.' },
    ],
    exercises: [
      { id: 'forks-1', fen: 'r3k3/5ppp/8/1N6/8/8/5PPP/4K3 w - - 0 1', prompt: 'White to move and win the rook.', line: ['b5c7', 'e8d7', 'c7a8'], tolerance: 60, hint: 'Find a knight check that also hits a8.', explain: 'Nc7+ forks the king and the rook. After the king moves, Nxa8.' },
      { id: 'forks-2', fen: '6k1/5ppp/3b1n2/8/3PP3/2N4P/5PP1/6K1 w - - 0 1', prompt: 'White to move. One pawn move attacks two pieces.', line: ['e4e5'], tolerance: 60, hint: 'Pawns capture diagonally forward.', explain: 'e5 forks the bishop and the knight. The pawn is protected by d4, so one of the pieces falls.' },
      { id: 'forks-3', fen: '4k3/8/8/8/4n3/8/8/3QK3 w - - 0 1', prompt: 'White to move and win the knight.', line: ['d1a4', 'e8e7', 'a4e4'], tolerance: 60, hint: 'A queen check can attack something else at the same time.', explain: 'Qa4+ checks the king and attacks the knight on e4 along the 4th rank. (Qe2, pinning the knight to the king, also wins it.)' },
    ],
    further: ['lichess-themes', 'chesscom-tactics', 'book:polgar'],
  },
  {
    id: 'pins',
    level: 'beginner',
    title: 'Pins and skewers',
    summary: 'Using a line piece to attack two things standing in a row.',
    tags: ['allowed-tactic'],
    body: [
      { p: 'Bishops, rooks and queens attack along lines. When two enemy pieces stand on the same line, you can attack both.' },
      { h: 'Pin' },
      { p: 'The piece in front is worth less than the one behind. If it moves, the valuable piece behind is exposed. Against the king the pin is absolute: the pinned piece may not move at all. Attack a pinned piece again — it can’t run away.' },
      { h: 'Skewer' },
      { p: 'The reverse: the valuable piece is in front. It has to move, and you capture the piece behind it.' },
      { tip: 'When your king and queen (or king and rook) share a line, look out for skewers.' },
    ],
    exercises: [
      { id: 'pins-1', fen: '4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1', prompt: 'White to move. The knight is pinned. Attack it again.', line: ['d4d5'], tolerance: 60, hint: 'A pawn attack on a pinned piece is deadly.', explain: 'd5! The knight can’t move because it’s pinned to the king, so it falls next move.' },
      { id: 'pins-2', fen: '7q/8/8/4k3/8/8/6PP/2B1K3 w - - 0 1', prompt: 'White to move and win the queen.', line: ['c1b2', 'e5e6', 'b2h8'], tolerance: 60, hint: 'The king and queen are on the same long diagonal.', explain: 'Bb2+ skewers the king and queen: the king must move and the bishop takes the queen.' },
    ],
    further: ['lichess-themes', 'chesscom-tactics', 'book:steps-1'],
  },
  {
    id: 'discovered',
    level: 'intermediate',
    title: 'Discovered attacks',
    summary: 'Move one piece out of the way and unleash the piece behind it.',
    tags: ['allowed-tactic', 'missed-capture'],
    body: [
      { p: 'A discovered attack happens when a piece moves and uncovers an attack by the piece behind it (usually a rook, bishop or queen). The moving piece can make its own threat at the same time — two attacks with one move.' },
      { p: 'A discovered check is the most powerful version: the opponent must answer the check, so whatever the moving piece attacks is often lost.' },
      { tip: 'Whenever one of your pieces stands between your rook/bishop/queen and an enemy piece, ask what happens if it moves with a threat.' },
    ],
    exercises: [
      { id: 'discovered-1', fen: '4k3/1q6/8/8/4B3/8/8/4RK2 w - - 0 1', prompt: 'White to move and win the queen.', line: ['e4b7'], tolerance: 60, hint: 'What does the rook on e1 see if the bishop moves?', explain: 'Bxb7 takes the queen with a discovered check from the rook.' },
      { id: 'discovered-2', fen: '3q2k1/5ppp/8/8/8/3B4/5PPP/3R2K1 w - - 0 1', prompt: 'White to move. Your rook and their queen share the d-file.', line: ['d3h7', 'g8h7', 'd1d8'], tolerance: 60, hint: 'Move the bishop with check.', explain: 'Bxh7+! The bishop moves with check, uncovering the rook’s attack on the queen. After the king deals with the check, Rxd8.' },
    ],
    further: ['lichess-themes', 'book:weteschnik', 'book:yusupov-1'],
  },
  {
    id: 'defender',
    level: 'intermediate',
    title: 'Removing the defender',
    summary: 'If a piece is protected only once, take away its protector.',
    tags: ['removed-defender', 'missed-capture'],
    body: [
      { p: 'When an enemy piece is defended only once, capture (or chase away) the defender, then capture the piece. Related ideas:' },
      { list: [
        'Overloading — one defender has two jobs and can’t do both.',
        'Deflection — force a defender away with a check or a capture.',
        'Decoy — force a piece onto a bad square, often with a sacrifice.',
      ] },
      { tip: 'For each enemy piece ask: “What is it protecting?” That piece is often the target.' },
    ],
    exercises: [
      { id: 'defender-1', fen: '6k1/3b1ppp/5n2/6B1/8/8/5PPP/3R2K1 w - - 0 1', prompt: 'White to move. The bishop on d7 has only one defender.', line: ['g5f6', 'g7f6', 'd1d7'], tolerance: 60, hint: 'Which piece guards d7?', explain: 'Bxf6 removes the knight that guards d7. After …gxf6, Rxd7 wins the bishop.' },
    ],
    further: ['lichess-themes', 'chesscom-tactics', 'book:weteschnik'],
  },
  {
    id: 'pawn-endgames',
    level: 'intermediate',
    title: 'Pawn endgames: the square and the opposition',
    summary: 'Two ideas that decide almost every king-and-pawn ending.',
    tags: ['positional'],
    body: [
      { h: 'The rule of the square' },
      { p: 'Draw a square from a passed pawn to its promotion rank. If the defending king can step inside the square, it catches the pawn. If not, the pawn queens.' },
      { h: 'The opposition' },
      { p: 'Kings standing face to face with one square between them are “in opposition”. The side that does NOT have to move holds the opposition and makes the other king give way.' },
      { list: [
        'With king and pawn against king, put your king in front of the pawn, not behind it.',
        'If your king reaches a square two ranks in front of the pawn (a “key square”), you win.',
        'Defending, keep your king in front of the pawn and take the opposition.',
      ] },
      { tip: 'In the endgame your king is a strong piece. Bring it to the centre early.' },
    ],
    exercises: [
      { id: 'pawn-endgames-1', fen: '7k/8/8/8/1p6/8/5K2/8 w - - 0 1', prompt: 'White to move. Can your king catch the pawn?', line: ['f2e2'], tolerance: 100, hint: 'Picture the square from b4 to b1. Step inside it.', explain: 'Ke2 (or Ke3 or Ke1) steps into the pawn’s square and catches it in time. Any other move is too slow.' },
      { id: 'pawn-endgames-2', kind: 'goal', goal: 'promote', maxMoves: 15, fen: '4k3/8/3K4/8/4P3/8/8/8 w - - 0 1', prompt: 'Win: promote your pawn. Stockfish defends.', hint: 'Keep your king in front of the pawn. Use the opposition; push the pawn only when it’s safe.', explain: 'Your king already stands on a key square in front of the pawn, so the win is there with careful king moves.' },
    ],
    further: ['lichess-practice', 'lichess-endgame-guide', 'book:silman-endgame'],
  },
  {
    id: 'rook-mate',
    level: 'intermediate',
    title: 'Mating with rooks',
    summary: 'The two-rook “ladder” and the king-and-rook mate.',
    tags: ['missed-mate'],
    body: [
      { h: 'Two rooks: the ladder' },
      { p: 'One rook cuts off a rank, the other checks on the next rank; then they swap roles. The king is pushed to the edge and mated.' },
      { h: 'King and rook against king' },
      { list: [
        'Use the rook to cut the enemy king off on a rank or file.',
        'Bring your king up until the kings face each other (opposition).',
        'Check with the rook along the edge when the kings face each other.',
        'When the enemy king steps away, make a waiting move with the rook — don’t release the box.',
      ] },
    ],
    exercises: [
      { id: 'rook-mate-1', fen: '7k/1R6/8/8/8/8/8/R5K1 w - - 0 1', prompt: 'White to move. Checkmate in one.', line: ['a1a8'], tolerance: 0, hint: 'One rook already guards the 7th rank.', explain: 'Ra8#: the rook on b7 covers the 7th rank, the other mates on the 8th.' },
      { id: 'rook-mate-2', kind: 'goal', goal: 'mate', maxMoves: 40, fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', prompt: 'Checkmate with king and rook. Stockfish defends.', hint: 'Cut the king off with the rook, walk your king up, and check when the kings face each other.', explain: 'Shrink the box with the rook, bring the king, and use the opposition to check on the edge.' },
    ],
    further: ['lichess-practice', 'book:silman-endgame', 'book:polgar'],
  },
  {
    id: 'patterns',
    level: 'intermediate',
    title: 'Mating patterns',
    summary: 'Smothered mate, Arabian mate and other patterns to recognise instantly.',
    tags: ['missed-mate', 'allowed-mate'],
    body: [
      { p: 'Strong players don’t calculate every mate from scratch — they recognise patterns. A few worth knowing:' },
      { list: [
        'Smothered mate: a knight mates a king boxed in by its own pieces.',
        'Arabian mate: rook and knight together in the corner.',
        'Back-rank mate: rook or queen on the last rank against a king behind its pawns.',
        'Anastasia’s mate: knight and rook trap the king against the edge.',
      ] },
      { tip: 'When the enemy king has few escape squares, look at every check — one of them may be mate.' },
    ],
    exercises: [
      { id: 'patterns-1', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', prompt: 'White to move. Checkmate in one.', line: ['g5f7'], tolerance: 0, hint: 'Black’s king is surrounded by its own pieces.', explain: 'Nf7# — a smothered mate.' },
      { id: 'patterns-2', fen: '7k/R7/5N2/8/8/8/8/6K1 w - - 0 1', prompt: 'White to move. Checkmate in one.', line: ['a7h7'], tolerance: 0, hint: 'The knight protects h7 and covers g8.', explain: 'Rh7# — the Arabian mate.' },
    ],
    further: ['lichess-practice', 'lichess-themes', 'book:polgar'],
  },
  {
    id: 'rook-endgames',
    level: 'advanced',
    title: 'Rook endgames: Lucena and Philidor',
    summary: 'The winning and drawing methods every serious player needs.',
    tags: ['positional'],
    body: [
      { p: 'Rook endgames are the most common endgames. Two positions are the foundation of all of them.' },
      { h: 'Lucena — how to win' },
      { p: 'Your king is in front of your pawn on the 7th rank, the enemy king is cut off by your rook. Bring your rook to the 4th rank to “build a bridge”, then walk your king out; when the checks come, your rook blocks them.' },
      { h: 'Philidor — how to draw' },
      { p: 'Defending, keep your king in front of the pawn and your rook on your third rank, stopping the enemy king from advancing. When the pawn steps onto that rank, move your rook to the back and check from behind — the enemy king has no shelter.' },
      { tip: 'Active rooks win rook endgames. Put rooks behind passed pawns — yours and theirs.' },
    ],
    exercises: [
      { id: 'rook-endgames-1', kind: 'goal', goal: 'promote', maxMoves: 25, fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', prompt: 'Lucena: win by promoting the pawn. Stockfish defends.', hint: 'Check the king further away first, then bring your rook to the 4th rank to build the bridge.', explain: 'Rd1+, then Rd4 builds the bridge so your rook can block the checks.' },
      { id: 'rook-endgames-2', kind: 'goal', goal: 'hold', maxMoves: 12, fen: '3k4/8/r7/3PK3/8/8/8/7R b - - 0 1', prompt: 'Philidor: you are Black. Hold the draw for 12 moves. Stockfish attacks.', hint: 'Keep your rook on the 6th rank. Only when the pawn reaches d6, drop the rook to the back and check from behind.', explain: 'Rook on the third rank, then checks from behind once the pawn advances.' },
    ],
    further: ['chesscom-rook-endings', 'lichess-endgame-guide', 'book:silman-endgame', 'book:de-la-villa'],
  },
  {
    id: 'strategy',
    level: 'advanced',
    title: 'Strategy: what to do when there’s no tactic',
    summary: 'Open files, active kings and improving your worst piece.',
    tags: ['positional'],
    body: [
      { p: 'Most moves in a game are not tactical. Then you improve your position step by step. Ideas from the classic strategy books:' },
      { list: [
        'Rooks belong on open files (no pawns) and on the 7th rank.',
        'Knights love outposts: squares in the enemy half that no enemy pawn can attack.',
        'A “bad” bishop is blocked by its own pawns on its colour — trade it or free it.',
        'Weak pawns (isolated, doubled, backward) are long-term targets.',
        'In the endgame, activate your king.',
        'Improve your worst-placed piece.',
      ] },
      { tip: 'Before each quiet move ask: what is my worst piece, and what does my opponent want to do?' },
    ],
    exercises: [
      { id: 'strategy-1', fen: 'r4rk1/ppp2ppp/2n5/8/8/2N5/PPP2PPP/R4RK1 w - - 0 1', prompt: 'White to move. Make your rooks active.', line: ['a1d1'], accept: ['a1d1', 'f1d1', 'a1e1', 'f1e1'], hint: 'Two files have no pawns on them.', explain: 'Rad1 or Rfe1: rooks belong on the open d- and e-files.' },
      { id: 'strategy-2', fen: '6k1/ppp5/8/8/8/8/PPP5/6K1 w - - 0 1', prompt: 'White to move. It’s an endgame. What’s the most useful move?', line: ['g1f2'], accept: ['g1f2', 'g1f1'], hint: 'Your king is far from the action.', explain: 'Kf2: in the endgame the king becomes a fighting piece — bring it toward the centre.' },
    ],
    further: ['book:seirawan-strategies', 'book:silman-reassess', 'book:nimzowitsch'],
  },
  {
    id: 'calculation',
    level: 'advanced',
    title: 'Calculation: forcing moves first',
    summary: 'How to look two or three moves ahead without getting lost.',
    tags: ['missed-mate', 'allowed-tactic'],
    body: [
      { p: 'Calculation is seeing the position a few moves ahead. Make it manageable:' },
      { list: [
        'List candidate moves, forcing ones first: checks, captures, threats.',
        'For each, find the opponent’s most forcing reply — not the one you hope for.',
        'Stop when the position is quiet and judge it: material, king safety, activity.',
        'Blunder-check your final choice once more before playing it.',
      ] },
      { tip: 'A sacrifice that forces the reply is much easier to calculate than a quiet move.' },
    ],
    exercises: [
      { id: 'calculation-1', fen: '2r3k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1', prompt: 'White to move. Mate in two.', line: ['e2e8', 'c8e8', 'e1e8'], tolerance: 0, hint: 'Sacrifice to remove the back-rank defender.', explain: 'Qe8+! Rxe8 is forced, then Rxe8# — a back-rank mate.' },
    ],
    further: ['book:yusupov-2', 'book:heisman-guide', 'steps-blog'],
  },
];

/** Lessons that address the mistakes the coach tagged in your games. */
export function lessonsForTags(tagCounts, done = {}) {
  const score = {};
  for (const [tag, n] of Object.entries(tagCounts || {})) {
    for (const l of LESSONS) if (l.tags.includes(tag)) score[l.id] = (score[l.id] || 0) + n;
  }
  return LESSONS.filter((l) => score[l.id])
    .sort((a, b) => (done[a.id] ? 1 : 0) - (done[b.id] ? 1 : 0) || score[b.id] - score[a.id]);
}

export function lessonById(id) {
  return LESSONS.find((l) => l.id === id);
}
