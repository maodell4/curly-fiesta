# Chess Coach

A browser chess coach for complete beginners. You play against an opponent that adapts to you. A coach talks you through the game move by move, and you get a rating estimate that updates after every move you make.

Everything runs locally in your browser, including the Stockfish engine. There is no account, no server and no tracking. Your progress is saved in your browser's local storage.

## Running it

The engine runs in a Web Worker, which browsers don't allow from `file://` pages, so serve the folder over HTTP:

```bash
python3 -m http.server 8000     # or: npm start
```

Then open <http://localhost:8000>. Any static web host (GitHub Pages, Netlify, etc.) works too; no build step is needed.

## What the coach does

**Before your move (live coaching)**
- It warns you when one of your pieces is hanging or when your opponent is threatening checkmate.
- It points out when your opponent left something loose, or when you have mate in one.
- In the opening it gives beginner principles: take the centre, develop knights and bishops, castle.
- The 💡 **Hint** button escalates. The first press gives the idea ("you can win material"), the second shows which piece to move, and the third shows the best move.

**After your move**
- Every move is graded by Stockfish: Great find, Best, Excellent, Good, Inaccuracy, Mistake or Blunder.
- The coach explains *why* in plain English. For example: "Your bishop on c4 isn't safe there. Nothing protects it, so your opponent can simply take it with dxc4." Other explanations cover a missed free piece, allowing a fork, ignoring a threat, moving a piece that was guarding another, allowing mate, and opening-principle mistakes.
- It shows the better move with arrows on the board, plus a short lesson.
- After a mistake it offers a takeback, so you can find the right move yourself.

**After the game**
- You get a summary with your level for the game, your accuracy, a count of each move grade, and the one thing to work on next.
- **Progress** shows your rating history, your recurring weaknesses and recent games.
- Tap any move in the move list (or use ← →) to review it with the coach's comment.

## Adapting to you

| Coach mode | Your rating | What changes |
| --- | --- | --- |
| Learning the basics | under 700 | Detailed tips, warnings about threats and loose pieces, takebacks on mistakes |
| Beginner | 700–1000 | Threat warnings, takebacks on mistakes |
| Developing | 1000–1300 | Only big dangers (mate threats, loose rooks and queens), takebacks on blunders |
| Club player | 1300–1700 | No warnings; feedback after each move, hints on request |
| Advanced | 1700+ | Short feedback |

The mode follows a blend of your overall rating and how you're playing *this* game, so it changes mid-game if you start playing much better or worse.

**The opponent adapts too.** Stockfish can't play below about 1300 by itself, so the bot picks among Stockfish's candidate moves the way a player of the target rating would. Usually it plays a good move. Sometimes it "slips" and plays an unchecked move, the way real beginners hang pieces. Slips get rarer as its target rating rises. The target follows your rating within the game. Settings has a Challenge option (easier/even/harder) and a fixed-rating mode.

The bot was calibrated by self-play: 10 games per level, measured with the same rating model it is compared against.

| Bot target | Played at (measured) |
| --- | --- |
| 400 | ≈ 450 |
| 700 | ≈ 880 |
| 1000 | ≈ 1120 |
| 1400 | ≈ 1390 |

## How the rating works (and how far to trust it)

After every move, Stockfish measures your **centipawn loss**: how much worse your move was than the best move, in hundredths of a pawn. Stronger players lose fewer centipawns on average. The estimate uses a widely quoted rule of thumb:

> rating ≈ 3100 × e^(−ACPL / 100)  (ACPL = average centipawn loss)

It is wrapped in a small statistical model:

- **Starting point.** Your previous rating (600 for a new player) counts as 15 moves of evidence. A few easy opening moves can't make you look like a master, and one blunder doesn't make you look hopeless.
- **Likely range.** Next to the number you get a range based on the actual spread of your move losses. It is wide early on and narrows as you play more.
- **Overall rating.** It combines your last 20 games, and recent games count more. As you improve, the number follows you.
- **What doesn't count.** Moves that are forced (only one legal move), moves played when the game is already decided, and *assisted* moves are left out. A move is assisted if you used a level 2+ hint, took a move back, or got a specific coach warning first. To get the purest rating, turn warnings off in Settings.

**Caveats, honestly.** The relationship between ACPL and rating is real but loose. Per game it is noisy, so the range is the honest answer and the single number is just its middle. The formula is an informal fit, not an official one, and its scale is roughly comparable to online rapid ratings. It is a good guide to your level and your progress over time, but it is not an official rating. Some background:

- [Lichess forum: estimating Elo from ACPL](https://lichess.org/forum/general-chess-discussion/how-to-estimate-your-elo-for-a-game-using-acpl-and-what-it-realistically-means?page=2) (source of the 3100·e^(−ACPL/100) rule of thumb)
- [How many mistakes do Grandmaster chess players make?](https://kwojcicki.github.io/blog/CHESS-BLUNDERS) (Lichess data: ACPL falls with rating, but the per-game correlation is weak)
- [Correlation of accuracy to rating (Lichess forum)](https://lichess.org/forum/general-chess-discussion/correlation-of-accuracy-to-rating)

Move grades use win-probability drops (Lichess's eval → win% curve), so a pawn lost in a completely winning position isn't called a blunder. Accuracy uses Lichess's accuracy formula.

## Project layout

```
index.html            page
css/app.css           styles (light + dark)
js/main.js            game loop, UI, review mode, dialogs
js/engine.js          Stockfish worker wrapper (UCI, MultiPV, caching)
js/coach.js           explanations, pre-move tips, hints, game summary
js/tactics.js         board reading: hanging pieces (static exchange), forks, mate threats
js/rating.js          centipawn loss → rating estimate, move grades, accuracy, coach modes
js/bot.js             adaptive opponent
js/openings.js        small opening book with beginner-friendly ideas
js/storage.js         progress saved in localStorage
vendor/               chess.js, chessground (board UI), Stockfish 19 lite (WASM) + Stockfish 10 (asm.js fallback)
tests/core.test.mjs   unit tests: npm test
```

## Tests

```bash
npm test
```

The tests cover the rating model, move grading, tactic detection (hanging pieces, forks, mate threats), the coach's explanations, hints and the bot's behaviour. They need Node 18+ and no `npm install`.

## Third-party code

- [Stockfish.js](https://github.com/nmrugg/stockfish.js) (Stockfish 19 lite and Stockfish 10): GPL-3.0
- [chessground](https://github.com/lichess-org/chessground) (Lichess's board UI and the cburnett piece set): GPL-3.0-or-later
- [chess.js](https://github.com/jhlywa/chess.js) (move generation and rules): BSD-2-Clause

Because Stockfish and chessground are GPL-licensed, anyone who distributes this app must do so under GPL-compatible terms. Their license texts are in `vendor/`.
