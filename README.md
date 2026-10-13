# Algebra Tiles

A web app where students multiply and factor polynomials with algebra tiles. A
teacher types one problem and shares a link; there are no accounts, and
nothing is stored on a server.

The words used here (mat, side, rectangle, zero pair, like-term group…) are
defined in [`GLOSSARY.md`](GLOSSARY.md), and the decisions behind them are
recorded in [`docs/adr/`](docs/adr/).

## Making a problem (home page)

The teacher picks **Multiply** or **Factor** and types the problem in a math
field (`^` for a power), in either form: `(x+2)(x-3)` or `x^2-x-6` works for
both. Multiply starts students from the factors and Factor from the
polynomial, whichever was typed. Anything tiles can build is allowed:

- Multiply: two factors, each some x's and some units, like `(x+2)(x-3)`,
  `(2x+1)(-x+4)`, `2x(x+3)`, `3(x-1)` or `(x+3)^2`.
- Factor: any polynomial up to x² that factors over the whole numbers, like
  `x^2-x-6`, `6x^2+x-2`, `x^2-9` or `4x+6`.

Anything else is refused with the reason, as it's typed. The teacher also picks
what students start with, for either activity type: all the tiles they need
(for Multiply, both sides' tiles and the rectangle's; for Factor, the
rectangle's, zero pairs included), only the positive ones, or none. A box
beside the choices shows the tiles the chosen one gives for the problem typed.
On the right, the page gives the student link, a QR code, and a way to try it
as a student. One link is one problem, carried in the link:
`/play?type=factor&p=x^2-x-6&start=positive`.

Under the two activity types, a dashed button asks teachers to suggest another
activity, by email. A help button in the bottom-left corner of the window gives
the support email, and the footer links to the About and Privacy pages.

## Doing a problem (`/play`)

The board is a whiteboard. Scroll to pan, pinch or Ctrl/⌘ + scroll to zoom, and
use − / + / Fit. A bar across the top shows the problem and its steps; each
step's instructions and its **Check** are written on the board under the T,
and zoom with it. The board shows no other messages: only what a failed Check
found wrong.

The toolbar at the bottom holds two tools, **Select** (V) and **Hand** (H, or
hold space). With Select, dragging empty board draws a box that selects the
tiles it touches; with Hand, it pans. Then come undo and redo; **Flip**, which
turns the tray's tiles over to their negatives, and **Turn**, which stands its
x tile up; the tiles, to drag out or to tap and then tap the board; and the
trash, which deletes what's dropped on it or what's selected.

A tile can go anywhere, and snaps to the edges of the T and of tiles nearby,
with no grid (see ADR 0002). A side of the T holds one row, laid end to end
from the corner: a tile dropped there slides along to the corner or the tile
before it, and the row closes up when one leaves. Tiles keep whichever way they
face: double-click one to turn it, except on a side of the T. Click a tile, or
Shift-click several, or Ctrl/⌘ + A for all of them, for their buttons: Turn,
Flip (to the opposite sign), Duplicate (Ctrl/⌘ + D), Delete, and **Zero
out** when one tile lies flush against its opposite, which rumbles the pair,
slides them into each other and poofs. Dragging a selected tile moves the whole
selection. Ctrl/⌘ + C, X and V copy, cut and paste tiles, pasting at the
pointer. Ctrl/⌘ + Z and Ctrl/⌘ + Shift + Z undo and redo, back to the last
passed Check.

Each Check marks what's wrong in red; only a passed Check opens the next step,
and it locks the tiles it read.

- **Multiply**: lay the factors along the two sides of the T → the sides lock
  and grey out; fill the rectangle → the T fades away; sort its tiles into their
  like-term groups and zero out the zero pairs → type the product after the
  printed `(x+2)(x-3) =`.
- **Factor**: arrange the tiles into a rectangle in the corner of the T,
  bringing out zero pairs as needed → lay tiles on the sides that measure it →
  type the factors after the printed `x^2-x-6 =`.

The answer has to be the other form: the simplified polynomial, or the factors
multiplied. One that's equal but not simplified gets a nudge.

## Code

- `src/lib/algebra.ts`: reading typed math with Caret, polynomials, which
  problems tiles can build, and checking the student's equation.
- `src/lib/mat.ts`: tile sizes, snapping, and the checks for the sides, the
  rectangle and the like-term groups. Positions on the mat are kept as so many
  x's plus so many units, and the checks read those, never pixels.
- `src/lib/settings.ts`: the tiles an activity starts with.
- `src/lib/support.ts`: the support email, used by the help box, About and
  Privacy.
- `src/lib/Activity.svelte`: the student's board and its steps.
- `vendor/`: Caret, the math field, packed from a local clone by
  `bun run caret` (see ADR 0003).

## Running

```
bun install
bun run dev     # start the site
bun run test    # the algebra and mat tests
bun run check   # type-check
bun run lint    # format + lint check
```

## Visitor counts

The site is published at algebratiles.org (mirrored at
algebratiles.teacher.dev) on Vercel by the teacher.dev Sites scripts
(`../sites`). `VITE_CF_BEACON_TOKEN` (see `.env.example`) carries the
Cloudflare Web Analytics token; it is set in Vercel's production environment
only, so local and preview runs load no analytics script.
