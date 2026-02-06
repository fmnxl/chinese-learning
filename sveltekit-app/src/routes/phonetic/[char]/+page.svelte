<script lang="ts">
	import { page } from '$app/stores';
	import { loadData, type Character } from '$lib/data/loader';
	import { openChat } from '$lib/stores/chat';
	
	let component: (Character & { char: string }) | null = null;
	let derivedChars: (Character & { char: string })[] = [];
	let loading = true;
	let sortBy = 'grade';
	let selectedGrades: Set<number> = new Set();
	
	$: charParam = $page.params.char;
	$: filteredDerived = filterByGrade(derivedChars, selectedGrades);
	$: sortedDerived = sortDerivedChars(filteredDerived, sortBy);
	
	$: if (charParam) {
		loadComponent(decodeURIComponent(charParam));
	}
	
	function filterByGrade(chars: typeof derivedChars, grades: Set<number>) {
		if (grades.size === 0) return chars;
		return chars.filter(c => {
			const grade = c.gradeLevel ?? 0;
			return grades.has(grade);
		});
	}
	
	function sortDerivedChars(chars: typeof derivedChars, sort: string) {
		let result = [...chars];
		switch (sort) {
			case 'frequency':
				result.sort((a, b) => (a.charFrequency || 999999) - (b.charFrequency || 999999));
				break;
			case 'grade':
				result.sort((a, b) => {
					const gradeCompare = (a.gradeLevel || 99) - (b.gradeLevel || 99);
					if (gradeCompare !== 0) return gradeCompare;
					// Secondary sort by frequency
					return (a.charFrequency || 999999) - (b.charFrequency || 999999);
				});
				break;
			case 'strokes':
				result.sort((a, b) => (a.strokes || 99) - (b.strokes || 99));
				break;
		}
		return result;
	}
	
	function toggleGrade(grade: number) {
		if (selectedGrades.has(grade)) {
			selectedGrades.delete(grade);
		} else {
			selectedGrades.add(grade);
		}
		selectedGrades = selectedGrades;
	}
	
	function clearGrades() {
		selectedGrades = new Set();
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
						.filter((c): c is Character & { char: string } => c !== null);
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
			<h2>Characters containing {component.char} ({sortedDerived.length}{selectedGrades.size > 0 ? ` of ${derivedChars.length}` : ''})</h2>
			<select class="sort-select" bind:value={sortBy}>
				<option value="frequency">Sort: Frequency</option>
				<option value="grade">Sort: HSK Level</option>
				<option value="strokes">Sort: Strokes</option>
			</select>
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
		<div class="character-grid">
			{#each sortedDerived as c}
				<a href="/char/{encodeURIComponent(c.char)}" class="character-card">
					<div class="char">{c.char}</div>
					<div class="info">
						<div class="pinyin">{c.pinyin || '—'}</div>
						<div class="definition">{(c.definition || '').slice(0, 40)}</div>
						<div class="meta">
							{#if c.gradeLevel && c.gradeLevel > 0}
								<span class="grade-badge grade-{c.gradeLevel}">HSK {c.gradeLevel}</span>
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
	
	.grade-filter {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
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
