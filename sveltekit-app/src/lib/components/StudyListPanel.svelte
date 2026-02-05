<script lang="ts">
	import { studyList, studyListStats, storageBackend } from '$lib/stores/studyList';
	import { loadData } from '$lib/data/loader';
	import type { Character, Word } from '$lib/data/loader';

	export let open = false;

	let panelWidth = 400;
	let isDragging = false;

	// Load panel width from localStorage
	if (typeof localStorage !== 'undefined') {
		const saved = localStorage.getItem('study_list_width');
		if (saved) panelWidth = parseInt(saved);
	}

	function closePanel() {
		open = false;
	}

	function handleRemove(type: 'character' | 'word', id: string) {
		studyList.removeItem(type, id);
	}

	function handleClearAll() {
		if (confirm('Are you sure you want to clear all items from your study list?')) {
			studyList.clearAll();
		}
	}

	function handleExport() {
		const json = studyList.exportToJSON($studyList);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `study-list-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleImport() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'application/json';
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = (e) => {
					const json = e.target?.result as string;
					if (studyList.importFromJSON(json)) {
						alert('Study list imported successfully!');
					} else {
						alert('Failed to import study list. Please check the file format.');
					}
				};
				reader.readAsText(file);
			}
		};
		input.click();
	}

	// Resize handling
	function startResize(e: MouseEvent) {
		isDragging = true;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDragging) return;

		const newWidth = window.innerWidth - e.clientX;
		const minWidth = 320;
		const maxWidth = window.innerWidth * 0.8;

		panelWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('study_list_width', panelWidth.toString());
		}
	}

	function handleMouseUp() {
		isDragging = false;
	}

	// Get character/word data
	async function getItemData(item: { type: 'character' | 'word'; id: string }) {
		const data = await loadData();
		if (item.type === 'character') {
			const char = data.characters[item.id];
			return char ? { ...char, char: item.id } : null;
		} else {
			const word = data.words[item.id];
			return word ? { ...word, word: item.id } : null;
		}
	}
</script>

<svelte:window on:mousemove={handleMouseMove} on:mouseup={handleMouseUp} />

<!-- Overlay -->
{#if open}
	<div class="overlay" on:click={closePanel} role="presentation"></div>
{/if}

<!-- Panel -->
<div class="panel" class:open style="width: {panelWidth}px">
	<div class="resize-handle" on:mousedown={startResize} role="separator" aria-orientation="vertical"></div>

	<div class="header">
		<h2>Study List</h2>
		<button class="close-btn" on:click={closePanel}>×</button>
	</div>

	<div class="stats">
		<div class="stat">
			<span class="stat-value">{$studyListStats.characters}</span>
			<span class="stat-label">Characters</span>
		</div>
		<div class="stat">
			<span class="stat-value">{$studyListStats.words}</span>
			<span class="stat-label">Words</span>
		</div>
		<div class="stat">
			<span class="stat-value">{$studyListStats.dueForReview}</span>
			<span class="stat-label">Due for Review</span>
		</div>
	</div>

	<div class="storage-info">
		<span class="storage-icon">{$storageBackend === 'IndexedDB' ? '💾' : '📁'}</span>
		<span class="storage-text">Storage: {$storageBackend}</span>
	</div>

	<div class="actions">
		<a href="/learn/quiz" class="action-btn quiz-btn" on:click={closePanel}>🎯 Start Quiz</a>
		<button on:click={handleExport} class="action-btn">Export</button>
		<button on:click={handleImport} class="action-btn">Import</button>
		<button on:click={handleClearAll} class="action-btn danger">Clear All</button>
	</div>

	<div class="items">
		{#if $studyList.items.length === 0}
			<div class="empty">
				<p>Your study list is empty.</p>
				<p class="hint">Browse characters and words to add them here!</p>
			</div>
		{:else}
			{#each $studyList.items as item (item.id + item.type)}
				{#await getItemData(item)}
					<div class="item loading">
						<span>{item.id}</span>
					</div>
				{:then data}
					{#if data}
						<div class="item">
							<a
								href={item.type === 'character' ? `/char/${item.id}` : `/word/${item.id}`}
								class="item-link"
							>
								<span class="item-text">{item.id}</span>
								<span class="item-pinyin"
									>{item.type === 'character' ? data.pinyin : data.pinyin}</span
								>
								<span class="item-def"
									>{item.type === 'character' ? data.definition : data.definition}</span
								>
							</a>
							<button
								class="remove-btn"
								on:click={() => handleRemove(item.type, item.id)}
								title="Remove from study list"
							>
								×
							</button>
						</div>
					{/if}
				{/await}
			{/each}
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 45;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		background: white;
		box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
		z-index: 50;
		transform: translateX(100%);
		transition: transform 0.3s ease;
		display: flex;
		flex-direction: column;
	}

	.panel.open {
		transform: translateX(0);
	}

	.resize-handle {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 6px;
		cursor: ew-resize;
		background: transparent;
		z-index: 10;
	}

	.resize-handle:hover {
		background: #f59e0b;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 2rem;
		line-height: 1;
		cursor: pointer;
		color: #6b7280;
		padding: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.25rem;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #1f2937;
	}

	.stats {
		display: flex;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: 1;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #1f2937;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #6b7280;
		text-align: center;
	}

	.storage-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1.5rem;
		font-size: 0.75rem;
		color: #6b7280;
		border-bottom: 1px solid #e5e7eb;
	}

	.storage-icon {
		font-size: 0.875rem;
	}

	.storage-text {
		font-family: monospace;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.action-btn {
		flex: 1;
		padding: 0.5rem 1rem;
		border: 1px solid #d1d5db;
		background: white;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.action-btn:hover {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	.action-btn.danger {
		color: #dc2626;
		border-color: #fecaca;
	}

	.action-btn.danger:hover {
		background: #fef2f2;
		border-color: #dc2626;
	}

	.quiz-btn {
		background: linear-gradient(135deg, #8b5cf6, #7c3aed);
		color: white;
		border: none;
		text-decoration: none;
		text-align: center;
	}

	.quiz-btn:hover {
		background: linear-gradient(135deg, #7c3aed, #6d28d9);
		transform: translateY(-1px);
	}

	.items {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.5rem;
	}

	.empty {
		text-align: center;
		color: #6b7280;
		padding: 2rem 1rem;
	}

	.empty p {
		margin: 0.5rem 0;
	}

	.hint {
		font-size: 0.875rem;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		margin-bottom: 0.5rem;
		transition: all 0.2s ease;
	}

	.item:hover {
		background: #f9fafb;
		border-color: #d1d5db;
	}

	.item-link {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-decoration: none;
		color: inherit;
	}

	.item-text {
		font-size: 1.5rem;
		font-weight: 600;
		color: #1f2937;
	}

	.item-pinyin {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.item-def {
		font-size: 0.875rem;
		color: #4b5563;
	}

	.remove-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		color: #9ca3af;
		padding: 0.25rem;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.25rem;
		flex-shrink: 0;
	}

	.remove-btn:hover {
		background: #fee2e2;
		color: #dc2626;
	}

	.loading {
		opacity: 0.5;
	}

	@media (max-width: 640px) {
		.panel {
			width: 100% !important;
		}
	}
</style>
