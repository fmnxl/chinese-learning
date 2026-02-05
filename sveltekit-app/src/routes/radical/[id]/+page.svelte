<script lang="ts">
	import { page } from '$app/stores';
	import { loadData, type Character } from '$lib/data/loader';
	import { openChat } from '$lib/stores/chat';
	
	let radical: { id: string; char: string; pinyin: string; meaning: string; characters: string[] } | null = null;
	let allCharDetails: Map<string, Character & { char: string }> = new Map();
	let loading = true;
	let sortBy = 'default';
	
	$: radicalId = $page.params.id;
	$: gradedCount = radical ? [...allCharDetails.values()].filter(c => c.gradeLevel && c.gradeLevel > 0).length : 0;
	$: sortedChars = getSortedCharacters(radical?.characters || [], allCharDetails, sortBy);
	
	$: if (radicalId) {
		loadRadical(radicalId);
	}
	
	function getSortedCharacters(chars: string[], details: Map<string, Character & { char: string }>, sort: string) {
		let result = [...chars].filter(c => details.has(c));
		
		switch (sort) {
			case 'grade':
				result.sort((a, b) => {
					const ga = details.get(a)?.gradeLevel || 0;
					const gb = details.get(b)?.gradeLevel || 0;
					if (ga === 0 && gb === 0) return 0;
					if (ga === 0) return 1;
					if (gb === 0) return -1;
					return ga - gb;
				});
				break;
			case 'strokes':
				result.sort((a, b) => {
					const sa = details.get(a)?.strokes || 0;
					const sb = details.get(b)?.strokes || 0;
					return sa - sb;
				});
				break;
			case 'pinyin':
				result.sort((a, b) => {
					const pa = details.get(a)?.pinyin || 'zzz';
					const pb = details.get(b)?.pinyin || 'zzz';
					return pa.localeCompare(pb);
				});
				break;
			default:
				// Keep original order
				break;
		}
		return result;
	}
	
	async function loadRadical(id: string) {
		loading = true;
		try {
			const data = await loadData();
			const r = data.radicals[id];
			if (r) {
				radical = { ...r, id };
				// Load ALL character details
				for (const char of r.characters) {
					const charData = data.characters[char];
					if (charData) {
						allCharDetails.set(char, { ...charData, char });
					}
				}
				allCharDetails = allCharDetails; // Trigger reactivity
			}
		} catch (error) {
			console.error('Failed to load radical:', error);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{radical ? `${radical.char} (${radical.meaning}) - Radical ${radical.id}` : 'Loading...'} | Chinese Radicals</title>
</svelte:head>

{#if loading}
	<div class="loading">Loading radical</div>
{:else if radical}
	<div class="radical-hero">
		<div class="char">{radical.char}</div>
		<div class="pinyin">{radical.pinyin}</div>
		<div class="meaning">{radical.meaning}</div>
		<div class="meta">Radical #{radical.id} · {radical.characters.length} characters ({gradedCount} graded)</div>
		
		{#if allCharDetails.get(radical.char)}
			<button class="ask-ai-btn" on:click={() => openChat(radical.char, allCharDetails.get(radical.char)!)}>
				🤖 Ask AI
			</button>
		{/if}
	</div>
	
	<section class="character-section">
		<div class="section-header">
			<h2>Characters using this radical ({sortedChars.length})</h2>
			<select class="sort-select" bind:value={sortBy}>
				<option value="default">Default Order</option>
				<option value="grade">Sort by Grade</option>
				<option value="strokes">Sort by Strokes</option>
				<option value="pinyin">Sort by Pinyin</option>
			</select>
		</div>
		<div class="character-grid">
			{#each sortedChars as char}
				{@const details = allCharDetails.get(char)}
				<a href="/char/{encodeURIComponent(char)}" class="character-card">
					<div class="char">{char}</div>
					<div class="info">
						{#if details}
							<div class="pinyin">{details.pinyin || '—'}</div>
							<div class="definition">{details.definition || ''}</div>
							<div class="meta">
								{#if details.gradeLevel && details.gradeLevel > 0}
									<span class="grade-badge grade-{details.gradeLevel}">G{details.gradeLevel}</span>
								{:else}
									<span class="grade-badge grade-0">—</span>
								{/if}
								<span class="strokes">{details.strokes || 0} strokes</span>
							</div>
						{:else}
							<div class="pinyin">—</div>
							<div class="definition">Loading...</div>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	</section>
{:else}
	<div class="loading">Radical not found</div>
{/if}

<style>
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
