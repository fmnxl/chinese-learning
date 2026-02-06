<script lang="ts">
	import { onMount } from 'svelte';
	import { loadData, type Character } from '$lib/data/loader';
	
	interface ComponentChar extends Character {
		char: string;
		derivedCount: number;
		derivedFreqScore: number; // Lower = more useful (derivatives are more common)
	}
	
	let components: ComponentChar[] = [];
	let loading = true;
	let minDerived = 10;
	let sortBy = 'frequency';
	let currentPage = 1;
	const perPage = 50;
	let selectedGrades: Set<number> = new Set();
	
	$: filtered = components
		.filter(c => c.derivedCount >= minDerived)
		.filter(c => {
			if (selectedGrades.size === 0) return true;
			const grade = c.gradeLevel ?? 0;
			return selectedGrades.has(grade);
		})
		.sort((a, b) => {
			if (sortBy === 'count') return b.derivedCount - a.derivedCount;
			// derivedFreqScore: lower = derivatives are more common = more useful
			return a.derivedFreqScore - b.derivedFreqScore;
		});
	
	$: totalPages = Math.ceil(filtered.length / perPage);
	$: pagedComponents = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
	
	function resetPage() { currentPage = 1; }
	
	function toggleGrade(grade: number) {
		if (selectedGrades.has(grade)) {
			selectedGrades.delete(grade);
		} else {
			selectedGrades.add(grade);
		}
		selectedGrades = selectedGrades; // Trigger reactivity
		resetPage();
	}
	
	function clearGrades() {
		selectedGrades = new Set();
		resetPage();
	}
	
	onMount(async () => {
		try {
			const data = await loadData();
			// Find characters that appear in other characters using appearsIn
			const componentData: ComponentChar[] = [];
			
			for (const [char, c] of Object.entries(data.characters)) {
				if (c.appearsIn && c.appearsIn.length >= 5) {
					// Calculate derivative frequency score
					// Get frequency ranks of derived characters (lower rank = more common)
					const derivedFreqs = c.appearsIn
						.map(d => data.characters[d]?.charFrequency || 99999)
						.sort((a, b) => a - b); // Sort ascending (most common first)
					
					// Use average of top 10 most common derivatives as the score
					const topN = derivedFreqs.slice(0, 10);
					const avgFreq = topN.reduce((sum, f) => sum + f, 0) / topN.length;
					
					componentData.push({
						...(c as Character),
						char,
						derivedCount: c.appearsIn.length,
						derivedFreqScore: avgFreq
					});
				}
			}
			
			components = componentData;
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
			<option value="frequency">Sort: Most Useful</option>
		</select>
		
		<span class="learn-count">Showing {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}</span>
	</div>
	
	<div class="grade-filter">
	<span class="filter-label">Filter by HSK:</span>
		<div class="grade-buttons">
			{#each [1, 2, 3, 4, 5, 6] as grade}
				<button
					class="grade-toggle grade-{grade}"
					class:active={selectedGrades.has(grade)}
					on:click={() => toggleGrade(grade)}
				>
					HSK {grade}
				</button>
			{/each}
			<button
				class="grade-toggle grade-0"
				class:active={selectedGrades.has(0)}
				on:click={() => toggleGrade(0)}
			>
				Ungraded
			</button>
			{#if selectedGrades.size > 0}
				<button class="clear-grades" on:click={clearGrades}>Clear</button>
			{/if}
		</div>
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

<style>
	.grade-filter {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}
	
	.filter-label {
		color: var(--text-secondary);
		font-size: 0.875rem;
	}
	
	.grade-buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	
	.grade-toggle {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--border-color);
		background: var(--card-bg);
		color: var(--text-secondary);
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
		transition: all 0.15s ease;
	}
	
	.grade-toggle:hover {
		border-color: var(--accent);
	}
	
	.grade-toggle.active {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}
	
	.grade-toggle.grade-1.active { background: #22c55e; border-color: #22c55e; }
	.grade-toggle.grade-2.active { background: #84cc16; border-color: #84cc16; }
	.grade-toggle.grade-3.active { background: #eab308; border-color: #eab308; color: #1a1a1f; }
	.grade-toggle.grade-4.active { background: #f97316; border-color: #f97316; }
	.grade-toggle.grade-5.active { background: #ef4444; border-color: #ef4444; }
	.grade-toggle.grade-6.active { background: #a855f7; border-color: #a855f7; }
	.grade-toggle.grade-0.active { background: var(--border); border-color: var(--border); color: var(--text-muted); }
	
	.clear-grades {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--border-color);
		background: transparent;
		color: var(--text-secondary);
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.8rem;
		transition: all 0.15s ease;
	}
	
	.clear-grades:hover {
		background: var(--card-bg);
		color: var(--text-primary);
	}
</style>
