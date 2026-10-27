# Klondike visual overhaul + mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Klondike's look (casino felt, crisp vector cards with traditional red/gold/black court art) and make it playable on phones (landscape) and tablets. Along the way, add traditional draw-1/draw-3 rules and scoring, unlimited Undo, and an optional Hint.

**Architecture:** The game stays one `index.html` (no build step), but its JS is split into four inline `<script>` blocks. Three of them are pure, with no DOM, and Node unit-tests them by extracting each block by id and running it in `vm`:
- `klondike-core`: rules, scoring, undo, hint
- `klondike-cards`: SVG card strings
- `klondike-layout`: geometry

The fourth, `klondike-ui`, owns the DOM, pointer input and settings, and is tested end-to-end. Those tests drive headless Chrome over the DevTools protocol with Node's built-in `WebSocket`, with no npm dependencies. Court art is 12 recoloured, svgo-optimised SVGs in `cards/`.

**Tech Stack:**
- The app: vanilla HTML/CSS/JS, inline SVG, Pointer Events.
- Tests: Node 24 `node:test` + `node:vm`, and `google-chrome-stable` headless for the end-to-end tests.
- Asset pipeline: `npx svgo@3.3.2`, used only by the build script.

**Spec:** `docs/superpowers/specs/2026-10-27-klondike-visual-mobile-design.md` (read it first; this plan argues from it). Visual reference: `.superpowers/brainstorm/303857-1793081247/content/look-v3.html` and `courts.html` row B (untracked, local only).

## Global Constraints

- The app is one `index.html` with inline CSS/JS, and it must run by opening the file from disk. The only extra runtime assets are in `cards/`.
- There are no runtime dependencies or CDNs. Dev-only tools are Node 24 built-ins, `npx svgo@3.3.2` (asset build only) and `google-chrome-stable`.
- Card aspect ratio: 1 : 1.4. All card graphics are vector.
- Felt: `radial-gradient(ellipse at 50% 35%, #23824b 0%, #17633a 50%, #0c4126 100%)` + SVG noise overlay + inset shadow. Controls are gold/cream on dark green, in a Georgia serif.
- Court recolour: blue → `#1a1a1a` (light/medium blues → `#3a3a3a`), yellow → `#e39a2d`, olive/green shading → `#c9821f`, light highlight → `#f2c879`, `#df0000` → `#d32128`. No blue or green may remain.
- Card backs, exactly these keys: `red`, `blue`, `green`, `black`, `purple`. Default `red`.
- Scoring:
  - waste→tableau +5
  - waste→foundation +10
  - tableau→foundation +10
  - turn over a tableau card +5
  - foundation→tableau −15
  - recycle: −100 each in draw 1; −20 per recycle from the 3rd recycle onward in draw 3 (passes 1–3 are free)
  - −2 per full 10 s
  - win bonus `round(700000 / seconds)` if seconds > 30
  - displayed score = `max(0, moveScore − timePenalty)` + bonus
  - the clock starts on the first move or stock tap
- Draw mode: default 3, set in Settings, takes effect on the next new game.
- Settings live in `localStorage` key `klondike.settings` as `{back, drawCount, showHint}`. Every `localStorage` access goes through try/catch.
- Layout modes:
  - `rotate`: `vh > vw && vw < 600`
  - `phone`: `vw >= vh && vh < 500`
  - `wide`: everything else
- Large-index cards when `cardW < 90`. Wide-mode `cardW` ≤ 140.
- Tap/click replaces double-click everywhere. Drag starts after 6px of movement. Move animations last 180ms.
- Court art credit: Byron Knoll, public domain, via github.com/notpeter/Vector-Playing-Cards. Credit it in an HTML comment and in `cards/README.md`.

## Review Focus

1. **`pointercancel` mid-drag** (an incoming call, a system edge swipe, a touch cancelled by the browser): the dragged cards animate back and the game state is unchanged. Test: Task 6 `touch cancel mid-drag returns cards`.
2. **Rotation or resize mid-drag:** the drag is abandoned, the board re-lays out for the new size, and the state is unchanged. Test: Task 6 `resize mid-drag cancels`.
3. **`localStorage` that throws** (Safari private mode, blocked storage): the game starts with default settings and remains fully playable. Test: Task 5 `storage throwing falls back to defaults`.
4. **Fast repeated taps while an animation is running:** each tap applies against the current state, there are no double moves, and the DOM matches the state afterwards. Test: Task 6 `rapid taps apply in order`.
5. **Undo across a recycle and across a win:** the stock and waste order come back exactly; undoing the winning move clears the win. Test: Task 2 `undo restores recycle order` and `undo after win clears win`.

---

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Everything, in sections:<br>- `<style>`<br>- markup (bar, table, modals)<br>- `<script id="klondike-core">`: global `Klondike`<br>- `<script id="klondike-cards">`: global `KlondikeCards`<br>- `<script id="klondike-layout">`: global `KlondikeLayout`<br>- `<script id="klondike-ui">`: DOM, input, settings |
| `cards/{J,Q,K}{C,D,H,S}.svg` | 12 recoloured, optimised court SVGs (generated, committed) |
| `cards/README.md` | Source, licence and credit |
| `tools/build-courts.sh` | Download → recolour → svgo → `cards/` |
| `tests/load.mjs` | `loadScripts(...ids) -> context` (extracts inline scripts by id and runs them in a `vm` context) |
| `tests/core.test.mjs`, `tests/cards.test.mjs`, `tests/layout.test.mjs`, `tests/assets.test.mjs` | Unit tests |
| `tests/cdp.mjs` | Minimal headless-Chrome driver |
| `tests/e2e.test.mjs` | Browser tests |
| `tests/screens.sh` | Screenshots at the 5 spec sizes into `tests/out/` (gitignored) |
| `Makefile`, `deploy/meta.json`, `.gitignore`, `HANDOFF.md` | Deploy and housekeeping |
| `playingcards_standard.png` | Deleted |

Run all unit tests with `node --test tests/` (the e2e file skips itself unless `E2E=1`).

---

### Task 0: Branch

- [ ] **Step 1:** Create the branch: `git checkout -b klondike-visual-mobile` (from `deploy-klondike`).
- [ ] **Step 2:** Commit the spec and plan: `git add docs/ && git commit -m "docs: klondike visual + mobile design and plan"`.

### Task 1: Core rules and scoring (`klondike-core`)

**Files:**
- Modify: `index.html`. Add `<script id="klondike-core">` before the existing script. Leave the old script untouched for now; Task 5 replaces it.
- Create: `tests/load.mjs`, `tests/core.test.mjs`
- Modify: `.gitignore` (add `/tests/out/` and `.superpowers/`)

**Interfaces:**
- Produces (global `Klondike`):
  - `Card = {suit:'clubs'|'diamonds'|'hearts'|'spades', rank:'A'|'2'…'10'|'J'|'Q'|'K', faceUp:boolean}`
  - `Loc = {pile:'tableau', index, cardIndex} | {pile:'waste'} | {pile:'foundation', index}`
  - `Dest = {pile:'tableau'|'foundation', index}`
  - `State = {tableau: Card[7][], stock: Card[], waste: Card[], foundations: Card[4][], drawCount: 1|3, moveScore, recycles, startedAt: number|null, wonAt: number|null, history: []}`

    Foundations have no `suit` field: a foundation's suit is its first card's. An Ace may go to any empty foundation.
  - `Klondike.SUITS`, `Klondike.RANKS`
  - `Klondike.newGame({drawCount = 3, deck} = {}) -> State`

    `deck` is 52 cards in deal order and defaults to shuffled. Deal as now: column i gets i+1 cards, the last face-up, and the rest go to `stock`.
  - `Klondike.canMove(state, from: Loc, to: Dest) -> boolean`
  - `Klondike.move(state, from, to, now = Date.now()) -> boolean`

    It mutates the state, scores, flips the newly exposed tableau card (+5), sets `startedAt` if null, and sets `wonAt` when won.
  - `Klondike.draw(state, now = Date.now()) -> 'dealt'|'recycled'|'empty'`

    It deals `drawCount` cards (or fewer) from the front of `stock` onto the end of `waste`, face up. When the stock is empty and the waste is not, it recycles: `stock = waste` (same order, face down), `recycles++`, and applies the penalty.
  - `Klondike.elapsedSeconds(state, now) -> number`: 0 before the first action, frozen at `wonAt`.
  - `Klondike.score(state, now) -> number`
  - `Klondike.isWon(state) -> boolean`

- [ ] **Step 1: Write `tests/load.mjs`**

  `export function loadScripts(...ids)` reads `../index.html` relative to the module. For each id, it extracts the body of `<script id="${id}">…</script>` (regex, non-greedy) and runs it in one shared `vm.createContext({})` with `vm.runInContext`. It returns the context. Top-level `const Klondike = …` would not land on the context, so each pure script must end with `globalThis.Klondike = Klondike;` (same for `KlondikeCards`, `KlondikeLayout`).

- [ ] **Step 2: Write failing tests in `tests/core.test.mjs`**

  Use a helper `orderedDeck()` that returns the 52 cards in suit-major, rank order (clubs A..K, diamonds, hearts, spades), all face-down. Build the scenarios by constructing `State` objects directly (helper `stateWith({tableau, stock, waste, foundations, drawCount})`, filling defaults) rather than hunting through deals.

  - `deal shape`: `newGame({deck: orderedDeck()})` gives tableau lengths `[1..7]`, only the last card of each column face-up, `stock.length === 24`, `waste.length === 0`, `drawCount === 3`, `moveScore === 0`.
  - `tableau rules`: alternating colour, one rank lower. King-led runs only into empty columns. A face-down card can't be moved.
  - `foundation rules`: an Ace goes to any empty foundation, then same-suit +1. Only the top card of a tableau column may go to a foundation.
  - `scores`:
    - waste→tableau = 5
    - waste→foundation = 10
    - tableau→foundation exposing a face-down card = 10 + 5
    - tableau→tableau exposing = 5
    - tableau→tableau exposing nothing = 0
    - foundation→tableau = −15, and is only allowed onto a legal column (`canMove` is false for an illegal one)
    - a foundation Ace can't move back
  - `draw 1`: deals 1. A recycle gives `stock` in the original order and costs −100 each time.
  - `draw 3`: deals 3 (2 when only 2 left), last dealt on top. Recycles 1 and 2 cost 0, the 3rd costs −20, the 4th another −20 (`moveScore === -40`).
  - `draw empty`: with no stock and no waste, it returns `'empty'` and changes nothing.
  - `clock`:
    - `elapsedSeconds` is 0 before any action.
    - After `draw(state, 1000)`, `score(state, 1000 + 19_999)` → time penalty 2 (one full 10 s).
    - At `+20_000` the penalty is 4.
    - The score is never < 0.
  - `win bonus`: given a state one move from won, with `startedAt = 0`, a move at `now = 100_000` sets `wonAt`. `score(state, anyLater)` equals `max(0, moveScore − 2*10) + Math.round(700000/100)`, and `elapsedSeconds` stays 100. With a winning move at 20 s: no bonus.

- [ ] **Step 3:** Run `node --test tests/core.test.mjs`. Expected: FAIL (`Klondike` undefined).
- [ ] **Step 4:** Implement the `klondike-core` script to the interfaces above.
- [ ] **Step 5:** Run `node --test tests/core.test.mjs`. Expected: all pass.
- [ ] **Step 6:** Commit: `git add index.html tests/ .gitignore && git commit -m "feat(core): traditional klondike rules and scoring as pure module"`.

### Task 2: Undo

**Files:** Modify `index.html` (`klondike-core`), `tests/core.test.mjs`

**Interfaces:**
- Produces:
  - `Klondike.undo(state) -> boolean`
  - `Klondike.canUndo(state) -> boolean`
- `move` (successful) and `draw` (`'dealt'`/`'recycled'`) push a deep snapshot `{tableau, stock, waste, foundations, moveScore, recycles, wonAt}` onto `state.history` before mutating. `undo` pops and restores it. `startedAt` is never restored (the time penalty is not refunded).

- [ ] **Step 1: Write failing tests**
  - `undo move`: restores the board, `faceUp` flags (the re-hidden card is face-down again) and `moveScore`.
  - `undo restores recycle order`: draw-3 through the whole stock, recycle, then undo. `stock`/`waste` deep-equal the pre-recycle values and `recycles` is decremented.
  - `undo chain`: 5 mixed actions, 5 undos → deep-equals the fresh deal's piles. A 6th undo returns false.
  - `undo after win clears win`: win, then undo → `isWon` is false, `wonAt` is null, and the score has no bonus.
  - `undo keeps clock`: `startedAt` is unchanged after undo.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `node --test tests/core.test.mjs` → pass.
- [ ] **Step 5:** Commit: `feat(core): unlimited undo`.

### Task 3: Tap destination, hint, move count

**Files:** Modify `index.html` (`klondike-core`), `tests/core.test.mjs`

**Interfaces:**
- Produces:
  - `Klondike.bestDestination(state, from: Loc) -> Dest | null`
  - `Klondike.hint(state) -> {from: Loc, to: Dest} | {draw: true} | null`
  - `Klondike.countMoves(state) -> number`
- `bestDestination` order:
  1. If `from` is the waste top, or a tableau column's last card: the first foundation (index 0..3) that accepts it.
  2. The first legal non-empty tableau column (0..6, excluding the source).
  3. The first empty column. Skip this when `from` is tableau with `cardIndex === 0`.

  From a foundation: steps 2 then 3.
- `hint` priority (spec, "Hint"):
  1. A tableau move from `cardIndex > 0` whose card below is face-down. Foundation destinations are preferred.
  2. Any move to a foundation (waste top or tableau last).
  3. waste → tableau.
  4. tableau → tableau where `cardIndex === 0` into a non-empty column.

     Never suggest a run whose card below is face-up, or a run from index 0 into an empty column.
  5. `{draw:true}` if the stock or the waste is non-empty.
  6. Otherwise `null`.

  Within a tier, use the lowest source column first.
- `countMoves` keeps the current `updatePossibleMoves` semantics exactly (`index.html` lines 665–724 before this work): waste top → each tableau/foundation, and each column's last card → each foundation and each other column. Only the waste top counts, in draw 3 as well.

- [ ] **Step 1: Write failing tests**
  - `tap prefers foundation`: a waste 2♥ with A♥ on a foundation and a legal tableau spot → foundation.
  - `tap moves run`: tapping a mid-column face-up card → the first legal column, with the whole run.
  - `tap no pointless king move`: a K at index 0 with an empty column available → `null`.
  - `tap from foundation`: → the first legal column, or `null`.
  - `hint tiers`: one constructed state per tier 1–6 asserting the returned value. A tier-4-excluded back-and-forth move alone yields `{draw:true}`.
  - `countMoves`: a constructed state with a hand-counted expected number (e.g., 4).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → pass.
- [ ] **Step 5:** Commit: `feat(core): tap destination, hint and move count`.

### Task 4: Court art pipeline and card renderer (`klondike-cards`)

**Files:**
- Create:
  - `tools/build-courts.sh`
  - `cards/*.svg` (generated)
  - `cards/README.md`
  - `tests/assets.test.mjs`
  - `tests/cards.test.mjs`
- Modify: `index.html` (add `<script id="klondike-cards">`)

**Interfaces:**
- Produces (global `KlondikeCards`):
  - `ASSET_VERSION`: the literal line `const ASSET_VERSION = '';`. Makefile dist rewrites it.
  - `KlondikeCards.BACKS = ['red','blue','green','black','purple']`
  - `KlondikeCards.face(card, {largeIndex}) -> string`: an `<svg viewBox="0 0 250 350">` string.
  - `KlondikeCards.back(color) -> string`
  - `KlondikeCards.courtUrl(card) -> string`: `cards/${rank}${'CDHS'[…]}.svg${ASSET_VERSION}`
- The drawing follows `look-v3.html`: `SUIT` paths, `LAY` pip table with `L=80,M=125,R=170`, `face()`, `back()`, and the court crop `viewBox="23.5 24 124 197.5"` with traditional frame `[46,50,158,250]` and large-index frame `[50,104,150,236]`. Port it, don't redesign it.

- [ ] **Step 1: Write `tools/build-courts.sh`**

  It runs `set -euo pipefail`:
  1. Download `{J,Q,K}{C,D,H,S}.svg` from `https://raw.githubusercontent.com/notpeter/Vector-Playing-Cards/master/cards-svg/` into `mktemp -d`.
  2. Recolour with `sed`, using the Global Constraints mapping. The mockup's map missed `#5f94bc`-family blues and `#1c5c20`; map *every* blue to `#3a3a3a`/`#1a1a1a` and every green to `#c9821f`.
  3. Run `npx -y svgo@3.3.2 -q --multipass --precision 1 -f <tmp> -o cards/`.

  Write `cards/README.md`: source URL, "public domain (Byron Knoll), recoloured red/gold/black".
- [ ] **Step 2: Write failing `tests/assets.test.mjs`**
  - 12 files exist.
  - Each is ≤ 350 000 bytes.
  - The total gzip (`zlib.gzipSync` of the concatenation) is ≤ 1 300 000.
  - None contains `<script`, ` on[a-z]+=`, or `href="http`.
  - No `#rrggbb` fill/stroke has a hue in 90°–260° with saturation > 0.25 (no blue or green left).
- [ ] **Step 3:** Run `bash tools/build-courts.sh && node --test tests/assets.test.mjs`. Iterate on the colour map until it passes. Then render `KH`, `QS`, `JD`, `KC` headlessly and compare by eye with `courts.html` row B.
- [ ] **Step 4: Write failing `tests/cards.test.mjs`**

  It uses `loadScripts('klondike-cards')`.
  - `face` for 2..10 contains exactly N pip `<path` uses in the body, plus the corner suits: 2 for traditional, 1 for large index. Count by a `data-pip` attribute on the body pips.
  - A court face contains `courtUrl(card)` and the crop viewBox.
  - A large-index face has no rotated bottom corner (no `rotate(180 125 175)`).
  - Red suits use `#b3121f`.
  - `back(c)` succeeds for each of `BACKS` and has a unique pattern id per colour.
  - `courtUrl({rank:'Q',suit:'spades'}) === 'cards/QS.svg'`.
- [ ] **Step 5:** Run → FAIL. **Step 6:** Implement the `klondike-cards` script (end with `globalThis.KlondikeCards = KlondikeCards;`). **Step 7:** Run `node --test tests/` → pass.
- [ ] **Step 8:** Commit: `git add tools cards tests index.html && git commit -m "feat(cards): vector cards with recoloured public-domain court art"`.

### Task 5: Layout, table UI, settings (`klondike-layout`, `klondike-ui`)

**Files:**
- Modify: `index.html`:
  - Replace the whole old `<style>`, markup and old script.
  - Add `<script id="klondike-layout">` and `<script id="klondike-ui">`.
- Create:
  - `tests/layout.test.mjs`
  - `tests/cdp.mjs`
  - `tests/e2e.test.mjs` (render/settings cases)
  - `tests/screens.sh`

**Interfaces:**
- Produces (global `KlondikeLayout`, pure):
  - `KlondikeLayout.mode(vw, vh) -> 'wide'|'phone'|'rotate'`, using the Global Constraints rules.
  - `KlondikeLayout.compute(vw, vh, insets = {l:0,r:0,t:0,b:0}) -> {mode, cardW, cardH, largeIndex, stock:{x,y}, waste:{x,y}, foundations:[{x,y}×4], tableau:[{x,y}×7], bottom, sideLeft?:{x,y,w}, sideRight?:{x,y,w}}`
    - Wide: a top bar of `barH = 48` above the table. Then the top row (stock, waste, gap, foundations 3–6 aligned to tableau columns 3–6). Then the tableau. `cardW = min(140, floor((vw − 2·pad − 6·gap)/7))`, and also no larger than lets the top row plus 2.5 card heights fit in `vh − barH`.
    - Phone: there is no top bar. 10 card widths + gaps across `vw − insets.l − insets.r`. Left: stock over waste, with `sideLeft` below for score and moves. Tableau in the centre. Right: foundations 2×2, with `sideRight` below for buttons.
    - Rotate: `{mode:'rotate'}` only.
  - `KlondikeLayout.fan(pile, cardH, availH, largeIndex) -> number[]`: the y offset per card.

    Steps: face-down `0.08·cardH`; face-up `0.25·cardH` (traditional) or `0.30·cardH` (large index). When the last card would end past `availH`, both steps are scaled by the same factor so it fits exactly.
- Produces (`klondike-ui`, top-level, used by Task 6 and the e2e tests):
  - `let game` (a `Klondike` State)
  - `let settings` (`{back, drawCount, showHint}`)
  - `function newGame(opts)` (opts are passed through to `Klondike.newGame`; `drawCount` defaults to `settings.drawCount`)
  - `function render()`
  - `function loadSettings()` / `function saveSettings()`

  Each card element is `<div class="card" data-card="QS" data-pile="tableau" data-index="2" data-card-index="4">` containing the SVG. Pile slots are `<div class="slot" data-pile="foundation" data-index="1">`, and the stock is `data-pile="stock"`. Waste in draw 3 shows the top three fanned horizontally by `0.18·cardW`; only the top one carries `data-pile="waste"` interaction.
- Look: port the `look-v3.html` styles for felt, wood rim (wide only), `.bar`, `.btn`, `.btn.ghost`, `.slot` (faint suit mark on empty foundations) and `.settings`.
- Start-name modal and win modal keep their current behaviour and ids (`startModal`, `playerName`, `startGame`, `winModal`, `winMessage`, `playAgain`, `exitGame`), restyled. Keep the existing `playerName` `localStorage` key and the `onbeforeunload` prompt as they are.
- Settings modal `#settingsModal`:
  - The back picker (5 options, rendered with `KlondikeCards.back`).
  - Draw: two buttons, "Draw 1" / "Draw 3", with the caption "Applies to your next game".
  - A checkbox "Show hint button".
  - A Done button.
- Buttons: wide-bar order Score, Possible moves | Hint, Undo, New game, Settings, Quit. Phone: score and moves in `sideLeft`; Hint, Undo, New game, Quit, Settings in `sideRight`. Ids: `hintBtn`, `undoBtn`, `newGameBtn`, `settingsBtn`, `quitBtn`, `scoreValue`, `movesValue`. `#hintBtn` is hidden when `!settings.showHint`. `#undoBtn` is disabled when `!Klondike.canUndo(game)`.
- The score display refreshes every second while a game is running (the time penalty).
- Rotate screen `#rotatePrompt`: "Turn your phone sideways to play". Re-layout on `resize` and `orientationchange`. Use `env(safe-area-inset-*)` via CSS variables read into `insets`. Add `viewport-fit=cover` to the viewport meta tag.

- [ ] **Step 1: Write failing `tests/layout.test.mjs`**
  - `mode` at 1440×900, 1024×768 and 768×1024 is `wide`; 844×390 is `phone`; 390×844 is `rotate`.
  - At each size, every slot is inside `[0,vw]×[0,vh]` (and the tableau top plus `cardH` is ≤ `vh`).
  - 1440×900: `cardW === 140`, `largeIndex === false`. 844×390: `largeIndex === true`.
  - `fan` for 6 down + 13 up with small `availH`: the last offset + `cardH` ≤ `availH`, and the step ratio is preserved. For a short pile, the uncompressed steps are exactly `0.08`/`0.25` × `cardH`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `klondike-layout`. **Step 4:** Run → pass.
- [ ] **Step 5: Write `tests/cdp.mjs`**

  `export async function launch({width, height, mobile=false, touch=false, preload=''})` spawns `google-chrome-stable --headless=new --no-sandbox --remote-debugging-port=0 --user-data-dir=<mkdtemp> --use-angle=swiftshader --enable-unsafe-swiftshader` and reads the `DevTools listening on ws://…` line from stderr. It then opens a target via `Target.createTarget` over the browser socket and attaches with `flatten:true`, and applies `Emulation.setDeviceMetricsOverride` and `Emulation.setTouchEmulationEnabled`. `preload` goes into `Page.addScriptToEvaluateOnNewDocument`. Last, it navigates to `file://<repo>/index.html`.

  It returns `{send(method, params), eval(expr) /* Runtime.evaluate returnByValue, awaitPromise */, close()}`. The default preload sets `localStorage.playerName = 'Test'` so the name modal is skipped.
- [ ] **Step 6: Write failing e2e cases in `tests/e2e.test.mjs`**

  The whole file is skipped unless `process.env.E2E === '1'`.
  - `renders deal`: 1440×900 → 28 `.card` elements, 7 face-up.
  - `phone layout`: 844×390 touch → `#rotatePrompt` is hidden, the foundations are right of the tableau.
  - `rotate prompt`: 390×844 → `#rotatePrompt` is visible, the table is hidden. A `setDeviceMetricsOverride` to 844×390 hides it, and `game` is unchanged (`JSON.stringify` before/after).
  - `settings persist`: set the back to `purple` and the draw mode to 1 through the modal clicks, then reload → `settings` deep-equals `{back:'purple', drawCount:1, showHint:true}`. The stock card's SVG uses the purple palette. The current game's `drawCount` was unchanged until New game.
  - `storage throwing falls back to defaults`: preload `Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('blocked') }` → the page loads with no uncaught error (`Runtime.exceptionThrown` not seen), `settings` are the defaults, and New game works.
  - `hint toggle`: unchecking "Show hint button" hides `#hintBtn`.
- [ ] **Step 7:** Run `E2E=1 node --test tests/e2e.test.mjs` → FAIL.
- [ ] **Step 8: Implement**
  - Replace the old style, markup and script with the new style and markup plus `klondike-ui` (rendering, settings and modals only).
  - Wire input minimally for now: a click on the stock calls `Klondike.draw`, and the buttons work.
  - Delete the old drag/double-click code entirely.
- [ ] **Step 9:** Run `node --test tests/ && E2E=1 node --test tests/e2e.test.mjs` → pass.
- [ ] **Step 10: Write `tests/screens.sh`**

  It runs the `HANDOFF.md` headless Chrome screenshot command at 1440×900, 1024×768, 768×1024, 844×390 and 390×844 into `tests/out/`. It uses a temp copy of `index.html` with `localStorage.setItem("playerName","Test")` injected, and symlinks `cards/` next to the copy.

  Run it, open each PNG, and check against `look-v3.html` that:
  - the cards are crisp
  - the court art shows
  - nothing overflows or overlaps
  - the felt and the bar match the mockup

  Fix any of these before committing.
- [ ] **Step 11:** Commit: `feat(ui): casino felt table, responsive layouts, settings`.

### Task 6: Pointer input, tap-to-move, undo, hint, animation

**Files:** Modify `index.html` (`klondike-ui`, CSS), `tests/e2e.test.mjs`

**Interfaces:**
- Consumes: `Klondike.canMove/move/draw/undo/canUndo/bestDestination/hint`, `render()`, and the data attributes from Task 5.
- Produces:
  - `function onPointerDown(e)`, with move/up/cancel handlers bound on `window` during a gesture.
  - `function showHint()`
  - `function animateFrom(prevRects: Map<string, DOMRect>)`

**Behaviour:**
- `touch-action: none` and `user-select: none` on `#table`. Track only the first `pointerId`, and ignore others while a gesture is live.
- Press on a face-up card (tableau, waste top or foundation top). Moving more than 6px starts a drag: the run follows the pointer with the `.lift` shadow.
- On `pointerup`, the drop target is the slot or card under the pointer (`document.elementsFromPoint`, mapped to `Dest`). If `canMove` → `move` + render. Otherwise, animate back.
- On `pointercancel`, or on `resize`/`orientationchange` mid-drag, animate back with no state change.
- A tap (release within 6px) on a face-up card → `bestDestination` → `move`. On `null`, add `.shake` (a 250ms keyframe).
- A tap on the stock → `draw`. A tap on a face-down card does nothing.
- Animation: FLIP. Before each state change, capture `getBoundingClientRect()` per `data-card`. After `render()`, give moved cards an inverse `transform` and transition it to none over 180ms. Taps during an animation are not queued separately: each tap reads the current state and calls render again, which restarts FLIP from the current visual positions.
- `#undoBtn` and Ctrl/Cmd+Z (not while typing in the name input) → `undo` + render.
- `#hintBtn` → `Klondike.hint(game)`:
  - `{from,to}`: add `.hint-glow` (a gold `drop-shadow`/outline) to the source run and the destination slot or top card for 1500ms.
  - `{draw:true}`: glow the stock.
  - `null`: a toast "No moves left" for 1500ms.
- Win: when `Klondike.isWon(game)`, show `#winModal` with "Congratulations, {name}! You won! Final Score: {score}".

- [ ] **Step 1: Write failing e2e cases**

  Use deterministic deals via `newGame({drawCount:1, deck:[…]})` evaluated in the page, built in the test with the same `orderedDeck()` idea so the needed cards sit where the case needs them.
  - `mouse drag waste to tableau`: `Input.dispatchMouseEvent` press/move (3 steps)/release from the waste card centre to the target column's top card → `game` shows the move, the score is 5.
  - `touch drag run`: `Input.dispatchTouchEvent` start/move/end moves a 2-card run between columns.
  - `tap to foundation`: a tap on an exposed Ace → it is on a foundation, and the score is 10 (+5 if it exposed a card).
  - `tap illegal shakes`: a tap on a card with no destination → `.shake` is present and the state is unchanged.
  - `stock tap and recycle`: N taps → the waste count is right; one more recycles.
  - `undo button and ctrl+z`: two moves, then the button and `Input.dispatchKeyEvent` Ctrl+Z → back to the deal. `#undoBtn` is disabled at the deal.
  - `hint glows`: in a state with a known tier-2 move, after a click on `#hintBtn` the source card has `.hint-glow`, and it's gone after 1600ms.
  - `touch cancel mid-drag returns cards`: a touch start/move, then `dispatchTouchEvent({type:'touchCancel'})` → the state is unchanged and, after 300ms, the card's rect equals its pre-drag rect (±1px).
  - `resize mid-drag cancels`: a mouse press/move, then `setDeviceMetricsOverride` to a new size, then release over a legal target → the state is unchanged.
  - `rapid taps apply in order`: 3 taps 30ms apart on 3 different auto-movable cards → all 3 moves applied once each, and the DOM `data-pile` of each matches `game` after 400ms.
  - `win modal`: a one-move-from-won state, tap the last card → `#winModal` is visible and the message contains the score.
- [ ] **Step 2:** Run `E2E=1 node --test tests/e2e.test.mjs` → the new cases FAIL.
- [ ] **Step 3:** Implement the behaviour above.
- [ ] **Step 4:** Run `node --test tests/ && E2E=1 node --test tests/e2e.test.mjs` → all pass. Then re-run `tests/screens.sh` and check by eye.
- [ ] **Step 5:** Commit: `feat(ui): pointer drag, tap-to-move, undo, hint, animations`.

### Task 7: Deploy wiring and clean-up

**Files:**
- Modify: `Makefile`, `deploy/meta.json`, `index.html` (`<title>`), `HANDOFF.md`
- Delete: `playingcards_standard.png`

- [ ] **Step 1: Update `Makefile` `dist`**
  - `sed "s/const ASSET_VERSION = '';/const ASSET_VERSION = '?v=$(VERSION)';/" index.html > dist/web/index.html`
  - `cp -r cards dist/web/`
  - Drop the sprite lines. Update the header comment.
- [ ] **Step 2:** Set `<title>Klondike Solitaire</title>` and add the HTML comment crediting the court art. Set the `deploy/meta.json` blurb: "Classic Klondike patience with casino-felt looks: draw one or three, drag or tap to move, undo and hints. Plays on desktop, tablet and phone (landscape)."
- [ ] **Step 3:** Run `git rm playingcards_standard.png`. Check that `grep -n "playingcards\|dblclick\|draggable\|dataTransfer" index.html` prints nothing.
- [ ] **Step 4:** Run `make dist`. Check that:
  - `dist/web/cards/` has 12 SVGs
  - `grep -c "?v=" dist/web/index.html` ≥ 1
  - `cd dist/web && python3 -m http.server 8080 --bind 127.0.0.1` with headless Chrome at `http://127.0.0.1:8080/` renders a court card (screenshot)
- [ ] **Step 5:** Run the full suite one last time: `node --test tests/ && E2E=1 node --test tests/e2e.test.mjs` → all pass.
- [ ] **Step 6:** Update `HANDOFF.md`: replace the "Mobile is not supported" and "Small cleanups" to-dos with how to run the tests, `tools/build-courts.sh`, and the fact that mobile is landscape-only by design.
- [ ] **Step 7:** Commit: `chore: deploy cards/ with cache-busting, remove sprite sheet, update handoff`. Do **not** run `make deploy`; the owner deploys.
