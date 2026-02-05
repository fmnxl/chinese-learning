<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import ChatPanel from '$lib/components/ChatPanel.svelte';
	import StudyListPanel from '$lib/components/StudyListPanel.svelte';
	import { studyListStats } from '$lib/stores/studyList';
	import { setApiKey, getApiKey } from '$lib/stores/chat';
	import { onMount } from 'svelte';
	
	let settingsOpen = false;
	let studyListOpen = false;
	let apiKeyValue = '';
	
	onMount(() => {
		apiKeyValue = getApiKey() || '';
	});
	
	function openSettings() {
		apiKeyValue = getApiKey() || '';
		settingsOpen = true;
	}
	
	function closeSettings() {
		settingsOpen = false;
	}
	
	function saveSettings() {
		setApiKey(apiKeyValue);
		closeSettings();
	}
</script>

<header>
	<div class="header-content">
		<div class="logo">漢字 Radicals</div>
		<nav class="header-tabs">
			<a href="/" class="tab" class:active={$page.url.pathname === '/'}>By Radical</a>
			<a href="/learn" class="tab" class:active={$page.url.pathname === '/learn'}>By Level</a>
			<a href="/phonetic" class="tab" class:active={$page.url.pathname.startsWith('/phonetic')}>By Component</a>
		</nav>
		<div class="header-actions">
			<button class="icon-btn" on:click={() => studyListOpen = !studyListOpen} title="Study List">
				☆
				{#if $studyListStats.total > 0}
					<span class="badge">{$studyListStats.total}</span>
				{/if}
			</button>
			<button class="icon-btn" on:click={openSettings} title="Settings">⚙️</button>
		</div>
	</div>
</header>

<Breadcrumb />

<main>
	<slot />
</main>

<ChatPanel />

<StudyListPanel bind:open={studyListOpen} />

<!-- Settings Modal -->
{#if settingsOpen}
<div class="modal-overlay active" on:click|self={closeSettings} on:keydown={() => {}}>
	<div class="modal">
		<h2>⚙️ Settings</h2>
		<label for="api-key-input">OpenRouter API Key</label>
		<input type="password" id="api-key-input" bind:value={apiKeyValue} placeholder="sk-or-v1-...">
		<p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 1rem;">
			Get your API key from <a href="https://openrouter.ai/keys" target="_blank" style="color: var(--accent);">openrouter.ai/keys</a>
		</p>
		<div class="modal-actions">
			<button class="btn btn-secondary" on:click={closeSettings}>Cancel</button>
			<button class="btn btn-primary" on:click={saveSettings}>Save</button>
		</div>
	</div>
</div>
{/if}

<style>
	/* Layout-specific styles */
</style>
