<script lang="ts">
	import { page } from '$app/stores';
	
	interface Crumb {
		label: string;
		href?: string;
	}
	
	$: crumbs = buildCrumbs($page.url.pathname, $page.params);
	
	function buildCrumbs(pathname: string, params: Record<string, string>): Crumb[] {
		const parts = pathname.split('/').filter(Boolean);
		const crumbs: Crumb[] = [{ label: 'Home', href: '/' }];
		
		if (parts[0] === 'radical' && params.id) {
			crumbs.push({ label: `Radical #${params.id}` });
		} else if (parts[0] === 'char' && params.char) {
			const char = decodeURIComponent(params.char);
			crumbs.push({ label: 'Learn', href: '/learn' });
			crumbs.push({ label: char });
		} else if (parts[0] === 'word' && params.word) {
			const word = decodeURIComponent(params.word);
			crumbs.push({ label: word });
		} else if (parts[0] === 'learn') {
			crumbs.push({ label: 'Learn Characters' });
		} else if (parts[0] === 'phonetic') {
			if (params.char) {
				const char = decodeURIComponent(params.char);
				crumbs.push({ label: 'Components', href: '/phonetic' });
				crumbs.push({ label: char });
			} else {
				crumbs.push({ label: 'Components' });
			}
		}
		
		return crumbs;
	}
</script>

{#if crumbs.length > 1}
	<nav class="breadcrumb">
		{#each crumbs as crumb, i}
			{#if i > 0}
				<span class="separator">›</span>
			{/if}
			{#if crumb.href && i < crumbs.length - 1}
				<a href={crumb.href}>{crumb.label}</a>
			{:else}
				<span class="current">{crumb.label}</span>
			{/if}
		{/each}
	</nav>
{/if}

<style>
	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		font-size: 0.875rem;
		color: var(--text-muted);
		background: var(--bg-card);
		border-bottom: 1px solid var(--border);
	}
	
	.breadcrumb a {
		color: var(--text-secondary);
		text-decoration: none;
	}
	
	.breadcrumb a:hover {
		color: var(--accent);
	}
	
	.separator {
		color: var(--text-muted);
	}
	
	.current {
		color: var(--text-primary);
		font-weight: 500;
	}
</style>
