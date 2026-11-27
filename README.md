# Chess Coach

A browser chess coach for complete beginners. You play against an opponent that adapts to you. A coach talks you through the game move by move, and you get a rating estimate that updates after every move you make. Afterwards, the coach reviews your games with you, and a lesson library takes you from beginner to advanced.

The app has four sections:

- **Play** — a game against Coach Bot, with live coaching and your rating after every move.
- **Review** — every move of your games graded and explained, plus games you import from chess.com or Lichess.
- **Learn** — 14 lessons from beginner to advanced with 30 interactive exercises checked by Stockfish, practice positions built from your own mistakes, and a reading list.
- **Progress** — your rating history, what to work on, and your recent games.

Everything runs in your browser, including the Stockfish engine. Your progress is saved in the browser. When the app runs as a claude.ai artifact (for example from the Claude iPhone app) and you're signed in, it is also saved privately to your Claude account, so it follows you between devices.

## Running it

The engine runs in a Web Worker, which browsers don't allow from `file://` pages, so serve the folder over HTTP:

```bash
python3 -m http.server 8000     # or: npm start
```

Then open <http://localhost:8000>. Any static web host (GitHub Pages, Netlify, etc.) works too; no build step is needed.

**On iPhone/iPad:** open the published artifact link from the Claude app, or host the folder anywhere and open it in Safari. Moves work by tapping a piece and then its square, or by dragging. Safari's *Share → Add to Home Screen* gives it an app icon. On slower phones the engine automatically searches a little less deeply so it stays responsive.

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

**What your opponent is doing.** After each of Coach Bot's moves, the coach says what it does (develops a piece, takes something, gives check). It doesn't spell out threats, because finding those is your job; for beginners the pre-move warnings cover them. You can turn this off in Settings.

**After the game**
- You get a summary with your level for the game, your accuracy, a count of each move grade, and the one thing to work on next.
- **Review this game** opens the full review (below).

## Game review

- An **eval graph** shows who was ahead through the game, with dots for mistakes (big dots are yours). Tap it to jump to that moment.
- **Key moments** jumps straight to your mistakes, your opponent's mistakes and great moves.
- **Every move of both sides** gets a grade and an explanation; your opponent's moves are described from their side.
- **Show best move** draws the better move (green) next to what was played (red). **Play best line** animates the engine's line.
- **Try it yourself** puts you back in the position before your mistake to find a better move. The engine checks your answer.
- **Import a game:** paste a PGN from chess.com (*Share → PGN*) or Lichess (*Share & export*). The coach analyses every move. Imported games count toward your rating, since they're real games you played.

## Learn

The curriculum follows what coaches' study plans by rating agree on:

| Level | Lessons |
| --- | --- |
| Beginner (about 0–1000) | Is it safe? counting attackers and defenders · thinking routine: checks, captures, threats · opening principles · basic checkmates · forks · pins and skewers |
| Intermediate (about 1000–1600) | Discovered attacks · removing the defender · pawn endgames (rule of the square, opposition) · mating with rooks · mating patterns |
| Advanced (about 1600+) | Rook endgames (Lucena, Philidor) · strategy when there's no tactic · calculation |

- Each lesson has a short explanation, then exercises on a board. There are three kinds: find the best move, play a short line, or play the position out against Stockfish. Examples: mate with king and queen, win the Lucena, hold the Philidor.
- Any good move is accepted, not only the "book" answer, because the engine checks alternatives. Wrong moves get an explanation of what goes wrong.
- `npm run verify-lessons` checks every exercise position and solution with Stockfish.
- **Recommended for you** picks lessons from the mistakes the coach tagged in your recent games.
- **Practice your mistakes** turns positions where you went wrong in your own games into puzzles.
- **Before every move** is a four-step checklist based on Dan Heisman's advice against "hope chess".
- The **Library** has books by level and free websites and videos.

### Sources used for the curriculum and library

- Coaches' study plans by rating: [Chess.com study plan directory](https://www.chess.com/article/study-plan-directory), [The Complete Chess Improvement Roadmap: 0 to 2000](https://www.chess.com/blog/Michel2426/the-complete-chess-improvement-roadmap-from-0-to-2000-rating), [How to make progress based on your rating](https://www.chess.com/blog/WGMTijana/how-to-make-progress-based-on-your-rating)
- The Steps Method: [Han Schut on Lichess](https://lichess.org/@/HanSchut/blog/the-steps-method-for-learning-and-teaching-chess/L74I4Ihq), [New in Chess](https://newinchess.com/the-complete-step-by-step-method)
- Yusupov's course levels: [book review](https://www.chess.com/blog/beccrajoy/book-review-yusupovs-build-up-your-chess-the-fundamentals)
- Thinking process: [Dan Heisman, Passive vs Basic Hope Chess](https://www.chess.com/article/view/passive-vs-basic-hope-chess)
- Tactics: [Chess Tactics: 38 Definitions and Examples](https://www.chess.com/article/view/chess-tactics)
- Endgames: [The Two Rook Endings You Must Know](https://www.chess.com/article/view/the-two-rook-endings-you-must-know), [The complete U2000 guide to theoretical endgames](https://lichess.org/@/elementalmaster1/blog/the-complete-u2000-guide-to-theoretical-endgames/Hlht1BY0)
- Book recommendations: [Good Chess Books for Beginners and Beyond](https://www.chess.com/blog/RussBell/good-chess-books-for-beginners-and-beyond), [Chess Books – From Beginner to Expert](https://www.chess.com/blog/joeldick/chess-books-from-beginner-to-expert)
- Videos: [Top YouTube Chess Channels for Beginners](https://www.chess.com/blog/FRANKEE459/top-youtube-chess-channels-for-beginners)

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
index.html               page (Play, Review, Learn, Progress)
css/app.css              styles (light + dark, phone layouts, iOS safe areas)
js/main.js               game loop, navigation, Progress page, dialogs
js/review.js             game review and PGN import
js/learn.js              lessons, exercise runner, mistakes practice, library
js/lessons.js            the curriculum (lesson text + exercises)
js/library.js            books, websites, videos, move checklist
js/analysis.js           move grading and whole-game analysis
js/engine.js             Stockfish worker wrapper (UCI, MultiPV, caching, adaptive depth)
js/coach.js              explanations, pre-move tips, hints, opponent-move notes, tips library
js/tactics.js            board reading: hanging pieces (static exchange), forks, mate threats
js/rating.js             centipawn loss → rating estimate, move grades, accuracy, coach modes
js/bot.js                adaptive opponent
js/openings.js           small opening book with beginner-friendly ideas
js/storage.js            progress in the browser, plus your Claude account when available
js/board.js, exercise.js shared helpers
vendor/                  chess.js, chessground (board UI), Stockfish 19 lite (WASM) + Stockfish 10 (asm.js fallback)
tests/core.test.mjs      unit tests: npm test
tests/verify-lessons.mjs checks every lesson exercise with Stockfish: npm run verify-lessons
```

## Tests

```bash
npm test
```

The tests cover:

- the rating model and move grading
- tactic detection (hanging pieces, forks, mate threats)
- the coach's explanations, hints and opponent-move notes
- PGN parsing and whole-game review
- the curriculum data and the bot's behaviour

They need Node 18+ and no `npm install`. `npm run verify-lessons` runs Stockfish (the vendored build, under Node) over every exercise; it takes a few minutes.

## Third-party code

- [Stockfish.js](https://github.com/nmrugg/stockfish.js) (Stockfish 19 lite and Stockfish 10): GPL-3.0
- [chessground](https://github.com/lichess-org/chessground) (Lichess's board UI and the cburnett piece set): GPL-3.0-or-later
- [chess.js](https://github.com/jhlywa/chess.js) (move generation and rules): BSD-2-Clause

Because Stockfish and chessground are GPL-licensed, anyone who distributes this app must do so under GPL-compatible terms. Their license texts are in `vendor/`.
