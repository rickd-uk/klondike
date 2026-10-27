# Klondike: visual overhaul and mobile support — design

Date: 2026-10-27
Status: draft, awaiting approval

## Intent

Klondike (live at klondike.games.rickd.dev) works but looks dated and is desktop-only.
The owner wants two things:

1. **A better look**: a casino-felt table with traditional, high-resolution cards.
   The current cards come from a 1009×385 sprite sheet (about 72×96px per card)
   stretched to 140×190, so they look blurry.
2. **Playable on phones and tablets.** On phones that means **landscape only**:
   a portrait phone mockup was judged far too cramped.

The owner also asked for **traditional rules**: classic Windows-style Klondike rules and standard scoring. The current scoring was modelled on that but gets several parts wrong (see Rules and scoring). Two features were added along the way: Undo and Hint.

Visual reference: the approved mockups in
`.superpowers/brainstorm/303857-1793081247/content/` (`look-v3.html` for the table,
layouts and card backs; `courts.html` row B for the court cards).

## Goals

- Cards stay sharp at any size and on high-density screens. Everything is vector.
- A casino-felt look:
  - Green felt with subtle noise texture and a soft vignette.
  - A dark wood rim around the table on wide screens.
  - Controls in gold/cream on dark green, in a Georgia-style serif.
  - Empty piles drawn as faint outlines on the felt. Empty foundations show a faint suit symbol.
- Traditional court cards (J, Q, K) with real figure artwork, recoloured to a red, gold and black palette (owner's choice, mockup row B).
- The player chooses the card back from five options (deep red, royal blue, racing green, black & gold, royal purple) in a Settings panel. The choice is remembered between visits.
- Fully playable by touch on phones (landscape) and tablets (both orientations), and by mouse on desktop.
- Cards size themselves to the screen. Nothing scrolls during play.

## Non-goals

- Rule variants beyond draw 1 / draw 3: Vegas scoring, limited redeals, and so on.
- Timers on screen, statistics, or other new gameplay features. Undo and Hint are the exceptions (the owner asked for them; see below).
- Portrait play on phones.
- A build step, framework, or splitting into many source files.

## Anti-goals (these count as failure even if everything else works)

- Blurry or pixelated cards anywhere.
- Rank and suit unreadable on overlapped cards on a phone.
- Page scrolling, accidental zoom, or text selection while dragging on touch devices.
- Slow first load on a phone because of heavy card art.
- Scoring that differs from the classic standard values below.

## Constraints

- The app stays one `index.html` with inline CSS and JS, runnable by opening the file from disk.
  Card art lives in a new `cards/` folder next to it.
- Deployment goes through the existing `Makefile` (`make dist` / `make deploy`).
  `dist` must copy `cards/`, and its cache-busting `?v=` handling must cover the new assets instead of the sprite sheet.
- The court art comes from Byron Knoll's Vector Playing Cards (public domain; mirror at
  github.com/notpeter/Vector-Playing-Cards, `cards-svg/`). It must not be swapped for the owner's reference images, which are licensed stock art.

## Decided by the owner

- **Style:** casino felt with traditional cards.
- **Court cards:** traditional figure artwork, not plain letters, in the recoloured red/gold/black palette.
- **Card backs:** a choice of colours.
- **Phones:** landscape only. In portrait, show a "Turn your phone sideways to play" screen.
- **Moving cards:** both drag and tap-to-move.

## The design

### Cards

- **Number cards and aces** are drawn in code as inline SVG, as in the mockup:
  - Cream face (#fdfbf4) with a thin warm-grey border and rounded corners.
  - Standard pip layouts.
  - Pips in the bottom half rotated 180°.
  - A large single pip on aces, with the ace of spades larger.
  - Suits are drawn as SVG paths, not font glyphs, so they look the same on every device.
- **Court cards** draw the same card frame and corners. In the centre panel they embed the recoloured public-domain artwork, cropped to its picture frame.
  The mockup crops each source SVG with `viewBox="23.5 24 124 197.5"` (source viewBox `0 0 167.087 242.667`).
- **Recolouring** of the 12 court SVGs:
  - `#1156a1` blue → `#1a1a1a`
  - `#e2d200` / `#dcd00f` yellow → `#e39a2d` gold
  - Greenish-yellow shading → `#c9821f`
  - Light blues → `#f2c879` / `#3a3a3a`
  - `#df0000` → `#d32128`

  Do this once, offline. Ship only the recoloured files.
- **Two corner styles, picked by rendered card width:**
  - **Traditional:** small rank over small suit, top-left and bottom-right (rotated).
  - **Large index:** for small cards. A big rank top-left and a big suit top-right. The body (pips or court art) moves down to make room, and the bottom corner is dropped.
    This style is for overlapped cards, where only the top strip shows.
  - Builder's call: switch to large index below roughly 90px card width.
- **Card aspect ratio:** 1 : 1.4.
- **Card backs** are an SVG pattern inside a cream border, as in the mockup.
  There are five palettes; the exact colours are in `look-v3.html`, `back()`.
  The chosen back is stored in `localStorage`. The default is deep red.

### Table and controls

- **Felt background:** radial gradient (#23824b → #17633a → #0c4126) with an SVG noise overlay at low opacity and an inset shadow.
- **Wide layouts:**
  - A top bar: Score, Possible moves, then Hint, Undo, New game, Settings and Quit buttons on the right.
  - The +/– size buttons are removed.
- **Settings panel:** a small modal in the same style. It holds the card-back picker, the draw mode (1 or 3), and the "Show hint button" switch.
- **Restyled to match:** the start (player name) modal and the win modal.

### Layouts

The layout is chosen from the viewport and recomputed on resize and on orientation change.

1. **Wide** (desktop, tablets in either orientation, anything not covered below):
   - Top row: stock, waste, gap, four foundations.
   - Below it, seven tableau columns.
   - Card width is computed to fit seven columns across the available width, capped at about 140px. The height must fit too.
2. **Phone landscape** (landscape and viewport height under about 500px):
   - Left column: stock above waste, with score and moves below them.
   - Centre: seven tableau columns using the full height.
   - Right: foundations in a 2×2 grid, with Hint, Undo, New game, Quit and Settings below.
   - The width is split as 10 card-widths plus gaps, with side insets for phone notches (use `env(safe-area-inset-*)`).
3. **Phone portrait** (portrait and viewport width under about 600px):
   - Show only the rotate prompt.
   - The game state is kept, so rotating back resumes play.

**Column fanning:**
- Face-down cards overlap tightly; face-up cards overlap with enough showing to read the index.
- If a column would run past the bottom of the table, both overlaps shrink proportionally so the column fits.

### Interaction

- **One input path for everything:** use Pointer Events for mouse, touch and pen. Remove HTML5 drag-and-drop.
- **Prevent browser gestures:** set `touch-action: none` on the board, block text selection, and prevent pinch and double-tap zoom on the game area.
- **Drag:**
  - Press on a face-up card. A tableau card brings everything stacked on it.
  - Moving past a small threshold (about 6px) starts the drag. The card lifts with a larger shadow and follows the pointer.
  - On release, it drops on the pile under the pointer if the move is legal (reuse the existing validity and move code).
  - Otherwise it animates back.
- **Tap/click** (press and release without passing the threshold) on a face-up card moves it to the best legal destination:
  - Foundation first, when the card is a single top card.
  - Otherwise the first legal tableau column, preferring a non-empty column over an empty one.
  - If nothing is legal, give a small shake.

  This replaces double-click everywhere. Behaviour is the same on desktop and touch.
- **Tapping a face-up tableau card that has cards on top of it** moves that whole run to the first legal tableau column.
- **Tapping a foundation's top card** keeps the current double-click behaviour (`handleFoundationDoubleClick`): it moves back to the tableau when legal.
- **Tap on the stock** deals, as now, including recycling the waste.
- **Animation:** tapped moves and failed drops slide in about 150–200ms. The game logic stays synchronous; animation is visual only.

### Rules and scoring (owner: "traditional rules")

These are classic Windows Klondike rules with standard scoring.

- **Draw mode:** Draw 3 (the traditional default) or Draw 1, set in Settings and saved in `localStorage`.
  Changing it takes effect on the next new game (my call: draw-3 default with the choice offered, since the owner asked what's usual).
- **Draw 3:**
  - Each stock tap turns up to three cards onto the waste.
  - The top three waste cards are shown fanned; only the top one is playable.
- **Recycling:** an empty stock tap turns the waste back over. Unlimited passes.
- **Tableau:** build down in alternating colours. Only a King, or a run starting with a King, may go into an empty column.
  Any face-up run may move. A face-down card that becomes exposed turns up automatically, as now.
- **Foundations:** build up by suit from Ace.
  A foundation's top card (not an Ace) may move back to a tableau column **only where it legally fits**.
  On a tap it goes to the first legal column; when there is none, give a shake.
  This replaces the current "drop on the shortest column" behaviour.
- **Scoring (standard):**

  | Event | Points |
  |---|---|
  | Waste → tableau | +5 |
  | Waste → foundation | +10 |
  | Tableau → foundation | +10 |
  | Turn over a tableau card | +5 |
  | Foundation → tableau | −15 |
  | Recycle waste, draw 1 | −100 per recycle |
  | Recycle waste, draw 3 | −20 per recycle after the 3rd pass |
  | Time | −2 for every 10 seconds of play |
  | Win bonus (game over 30 s) | + 700000 ÷ seconds taken |

  - The score never goes below 0.
  - The clock starts on the first move or stock tap of a deal.
  - Keep the move score and the time penalty separate: displayed score = max(0, move score − time penalty). Undo restores only the move score.
  - These replace all the current values, including the wrong +15 and the inverted win bonus.
- **Possible moves:** the count stays in the bar. It must handle draw 3, where only the top waste card is playable.

### Undo (owner asked for it)

- An **Undo** button sits next to New game: in the top bar on wide layouts, and in the right-hand gutter in phone landscape.
  On desktop, Ctrl/Cmd+Z also undoes (my call).
- **Unlimited steps** back to the start of the deal (my call). Every state change counts as a step:
  - a card or run moved
  - a stock deal
  - a waste recycle
  - a face-down card turned up as part of a move
- **Implementation:** before each change, push a deep snapshot of `tableau`, `stock`, `waste`, `foundations` and `score`. Undo pops one and re-renders.
  - The move score goes back to its value before the move, with no penalty for undoing (my call). The time penalty is not refunded (see Rules and scoring).
  - The stack clears on New game or Restart.
- The button is disabled when there's nothing to undo.

### Hint (owner asked for it, with an option to switch it off)

- A **Hint** button sits next to Undo.
- **Settings toggle:** "Show hint button". It's on by default and saved in `localStorage`. When it's off, the button is hidden.
- **What pressing Hint does:** it highlights one suggested move for about 1.5 seconds. The source card (and its run) and the destination pile both get a soft gold glow. Nothing moves by itself.
- **Which move gets suggested**, in this order (my call; reuse the existing possible-moves calculation):
  1. A move that turns up a face-down card.
  2. A move to a foundation.
  3. A waste-to-tableau move.
  4. Any other legal tableau move that isn't a pointless back-and-forth.
  5. Otherwise, the stock glows ("deal").
  6. If even that isn't possible, a short "No moves left" message.
- No score penalty for using a hint (my call; classic Windows Klondike had no hint to copy).

### Clean-up while in there

- Remove the duplicate `handleDragStart` / `handleDragOver` / `handleDrop` definitions; they're replaced by the pointer code.
- Remove `playingcards_standard.png` and all sprite code paths.
- Update the `<title>` to something short (for example "Klondike Solitaire").

## Left to the builder

- Exact breakpoints, gaps, overlap ratios, and the large-index threshold, within the ranges above.
- How the court SVGs are optimised. Target: all 12 under about 1MB total. Strip Inkscape metadata, reduce precision, minify.
  Whether to embed them inline in `index.html` or load them from `cards/`. Loading from `cards/` with `?v=` cache-busting is the default.
- DOM structure: re-render per move as now, or move existing elements. Whichever keeps animation simple.
- Ace and number-card pip styling details, within the mockup's look.
- Whether the existing `onbeforeunload` "Are you sure?" prompt stays. Not in scope; leave as is unless it breaks mobile.

## Verification

- Headless screenshots, using the Chrome command in `HANDOFF.md`, at:
  - 1440×900
  - 1024×768
  - 768×1024
  - 844×390
  - 390×844 (rotate prompt)

  Check that the cards are sharp and nothing overflows.
- Play through on desktop with a mouse and on a phone (or Chrome device emulation with touch):
  - Drag single cards and stacks.
  - Tap-to-move to the foundation and to the tableau.
  - Stock dealing and recycling.
  - Undo after each kind of move, including several in a row back to the deal. Check that the board and score return exactly.
  - A win.
- Check that the scoring matches the table in Rules and scoring for each kind of move, recycle, time penalty and win bonus, in both draw modes.
