<script lang="ts">
	import { onMount } from 'svelte';
	import { loadData, type Character } from '$lib/data/loader';
	
	interface ComponentChar extends Character {
		char: string;
		derivedCount: number;
	}
	
	let components: ComponentChar[] = [];
	let loading = true;
	let minDerived = 10;
	let sortBy = 'count';
	let currentPage = 1;
	const perPage = 50;
	
	$: filtered = components
		.filter(c => c.derivedCount >= minDerived)
		.sort((a, b) => {
			if (sortBy === 'count') return b.derivedCount - a.derivedCount;
			// charFrequency is a RANK: lower = more common
			return (a.charFrequency || 999999) - (b.charFrequency || 999999);
		});
	
	$: totalPages = Math.ceil(filtered.length / perPage);
	$: pagedComponents = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
	
	function resetPage() { currentPage = 1; }
	
	onMount(async () => {
		try {
			const data = await loadData();
			// Find characters that appear in other characters using appearsIn
			const appearsCounts: Record<string, number> = {};
			
			for (const [char, c] of Object.entries(data.characters)) {
				if (c.appearsIn && c.appearsIn.length > 0) {
					appearsCounts[char] = c.appearsIn.length;
				}
			}
			
			components = Object.entries(appearsCounts)
				.filter(([_, count]) => count >= 5)
				.map(([char, count]) => ({
					...(data.characters[char] || {}),
					char,
					derivedCount: count
				})) as ComponentChar[];
		} catch (error) {
			console.error('Failed to load:', error);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Common Components | Chinese Radicals</title>
</svelte:head>

<section class="view">
	<div class="view-header">
		<h1>Common Components</h1>
		<p>Characters sorted by how often they appear as building blocks in other characters</p>
	</div>
	
	<div class="learn-controls">
		<select class="sort-select" bind:value={minDerived} on:change={resetPage}>
			<option value={5}>Min 5 derived chars</option>
			<option value={10}>Min 10 derived chars</option>
			<option value={20}>Min 20 derived chars</option>
			<option value={50}>Min 50 derived chars</option>
		</select>
		
		<select class="sort-select" bind:value={sortBy} on:change={resetPage}>
			<option value="count">Sort: Most Derivatives</option>
			<option value="frequency">Sort: Most Common</option>
		</select>
		
		<span class="learn-count">Showing {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}</span>
	</div>
	
	{#if loading}
		<div class="loading">Loading components</div>
	{:else}
		<div class="character-grid">
			{#each pagedComponents as char}
				<a href="/phonetic/{encodeURIComponent(char.char)}" class="character-card">
					<div class="char">{char.char}</div>
					<div class="info">
						<div class="pinyin">{char.pinyin || '—'}</div>
						<div class="definition">{(char.definition || '').slice(0, 30)}</div>
						<div class="meta">
							<span class="freq-badge">{char.derivedCount} derived</span>
						</div>
					</div>
				</a>
			{/each}
		</div>
		
		{#if totalPages > 1}
			<div class="pagination">
				<button disabled={currentPage === 1} on:click={() => currentPage = 1}>«</button>
				<button disabled={currentPage === 1} on:click={() => currentPage--}>‹</button>
				<span style="padding: 0.5rem 1rem; color: var(--text-secondary);">
					Page {currentPage} of {totalPages}
				</span>
				<button disabled={currentPage === totalPages} on:click={() => currentPage++}>›</button>
				<button disabled={currentPage === totalPages} on:click={() => currentPage = totalPages}>»</button>
			</div>
		{/if}
	{/if}
</section>

