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
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid var(--border-color, #ddd);
		background: white;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.add-button:hover {
		background: var(--hover-bg, #f9fafb);
		border-color: var(--hover-border, #999);
	}

	.add-button.in-list {
		background: var(--accent-bg, #fef3c7);
		border-color: var(--accent-border, #f59e0b);
		color: var(--accent-text, #92400e);
	}

	.add-button.in-list:hover {
		background: var(--accent-bg-hover, #fde68a);
	}

	.add-button.compact {
		padding: 0.375rem 0.625rem;
		min-width: auto;
	}

	.icon {
		font-size: 1.125rem;
		line-height: 1;
	}

	.add-button.in-list .icon {
		color: #f59e0b;
	}

	.label {
		font-weight: 500;
	}
</style>
