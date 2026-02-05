<script lang="ts">
	import { parseIDSToTree, getOperatorDescription, type IDSNode } from '$lib/utils/ids';
	import type { Character } from '$lib/data/loader';
	
	export let ids: string;
	export let characters: Record<string, Character> = {};
	
	$: tree = parseIDSToTree(ids);
	
	function getCharUrl(char: string): string {
		if (characters[char]) {
			return `/char/${encodeURIComponent(char)}`;
		}
		return `/phonetic/${encodeURIComponent(char)}`;
	}
	
	function getCharInfo(char: string): { pinyin: string; definition: string; exists: boolean } {
		const data = characters[char];
		return {
			pinyin: data?.pinyin || '',
			definition: data?.definition?.split(/[;,]/)[0] || '',  // First meaning only
			exists: !!data
		};
	}
	
	// Recursive render function
	function renderNode(node: IDSNode, level: number): string {
		if (node.type === 'char' && node.char) {
			const info = getCharInfo(node.char);
			const url = getCharUrl(node.char);
			const pinyinHtml = info.pinyin ? `<span class="pinyin">${info.pinyin}</span>` : '';
			const defHtml = info.definition ? `<span class="meaning">${info.definition}</span>` : '';
			return `<a href="${url}" class="component-tag${info.exists ? ' exists' : ''}">
				<span class="char">${node.char}</span>
				<span class="meta">${pinyinHtml}${defHtml}</span>
			</a>`;
		} else if (node.type === 'op' && node.children) {
			const childrenHtml = node.children.map(c => renderNode(c, level + 1)).join('');
			const desc = getOperatorDescription(node.op || '');
			return `<div class="ids-level" data-level="${level}">
				<span class="ids-op" title="${desc}">${node.op}</span>
				<div class="ids-children">${childrenHtml}</div>
			</div>`;
		}
		return '';
	}
	
	$: treeHtml = tree ? renderNode(tree, 0) : '';
</script>

<div class="decomposition-section">
	{#if tree}
		<div class="ids-tree">
			{@html treeHtml}
		</div>
	{:else}
		<code class="ids-fallback">{ids}</code>
	{/if}
</div>

<style>
	.decomposition-section {
		margin-bottom: 1.5rem;
	}
	
	.ids-tree {
		padding: 1rem;
		background: var(--bg-card);
		border-radius: 8px;
		overflow-x: auto;
	}
	
	.ids-fallback {
		display: block;
		padding: 0.5rem;
		color: var(--text-muted);
	}
	
	:global(.ids-level) {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.25rem 0;
	}
	
	:global(.ids-op) {
		font-size: 1.5rem;
		color: var(--accent);
		cursor: help;
		flex-shrink: 0;
		line-height: 1;
	}
	
	:global(.ids-children) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	
	:global(.component-tag) {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: var(--bg-hover);
		border: 1px solid var(--border);
		border-radius: 6px;
		text-decoration: none;
		color: var(--text-primary);
		transition: border-color 0.2s, background 0.2s;
	}
	
	:global(.component-tag:hover) {
		border-color: var(--accent);
		background: rgba(99, 102, 241, 0.1);
	}
	
	:global(.component-tag.exists) {
		border-color: var(--accent);
	}
	
	:global(.component-tag .char) {
		font-size: 1.25rem;
	}
	
	:global(.component-tag .pinyin) {
		font-size: 0.75rem;
		color: var(--accent-secondary);
	}
	
	:global(.component-tag .meta) {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
	}
	
	:global(.component-tag .meaning) {
		font-size: 0.7rem;
		color: var(--text-muted);
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
