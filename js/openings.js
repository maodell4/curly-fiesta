// A small opening book so the coach can name what you're playing and explain its idea.

const BOOK = [
  ["King's Pawn Opening", 'e4', 'Grabs the centre and opens lines for your queen and bishop.'],
  ["Queen's Pawn Opening", 'd4', 'Takes the centre; the pawn is already protected by the queen.'],
  ['English Opening', 'c4', 'Controls d5 from the side and keeps options flexible.'],
  ['Réti Opening', 'Nf3', 'Develops a knight first and decides on the pawn centre later.'],
  ['Bird Opening', 'f4', 'Fights for e5, but slightly loosens the king.'],
  ["King's Pawn Game", 'e4 e5', 'Both sides claim the centre with a pawn.'],
  ['Italian Game', 'e4 e5 Nf3 Nc6 Bc4', 'The bishop eyes f7, the weakest square near Black’s king.'],
  ['Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5', 'A calm classical setup: develop, castle, then push d4.'],
  ['Two Knights Defense', 'e4 e5 Nf3 Nc6 Bc4 Nf6', 'Black counterattacks e4 straight away.'],
  ['Fried Liver Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7', 'A knight sacrifice on f7 to drag Black’s king out.'],
  ['Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5', 'Pressures the knight that defends e5.'],
  ['Scotch Game', 'e4 e5 Nf3 Nc6 d4', 'Opens the centre at once for quick development.'],
  ['Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6', 'Both sides develop knights toward the centre first.'],
  ['Petrov Defense', 'e4 e5 Nf3 Nf6', 'Black counterattacks e4 instead of defending e5.'],
  ['Stafford Gambit', 'e4 e5 Nf3 Nf6 Nxe5 Nc6', 'A tricky pawn sacrifice full of traps.'],
  ['Philidor Defense', 'e4 e5 Nf3 d6', 'A solid but slightly passive way to protect e5.'],
  ["King's Gambit", 'e4 e5 f4', 'White offers a pawn to open the f-file and grab the centre.'],
  ['Vienna Game', 'e4 e5 Nc3', 'Develops the knight and keeps f4 in reserve.'],
  ['Center Game', 'e4 e5 d4 exd4 Qxd4', 'The queen comes out early — it can be chased with tempo.'],
  ["Scholar's Mate attempt", 'e4 e5 Qh5', 'An early queen attack on f7. Defend f7 and develop — the queen will be a target.'],
  ["Scholar's Mate attempt", 'e4 e5 Bc4 Nc6 Qh5', 'Queen and bishop both hit f7! Defend with ...g6 or ...Qe7.'],
  ["Scholar's Mate attempt", 'e4 e5 Qf3', 'Queen eyes f7. Develop knights and keep f7 protected.'],
  ['Sicilian Defense', 'e4 c5', 'Fights for d4 from the side, leading to sharp, unbalanced games.'],
  ['Open Sicilian', 'e4 c5 Nf3 d6 d4', 'White opens the centre for fast development.'],
  ['French Defense', 'e4 e6', 'Prepares ...d5 with a solid pawn chain.'],
  ['Caro-Kann Defense', 'e4 c6', 'Prepares ...d5 while keeping the light-squared bishop free.'],
  ['Scandinavian Defense', 'e4 d5', 'Challenges e4 immediately.'],
  ['Pirc Defense', 'e4 d6', 'Lets White build a centre, planning to attack it later.'],
  ['Alekhine Defense', 'e4 Nf6', 'Invites White’s pawns forward to attack them later.'],
  ['Modern Defense', 'e4 g6', 'Fianchettoes the bishop to pressure the centre from afar.'],
  ["Queen's Pawn Game", 'd4 d5', 'Both sides claim the centre.'],
  ["Queen's Gambit", 'd4 d5 c4', 'Offers a side pawn to pull Black’s d-pawn away from the centre.'],
  ["Queen's Gambit Accepted", 'd4 d5 c4 dxc4', 'Black takes the pawn; White gets a big centre.'],
  ["Queen's Gambit Declined", 'd4 d5 c4 e6', 'Black keeps a solid centre.'],
  ['Slav Defense', 'd4 d5 c4 c6', 'Supports d5 with a pawn while keeping the bishop free.'],
  ['London System', 'd4 d5 Bf4', 'A simple, solid setup: pawns on d4/e3/c3, bishop on f4.'],
  ['London System', 'd4 Nf6 Bf4', 'A simple, solid setup: pawns on d4/e3/c3, bishop on f4.'],
  ['London System', 'd4 d5 Nf3 Nf6 Bf4', 'A simple, solid setup: pawns on d4/e3/c3, bishop on f4.'],
  ['Indian Defense', 'd4 Nf6', 'Controls e4 with a piece instead of a pawn.'],
  ["King's Indian Defense", 'd4 Nf6 c4 g6', 'Black fianchettoes and counterattacks the centre later.'],
  ['Nimzo-Indian Defense', 'd4 Nf6 c4 e6 Nc3 Bb4', 'The bishop pins the knight that controls e4.'],
  ["Queen's Indian Defense", 'd4 Nf6 c4 e6 Nf3 b6', 'The bishop on b7 will fight for e4.'],
  ['Grünfeld Defense', 'd4 Nf6 c4 g6 Nc3 d5', 'Black lets White build a centre and then strikes at it.'],
  ['Dutch Defense', 'd4 f5', 'Fights for e4 aggressively, but loosens Black’s king.'],
  ['Englund Gambit', 'd4 e5', 'A risky pawn sacrifice.'],
];

const ENTRIES = BOOK.map(([name, line, idea]) => ({ name, moves: line.split(' '), idea }));

const clean = (san) => san.replace(/[+#?!]/g, '');

/** Longest book line matching the start of the game, or null. */
export function detectOpening(sanHistory) {
  const hist = sanHistory.map(clean);
  let best = null;
  for (const e of ENTRIES) {
    if (e.moves.length > hist.length) continue;
    if (e.moves.every((m, i) => m === hist[i]) && (!best || e.moves.length > best.moves.length)) best = e;
  }
  return best;
}
