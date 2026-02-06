<script lang="ts">
	import { page } from '$app/stores';
	import { loadData, type Word, type Character } from '$lib/data/loader';
	import { pairCharsWithPinyin, numberedToToneMarked } from '$lib/utils/pinyin';
	import AddToStudyList from '$lib/components/AddToStudyList.svelte';
	import { openWordChat } from '$lib/stores/chat';
	
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
	<div class="character-hero compact word-hero">
		<div class="hero-chars">
			<div class="hero-char primary">{word.wordStr}</div>
		</div>
		<div class="hero-content">
			<div class="hero-header">
				<span class="pinyin">{numberedToToneMarked(word.pinyin || '') || '—'}</span>
				<div class="hero-badges">
					{#if word.gradeLevel && word.gradeLevel > 0}
						<span class="grade-badge grade-{word.gradeLevel}">HSK {word.gradeLevel}</span>
					{/if}
					{#if word.frequency}
						<span class="freq-badge">#{word.frequency}</span>
					{/if}
				</div>
			</div>
			<div class="definition">{word.definition || 'No definition available'}</div>
			<div class="hero-links">
				<a href="https://en.wiktionary.org/wiki/{encodeURIComponent(word.wordStr)}" 
				   class="meta-link external" 
				   target="_blank" 
				   rel="noopener noreferrer">
					<span>📖</span>
					<span>Wiktionary</span>
				</a>
				<button class="ask-ai-btn" on:click={() => openWordChat(word!.wordStr, word!)}>
					🤖 Ask AI
				</button>
				<AddToStudyList type="word" id={word.wordStr} compact />
			</div>
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

