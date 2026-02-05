// IDS (Ideographic Description Sequence) parsing utilities

// IDS operator definitions: how many arguments each takes
export const IDS_OPERATORS: Record<string, number> = {
	'⿰': 2, '⿱': 2, '⿲': 3, '⿳': 3, '⿴': 2,
	'⿵': 2, '⿶': 2, '⿷': 2, '⿸': 2, '⿹': 2, '⿺': 2, '⿻': 2
};

export interface IDSNode {
	type: 'op' | 'char';
	op?: string;
	char?: string;
	children?: IDSNode[];
}

/**
 * Parse IDS string into a tree structure
 * e.g., "⿰氵母" → { type: 'op', op: '⿰', children: [{type: 'char', char: '氵'}, {type: 'char', char: '母'}] }
 */
export function parseIDSToTree(ids: string): IDSNode | null {
	if (!ids) return null;
	let pos = 0;

	function parse(): IDSNode | null {
		if (pos >= ids.length) return null;
		
		// Handle surrogate pairs (some IDS chars are outside BMP)
		let char: string;
		const code = ids.charCodeAt(pos);
		if (code >= 0xD800 && code <= 0xDBFF && pos + 1 < ids.length) {
			// Surrogate pair
			char = ids.slice(pos, pos + 2);
			pos += 2;
		} else {
			char = ids[pos];
			pos++;
		}

		if (IDS_OPERATORS[char]) {
			// This is an operator, parse its arguments
			const argCount = IDS_OPERATORS[char];
			const children: IDSNode[] = [];
			for (let i = 0; i < argCount && pos < ids.length; i++) {
				const child = parse();
				if (child) children.push(child);
			}
			return { type: 'op', op: char, children };
		} else {
			// This is a character (leaf node)
			return { type: 'char', char };
		}
	}

	return parse();
}

/**
 * Flatten tree to just leaf components (characters)
 */
export function getTreeLeaves(tree: IDSNode | null): string[] {
	if (!tree) return [];
	
	if (tree.type === 'char' && tree.char) {
		return [tree.char];
	} else if (tree.type === 'op' && tree.children) {
		return tree.children.flatMap(child => getTreeLeaves(child));
	}
	return [];
}

/**
 * Get operator description for tooltip
 */
export function getOperatorDescription(op: string): string {
	const descriptions: Record<string, string> = {
		'⿰': 'Left-Right',
		'⿱': 'Top-Bottom',
		'⿲': 'Left-Middle-Right',
		'⿳': 'Top-Middle-Bottom',
		'⿴': 'Surround',
		'⿵': 'Surround from above',
		'⿶': 'Surround from below',
		'⿷': 'Surround from left',
		'⿸': 'Surround from upper-left',
		'⿹': 'Surround from upper-right',
		'⿺': 'Surround from lower-left',
		'⿻': 'Overlaid'
	};
	return descriptions[op] || 'Composition';
}
