<script lang="ts">
	import { onMount } from 'svelte';
	import { loadData, type Character } from '$lib/data/loader';
	
	let characters: (Character & { char: string })[] = [];
	let loading = true;
	let gradeFilter = 'all';
	let sortBy = 'frequency';
	let scriptType = 'simplified';
	let currentPage = 1;
	const perPage = 50;
	
	$: filteredChars = filterAndSort(characters, gradeFilter, sortBy, scriptType);
	$: totalPages = Math.ceil(filteredChars.length / perPage);
	$: pagedChars = filteredChars.slice((currentPage - 1) * perPage, currentPage * perPage);
	
	function filterAndSort(chars: typeof characters, grade: string, sort: string, script: string) {
		let result = [...chars];
		
		// Filter by script type (deduplicate simplified/traditional)
		// A char with a "simplified" field pointing to a DIFFERENT character is TRADITIONAL
		// A char with a "traditional" field pointing to a DIFFERENT character is SIMPLIFIED
		// Ignore self-references (e.g., 么 has simplified:'么', traditional:'么')
		if (script === 'simplified') {
			// Show characters that ARE simplified: no simplified variant OR self-reference
			result = result.filter(c => !c.simplified || c.simplified === c.char);
		} else {
			// Show characters that ARE traditional: no traditional variant OR self-reference
			result = result.filter(c => !c.traditional || c.traditional === c.char);
		}
		
		// Filter by grade
		if (grade !== 'all') {
			const g = parseInt(grade);
			result = result.filter(c => c.gradeLevel === g);
		}
		
		// Sort
		if (sort === 'frequency') {
			// charFrequency is a RANK: lower = more common, 0/missing = unranked (last)
			result.sort((a, b) => (a.charFrequency || 999999) - (b.charFrequency || 999999));
		} else if (sort === 'strokes') {
			result.sort((a, b) => (a.strokes || 99) - (b.strokes || 99));
		} else if (sort === 'grade') {
			result.sort((a, b) => (a.gradeLevel || 99) - (b.gradeLevel || 99));
		}
		
		return result;
	}
	
	function handleFilterChange() {
		currentPage = 1;
	}
	
	onMount(async () => {
		try {
			const data = await loadData();
			// Get all characters with definitions (no arbitrary 5000 limit)
			characters = Object.entries(data.characters)
				.map(([char, c]) => ({ ...c, char }))
				.filter(c => c.pinyin || c.definition);
		} catch (error) {
			console.error('Failed to load:', error);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Learn Characters by Level | Chinese Radicals</title>
</svelte:head>

<section class="view">
	<div class="view-header">
		<h1>Learn Characters</h1>
		<p>Progress from beginner to advanced, sorted by frequency</p>
	</div>
	
	<div class="learn-controls">
		<select class="sort-select" bind:value={gradeFilter} on:change={handleFilterChange}>
			<option value="all">All Grades</option>
			<option value="1">Grade 1 (Beginner)</option>
			<option value="2">Grade 2</option>
			<option value="3">Grade 3</option>
			<option value="4">Grade 4</option>
			<option value="5">Grade 5</option>
			<option value="6">Grade 6 (Advanced)</option>
			<option value="0">Ungraded</option>
		</select>
		
		<select class="sort-select" bind:value={sortBy} on:change={handleFilterChange}>
			<option value="frequency">Sort: Most Common First</option>
			<option value="strokes">Sort: Fewest Strokes First</option>
			<option value="grade">Sort: By Grade Level</option>
		</select>
		
		<select class="sort-select" bind:value={scriptType} on:change={handleFilterChange}>
			<option value="simplified">Simplified (简体)</option>
			<option value="traditional">Traditional (繁體)</option>
		</select>
		
		<span class="learn-count">Showing {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filteredChars.length)} of {filteredChars.length.toLocaleString()}</span>
	</div>
	
	{#if loading}
		<div class="loading">Loading characters</div>
	{:else}
		<div class="character-grid">
			{#each pagedChars as char}
				<a href="/char/{encodeURIComponent(char.char)}" class="character-card">
					<div class="char">{char.char}</div>
					<div class="info">
						<div class="pinyin">{char.pinyin || '—'}</div>
						<div class="definition">{char.definition || ''}</div>
						<div class="meta">
							{#if char.gradeLevel && char.gradeLevel > 0}
								<span class="grade-badge grade-{char.gradeLevel}">G{char.gradeLevel}</span>
							{:else}
								<span class="grade-badge grade-0">—</span>
							{/if}
							{#if char.charFrequency}
								<span class="freq-badge">#{char.charFrequency}</span>
							{/if}
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
