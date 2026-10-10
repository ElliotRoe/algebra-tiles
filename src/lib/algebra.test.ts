import { describe, expect, test } from 'bun:test';
import {
	checkEquation,
	factorizations,
	formatPoly,
	mul,
	prettyText,
	readProblem,
	type Problem
} from './algebra';
import { readStart, startingPiles } from './settings';

const ok = (p: Problem) => {
	if (!p.ok) throw new Error(p.reason);
	return p;
};

describe('readProblem: multiply', () => {
	test('two binomials', () => {
		const p = ok(readProblem('multiply', '(x+2)(x-3)'));
		expect(p.type === 'multiply' && p.factors).toEqual([
			{ x: 1, unit: 2 },
			{ x: 1, unit: -3 }
		]);
		expect(p.poly).toEqual([-6, -1, 1]);
		expect(p.given).toBe('(x+2)(x-3)');
	});
	test('a monomial times a binomial joins its single terms into one side', () => {
		const p = ok(readProblem('multiply', '2x(x+3)'));
		expect(p.type === 'multiply' && p.factors).toEqual([
			{ x: 2, unit: 0 },
			{ x: 1, unit: 3 }
		]);
	});
	test('leading coefficients, negatives and a square', () => {
		expect(ok(readProblem('multiply', '(-x+2)(3x-1)')).ok).toBe(true);
		const sq = ok(readProblem('multiply', '(x+3)^2'));
		expect(sq.type === 'multiply' && sq.factors).toEqual([
			{ x: 1, unit: 3 },
			{ x: 1, unit: 3 }
		]);
		expect(ok(readProblem('multiply', 'x*x')).ok).toBe(true);
		expect(ok(readProblem('multiply', '3(x-1)')).ok).toBe(true);
	});
	test('things tiles cannot show', () => {
		expect(readProblem('multiply', 'x+2').ok).toBe(false);
		expect(readProblem('multiply', '(x+1)(x+2)(x+3)').ok).toBe(false);
		expect(readProblem('multiply', '(x+y)(x-1)').ok).toBe(false);
		expect(readProblem('multiply', '(x+2)(x-3)=1').ok).toBe(false);
		expect(readProblem('multiply', '(x+0.5)(x-1)').ok).toBe(false);
		expect(readProblem('multiply', '(x+2)(x').ok).toBe(false);
		expect(readProblem('multiply', '').ok).toBe(false);
	});
});

describe('readProblem: either form', () => {
	test('Multiply from a polynomial starts from its factors', () => {
		const p = ok(readProblem('multiply', 'x^2-x-6'));
		expect(p.given).toBe('(x+2)(x-3)');
		expect(ok(readProblem('multiply', '2x^2+6x')).given).toBe('2x(x+3)');
	});
	test('Factor from factors starts from the polynomial', () => {
		const p = ok(readProblem('factor', '(x+2)(x-3)'));
		expect(p.given).toBe('x^2-x-6');
		expect(p.poly).toEqual([-6, -1, 1]);
	});
	test('a factored-out number comes out whole', () => {
		expect(ok(readProblem('factor', '4x+6')).factors).toEqual([
			{ x: 0, unit: 2 },
			{ x: 2, unit: 3 }
		]);
	});
});

describe('readProblem: factor', () => {
	test('trinomials that factor', () => {
		expect(readProblem('factor', 'x^2-x-6').ok).toBe(true);
		expect(readProblem('factor', '6x^2+x-2').ok).toBe(true);
		expect(readProblem('factor', 'x^2-9').ok).toBe(true);
		expect(readProblem('factor', '2x^2+4x').ok).toBe(true);
		expect(readProblem('factor', '-x^2+5x-6').ok).toBe(true);
		expect(readProblem('factor', '4x+6').ok).toBe(true);
	});
	test('says why when it does not factor', () => {
		const p = readProblem('factor', 'x^2+x+1');
		expect(p.ok).toBe(false);
		expect(!p.ok && p.reason).toContain('doesn’t factor');
		expect(readProblem('factor', 'x^3+1').ok).toBe(false);
		expect(readProblem('factor', '0').ok).toBe(false);
	});
});

describe('factorizations', () => {
	test('every one multiplies back', () => {
		for (const poly of [[-6, -1, 1], [-2, 1, 6], [0, 4, 2], [-9, 0, 1], [6, 4], [6], [0, 0, 3]]) {
			const ways = factorizations(poly);
			expect(ways.length).toBeGreaterThan(0);
			for (const [f, g] of ways) expect(mul([f.unit, f.x], [g.unit, g.x]).join()).toBe(poly.join());
		}
	});
});

describe('checkEquation', () => {
	const multiply = ok(readProblem('multiply', '(x+2)(x-3)'));
	const factor = ok(readProblem('factor', 'x^2-x-6'));
	test('right either way round, in any term order', () => {
		expect(checkEquation(multiply, '(x+2)(x-3)=x^2-x-6').ok).toBe(true);
		expect(checkEquation(multiply, 'x^2-x-6=(x+2)(x-3)').ok).toBe(true);
		expect(checkEquation(multiply, '(x-3)(x+2)=-6-x+x^2').ok).toBe(true);
		expect(checkEquation(factor, 'x^2-x-6=(2+x)(x-3)').ok).toBe(true);
	});
	test('flipped signs count, with a note', () => {
		const v = checkEquation(factor, 'x^2-x-6=(-x-2)(-x+3)');
		expect(v.ok && v.note).toBeTruthy();
	});
	test('equal but not simplified gets a nudge', () => {
		const v = checkEquation(multiply, '(x+2)(x-3)=x^2+2x-3x-6');
		expect(!v.ok && v.message).toContain('combine the like terms');
	});
	test('wrong answers and malformed ones', () => {
		expect(checkEquation(multiply, '(x+2)(x-3)=x^2+x-6').ok).toBe(false);
		expect(checkEquation(multiply, 'x^2-x-6').ok).toBe(false);
		expect(checkEquation(multiply, 'x^2-x-6=x^2-x-6').ok).toBe(false);
		expect(checkEquation(multiply, '(x+2)(x-3)=').ok).toBe(false);
	});
});

describe('formatting', () => {
	test('formatPoly', () => {
		expect(formatPoly([-6, -1, 1])).toBe('x² − x − 6');
		expect(formatPoly([0, 2, -3])).toBe('−3x² + 2x');
		expect(formatPoly([0])).toBe('0');
	});
	test('prettyText', () => {
		expect(prettyText('(x+2)(x-3)')).toBe('(x + 2)(x − 3)');
		expect(prettyText('-x^2+3x')).toBe('−x² + 3x');
	});
});

describe('starting tiles', () => {
	const count = (piles: { n: number }[]) => piles.reduce((a, p) => a + p.n, 0);

	test('Multiply starts with the sides’ tiles and the rectangle’s, or none', () => {
		const p = ok(readProblem('multiply', '(x+2)(x-3)'));
		// Sides: x, 1, 1 and x, −1, −1, −1. Rectangle: x², 2x, −3x, −6.
		expect(startingPiles(p, 'all')).toEqual([
			{ kind: 'x2', sign: 1, n: 1 },
			{ kind: 'x', sign: 1, n: 4 },
			{ kind: 'x', sign: -1, n: 3 },
			{ kind: 'unit', sign: 1, n: 2 },
			{ kind: 'unit', sign: -1, n: 9 }
		]);
		expect(startingPiles(p, 'none')).toEqual([]);
	});

	test('Factor starts with the rectangle’s tiles, or only the positive ones', () => {
		const p = ok(readProblem('factor', 'x^2-x-6'));
		expect(count(startingPiles(p, 'all'))).toBe(12);
		expect(startingPiles(p, 'positive')).toEqual([
			{ kind: 'x2', sign: 1, n: 1 },
			{ kind: 'x', sign: 1, n: 2 }
		]);
	});

	test('Multiply can start with only the positive tiles', () => {
		const p = ok(readProblem('multiply', '(x+2)(x-3)'));
		expect(startingPiles(p, 'positive')).toEqual([
			{ kind: 'x2', sign: 1, n: 1 },
			{ kind: 'x', sign: 1, n: 4 },
			{ kind: 'unit', sign: 1, n: 2 }
		]);
	});

	test('an unknown start falls back to all the tiles', () => {
		expect(readStart('positive')).toBe('positive');
		expect(readStart('lots')).toBe('all');
	});
});
