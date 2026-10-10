// What tiles an activity starts with, set by the teacher and carried in the
// link as `start`.

import type { ActivityType, Problem } from './algebra';
import type { Kind, Sign } from './mat';

/** Every tile the student needs, only the positive ones (Factor), or none. */
export type Start = 'all' | 'positive' | 'none';

export const STARTS: Record<ActivityType, { value: Start; name: string; about: string }[]> = {
	multiply: [
		{
			value: 'all',
			name: 'All the tiles they need',
			about: 'The tiles for both sides and the rectangle, ready to sort out.'
		},
		{ value: 'none', name: 'No tiles', about: 'Students bring out every tile from the tray.' }
	],
	factor: [
		{
			value: 'all',
			name: 'All the tiles they need',
			about: 'Every tile the rectangle takes, zero pairs included, ready to arrange.'
		},
		{
			value: 'positive',
			name: 'Only the positive tiles',
			about: 'Students bring out the negative tiles themselves.'
		},
		{ value: 'none', name: 'No tiles', about: 'Students bring out every tile from the tray.' }
	]
};

export const readStart = (type: ActivityType, value: string | null): Start =>
	STARTS[type].find((s) => s.value === value)?.value ?? 'all';

export interface Pile {
	kind: Kind;
	sign: Sign;
	n: number;
}

/** The tiles of the problem's rectangle, by kind and sign: (x + 2)(x − 3)
 *  has one x², two x, three −x and six −1. */
export function rectangleTiles(problem: Extract<Problem, { ok: true }>): Pile[] {
	const [f, g] = problem.factors;
	return piles([
		...signed('x2', f.x * g.x),
		...signed('x', f.x * g.unit),
		...signed('x', f.unit * g.x),
		...signed('unit', f.unit * g.unit)
	]);
}

/** The tiles a student starts with, beside the mat. Multiply's are the tiles
 *  for both sides as well as the rectangle's. */
export function startingPiles(problem: Extract<Problem, { ok: true }>, start: Start): Pile[] {
	if (start === 'none') return [];
	const rect = rectangleTiles(problem);
	if (problem.type === 'factor')
		return start === 'positive' ? rect.filter((p) => p.sign > 0) : rect;
	const sides = problem.factors.flatMap((f) => [...signed('x', f.x), ...signed('unit', f.unit)]);
	return piles([...sides, ...rect]);
}

const signed = (kind: Kind, n: number): Pile[] =>
	n ? [{ kind, sign: Math.sign(n) as Sign, n: Math.abs(n) }] : [];

/** Add up piles of the same kind and sign, in the order x², x, unit; positive first. */
function piles(all: Pile[]): Pile[] {
	const out: Pile[] = [];
	for (const kind of ['x2', 'x', 'unit'] as Kind[])
		for (const sign of [1, -1] as Sign[]) {
			const n = all.filter((p) => p.kind === kind && p.sign === sign).reduce((a, p) => a + p.n, 0);
			if (n) out.push({ kind, sign, n });
		}
	return out;
}
