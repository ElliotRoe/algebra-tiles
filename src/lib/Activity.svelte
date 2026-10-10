<script lang="ts">
	// The student's view of one problem: a whiteboard with the mat on it. A bar
	// across the top names the problem and its steps; the step's instructions
	// and its Check are written on the board under the T, and zoom with it; the
	// toolbar floats at the bottom, with the zoom beside it.
	//
	// Multiply goes sides → rectangle → like-term groups → equation; Factor goes
	// rectangle → sides → equation. Each step ends with Check, which marks what's
	// wrong in red, and only a passed Check opens the next step. A passed Check
	// locks the tiles it read; once Multiply's rectangle passes, the T fades away
	// and its tiles are sorted into groups. The board shows no messages but a
	// failed Check's.
	//
	// Tiles behave the same everywhere and can go anywhere: they snap to the
	// edges near them (a side of the T holds a single row), keep whichever way
	// they face until the student turns them, and a tile pushed flush against
	// its opposite can cancel out with it. A side of the T holds one row, laid
	// end to end from the corner, so a tile dropped there slides into place; a
	// tile there can't be turned.
	import { onMount, tick } from 'svelte';
	import {
		Check,
		Copy,
		FlipVertical2,
		Hand,
		Maximize,
		Minus,
		MousePointer2,
		Plus,
		Redo2,
		RotateCw,
		Trash2,
		Undo2
	} from '@lucide/svelte';
	import {
		checkEquation,
		factorizations,
		formatFactor,
		prettyText,
		type ActivityType,
		type Factor,
		type Problem
	} from './algebra';
	import {
		GAP,
		lenAdd,
		lenSub,
		GROUP_KINDS,
		SNAP_REACH,
		UNIT,
		XLEN,
		checkGroups,
		checkProduct,
		checkSides,
		checkSidesAgainst,
		lenPx,
		packSides,
		readRectangle,
		readSide,
		rectOf,
		rowOf,
		settle,
		size,
		zeroPairs,
		type Cell,
		type Grid,
		type Kind,
		type Len,
		type Rect,
		type Result,
		type SideTile,
		type Sign,
		type Tile
	} from './mat';
	import MathInput from './MathInput.svelte';
	import TileView from './TileView.svelte';
	import { rectangleTiles, startingPiles, type Start } from './settings';

	let { problem, start = 'all' }: { problem: Extract<Problem, { ok: true }>; start?: Start } =
		$props();

	// The problem never changes for the life of this view; the page makes a new one per link.
	// svelte-ignore state_referenced_locally
	const p = problem;
	// svelte-ignore state_referenced_locally
	const startWith = start;

	// --- steps ---

	type Step = 'sides' | 'rectangle' | 'groups' | 'equation' | 'done';
	const STEPS: Record<ActivityType, Step[]> = {
		multiply: ['sides', 'rectangle', 'groups', 'equation'],
		factor: ['rectangle', 'sides', 'equation']
	};
	const STEP_NAMES: Record<Step, string> = {
		sides: 'Sides',
		rectangle: 'Rectangle',
		groups: 'Like terms',
		equation: 'Equation',
		done: 'Done'
	};
	const steps = STEPS[p.type];
	let step = $state<Step>(steps[0]);
	/** Multiply's T fades away once its rectangle is done, leaving the tiles to sort. */
	const faded = $derived(
		p.type === 'multiply' && (step === 'groups' || step === 'equation' || step === 'done')
	);

	const instructions = (s: Step): string => {
		const [f, g] = p.factors;
		return {
			sides:
				p.type === 'multiply'
					? `Build ${formatFactor(f)} along one side of the T and ${formatFactor(g)} along the other.`
					: 'Lay tiles along both sides of the T to measure your rectangle.',
			rectangle:
				p.type === 'multiply'
					? 'Fill in the rectangle. Each tile fits its row and column, and takes their signs multiplied.'
					: 'Make a rectangle in the corner of the T. Add zero pairs if you need them.',
			groups: 'Sort the tiles into their groups, and cancel out the zero pairs.',
			equation:
				p.type === 'multiply'
					? 'Write the product with like terms combined.'
					: 'Write the polynomial as its factors.',
			done: ''
		}[s];
	};

	// --- the mat's size: long enough for the longest side any answer needs ---

	const sideLength = (f: Factor) => Math.abs(f.x) * XLEN + Math.abs(f.unit) * UNIT;
	const allSides = [...p.factors, ...factorizations(p.poly).flat()];
	const ARM = Math.max(Math.max(...allSides.map(sideLength)) + 2 * XLEN, 4 * XLEN);
	const STRIP = UNIT + 2 * GAP;
	const region: Rect = { x: 0, y: 0, w: ARM, h: ARM };
	const topStrip: Rect = { x: 0, y: -STRIP, w: ARM, h: STRIP };
	const leftStrip: Rect = { x: -STRIP, y: 0, w: STRIP, h: ARM };
	/** Where the instructions are written, under the T. */
	const ROW: Rect = { x: -STRIP, y: ARM + UNIT * 0.75, w: ARM + STRIP, h: UNIT * 4 };

	const rectTiles = rectangleTiles(p);

	// The like-term groups, beside the rectangle, each big enough for its tiles.
	const ZONE_W = 4.5 * XLEN;
	const zones: Record<Kind, Rect> = (() => {
		const out = {} as Record<Kind, Rect>;
		let y = 0;
		for (const k of GROUP_KINDS) {
			const n = rectTiles.filter((t) => t.kind === k).reduce((a, t) => a + t.n, 0);
			const area = n * lenPx(size(k).w) * lenPx(size(k).h);
			const h = Math.max(1.4 * XLEN, (area * 2.4) / ZONE_W + UNIT);
			out[k] = { x: ARM + 1.5 * XLEN, y, w: ZONE_W, h };
			y += h + UNIT;
		}
		return out;
	})();
	const ZONE_NAMES: Record<Kind, string> = { x2: 'x² tiles', x: 'x tiles', unit: 'Unit tiles' };

	// --- what's on the board ---

	let nextId = 1;
	let tiles = $state<Tile[]>(startingTiles());
	/** The sides, as read when their Check passed. */
	let top = $state<SideTile[]>([]);
	let left = $state<SideTile[]>([]);
	/** The tiles on the T's sides once they passed, which fade with the T. */
	let sideIds = $state(new Set<number>());
	/** Tiles a passed Check has locked in place. */
	let locked = $state(new Set<number>());
	/** Factor: the rectangle as read when its Check passed, to check the sides against. */
	let grid: Grid | null = null;
	/** Multiply: the rectangle's tiles, which all have to end up in a group. */
	let product = new Set<number>();

	/** The tiles the teacher chose to start with, lying beside the mat, one row
	 *  per kind and sign. */
	function startingTiles(): Tile[] {
		const out: Tile[] = [];
		let y = 0;
		for (const { kind, sign, n } of startingPiles(p, startWith)) {
			const { w, h } = size(kind);
			const perRow = Math.max(1, Math.floor((5 * XLEN) / (lenPx(w) + GAP)));
			for (let i = 0; i < n; i++) {
				out.push({
					id: nextId++,
					kind,
					sign,
					turned: false,
					x: ARM + 1.5 * XLEN + (i % perRow) * (lenPx(w) + GAP),
					y: y + Math.floor(i / perRow) * (lenPx(h) + GAP),
					at: { x: null, y: null }
				});
			}
			y += Math.ceil(n / perRow) * (lenPx(h) + GAP) + UNIT;
		}
		return out;
	}

	const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
	const inside = (pt: { x: number; y: number }, r: Rect) =>
		pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
	const within = (t: Tile | Rect, r: Rect) => inside(centre('kind' in t ? rectOf(t) : t), r);
	const zoneOf = (t: Tile): Kind | null =>
		faded ? (GROUP_KINDS.find((k) => within(t, zones[k])) ?? null) : null;
	/** Whether a tile is gone from the board with the faded T. */
	const vanished = (t: Tile) => faded && sideIds.has(t.id);

	// --- undo and redo ---

	// Every change to the tiles can be undone within a step; a passed Check
	// can't be taken back, so moving on to the next step clears the history.
	let past = $state.raw<Tile[][]>([]);
	let future = $state.raw<Tile[][]>([]);
	function change(next: Tile[]) {
		past = [...past.slice(-199), tiles];
		future = [];
		tiles = arrange(next);
	}
	/** Close up the rows on the T's sides, keeping locked tiles in front. Once
	 *  the T has faded, its sides are gone. */
	const arrange = (next: Tile[]) => (faded ? next : packSides(next, ARM, (t) => locked.has(t.id)));
	function undo() {
		if (!past.length || cancelling) return;
		future = [...future, tiles];
		tiles = past[past.length - 1];
		past = past.slice(0, -1);
		afterHistory();
	}
	function redo() {
		if (!future.length || cancelling) return;
		past = [...past, tiles];
		tiles = future[future.length - 1];
		future = future.slice(0, -1);
		afterHistory();
	}
	function afterHistory() {
		select([]);
		clearMarks();
	}

	// --- marks from the last Check ---

	let wrong = $state<Set<number>>(new Set());
	let gaps = $state<Cell[]>([]);
	/** What a failed Check found wrong: the only message the board shows. */
	let error = $state('');
	let note = $state('');
	function clearMarks() {
		wrong = new Set();
		gaps = [];
	}
	function forget(id: number) {
		if (wrong.has(id)) wrong = new Set([...wrong].filter((w) => w !== id));
	}

	// --- checking ---

	let answer = $state('');

	function checkSidesStep(): Result {
		const onTop = tiles.filter((t) => within(t, topStrip));
		const onLeft = tiles.filter((t) => within(t, leftStrip));
		if (!onTop.length || !onLeft.length)
			return { ok: false, message: 'Put a factor on each side of the T.', wrong: [], gaps: [] };
		const rt = readSide(onTop, 'top');
		if (!rt.ok) return rt;
		const rl = readSide(onLeft, 'left');
		if (!rl.ok) return rl;
		const r =
			p.type === 'multiply'
				? checkSides(rt.side, rl.side, p.factors)
				: checkSidesAgainst(rt.side, rl.side, grid!);
		if (r.ok) {
			top = rt.side;
			left = rl.side;
			const ids = [...rt.side, ...rl.side].map((t) => t.id);
			sideIds = new Set(ids);
			locked = new Set([...locked, ...ids]);
		}
		return r;
	}

	function checkStep(): Result & { note?: string } {
		const onMat = tiles.filter((t) => within(t, region));
		if (step === 'sides') return checkSidesStep();
		if (step === 'rectangle') {
			if (p.type === 'multiply') {
				const r = checkProduct(onMat, top, left);
				if (r.ok) product = new Set(onMat.map((t) => t.id));
				return r;
			}
			const r = readRectangle(onMat, p.poly);
			if (r.ok) {
				grid = r.grid!;
				locked = new Set([...locked, ...onMat.map((t) => t.id)]);
			}
			return r;
		}
		if (step === 'groups') {
			const groups = Object.fromEntries(
				GROUP_KINDS.map((k) => [k, tiles.filter((t) => zoneOf(t) === k)])
			) as Record<Kind, Tile[]>;
			const outside = tiles.filter((t) => product.has(t.id) && !zoneOf(t));
			return checkGroups(outside, groups, p.poly);
		}
		const none = { wrong: [], gaps: [] };
		if (answer.includes('='))
			return { ok: false, message: 'Type just the other side. The = is already there.', ...none };
		const v = checkEquation(p, `${p.given}=${answer}`);
		return v.ok
			? { ok: true, message: '', note: v.note, ...none }
			: { ok: false, message: v.message, ...none };
	}

	async function check() {
		if (cancelling) return;
		clearMarks();
		const result = checkStep();
		if (!result.ok) {
			wrong = new Set(result.wrong);
			gaps = result.gaps;
			error = result.message;
			return;
		}
		error = '';
		if (result.note) note = result.note;
		const next = steps[steps.indexOf(step) + 1] ?? 'done';
		step = next;
		past = [];
		future = [];
		select([]);
		if (next === 'groups') {
			await tick();
			fit();
		}
	}

	// --- the view: pan and zoom ---

	let boardEl = $state<HTMLDivElement>();
	let toolbarEl = $state<HTMLDivElement>();
	let trashEl = $state<HTMLButtonElement>();
	let headerEl = $state<HTMLElement>();
	let boardW = $state(0);
	let boardH = $state(0);
	let panX = $state(0);
	let panY = $state(0);
	let zoom = $state(1);

	const toBoard = (cx: number, cy: number) => {
		const r = boardEl!.getBoundingClientRect();
		return { x: (cx - r.left - panX) / zoom, y: (cy - r.top - panY) / zoom };
	};
	/** A board point in pixels from the board's top-left corner on screen. */
	const toScreen = (x: number, y: number) => ({ x: panX + x * zoom, y: panY + y * zoom });

	function zoomAt(factor: number, cx: number, cy: number) {
		const r = boardEl!.getBoundingClientRect();
		const next = Math.min(4, Math.max(0.05, zoom * factor));
		const k = next / zoom;
		panX = cx - r.left - (cx - r.left - panX) * k;
		panY = cy - r.top - (cy - r.top - panY) * k;
		zoom = next;
	}
	function zoomBy(factor: number) {
		const r = boardEl!.getBoundingClientRect();
		zoomAt(factor, r.left + boardW / 2, r.top + boardH / 2);
	}

	/** Zoom to show the whole mat, every tile and the instructions, clear of the bars. */
	function fit() {
		if (!boardEl) return;
		// Read the size directly: on the first fit, the bound size isn't in yet.
		boardW = boardEl.clientWidth;
		boardH = boardEl.clientHeight;
		const rects = [
			{ x: -STRIP, y: -STRIP, w: ARM + STRIP, h: ARM + STRIP },
			ROW,
			...tiles.filter((t) => !vanished(t)).map(rectOf),
			...(faded ? GROUP_KINDS.map((k) => zones[k]) : [])
		];
		const x0 = Math.min(...rects.map((r) => r.x));
		const y0 = Math.min(...rects.map((r) => r.y));
		const x1 = Math.max(...rects.map((r) => r.x + r.w));
		const y1 = Math.max(...rects.map((r) => r.y + r.h));
		const marginT = (headerEl?.offsetHeight ?? 0) + 32;
		const marginB = (toolbarEl?.offsetHeight ?? 0) + 48;
		const w = Math.max(100, boardW - 48);
		const h = Math.max(100, boardH - marginT - marginB);
		zoom = Math.min(1.5, w / (x1 - x0), h / (y1 - y0));
		panX = 24 + (w - (x1 - x0) * zoom) / 2 - x0 * zoom;
		panY = marginT + (h - (y1 - y0) * zoom) / 2 - y0 * zoom;
	}

	onMount(() => {
		// After the first layout, once the bars have their sizes.
		requestAnimationFrame(fit);
		// Wheel and trackpad: scrolling pans, and pinching (which browsers send as
		// ctrl + wheel) or ctrl/⌘ + scroll zooms around the pointer.
		const wheel = (e: WheelEvent) => {
			e.preventDefault();
			if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
			else {
				panX -= e.deltaX;
				panY -= e.deltaY;
			}
		};
		boardEl!.addEventListener('wheel', wheel, { passive: false });
		return () => boardEl?.removeEventListener('wheel', wheel);
	});

	// --- selecting, panning and pinching ---

	// Like a whiteboard app, the board has two tools. With Select, dragging
	// empty board draws a box that selects the tiles it touches; with Hand, or
	// while the space bar is held, it pans. Scrolling pans and pinching zooms
	// with either. Only presses that start on empty board land here: a tile's
	// own press stops at the tile.
	type Tool = 'select' | 'hand';
	let tool = $state<Tool>('select');
	let spaceHeld = $state(false);
	const panning = $derived(tool === 'hand' || spaceHeld);

	/** The tiles selected, whose buttons show above them. */
	let selected = $state(new Set<number>());
	const select = (ids: Iterable<number>) => (selected = new Set(ids));
	/** The box being dragged out to select tiles, in board pixels. */
	let marquee = $state<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(
		null
	);

	// Read only inside the pointer handlers, so it needn't be reactive.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pointers = new Map<number, { x: number; y: number }>();
	let pinch: { d: number; mx: number; my: number } | null = null;
	let panMoved = false;

	function boardDown(e: PointerEvent) {
		boardEl!.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		panMoved = false;
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
			marquee = null;
		} else if (pointers.size === 1 && !panning && e.button === 0) {
			const pt = toBoard(e.clientX, e.clientY);
			marquee = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, add: e.shiftKey };
		}
	}
	function boardMove(e: PointerEvent) {
		const last = pointers.get(e.pointerId);
		if (!last) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 2 && pinch) {
			// Two fingers zoom by how far apart they are, and pan as they move together.
			const [a, b] = [...pointers.values()];
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			const mx = (a.x + b.x) / 2;
			const my = (a.y + b.y) / 2;
			panX += mx - pinch.mx;
			panY += my - pinch.my;
			zoomAt(d / pinch.d, mx, my);
			pinch = { d, mx, my };
			panMoved = true;
		} else if (pointers.size === 1 && marquee) {
			const pt = toBoard(e.clientX, e.clientY);
			marquee.x1 = pt.x;
			marquee.y1 = pt.y;
			if (Math.hypot(marquee.x1 - marquee.x0, marquee.y1 - marquee.y0) * zoom > 4) panMoved = true;
		} else if (pointers.size === 1) {
			const dx = e.clientX - last.x;
			const dy = e.clientY - last.y;
			panX += dx;
			panY += dy;
			if (Math.hypot(dx, dy) > 1) panMoved = true;
		}
	}
	function boardUp(e: PointerEvent) {
		// Only presses that began on empty board count: a tile dragged here and let
		// go is placed by its own drag, not placed again by this tap.
		if (!pointers.delete(e.pointerId)) return;
		if (pointers.size < 2) pinch = null;
		const box = marquee;
		marquee = null;
		if (box && panMoved) {
			const r = boxRect(box);
			const caught = selectable().filter((t) => {
				const o = rectOf(t);
				return o.x < r.x + r.w && r.x < o.x + o.w && o.y < r.y + r.h && r.y < o.y + o.h;
			});
			select([...(box.add ? selected : []), ...caught.map((t) => t.id)]);
			return;
		}
		if (panMoved || pointers.size) return;
		// A tap on empty board places the tile picked in the tray, or lets go of
		// the selected tiles.
		if (!e.shiftKey) select([]);
		if (picked) {
			const { w, h } = size(picked.kind, picked.turned);
			place(
				{
					source: { from: 'tray' },
					kind: picked.kind,
					sign: picked.sign,
					turned: picked.turned,
					dx: lenPx(w) / 2,
					dy: lenPx(h) / 2,
					group: []
				},
				e.clientX,
				e.clientY
			);
		}
	}
	const boxRect = (m: { x0: number; y0: number; x1: number; y1: number }): Rect => ({
		x: Math.min(m.x0, m.x1),
		y: Math.min(m.y0, m.y1),
		w: Math.abs(m.x1 - m.x0),
		h: Math.abs(m.y1 - m.y0)
	});

	// --- moving tiles ---

	type Source = { from: 'tray' } | { from: 'board'; id: number };
	interface Held {
		source: Source;
		kind: Kind;
		sign: Sign;
		turned: boolean;
		/** Where the tile was grabbed, in board pixels from its top-left corner. */
		dx: number;
		dy: number;
		/** The other selected tiles, which move with it. */
		group: number[];
	}
	let drag = $state<
		| (Held & {
				startX: number;
				startY: number;
				cx: number;
				cy: number;
				moved: boolean;
				shift: boolean;
		  })
		| null
	>(null);
	/** The tray tile tapped, waiting for a tap on the board. */
	let picked = $state<{ kind: Kind; sign: Sign; turned: boolean } | null>(null);
	/** The last tap on a board tile, to tell a double tap. */
	let lastTap = { id: -1, at: 0 };

	const movable = (t: Tile) =>
		step !== 'done' && !locked.has(t.id) && !cancelling?.ids.includes(t.id);
	/** The tiles a student can select: every one they can still move. */
	const selectable = () => tiles.filter((t) => movable(t) && !vanished(t));

	/** Start holding a tile. `scale` is how many screen pixels its element draws per board pixel. */
	function grab(e: PointerEvent, held: Omit<Held, 'dx' | 'dy' | 'group'>, scale: number) {
		e.stopPropagation();
		e.preventDefault();
		// Measured from the tile itself: in the tray it sits in the middle of a bigger slot.
		const el = e.currentTarget as HTMLElement;
		const r = (el.querySelector('.tile') ?? el).getBoundingClientRect();
		const id = held.source.from === 'board' ? held.source.id : null;
		// A selected tile drags the whole selection along with it.
		const group = id !== null && selected.has(id) ? [...selected].filter((o) => o !== id) : [];
		drag = {
			...held,
			dx: (e.clientX - r.left) / scale,
			dy: (e.clientY - r.top) / scale,
			group,
			startX: e.clientX,
			startY: e.clientY,
			cx: e.clientX,
			cy: e.clientY,
			moved: false,
			shift: e.shiftKey
		};
	}

	function dragMove(e: PointerEvent) {
		if (!drag) return;
		drag.cx = e.clientX;
		drag.cy = e.clientY;
		if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) {
			drag.moved = true;
			if (!drag.group.length) select([]);
		}
	}

	function dragUp(e: PointerEvent) {
		if (!drag) return;
		const held = drag;
		drag = null;
		if (held.moved) place(held, e.clientX, e.clientY);
		else tap(held, held.shift);
	}

	function tap(held: Held, shift: boolean) {
		if (held.source.from === 'tray') {
			const same = picked?.kind === held.kind && picked.sign === held.sign;
			picked = same ? null : { kind: held.kind, sign: held.sign, turned: held.turned };
			return;
		}
		const id = held.source.id;
		// Shift adds a tile to the selection, or takes it out.
		if (shift) {
			select(selected.has(id) ? [...selected].filter((o) => o !== id) : [...selected, id]);
			return;
		}
		const now = Date.now();
		// A double tap turns the tile; a single tap selects it.
		if (lastTap.id === id && now - lastTap.at < 350) {
			turnAll([id]);
			lastTap = { id: -1, at: 0 };
			select([id]);
			return;
		}
		lastTap = { id, at: now };
		select(selected.size === 1 && selected.has(id) ? [] : [id]);
	}

	const hit = (el: HTMLElement | undefined, cx: number, cy: number) => {
		const r = el?.getBoundingClientRect();
		return !!r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
	};

	/** On a side of the T, a tile lies in the side's single row: its inner edge
	 *  against the side's line. Elsewhere it's free on both axes. */
	function pinFor(kind: Kind, turned: boolean, x: number, y: number) {
		if (faded) return {};
		const { w, h } = size(kind, turned);
		const landing = { x, y, w: lenPx(w), h: lenPx(h) };
		if (within(landing, topStrip)) return { y: -GAP - lenPx(h) };
		if (within(landing, leftStrip)) return { x: -GAP - lenPx(w) };
		return {};
	}

	/** The board with a tile set down at (x, y): on a side of the T it joins the
	 *  side's row, and anywhere else it snaps to the edges near it. Not yet
	 *  arranged: `change` closes up the rows. */
	function land(
		t: Omit<Tile, 'x' | 'y' | 'at'>,
		x: number,
		y: number,
		base: Tile[] = tiles
	): Tile[] {
		const pin = pinFor(t.kind, t.turned, x, y);
		const others = base.filter((o) => o.id !== t.id && !vanished(o));
		const at =
			pin.x !== undefined || pin.y !== undefined
				? { x: pin.x ?? x, y: pin.y ?? y, at: { x: null, y: null } }
				: settle(t, x, y, others, top, left, SNAP_REACH / zoom);
		return [...base.filter((o) => o.id !== t.id), { ...t, ...at }];
	}

	/** The board with a held tile let go where the pointer is. The tile snaps,
	 *  and the rest of the selection keeps its place around it, moving as far. */
	function drop(held: Held, cx: number, cy: number, id: number): Tile[] {
		const pt = toBoard(cx, cy);
		const { kind, sign, turned } = held;
		const group = new Set(held.group);
		const base = tiles.filter((t) => !group.has(t.id));
		const next = land({ id, kind, sign, turned }, pt.x - held.dx, pt.y - held.dy, base);
		if (!group.size) return next;
		const was = tiles.find((t) => t.id === id)!;
		const now = next.find((t) => t.id === id)!;
		const shift = (a: Len | null, b: Len | null, o: Len | null) =>
			a && b && o ? lenAdd(o, lenSub(b, a)) : null;
		const moved = tiles
			.filter((t) => group.has(t.id))
			.map((t) => ({
				...t,
				x: t.x + now.x - was.x,
				y: t.y + now.y - was.y,
				at: { x: shift(was.at.x, now.at.x, t.at.x), y: shift(was.at.y, now.at.y, t.at.y) }
			}));
		return [...next, ...moved];
	}

	/** Put a held tile down where the pointer is. A tile can go anywhere. */
	function place(held: Held, cx: number, cy: number) {
		picked = null;
		if (hit(trashEl, cx, cy) || hit(toolbarEl, cx, cy)) {
			if (held.source.from === 'board') remove([held.source.id, ...held.group]);
			return;
		}
		const id = held.source.from === 'board' ? held.source.id : nextId++;
		change(drop(held, cx, cy, id));
		forget(id);
		held.group.forEach(forget);
		// A selection moved together stays selected; a single tile is let go.
		select(held.group.length ? [id, ...held.group] : []);
	}

	/** Copies of tiles, set down just after them. One tile's copy goes further
	 *  along its side's row, or beside it; a selection's copies go beside it,
	 *  laid out the same. The copies are selected, so the next Duplicate copies on. */
	function duplicate(ids: number[]) {
		const chosen = tiles.filter((t) => ids.includes(t.id) && movable(t));
		if (!chosen.length) return;
		if (chosen.length === 1) {
			const [t] = chosen;
			const r = rectOf(t);
			const copy = { id: nextId++, kind: t.kind, sign: t.sign, turned: t.turned };
			const down = !faded && rowOf(t, ARM) === 'left';
			change(land(copy, down ? t.x : t.x + r.w + GAP, down ? t.y + r.h + GAP : t.y));
			select([copy.id]);
			return;
		}
		const box = bounds(chosen.map(rectOf));
		const copies = chosen.map((t) => ({
			...t,
			id: nextId++,
			x: t.x + box.w + UNIT,
			at: { x: null, y: null }
		}));
		change([...tiles, ...copies]);
		select(copies.map((t) => t.id));
	}

	function remove(ids: number[]) {
		const gone = new Set(ids.filter((id) => tiles.some((t) => t.id === id && movable(t))));
		if (!gone.size) return;
		change(tiles.filter((t) => !gone.has(t.id)));
		select([...selected].filter((id) => !gone.has(id)));
	}

	const bounds = (rects: Rect[]): Rect => {
		const x = Math.min(...rects.map((r) => r.x));
		const y = Math.min(...rects.map((r) => r.y));
		return {
			x,
			y,
			w: Math.max(...rects.map((r) => r.x + r.w)) - x,
			h: Math.max(...rects.map((r) => r.y + r.h)) - y
		};
	};

	// --- turning and flipping a tile, with a little animation for each ---

	/** Tiles mid-turn, and which way: an x tile swings about its end, down to
	 *  stand up or up to lie flat. */
	let spinning = $state(new Map<number, 'down' | 'up'>());
	let flippingTile = $state(new Set<number>());
	function animate(id: number, how: 'down' | 'up' | 'flip') {
		if (how === 'flip') flippingTile = new Set([...flippingTile, id]);
		else spinning = new Map([...spinning, [id, how]]);
		setTimeout(() => {
			if (how === 'flip') flippingTile = new Set([...flippingTile].filter((i) => i !== id));
			else spinning = new Map([...spinning].filter(([i]) => i !== id));
		}, 300);
	}

	/** Whether a tile can turn: an x tile, and not on a side of the T, which
	 *  holds its tiles the way they run. */
	const turnable = (t: Tile) => t.kind === 'x' && movable(t) && (faded || !rowOf(t, ARM));

	/** An x tile turned about its end, snapped to what's near it. */
	function turned(t: Tile, base: Tile[]): Tile {
		const next = { ...t, turned: !t.turned };
		const others = base.filter((o) => o.id !== t.id && !vanished(o));
		const pin = pinFor(t.kind, next.turned, t.x, t.y);
		return { ...next, ...settle(next, t.x, t.y, others, top, left, SNAP_REACH / zoom, pin) };
	}

	/** Turn the x tiles among these, each about its own end. */
	function turnAll(ids: number[]) {
		let next = tiles;
		for (const id of ids) {
			const t = next.find((t) => t.id === id);
			if (!t || !turnable(t)) continue;
			const after = turned(t, next);
			next = next.map((o) => (o.id === id ? after : o));
			forget(id);
			animate(id, after.turned ? 'down' : 'up');
		}
		if (next !== tiles) change(next);
	}

	/** Flip these tiles over to their opposites. */
	function flipAll(ids: number[]) {
		const flip = new Set(ids.filter((id) => tiles.some((t) => t.id === id && movable(t))));
		if (!flip.size) return;
		change(tiles.map((o) => (flip.has(o.id) ? { ...o, sign: -o.sign as Sign } : o)));
		for (const id of flip) {
			forget(id);
			animate(id, 'flip');
		}
	}

	// --- cancelling zero pairs: a rumble, the two slide into each other, and a poof ---

	const pairs = $derived(zeroPairs(tiles.filter((t) => movable(t) && !vanished(t))));
	const partner = (id: number) => {
		const pair = pairs.find(([a, b]) => a.id === id || b.id === id);
		return pair ? (pair[0].id === id ? pair[1] : pair[0]) : null;
	};
	let cancelling = $state<{
		ids: number[];
		phase: 'rumble' | 'merge';
		to: Record<number, { x: number; y: number }>;
	} | null>(null);

	/** One bit of a poof: a puff of cloud, a speck of dust or a sparkle, heading
	 *  out from the middle by (dx, dy). */
	interface Bit {
		type: 'cloud' | 'speck' | 'sparkle';
		dx: number;
		dy: number;
		d: number;
		delay: number;
		spin: number;
	}
	let poofs = $state<{ id: number; x: number; y: number; zero: number; bits: Bit[] }[]>([]);
	const RUMBLE_MS = 480;
	const MERGE_MS = 280;
	/** The cloud starts billowing just before the tiles meet, so it covers them as they go. */
	const POOF_LEAD_MS = 90;
	/** Until the 0 left behind has faded away. */
	const POOF_MS = 2800;

	/** A soft cartoon cloud over the pair: puffs spread across where the tiles
	 *  were, that billow out and drift up, with dust flying further and a few
	 *  sparkles. */
	function poofBits(w: number, h: number): Bit[] {
		const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
		const puff = Math.min(72, Math.max(30, Math.max(w, h) * 0.42));
		const rx = Math.max(w / 2, puff * 0.6) * 0.8;
		const ry = Math.max(h / 2, puff * 0.5) * 0.8;
		const ring = (n: number, type: Bit['type'], far: [number, number], d: [number, number]) =>
			Array.from({ length: n }, (_, i): Bit => {
				const a = ((i + rnd(-0.25, 0.25)) / n) * 2 * Math.PI;
				const r = rnd(...far);
				return {
					type,
					dx: Math.cos(a) * (rx + puff * 0.3) * r,
					dy: Math.sin(a) * (ry + puff * 0.3) * r,
					d: rnd(...d) * puff,
					delay: type === 'sparkle' ? rnd(120, 220) : rnd(0, 50),
					spin: rnd(-90, 90)
				};
			});
		const middle = [-0.4, 0, 0.4].map((f): Bit => ({
			type: 'cloud',
			dx: f * rx,
			dy: rnd(-4, 4),
			d: 1.2 * puff,
			delay: 0,
			spin: 0
		}));
		return [
			...ring(12, 'speck', [1.5, 2.1], [0.1, 0.18]),
			...middle,
			...ring(9, 'cloud', [0.8, 1], [0.7, 1]),
			...ring(4, 'sparkle', [1.4, 1.7], [0.32, 0.42])
		];
	}

	function cancelOut(id: number) {
		const other = partner(id);
		const t = tiles.find((t) => t.id === id);
		if (!other || !t || cancelling) return;
		const a = rectOf(t);
		const b = rectOf(other);
		const mid = {
			x: (Math.min(a.x, b.x) + Math.max(a.x + a.w, b.x + b.w)) / 2,
			y: (Math.min(a.y, b.y) + Math.max(a.y + a.h, b.y + b.h)) / 2
		};
		// How far each tile slides to land right on top of the other, in the middle.
		const to = {
			[t.id]: { x: mid.x - centre(a).x, y: mid.y - centre(a).y },
			[other.id]: { x: mid.x - centre(b).x, y: mid.y - centre(b).y }
		};
		select([]);
		cancelling = { ids: [t.id, other.id], phase: 'rumble', to };
		setTimeout(() => cancelling && (cancelling = { ...cancelling, phase: 'merge' }), RUMBLE_MS);
		setTimeout(
			() => {
				const w = Math.max(a.w, b.w);
				const h = Math.max(a.h, b.h);
				// The 0 they make, as big as the pair allows, waiting under the cloud.
				const zero = Math.min(48, Math.max(26, Math.min(w, h) * 0.95));
				const poof = { id: nextId++, ...mid, zero, bits: poofBits(w, h) };
				poofs = [...poofs, poof];
				setTimeout(() => (poofs = poofs.filter((q) => q.id !== poof.id)), POOF_MS);
			},
			RUMBLE_MS + MERGE_MS - POOF_LEAD_MS
		);
		setTimeout(() => {
			cancelling = null;
			change(tiles.filter((o) => o.id !== t.id && o.id !== other.id));
		}, RUMBLE_MS + MERGE_MS);
	}

	// --- the buttons above the selected tiles ---

	const focus = $derived.by(() => {
		if (drag?.moved || cancelling || marquee) return null;
		const chosen = tiles.filter((t) => selected.has(t.id) && movable(t) && !vanished(t));
		if (!chosen.length) return null;
		// One tile in a zero pair can cancel out; the buttons then sit above both
		// tiles, so neither is hidden.
		const other = chosen.length === 1 ? partner(chosen[0].id) : null;
		const box = bounds([...chosen, ...(other ? [other] : [])].map(rectOf));
		return {
			ids: chosen.map((t) => t.id),
			canTurn: chosen.some(turnable),
			cancel: other ? chosen[0].id : null,
			x: box.x + box.w / 2,
			y: box.y
		};
	});

	// --- the tray ---

	let traySign = $state<Sign>(1);
	let trayTurned = $state(false);
	let flipping = $state(false);
	/** Each tray tile turns over about its own middle, and shows its other side. */
	function flipTray() {
		flipping = true;
		setTimeout(() => {
			traySign = -traySign as Sign;
			flipping = false;
		}, 150);
		picked = null;
	}
	/** Whether the tray's x tile has turned yet, so it doesn't spin as the page opens. */
	let trayTurnedOnce = $state(false);
	function turnTray() {
		trayTurned = !trayTurned;
		trayTurnedOnce = true;
		if (picked?.kind === 'x') picked.turned = trayTurned;
	}
	const TRAY_KINDS: Kind[] = ['x2', 'x', 'unit'];
	const TRAY_SCALE = 0.72;

	// Where the held tiles will land, shown as outlines while they're dragged.
	const landing = $derived.by(() => {
		if (!drag?.moved || !boardEl) return [];
		if (hit(trashEl, drag.cx, drag.cy) || hit(toolbarEl, drag.cx, drag.cy)) return [];
		const id = drag.source.from === 'board' ? drag.source.id : -1;
		const moving = new Set([id, ...drag.group]);
		return arrange(drop(drag, drag.cx, drag.cy, id))
			.filter((t) => moving.has(t.id))
			.map(rectOf);
	});

	/** The board tiles being dragged, drawn by their ghosts while their places stay empty. */
	const held = $derived(
		drag?.moved && drag.source.from === 'board' ? new Set([drag.source.id, ...drag.group]) : null
	);
	/** The ghosts: the tile under the pointer and the rest of the selection, as
	 *  far from it as they lie on the board. */
	const ghosts = $derived.by(() => {
		if (!drag?.moved) return [];
		const main = { kind: drag.kind, sign: drag.sign, turned: drag.turned, ox: 0, oy: 0 };
		if (drag.source.from === 'tray') return [main];
		const at = tiles.find((t) => t.id === (drag!.source as { id: number }).id)!;
		const rest = tiles
			.filter((t) => drag!.group.includes(t.id))
			.map((t) => ({
				kind: t.kind,
				sign: t.sign,
				turned: t.turned,
				ox: t.x - at.x,
				oy: t.y - at.y
			}));
		return [main, ...rest];
	});
	const holdingBoardTile = $derived(!!held);
	const overTrash = $derived(holdingBoardTile && hit(trashEl, drag!.cx, drag!.cy));

	const typing = (e: KeyboardEvent) =>
		e.target instanceof HTMLElement &&
		(e.target.isContentEditable || !!e.target.closest('input, textarea, .caret-field'));

	function key(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			picked = null;
			select([]);
		}
		if (typing(e)) return;
		const mod = e.ctrlKey || e.metaKey;
		const k = e.key.toLowerCase();
		if (mod && k === 'z') {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
		} else if (mod && k === 'y') {
			e.preventDefault();
			redo();
		} else if (mod && k === 'a') {
			e.preventDefault();
			select(selectable().map((t) => t.id));
		} else if (mod && k === 'd') {
			e.preventDefault();
			duplicate([...selected]);
		} else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
			e.preventDefault();
			remove([...selected]);
		} else if (mod || e.altKey) {
			return;
		} else if (k === 'v') tool = 'select';
		else if (k === 'h') tool = 'hand';
		else if (e.key === ' ') {
			e.preventDefault();
			spaceHeld = true;
		}
	}
	function keyUp(e: KeyboardEvent) {
		if (e.key === ' ') spaceHeld = false;
	}
</script>

<svelte:window
	onpointermove={dragMove}
	onpointerup={dragUp}
	onkeydown={key}
	onkeyup={keyUp}
	onblur={() => (spaceHeld = false)}
/>

<div class="activity">
	<!-- The whiteboard. Everything inside .layer is in board pixels and zooms together. -->
	<div
		class="board"
		class:placing={picked}
		class:panning
		bind:this={boardEl}
		bind:clientWidth={boardW}
		bind:clientHeight={boardH}
		onpointerdown={boardDown}
		onpointermove={boardMove}
		onpointerup={boardUp}
		onpointercancel={boardUp}
		role="application"
		aria-label="Algebra tiles board"
	>
		<div class="layer" style:transform="translate({panX}px, {panY}px) scale({zoom})">
			<!-- The mat: one box, split by lines into the corner, the two sides and
			     the rectangle. -->
			<div
				class="mat"
				class:faded
				style:left="{-STRIP}px"
				style:top="{-STRIP}px"
				style:width="{ARM + STRIP}px"
				style:height="{ARM + STRIP}px"
				style:--strip="{STRIP}px"
			>
				<div class="side top" class:open={step === 'sides'}></div>
				<div class="side left" class:open={step === 'sides'}></div>
				<div class="corner">×</div>
			</div>

			{#if faded}
				{#each GROUP_KINDS as k (k)}
					<div
						class="zone"
						style:left="{zones[k].x}px"
						style:top="{zones[k].y}px"
						style:width="{zones[k].w}px"
						style:height="{zones[k].h}px"
					>
						<span>{ZONE_NAMES[k]}</span>
					</div>
				{/each}
			{/if}

			{#each gaps as c, i (i)}
				<div
					class="gap"
					style:left="{lenPx(c.x)}px"
					style:top="{lenPx(c.y)}px"
					style:width="{lenPx(c.w)}px"
					style:height="{lenPx(c.h)}px"
				></div>
			{/each}

			{#each tiles as t (t.id)}
				{@const moving = cancelling?.ids.includes(t.id) ? cancelling : null}
				<button
					type="button"
					class="piece"
					class:fixed={!movable(t)}
					class:locked={sideIds.has(t.id)}
					class:gone={vanished(t)}
					class:selected={selected.has(t.id)}
					class:held={held?.has(t.id)}
					class:rumble={moving?.phase === 'rumble'}
					class:merge={moving?.phase === 'merge'}
					style:left="{t.x}px"
					style:top="{t.y}px"
					style:--to-x="{moving?.to[t.id].x ?? 0}px"
					style:--to-y="{moving?.to[t.id].y ?? 0}px"
					aria-label="{t.sign < 0 ? 'negative ' : ''}{t.kind === 'x2' ? 'x squared' : t.kind} tile"
					onpointerdown={(e) =>
						movable(t)
							? grab(
									e,
									{
										source: { from: 'board', id: t.id },
										kind: t.kind,
										sign: t.sign,
										turned: t.turned
									},
									zoom
								)
							: e.stopPropagation()}
				>
					<span
						class="face"
						class:swing-down={spinning.get(t.id) === 'down'}
						class:swing-up={spinning.get(t.id) === 'up'}
						class:flip={flippingTile.has(t.id)}
						style:--pivot="{UNIT / 2}px"
					>
						<TileView kind={t.kind} sign={t.sign} turned={t.turned} wrong={wrong.has(t.id)} />
					</span>
				</button>
			{/each}

			{#each poofs as q (q.id)}
				<div class="poof" style:left="{q.x}px" style:top="{q.y}px">
					<span class="zero" style:font-size="{q.zero}px">0</span>
					<!-- Each puff of cloud is drawn twice, outlined behind and plain in front,
					     so the cloud has one outline round the outside. -->
					{#each [...q.bits
							.filter((b) => b.type === 'cloud')
							.map((b) => ({ ...b, type: 'cloud back' })), ...q.bits] as bit, i (i)}
						<span
							class={bit.type}
							style:--dx="{bit.dx}px"
							style:--dy="{bit.dy}px"
							style:--d="{bit.d}px"
							style:--delay="{bit.delay}ms"
							style:--spin="{bit.spin}deg"
						></span>
					{/each}
				</div>
			{/each}

			{#each landing as r, i (i)}
				<div
					class="landing"
					style:left="{r.x}px"
					style:top="{r.y}px"
					style:width="{r.w}px"
					style:height="{r.h}px"
				></div>
			{/each}

			<!-- The step's instructions and its Check, written on the board under the T. -->
			<div
				class="row"
				style:left="{ROW.x}px"
				style:top="{ROW.y}px"
				style:width="{ROW.w}px"
				role="presentation"
				onpointerdown={(e) => e.stopPropagation()}
			>
				{#if step === 'done'}
					<p class="complete">Yay! It’s complete.</p>
					<p class="final">{prettyText(p.given)} = {prettyText(answer)}</p>
					{#if note}<p class="note">{note}</p>{/if}
				{:else if step === 'equation'}
					<div class="equation">
						<span class="given">{prettyText(p.given)} =</span>
						<div
							class="field"
							role="presentation"
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									check();
								}
							}}
						>
							<MathInput
								bind:value={answer}
								aria-label="The other side of the equation"
								placeholder={p.type === 'multiply' ? 'the product' : 'the factors'}
							/>
						</div>
						<button type="button" class="btn-primary" onclick={check}>Check</button>
					</div>
					<p class="instructions">{instructions(step)}</p>
					{#if error}<p class="error" aria-live="polite">{error}</p>{/if}
				{:else}
					<div class="instruct">
						<div>
							<p class="instructions">{instructions(step)}</p>
							{#if error}<p class="error" aria-live="polite">{error}</p>{/if}
						</div>
						<button type="button" class="btn-primary" onclick={check}>Check</button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- The box being dragged out to select tiles. -->
	{#if marquee}
		{@const r = boxRect(marquee)}
		{@const at = toScreen(r.x, r.y)}
		<div
			class="marquee"
			style:left="{at.x}px"
			style:top="{at.y}px"
			style:width="{r.w * zoom}px"
			style:height="{r.h * zoom}px"
		></div>
	{/if}

	<!-- The buttons above the selected tiles. -->
	{#if focus}
		{@const at = toScreen(focus.x, focus.y)}
		<div
			class="tile-actions"
			style:left="{at.x}px"
			style:top="{at.y}px"
			role="toolbar"
			aria-label="Tile actions"
		>
			{#if focus.ids.length > 1}<span class="count">{focus.ids.length} tiles</span>{/if}
			{#if focus.canTurn}
				<button
					type="button"
					onclick={() => turnAll(focus.ids)}
					title="Turn (or double-click a tile)"
				>
					<RotateCw size={15} /> Turn
				</button>
			{/if}
			<button type="button" onclick={() => flipAll(focus.ids)} title="Flip to the opposite sign">
				<FlipVertical2 size={15} /> Flip
			</button>
			<button type="button" onclick={() => duplicate(focus.ids)} title="Duplicate (Ctrl+D)">
				<Copy size={15} /> Duplicate
			</button>
			{#if focus.cancel !== null}
				<button
					type="button"
					class="zero"
					onclick={() => cancelOut(focus.cancel!)}
					title="These two make zero"
				>
					Cancel out
				</button>
			{/if}
			<button
				type="button"
				class="delete"
				onclick={() => remove(focus.ids)}
				aria-label="Delete"
				title="Delete"
			>
				<Trash2 size={15} />
			</button>
		</div>
	{/if}

	<!-- The problem and its steps, across the top. -->
	<header class="bar" bind:this={headerEl}>
		<span class="kind">{p.type === 'multiply' ? 'Multiply' : 'Factor'}</span>
		<h1 class="problem">{prettyText(p.given)}</h1>
		<ol class="steps">
			{#each steps as s, i (s)}
				{@const done = steps.indexOf(step) > i || step === 'done'}
				<li class:current={s === step} class:done>
					<span class="num"
						>{#if done}<Check size={12} strokeWidth={3} />{:else}{i + 1}{/if}</span
					>
					{STEP_NAMES[s]}
				</li>
			{/each}
		</ol>
	</header>

	<!-- The toolbar, like a whiteboard app's: undo and redo; flip the tray to its
	     negative tiles and turn its x tile; the tiles; and the trash. -->
	{#if step !== 'done'}
		<div class="toolbar" bind:this={toolbarEl} aria-label="Tiles">
			<div class="group">
				<button
					type="button"
					class="tool"
					class:on={tool === 'select'}
					aria-pressed={tool === 'select'}
					onclick={() => (tool = 'select')}
					title="Select (V): drag to select tiles"
					aria-label="Select"
				>
					<MousePointer2 size={20} />
				</button>
				<button
					type="button"
					class="tool"
					class:on={tool === 'hand'}
					aria-pressed={tool === 'hand'}
					onclick={() => (tool = 'hand')}
					title="Hand (H, or hold space): drag to move around"
					aria-label="Hand"
				>
					<Hand size={20} />
				</button>
			</div>
			<div class="group">
				<button
					type="button"
					class="tool"
					onclick={undo}
					disabled={!past.length}
					title="Undo (Ctrl+Z)"
					aria-label="Undo"
				>
					<Undo2 size={20} />
				</button>
				<button
					type="button"
					class="tool"
					onclick={redo}
					disabled={!future.length}
					title="Redo (Ctrl+Shift+Z)"
					aria-label="Redo"
				>
					<Redo2 size={20} />
				</button>
			</div>
			<div class="group">
				<button
					type="button"
					class="tool labelled"
					onclick={flipTray}
					title="Flip to the {traySign > 0 ? 'negative' : 'positive'} tiles"
					aria-label="Flip to the {traySign > 0 ? 'negative' : 'positive'} tiles"
				>
					<FlipVertical2 size={20} /><span>Flip</span>
				</button>
				<button
					type="button"
					class="tool labelled"
					onclick={turnTray}
					title="Turn the x tile"
					aria-label="Turn the x tile"
				>
					<RotateCw size={20} /><span>Turn</span>
				</button>
			</div>
			<div class="group palette">
				{#each TRAY_KINDS as kind (kind)}
					{@const turned = kind === 'x' && trayTurned}
					{@const isPicked = picked?.kind === kind && picked.sign === traySign}
					<button
						type="button"
						style:width="{XLEN * TRAY_SCALE}px"
						style:height="{XLEN * TRAY_SCALE}px"
						class="tray-tile"
						class:picked={isPicked}
						aria-pressed={isPicked}
						aria-label="{traySign < 0 ? 'Negative ' : ''}{kind === 'x2' ? 'x squared' : kind} tile"
						onpointerdown={(e) =>
							grab(e, { source: { from: 'tray' }, kind, sign: traySign, turned }, TRAY_SCALE)}
					>
						<span class="card" class:flipping>
							{#key turned}
								<span
									class="face"
									class:turn-in={kind === 'x' && trayTurnedOnce}
									class:back={!turned}
								>
									<TileView {kind} sign={traySign} {turned} scale={TRAY_SCALE} />
								</span>
							{/key}
						</span>
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="trash"
				class:ready={holdingBoardTile || selected.size > 0}
				class:over={overTrash}
				bind:this={trashEl}
				onclick={() => remove([...selected])}
				aria-label="Delete the selected tiles"
				title="Drop a tile here to delete it"
			>
				<Trash2 size={22} />
			</button>
		</div>
	{/if}

	<div class="zoom" aria-label="Zoom">
		<button type="button" onclick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" title="Zoom out"
			><Minus size={16} /></button
		>
		<span>{Math.round(zoom * 100)}%</span>
		<button type="button" onclick={() => zoomBy(1.25)} aria-label="Zoom in" title="Zoom in"
			><Plus size={16} /></button
		>
		<button type="button" onclick={fit} aria-label="Fit everything on screen" title="Fit"
			><Maximize size={15} /></button
		>
	</div>

	{#if drag?.moved}
		{#each ghosts as g, i (i)}
			<div
				class="ghost"
				style:left="{drag.cx + (g.ox - drag.dx) * zoom}px"
				style:top="{drag.cy + (g.oy - drag.dy) * zoom}px"
				aria-hidden="true"
			>
				<TileView kind={g.kind} sign={g.sign} turned={g.turned} scale={zoom} lifted />
			</div>
		{/each}
	{/if}
</div>

<style>
	.activity {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}
	.board {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background-color: var(--ground);
		touch-action: none;
		cursor: grab;
	}
	.board {
		cursor: default;
	}
	.board.panning {
		cursor: grab;
	}
	.board.panning:active {
		cursor: grabbing;
	}
	.board.placing {
		cursor: copy;
	}
	.layer {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
	}
	.layer > * {
		position: absolute;
	}

	/* The mat is one box with square corners; lines inside it mark off the
	   corner and the sides, so no edge is ever drawn twice. */
	.mat {
		border: 1px solid var(--line-strong);
		background: var(--paper);
		transition: opacity 0.5s;
	}
	.mat.faded {
		opacity: 0;
		pointer-events: none;
	}
	.side {
		position: absolute;
		background: var(--paper-low);
	}
	.side.open {
		background: var(--accent-wash);
	}
	.side.top {
		top: 0;
		left: var(--strip);
		right: 0;
		height: var(--strip);
		border-bottom: 1px solid var(--line-strong);
	}
	.side.left {
		top: var(--strip);
		left: 0;
		bottom: 0;
		width: var(--strip);
		border-right: 1px solid var(--line-strong);
	}
	.corner {
		position: absolute;
		top: 0;
		left: 0;
		display: grid;
		place-items: center;
		width: var(--strip);
		height: var(--strip);
		border-right: 1px solid var(--line-strong);
		border-bottom: 1px solid var(--line-strong);
		background: var(--paper-low);
		color: var(--muted);
		font-weight: 700;
	}
	.zone {
		border: 2px dashed var(--line-strong);
		border-radius: 12px;
		background: rgb(251 252 254 / 0.6);
	}
	.zone span {
		position: absolute;
		top: -1.6rem;
		left: 0.25rem;
		color: var(--muted);
		font-size: 0.9rem;
		font-weight: 700;
	}
	.gap {
		border: 2px dashed var(--bad);
		background: var(--bad-wash);
		pointer-events: none;
	}
	.landing {
		border: 2px dashed var(--accent);
		border-radius: 4px;
		background: rgb(44 95 199 / 0.08);
		pointer-events: none;
	}
	.piece {
		padding: 0;
		border: none;
		border-radius: 5px;
		background: none;
		cursor: grab;
		touch-action: none;
		transition:
			opacity 0.5s,
			filter 0.3s;
	}
	.piece.fixed {
		cursor: default;
	}
	.face {
		display: block;
	}
	/* Locked sides go grey, so it's plain they can't be changed now. */
	.piece.locked {
		filter: grayscale(1);
		opacity: 0.55;
	}
	.piece.gone {
		opacity: 0;
		pointer-events: none;
	}
	/* The tile being dragged is drawn by its ghost; its place stays empty. */
	.piece.held {
		visibility: hidden;
	}
	.piece.selected,
	.piece:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}
	/* A turn swings an x tile a quarter about its end, the square at its top or
	   left; a flip turns a tile over like a card. */
	.face.swing-down,
	.face.swing-up {
		transform-origin: var(--pivot) var(--pivot);
		animation: swing-down 0.28s cubic-bezier(0.3, 0.7, 0.4, 1.15);
	}
	.face.swing-up {
		animation-name: swing-up;
	}
	@keyframes swing-down {
		from {
			transform: rotate(-90deg);
		}
	}
	@keyframes swing-up {
		from {
			transform: rotate(90deg);
		}
	}
	.face.flip {
		animation: flip 0.28s ease-out;
	}
	@keyframes flip {
		from {
			transform: perspective(400px) rotateX(90deg);
		}
	}

	/* Cancelling out: the pair rumbles, slides into each other, and poofs. */
	.piece.rumble {
		animation: rumble 0.12s linear infinite;
	}
	@keyframes rumble {
		0%,
		100% {
			transform: translate(0, 0) rotate(0);
		}
		25% {
			transform: translate(-2px, 1px) rotate(-2deg);
		}
		50% {
			transform: translate(2px, -1px) rotate(1.5deg);
		}
		75% {
			transform: translate(-1px, -2px) rotate(-1deg);
		}
	}
	/* The pair slides into each other, speeding up as they go, in one motion. */
	.piece.merge {
		animation: merge 0.28s cubic-bezier(0.5, 0, 0.75, 0) forwards;
	}
	@keyframes merge {
		to {
			transform: translate(var(--to-x), var(--to-y));
		}
	}

	/* The poof. Moving, growing and fading are separate animations, each with
	   one easing curve from start to end, so nothing stops and starts. */
	.poof {
		width: 0;
		height: 0;
		pointer-events: none;
	}
	.poof span:not(.zero) {
		position: absolute;
		left: calc(var(--d) / -2);
		top: calc(var(--d) / -2);
		width: var(--d);
		height: var(--d);
		animation-delay: var(--delay);
		animation-fill-mode: both;
	}
	/* Puffs of cloud: the outlined ones behind give the cloud its edge, the
	   white ones in front hide the outlines where puffs overlap. The edge goes
	   first, then the smoke thins out as it spreads and drifts up. */
	.poof .cloud {
		border-radius: 50%;
		background: radial-gradient(circle at 40% 30%, #fff 0 45%, #f1f5fb 75%, #e2e9f3 100%);
		animation-name: drift, billow, clear;
		animation-duration: 1.4s;
		animation-timing-function: cubic-bezier(0.16, 0.84, 0.3, 1), linear, linear;
	}
	.poof .cloud.back {
		background: #fff;
		box-shadow: 0 0 0 2.5px #b4c3d9;
		animation-name: drift, billow, clear-edge;
	}
	@keyframes drift {
		from {
			translate: calc(var(--dx) * 0.6) calc(var(--dy) * 0.6);
		}
		to {
			translate: calc(var(--dx) * 1.25) calc(var(--dy) * 1.25 - 24px);
		}
	}
	@keyframes billow {
		0% {
			scale: 0.7;
			animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1.2);
		}
		25% {
			scale: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		100% {
			scale: 1.25;
		}
	}
	@keyframes clear {
		0%,
		35% {
			opacity: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		100% {
			opacity: 0;
		}
	}
	@keyframes clear-edge {
		0%,
		22% {
			opacity: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		55%,
		100% {
			opacity: 0;
		}
	}
	/* Dust: little specks thrown further out, slowing as they go. */
	.poof .speck {
		border-radius: 50%;
		background: #9fb1cb;
		animation-name: fling, speck-fade;
		animation-duration: 0.75s;
		animation-timing-function: cubic-bezier(0.1, 0.8, 0.3, 1), linear;
	}
	@keyframes fling {
		from {
			translate: 0 0;
		}
		to {
			translate: var(--dx) var(--dy);
		}
	}
	@keyframes speck-fade {
		0% {
			opacity: 0;
		}
		12% {
			opacity: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		100% {
			opacity: 0;
		}
	}
	/* Sparkles: four-pointed stars that twinkle at the cloud's edge. */
	.poof .sparkle {
		background: #ffd15c;
		clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
		animation-name: twinkle-out, twinkle;
		animation-duration: 0.8s;
		animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1), linear;
	}
	@keyframes twinkle-out {
		from {
			translate: calc(var(--dx) * 0.6) calc(var(--dy) * 0.6);
			rotate: 0deg;
		}
		to {
			translate: calc(var(--dx) * 1.1) calc(var(--dy) * 1.1);
			rotate: calc(var(--spin) * 2);
		}
	}
	@keyframes twinkle {
		0% {
			scale: 0;
			animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1.3);
		}
		40% {
			scale: 1;
			animation-timing-function: cubic-bezier(0.5, 0, 0.8, 0.5);
		}
		100% {
			scale: 0;
		}
	}
	/* The 0 the pair made, found as the smoke clears, fading slowly as it rises. */
	.poof .zero {
		position: absolute;
		left: 0;
		top: 0;
		transform: translate(-50%, -50%);
		color: var(--accent-dark);
		font-weight: 800;
		line-height: 1;
		animation:
			zero-pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.3) 0.1s both,
			zero-rise 2.7s cubic-bezier(0.3, 0, 0.4, 1) both,
			zero-fade 2.7s linear both;
	}
	@keyframes zero-pop {
		from {
			scale: 0.6;
		}
		to {
			scale: 1;
		}
	}
	@keyframes zero-rise {
		from {
			translate: 0 6px;
		}
		to {
			translate: 0 -10px;
		}
	}
	@keyframes zero-fade {
		0% {
			opacity: 0;
		}
		10%,
		65% {
			opacity: 1;
			animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
		}
		100% {
			opacity: 0;
		}
	}
	.marquee {
		position: absolute;
		z-index: 5;
		border: 1px solid var(--accent);
		background: rgb(44 95 199 / 0.08);
		pointer-events: none;
	}
	.tile-actions .count {
		align-self: center;
		padding: 0 0.5rem;
		color: var(--muted);
		font-size: 0.78rem;
		font-weight: 700;
	}
	.ghost {
		position: fixed;
		z-index: 30;
		pointer-events: none;
	}
	.tile-actions {
		position: absolute;
		z-index: 15;
		display: flex;
		gap: 0.15rem;
		padding: 0.25rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--paper);
		box-shadow: 0 4px 14px rgb(29 40 56 / 0.18);
		transform: translate(-50%, calc(-100% - 8px));
		white-space: nowrap;
	}
	.tile-actions button {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		height: 2rem;
		padding: 0 0.6rem;
		border: none;
		border-radius: 999px;
		background: none;
		color: var(--ink-soft);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.tile-actions button:hover {
		background: var(--accent-wash);
		color: var(--accent-dark);
	}
	.tile-actions .zero {
		color: var(--accent-dark);
	}
	.tile-actions .delete:hover {
		background: var(--bad-wash);
		color: var(--bad);
	}

	/* The instructions under the T, in board pixels, so they zoom with it. */
	.row {
		cursor: default;
	}
	.instruct {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.instructions {
		color: var(--muted);
		font-size: 15px;
		line-height: 1.45;
	}
	.error {
		margin-top: 6px;
		color: var(--bad);
		font-size: 14px;
		font-weight: 600;
		line-height: 1.35;
	}
	.row :global(.btn-primary) {
		flex: none;
	}
	.equation {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}
	.given {
		flex: none;
		font-size: 22px;
		font-weight: 700;
		white-space: nowrap;
	}
	.field {
		flex: 1;
		min-width: 120px;
	}
	.complete {
		color: var(--good);
		font-size: 26px;
		font-weight: 700;
	}
	.final {
		margin-top: 4px;
		font-size: 20px;
		font-weight: 600;
	}
	.note {
		margin-top: 6px;
		color: var(--muted);
	}

	/* The bars float over the board like a whiteboard app's toolbars. */
	.bar,
	.toolbar,
	.zoom {
		position: absolute;
		z-index: 10;
		border: 1px solid var(--line);
		background: var(--paper);
		box-shadow:
			0 1px 2px rgb(29 40 56 / 0.08),
			0 10px 28px rgb(29 40 56 / 0.12);
	}
	.bar {
		top: 0.75rem;
		left: 50%;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.5rem 1.25rem;
		width: max-content;
		max-width: calc(100% - 1.5rem);
		min-width: min(40rem, calc(100% - 1.5rem));
		padding: 0.7rem 1.25rem;
		border-radius: 14px;
		transform: translateX(-50%);
	}
	.kind {
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
		background: var(--accent-wash);
		color: var(--accent-dark);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.problem {
		font-size: 1.45rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.8rem;
		list-style: none;
		color: var(--muted);
		font-size: 0.82rem;
		font-weight: 600;
	}
	.steps li {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.num {
		display: grid;
		place-items: center;
		width: 1.2rem;
		height: 1.2rem;
		border: 1.5px solid var(--line-strong);
		border-radius: 999px;
		font-size: 0.7rem;
	}
	.steps .current {
		color: var(--accent-dark);
	}
	.steps .current .num {
		border-color: var(--accent);
		background: var(--accent);
		color: var(--paper);
	}
	.steps .done {
		color: var(--good);
	}
	.steps .done .num {
		border-color: var(--good);
		background: var(--good-wash);
	}

	/* The toolbar: groups split by thin rules, the tiles standing up out of it. */
	.toolbar {
		bottom: 1rem;
		left: 50%;
		display: flex;
		align-items: stretch;
		height: 4.6rem;
		border-radius: 18px;
		transform: translateX(-50%);
	}
	.group {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.6rem;
		border-right: 1px solid var(--line);
	}
	.tool {
		display: grid;
		place-items: center;
		width: 2.8rem;
		height: 2.8rem;
		border: none;
		border-radius: 10px;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}
	.tool.labelled {
		gap: 0.1rem;
		width: 3.2rem;
		height: 3.6rem;
	}
	.tool span {
		font-size: 0.68rem;
		font-weight: 700;
	}
	.tool:hover:not(:disabled) {
		background: var(--paper-low);
		color: var(--accent);
	}
	.tool.on {
		background: var(--accent);
		color: var(--paper);
	}
	.tool.on:hover {
		background: var(--accent-dark);
		color: var(--paper);
	}
	.tool:disabled {
		color: #b6c0ce;
		cursor: default;
	}
	/* Each tile sits in the middle of a square slot as big as the x² tile, so the
	   x tile turns about its own middle, and the toolbar keeps its width. */
	.palette {
		align-items: flex-end;
		gap: 0.9rem;
		padding: 0 1.1rem 0.45rem;
	}
	.card {
		display: grid;
		place-items: center;
		transition: transform 0.15s ease-in;
	}
	.card.flipping {
		transform: perspective(400px) rotateX(90deg);
	}
	.face.turn-in {
		animation: turn-in 0.28s cubic-bezier(0.3, 0.7, 0.4, 1.15);
	}
	.face.turn-in.back {
		animation-name: turn-back;
	}
	@keyframes turn-in {
		from {
			transform: rotate(-90deg);
		}
	}
	@keyframes turn-back {
		from {
			transform: rotate(90deg);
		}
	}
	.tray-tile {
		display: grid;
		place-items: center;
		padding: 0;
		border: none;
		border-radius: 6px;
		background: none;
		cursor: grab;
		touch-action: none;
		transition: transform 0.12s;
	}
	.tray-tile:hover {
		transform: translateY(-4px);
	}
	.tray-tile.picked {
		outline: 3px solid var(--accent);
		outline-offset: 3px;
	}
	/* The trash is a whole end of the toolbar, so a tile is easy to drop on it. */
	.trash {
		display: grid;
		place-items: center;
		width: 4.6rem;
		border: none;
		border-radius: 0 17px 17px 0;
		background: none;
		color: #b6c0ce;
		cursor: default;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.trash.ready {
		color: var(--bad);
		cursor: pointer;
	}
	.trash.ready:hover,
	.trash.over {
		background: var(--bad-wash);
	}
	.trash.over {
		color: var(--bad);
	}
	.zoom {
		right: 1rem;
		bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.15rem;
		padding: 0.25rem;
		border-radius: 10px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--muted);
	}
	.zoom span {
		min-width: 2.8rem;
		text-align: center;
	}
	.zoom button {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: none;
		border-radius: 6px;
		background: none;
		color: var(--ink-soft);
		cursor: pointer;
	}
	.zoom button:hover {
		background: var(--paper-low);
	}
	@media (max-width: 900px) {
		.toolbar {
			bottom: 4rem;
		}
	}
</style>
