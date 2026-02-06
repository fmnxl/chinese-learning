<script lang="ts">
	import { studyList, isInStudyList } from '$lib/stores/studyList';

	export let type: 'character' | 'word';
	export let id: string;
	export let compact = false;

	$: inList = $isInStudyList(type, id);

	function toggle() {
		if (inList) {
			studyList.removeItem(type, id);
		} else {
			studyList.addItem(type, id);
		}
	}
</script>

<button
	on:click={toggle}
	class="add-button"
	class:in-list={inList}
	class:compact
	title={inList ? 'Remove from study list' : 'Add to study list'}
>
	{#if compact}
		<span class="icon">{inList ? '★' : '☆'}</span>
	{:else}
		<span class="icon">{inList ? '★' : '☆'}</span>
		<span class="label">{inList ? 'In Study List' : 'Add to Study List'}</span>
	{/if}
</button>

<style>
	.add-button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border, #3a3a44);
		background: var(--bg-hover, #2a2a32);
		border-radius: 6px;
		font-size: 0.85rem;
		color: var(--text-secondary, #a0a0a8);
		cursor: pointer;
		transition: all 0.2s ease;
		min-height: 3.125rem;
		box-sizing: border-box;
	}

	.add-button:hover {
		border-color: var(--accent, #ff6b6b);
		color: var(--text-primary, #e4e4e7);
	}

	.add-button.in-list {
		background: rgba(245, 158, 11, 0.15);
		border-color: #f59e0b;
		color: #fbbf24;
	}

	.add-button.in-list:hover {
		background: rgba(245, 158, 11, 0.25);
	}

	.add-button.compact {
		padding: 0.4rem 0.6rem;
		min-width: auto;
	}

	.icon {
		font-size: 1rem;
		line-height: 1;
	}

	.add-button.in-list .icon {
		color: #f59e0b;
	}

	.label {
		font-weight: 500;
	}
</style>
