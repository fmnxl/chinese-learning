<script lang="ts">
	import { onMount } from 'svelte';
	import { loadData, type Radical } from '$lib/data/loader';
	
	let radicals: (Radical & { id: string })[] = [];
	let totalCharacters = 0;
	let loading = true;
	let searchQuery = '';
	
	$: filteredRadicals = searchQuery
		? radicals.filter(r => 
			r.meaning.toLowerCase().includes(searchQuery.toLowerCase()) ||
			r.pinyin.toLowerCase().includes(searchQuery.toLowerCase()) ||
			r.char === searchQuery
		)
		: radicals;
	
	onMount(async () => {
		try {
			const data = await loadData();
			radicals = Object.entries(data.radicals).map(([id, radical]) => ({
				...radical,
				id
			}));
			totalCharacters = Object.keys(data.characters).length;
		} catch (error) {
			console.error('Failed to load data:', error);
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>Learn Chinese Radicals</title>
	<meta name="description" content="Learn Chinese characters through their radicals - the building blocks of written Chinese">
</svelte:head>

<section id="radical-list" class="view">
	<div class="view-header">
		<h1>Chinese Radicals</h1>
		<p>Click any radical to explore its derivative characters</p>
		<div class="stats">
			<div class="stat">
				<span class="stat-number">{radicals.length || 214}</span>
				<span class="stat-label">Radicals</span>
			</div>
			<div class="stat">
				<span class="stat-number">{totalCharacters > 0 ? totalCharacters.toLocaleString() : '-'}</span>
				<span class="stat-label">Characters</span>
			</div>
		</div>
	</div>
	
	<div class="search-container">
		<input 
			type="text" 
			class="search-input" 
			placeholder="Search by meaning or pinyin..."
			bind:value={searchQuery}
		>
	</div>
	
	<div class="radical-grid">
		{#if loading}
			<div class="loading">Loading radicals</div>
		{:else}
			{#each filteredRadicals as radical}
				<a href="/radical/{radical.id}" class="radical-card">
					<div class="radical-char">{radical.char}</div>
					<div class="radical-pinyin">{radical.pinyin}</div>
					<div class="radical-meaning">{radical.meaning}</div>
					<div class="radical-count">{radical.characters.length} characters</div>
				</a>
			{/each}
		{/if}
	</div>
</section>
