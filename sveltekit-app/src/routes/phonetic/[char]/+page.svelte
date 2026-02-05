<script lang="ts">
	import { page } from '$app/stores';
	import { loadData, type Character } from '$lib/data/loader';
	import { openChat } from '$lib/stores/chat';
	
	let component: (Character & { char: string }) | null = null;
	let derivedChars: (Character & { char: string })[] = [];
	let loading = true;
	let sortBy = 'frequency';
	
	$: charParam = $page.params.char;
	$: sortedDerived = sortDerivedChars(derivedChars, sortBy);
	
	$: if (charParam) {
		loadComponent(decodeURIComponent(charParam));
	}
	
	function sortDerivedChars(chars: typeof derivedChars, sort: string) {
		let result = [...chars];
		switch (sort) {
			case 'frequency':
				result.sort((a, b) => (a.charFrequency || 999999) - (b.charFrequency || 999999));
				break;
			case 'grade':
				result.sort((a, b) => (a.gradeLevel || 99) - (b.gradeLevel || 99));
				break;
			case 'strokes':
				result.sort((a, b) => (a.strokes || 99) - (b.strokes || 99));
				break;
		}
		return result;
	}
	
	async function loadComponent(char: string) {
		loading = true;
		try {
			const data = await loadData();
			const c = data.characters[char];
			
			if (c) {
				component = { ...c, char };
				// Get derived characters from appearsIn
				if (c.appearsIn) {
					derivedChars = c.appearsIn
						.map(ch => {
							const charData = data.characters[ch];
							return charData ? { ...charData, char: ch } : null;
						})
						.filter(Boolean) as (Character & { char: string })[];
				}
			} else {
				// Component not in characters dict - search for chars containing it in IDS
				component = { char, pinyin: '', definition: '' } as any;
				derivedChars = [];
				for (const [ch, cData] of Object.entries(data.characters)) {
					// Check both components list and IDS string
					const inComponents = cData.components && cData.components.includes(char);
					const inIds = cData.ids && cData.ids.includes(char);
					if (inComponents || inIds) {
						derivedChars.push({ ...cData, char: ch });
					}
				}
			}
		} catch (error) {
			console.error('Failed to load component:', error);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{component ? `${component.char} - Component` : 'Loading...'} | Chinese Radicals</title>
</svelte:head>

{#if loading}
	<div class="loading">Loading component</div>
{:else if component}
	<div class="radical-hero">
		<div class="char">{component.char}</div>
		<div class="pinyin">{component.pinyin || ''}</div>
		<div class="meaning">{component.definition || ''}</div>
		<div class="meta">{derivedChars.length} derived characters</div>
		<a href="/char/{encodeURIComponent(component.char)}" class="link-to-char">
			View character details →
		</a>
		<button class="ask-ai-btn" on:click={() => openChat(component.char, component)}>
			🤖 Ask AI
		</button>
	</div>
	
	<section class="character-section">
		<div class="section-header">
			<h2>Characters containing {component.char} ({derivedChars.length})</h2>
			<select class="sort-select" bind:value={sortBy}>
				<option value="frequency">Sort: Frequency</option>
				<option value="grade">Sort: Grade</option>
				<option value="strokes">Sort: Strokes</option>
			</select>
		</div>
		<div class="character-grid">
			{#each sortedDerived as c}
				<a href="/char/{encodeURIComponent(c.char)}" class="character-card">
					<div class="char">{c.char}</div>
					<div class="info">
						<div class="pinyin">{c.pinyin || '—'}</div>
						<div class="definition">{(c.definition || '').slice(0, 40)}</div>
						<div class="meta">
							{#if c.gradeLevel && c.gradeLevel > 0}
								<span class="grade-badge grade-{c.gradeLevel}">G{c.gradeLevel}</span>
							{:else}
								<span class="grade-badge grade-0">—</span>
							{/if}
							{#if c.charFrequency}
								<span class="freq-badge">#{c.charFrequency}</span>
							{/if}
						</div>
					</div>
				</a>
			{/each}
		</div>
	</section>
{:else}
	<div class="loading">Component not found</div>
{/if}

<style>
	.link-to-char {
		display: inline-block;
		margin-top: 1rem;
		color: var(--accent);
		text-decoration: none;
	}
	.link-to-char:hover {
		text-decoration: underline;
	}
	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.section-header h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
		color: var(--text-secondary);
	}
</style>
