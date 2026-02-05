<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { loadData, type Character, type Word } from '$lib/data/loader';
	import IDSTree from '$lib/components/IDSTree.svelte';
	import AddToStudyList from '$lib/components/AddToStudyList.svelte';
	import { openChat } from '$lib/stores/chat';
	
	let character: Character | null = null;
	let radicalInfo: { id: string; char: string; meaning: string } | null = null;
	let words: Word[] = [];
	let appearsIn: (Character & { char: string })[] = [];
	let allCharacters: Record<string, Character> = {};
	let loading = true;
	let appearsInSort = 'frequency';
	
	$: sortedAppearsIn = sortAppearsInList(appearsIn, appearsInSort);
	
	function sortAppearsInList(list: typeof appearsIn, sort: string) {
		let result = [...list];
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
	
	$: charParam = $page.params.char;
	
	$: if (charParam) {
		loadCharacter(decodeURIComponent(charParam));
	}
	
	async function loadCharacter(char: string) {
		loading = true;
		try {
			const data = await loadData();
			allCharacters = data.characters;
			const c = data.characters[char];
			if (c) {
				character = { ...c, char };
				
				// Get radical info
				if (c.radical) {
					const r = data.radicals[String(c.radical)];
					if (r) {
						radicalInfo = { id: String(c.radical), char: r.char, meaning: r.meaning };
					}
				}
				
				// Get words containing this character
				if (c.words) {
					words = c.words.slice(0, 20)
						.map(w => {
							const wordData = data.words[w];
							return wordData ? { ...wordData, word: w } : null;
						})
						.filter(Boolean) as (Word & { word: string })[];
				}
				
				// Get characters this one appears in
				if (c.appearsIn) {
					appearsIn = c.appearsIn
						.map(ch => {
							const charData = data.characters[ch];
							return charData ? { ...charData, char: ch } : null;
						})
						.filter(Boolean) as (Character & { char: string })[];
				}
			}
		} catch (error) {
			console.error('Failed to load character:', error);
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>{character ? `${character.char} - ${character.pinyin || ''}` : 'Loading...'} | Chinese Radicals</title>
</svelte:head>

{#if loading}
	<div class="loading">Loading character</div>
{:else if character}
	<div class="character-hero compact">
		<div class="hero-chars">
			<div class="hero-char primary">{character.char}</div>
			{#if character.simplified && character.simplified !== character.char}
				<a href="/char/{encodeURIComponent(character.simplified)}" class="hero-char variant" title="Simplified">({character.simplified})</a>
			{/if}
			{#if character.traditional && character.traditional !== character.char}
				<a href="/char/{encodeURIComponent(character.traditional)}" class="hero-char variant" title="Traditional">({character.traditional})</a>
			{/if}
		</div>
		<div class="hero-content">
			<div class="hero-header">
				<span class="pinyin">{character.pinyin || '—'}</span>
				<div class="hero-badges">
					{#if character.gradeLevel && character.gradeLevel > 0}
						<span class="grade-badge grade-{character.gradeLevel}">G{character.gradeLevel}</span>
					{/if}
					<span class="strokes-badge">{character.strokes || 0}画</span>
					{#if character.charFrequency}
						<span class="freq-badge">#{character.charFrequency}</span>
					{/if}
				</div>
			</div>
			<div class="definition">{character.definition || 'No definition available'}</div>
			<div class="hero-links">
				{#if radicalInfo}
					<a href="/radical/{radicalInfo.id}" class="meta-link">
						<span class="link-char">{radicalInfo.char}</span>
						<span>Radical #{radicalInfo.id}</span>
					</a>
				{/if}
				<a href="https://en.wiktionary.org/wiki/{encodeURIComponent(character.char)}" 
				   class="meta-link external" 
				   target="_blank" 
				   rel="noopener noreferrer">
					<span>📖</span>
					<span>Wiktionary</span>
				</a>
				<button class="ask-ai-btn" on:click={() => openChat(character.char, character)}>
					🤖 Ask AI
				</button>
				<AddToStudyList type="character" id={character.char} compact />
			</div>
		</div>
	</div>
	
	{#if character.ids && character.ids !== character.char}
		<div class="decomposition-box">
			<h3>Decomposition</h3>
			<IDSTree ids={character.ids} characters={allCharacters} />
		</div>
	{/if}
	

	
	{#if words.length > 0}
		<div class="words-section">
			<h3>Example Words</h3>
			<div class="words-grid">
				{#each words as word}
					<a href="/word/{encodeURIComponent(word.word)}" class="word-tag">
						<div class="word-header">
							<span class="word-chars">{word.word}</span>
							<span class="pinyin">{word.pinyin || ''}</span>
						</div>
						<div class="definition">{word.definition || ''}</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}
	
	{#if appearsIn.length > 0}
		<div class="appears-in-section">
			<div class="section-header">
				<h3>Appears In ({appearsIn.length} characters)</h3>
				<select class="sort-select" bind:value={appearsInSort}>
					<option value="frequency">Sort: Frequency</option>
					<option value="grade">Sort: Grade</option>
					<option value="strokes">Sort: Strokes</option>
				</select>
			</div>
			<div class="character-grid">
				{#each sortedAppearsIn as c}
					<a href="/char/{encodeURIComponent(c.char)}" class="character-card">
						<div class="char">{c.char}</div>
						<div class="info">
							<div class="pinyin">{c.pinyin || '—'}</div>
							<div class="definition">{(c.definition || '').slice(0, 50)}</div>
							<div class="meta">
								{#if c.gradeLevel && c.gradeLevel > 0}
									<span class="grade-badge grade-{c.gradeLevel}">G{c.gradeLevel}</span>
								{:else}
									<span class="grade-badge grade-0">—</span>
								{/if}
							</div>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}
{:else}
	<div class="loading">Character not found</div>
{/if}
