<script lang="ts">
	// The teacher's page: choose Multiply or Factor, type one problem, and share
	// it as a link (see docs/adr/0001-one-link-one-problem.md). Nothing is saved;
	// the link carries the problem.
	import { Check, Copy, ExternalLink, QrCode } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { formatPoly, prettyText, readProblem, type ActivityType } from '$lib/algebra';
	import { STARTS, startingPiles, type Start } from '$lib/settings';
	import MathInput from '$lib/MathInput.svelte';
	import TileView from '$lib/TileView.svelte';
	import Footer from '$lib/Footer.svelte';
	import { makeQr, qrExtent, qrPath, qrPng } from '$lib/qr';
	import favicon from '$lib/assets/favicon.svg';

	let type = $state<ActivityType>('multiply');
	let text = $state('');
	let chosenStart = $state<Start>('all');
	/** Multiply has no "only the positive tiles", so a choice made for Factor falls back. */
	const start = $derived(STARTS[type].some((s) => s.value === chosenStart) ? chosenStart : 'all');
	let origin = $state('');
	onMount(() => (origin = window.location.origin));

	const problem = $derived(readProblem(type, text));
	const query = $derived(
		problem.ok
			? new URLSearchParams({
					type,
					p: text.replace(/\s+/g, ''),
					start
				}).toString()
			: ''
	);
	const link = $derived(query && origin ? `${origin}${resolve('/play')}?${query}` : '');
	const summary = $derived.by(() => {
		if (!problem.ok) return '';
		if (problem.type === 'multiply')
			return `Students build ${prettyText(problem.given)} and find ${formatPoly(problem.poly)}.`;
		return `Students arrange ${prettyText(problem.given)} into a rectangle and read its factors off the sides.`;
	});

	const TYPES: { type: ActivityType; name: string; about: string; example: string }[] = [
		{
			type: 'multiply',
			name: 'Multiply',
			about:
				'Students lay out two factors on the T, fill in the rectangle, combine like terms and write the product.',
			example: '(x+2)(x-3)'
		},
		{
			type: 'factor',
			name: 'Factor',
			about:
				'Students arrange a polynomial’s tiles into a rectangle, measure its sides and write the factors.',
			example: 'x^2-x-6'
		}
	];
	const example = $derived(TYPES.find((t) => t.type === type)!.example);

	// --- sharing ---

	let copied = $state<'link' | 'qr' | null>(null);
	let copiedTimer: ReturnType<typeof setTimeout>;
	let qrOpen = $state(false);
	const qr = $derived(link ? makeQr(link) : null);

	function flash(what: 'link' | 'qr') {
		copied = what;
		clearTimeout(copiedTimer);
		copiedTimer = setTimeout(() => (copied = null), 1500);
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(link);
			flash('link');
		} catch {
			// The link is on screen to copy by hand.
		}
	}

	async function copyQr() {
		if (!qr) return;
		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': qrPng(qr) })]);
			flash('qr');
		} catch {
			// Some browsers can't put images on the clipboard; the code is on screen.
		}
	}
</script>

<div class="page">
	<header>
		<p class="brand"><img src={favicon} alt="" width="28" height="28" /> Algebra Tiles</p>
		<h1>Make a problem</h1>
		<p class="lede">
			Type one problem and share it as a link. Students build it with algebra tiles, one step at a
			time, and write the equation at the end.
		</p>
	</header>

	<section class="card">
		<h2>What will students do?</h2>
		<div class="types" role="radiogroup" aria-label="Activity type">
			{#each TYPES as t (t.type)}
				<button
					type="button"
					role="radio"
					aria-checked={type === t.type}
					class="type"
					class:chosen={type === t.type}
					onclick={() => (type = t.type)}
				>
					<span class="picture" aria-hidden="true">
						{#if t.type === 'multiply'}
							<TileView kind="x2" sign={1} scale={0.45} />
							<TileView kind="x" sign={1} turned scale={0.45} />
							<TileView kind="x" sign={-1} turned scale={0.45} />
						{:else}
							<span class="rect">
								<TileView kind="x2" sign={1} scale={0.36} />
								<TileView kind="x" sign={1} turned scale={0.36} />
								<TileView kind="x" sign={-1} scale={0.36} />
								<TileView kind="unit" sign={-1} scale={0.36} />
							</span>
						{/if}
					</span>
					<span class="name">{t.name}</span>
					<span class="about">{t.about}</span>
				</button>
			{/each}
		</div>

		<label class="field-label" for="problem">
			{type === 'multiply'
				? 'The factors to multiply, or the polynomial they make'
				: 'The polynomial to factor, or its factors'}
		</label>
		<div class="field">
			<MathInput
				bind:value={text}
				id="problem"
				placeholder="e.g. {example}"
				aria-describedby="problem-status"
				aria-invalid={text.trim() !== '' && !problem.ok}
			/>
		</div>
		<p
			id="problem-status"
			class="status"
			class:bad={text.trim() !== '' && !problem.ok}
			aria-live="polite"
		>
			{#if problem.ok}{summary}{:else if text.trim()}{problem.reason}{:else}For example,
				{prettyText(example)}.{/if}
		</p>

		<fieldset class="starts">
			<legend>Students start with</legend>
			{#each STARTS[type] as s (s.value)}
				{@const piles = problem.ok ? startingPiles(problem, s.value) : []}
				<label class="start" class:chosen={start === s.value}>
					<input
						type="radio"
						name="start"
						value={s.value}
						checked={start === s.value}
						onchange={() => (chosenStart = s.value)}
					/>
					<span class="start-text">
						<span class="start-name">{s.name}</span>
						<span class="about">{s.about}</span>
					</span>
					<!-- The tiles students will find beside the mat, for the problem typed. -->
					{#if problem.ok && piles.length}
						<span class="preview" aria-hidden="true">
							{#each piles as pile (pile.kind + pile.sign)}
								<span class="pile">
									{#each { length: pile.n }, i (i)}
										<TileView kind={pile.kind} sign={pile.sign} scale={0.3} />
									{/each}
								</span>
							{/each}
						</span>
					{/if}
				</label>
			{/each}
		</fieldset>
	</section>

	<section class="card share" class:off={!link}>
		<h2>Share it</h2>
		<p class="link" title={link}>
			{link || 'The student link appears here once the problem works.'}
		</p>
		<div class="buttons">
			<button type="button" class="btn-primary" disabled={!link} onclick={copyLink}>
				{#if copied === 'link'}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy student link{/if}
			</button>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- the student page, with this problem in its address -->
			<a
				class="btn-ghost"
				class:disabled={!link}
				href={link || undefined}
				target="_blank"
				rel="noopener"
				aria-disabled={!link}><ExternalLink size={16} /> Try it as a student</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			<button
				type="button"
				class="btn-ghost"
				disabled={!link}
				onclick={() => (qrOpen = !qrOpen)}
				aria-expanded={qrOpen}
			>
				<QrCode size={16} />
				{qrOpen ? 'Hide QR code' : 'QR code'}
			</button>
		</div>
		{#if qrOpen && qr}
			<div class="qr">
				<svg
					viewBox="0 0 {qrExtent(qr)} {qrExtent(qr)}"
					width="200"
					height="200"
					role="img"
					aria-label="QR code for the student link"
				>
					<rect width="100%" height="100%" fill="#fff" />
					<path d={qrPath(qr)} fill="#000" />
				</svg>
				<button type="button" class="btn-ghost" onclick={copyQr}>
					{#if copied === 'qr'}<Check size={16} /> Copied{:else}<Copy size={16} /> Copy QR code{/if}
				</button>
			</div>
		{/if}
	</section>

	<Footer />
</div>

<style>
	.page {
		max-width: 46rem;
		margin: 0 auto;
		padding: 2rem 1.25rem 1.5rem;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--accent);
		font-size: 1.05rem;
		font-weight: 700;
	}
	h1 {
		margin-top: 0.4rem;
		font-size: 2.2rem;
		font-weight: 700;
	}
	.lede {
		margin-top: 0.3rem;
		color: var(--muted);
		line-height: 1.5;
	}
	.card {
		margin-top: 1.25rem;
		padding: 1.25rem;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--paper);
		box-shadow: 0 1px 2px rgb(29 40 56 / 0.06);
	}
	h2 {
		font-size: 1.1rem;
		font-weight: 700;
	}
	.types {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.75rem;
		margin-top: 0.75rem;
	}
	.type {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.3rem;
		padding: 0.85rem;
		border: 2px solid var(--line);
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.type:hover {
		border-color: var(--line-strong);
	}
	.type.chosen {
		border-color: var(--accent);
		background: var(--accent-wash);
	}
	.picture {
		display: flex;
		align-items: flex-start;
		gap: 2px;
		height: 3rem;
		margin-bottom: 0.3rem;
	}
	.rect {
		display: grid;
		grid-template-columns: auto auto;
		gap: 2px;
	}
	.name {
		font-size: 1.05rem;
		font-weight: 700;
	}
	.about {
		color: var(--muted);
		font-size: 0.88rem;
		line-height: 1.4;
	}
	.field-label {
		display: block;
		margin-top: 1.25rem;
		font-weight: 600;
	}
	.field {
		margin-top: 0.4rem;
	}
	.status {
		min-height: 1.4rem;
		margin-top: 0.5rem;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.starts {
		margin-top: 1.1rem;
		padding: 0;
		border: none;
	}
	.starts legend {
		font-weight: 600;
	}
	.start {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		margin-top: 0.45rem;
		padding: 0.6rem 0.75rem;
		border: 2px solid var(--line);
		border-radius: 10px;
		cursor: pointer;
	}
	.start.chosen {
		border-color: var(--accent);
		background: var(--accent-wash);
	}
	.start input {
		margin-top: 0.2rem;
		accent-color: var(--accent);
	}
	.start-text {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.1rem;
	}
	.preview {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
		max-width: 45%;
	}
	.pile {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: flex-end;
		gap: 2px;
	}
	.start-name {
		font-weight: 600;
	}
	.status.bad {
		color: var(--bad);
		font-weight: 600;
	}
	.share.off {
		opacity: 0.7;
	}
	.link {
		margin-top: 0.5rem;
		padding: 0.6rem 0.75rem;
		overflow: hidden;
		border-radius: 8px;
		background: var(--paper-low);
		color: var(--ink-soft);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	a.disabled {
		pointer-events: none;
		color: #9aa7b8;
		border-color: var(--line);
	}
	.qr {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 1rem;
		margin-top: 1rem;
	}
	.page :global(footer) {
		margin-top: 2rem;
	}
</style>
