<script lang="ts">
	// The foot of the teacher page: who made the tool.
	import logo from '$lib/assets/edtechathon-logo.svg';
</script>

<footer>
	<a class="built" href="https://teacher.dev" target="_blank" rel="noopener noreferrer">
		<img src={logo} alt="" width="18" height="18" />
		Built by teacher.dev
	</a>
</footer>

<style>
	footer {
		display: flex;
		justify-content: flex-end;
	}
	.built {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--muted);
		font-size: 0.82rem;
		text-decoration: none;
	}
	.built:hover {
		color: var(--accent);
	}
</style>
