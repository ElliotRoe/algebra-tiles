<script lang="ts">
	// The foot of the site's pages: who made the tool, About and Privacy, and a
	// help button pinned to the bottom-left corner of the window.
	import { CircleQuestionMark, X } from '@lucide/svelte';
	import { resolve } from '$app/paths';
	import logo from '$lib/assets/edtechathon-logo.svg';
	import { SUPPORT_EMAIL } from '$lib/support';

	let help = $state<HTMLDialogElement>();
</script>

<footer>
	<button
		type="button"
		class="help"
		aria-label="Help"
		aria-haspopup="dialog"
		onclick={() => help?.showModal()}
	>
		<CircleQuestionMark size={20} aria-hidden="true" />
	</button>
	<a class="link built" href="https://teacher.dev" target="_blank" rel="noopener noreferrer">
		<img src={logo} alt="" width="18" height="18" />
		Built by teacher.dev
	</a>
	<a class="link" href={resolve('/about')}>about</a>
	<a class="link" href={resolve('/privacy')}>privacy</a>
</footer>

<!-- A click on the backdrop, outside the box, closes it too. -->
<dialog
	bind:this={help}
	aria-labelledby="help-title"
	onclick={(e) => e.target === help && help.close()}
>
	<div class="box">
		<header>
			<h2 id="help-title">Need a hand?</h2>
			<button type="button" class="close" aria-label="Close help" onclick={() => help?.close()}>
				<X size={18} />
			</button>
		</header>
		<p>
			If you’re running into trouble or have suggestions, email us at
			<a href="mailto:{SUPPORT_EMAIL}?subject=Algebra%20Tiles">{SUPPORT_EMAIL}</a>.
		</p>
	</div>
</dialog>

<style>
	footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.4rem 1.1rem;
	}
	.link {
		color: var(--muted);
		font-size: 0.82rem;
		text-decoration: none;
	}
	.built {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.link:hover {
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	/* Help stays in the bottom-left corner of the window, wherever the page is scrolled. */
	.help {
		position: fixed;
		z-index: 30;
		bottom: 1rem;
		left: 1rem;
		display: grid;
		place-items: center;
		width: 2.6rem;
		height: 2.6rem;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 50%;
		background: var(--paper);
		box-shadow: 0 4px 14px rgb(29 40 56 / 0.12);
		color: var(--muted);
		cursor: pointer;
	}
	.help:hover,
	.help:focus-visible {
		background: var(--accent-wash);
		color: var(--accent);
	}
	dialog {
		width: min(27rem, calc(100vw - 2rem));
		margin: auto;
		padding: 0;
		border: none;
		border-radius: 12px;
		background: var(--paper);
		color: var(--ink);
		box-shadow: 0 18px 60px rgb(29 40 56 / 0.24);
	}
	dialog::backdrop {
		background: rgb(29 40 56 / 0.35);
	}
	.box {
		padding: 1.25rem;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.6rem;
	}
	h2 {
		font-size: 1.15rem;
		font-weight: 700;
	}
	.close {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border: none;
		border-radius: 8px;
		background: none;
		color: var(--muted);
		cursor: pointer;
	}
	.close:hover {
		background: var(--paper-low);
	}
	p {
		font-size: 0.95rem;
		line-height: 1.6;
	}
	p a {
		color: var(--accent);
		font-weight: 600;
		text-underline-offset: 4px;
	}
</style>
