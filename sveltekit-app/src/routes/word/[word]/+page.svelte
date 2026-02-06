<script lang="ts">
	import { page } from '$app/stores';
	import { loadData, type Word, type Character } from '$lib/data/loader';
	import AddToStudyList from '$lib/components/AddToStudyList.svelte';
	
	let word: (Word & { wordStr: string }) | null = null;
	let characters: (Character & { char: string })[] = [];
	let loading = true;
	
	$: wordParam = $page.params.word;
	
	$: if (wordParam) {
		loadWord(decodeURIComponent(wordParam));
	}
	
	async function loadWord(w: string) {
		loading = true;
		try {
			const data = await loadData();
			const wordData = data.words[w];
			if (wordData) {
				word = { ...wordData, wordStr: w };
				// Get character breakdowns - preserve the char key
				characters = [...w]
					.map(c => {
						const charData = data.characters[c];
						return charData ? { ...charData, char: c } : null;
					})
					.filter((c): c is Character & { char: string } => c !== null);
			}
		} catch (error) {
			console.error('Failed to load word:', error);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{word ? `${word.wordStr} - ${word.pinyin || ''}` : 'Loading...'} | Chinese Radicals</title>
</svelte:head>

{#if loading}
	<div class="loading">Loading word</div>
{:else if word}
	<div class="word-hero">
		<div class="word-chars">{word.wordStr}</div>
		<div class="word-pinyin">{word.pinyin || '—'}</div>
		<div class="word-definition">{word.definition || 'No definition available'}</div>
			<div class="word-meta">
			{#if word.gradeLevel && word.gradeLevel > 0}
				<span class="grade-badge grade-{word.gradeLevel}">HSK {word.gradeLevel}</span>
			{/if}
			{#if word.frequency}
				<span class="frequency-badge" class:common={word.frequency <= 1000}>
					#{word.frequency} most common
				</span>
			{/if}
			<AddToStudyList type="word" id={word.wordStr} />
		</div>
	</div>
	
	{#if characters.length > 0}
		<div class="character-breakdown">
			<h3>Character Breakdown</h3>
			<div class="breakdown-grid">
				{#each characters as char}
					<a href="/char/{encodeURIComponent(char.char)}" class="breakdown-card">
						<span class="breakdown-char">{char.char}</span>
						<div class="breakdown-info">
							<div class="breakdown-pinyin">{char.pinyin || '—'}</div>
							<div class="breakdown-meaning">{char.definition || ''}</div>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}
{:else}
	<div class="loading">Word not found</div>
{/if}
