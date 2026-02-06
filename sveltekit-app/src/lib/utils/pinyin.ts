/**
 * Pinyin utilities for tone conversion and ruby text generation
 */

// Vowel to tone marker mapping
const toneMarks: Record<string, string[]> = {
	a: ['ā', 'á', 'ǎ', 'à', 'a'],
	e: ['ē', 'é', 'ě', 'è', 'e'],
	i: ['ī', 'í', 'ǐ', 'ì', 'i'],
	o: ['ō', 'ó', 'ǒ', 'ò', 'o'],
	u: ['ū', 'ú', 'ǔ', 'ù', 'u'],
	ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'],
	v: ['ǖ', 'ǘ', 'ǚ', 'ǜ', 'ü'] // v is often used as ü in input
};

/**
 * Convert numbered pinyin syllable to tone-marked pinyin
 * e.g., "hao3" → "hǎo", "nü3" → "nǚ"
 */
function convertSyllable(syllable: string): string {
	const match = syllable.match(/^([a-züv]+)(\d)?$/i);
	if (!match) return syllable;

	const [, base, toneStr] = match;
	const tone = toneStr ? parseInt(toneStr) : 5;
	if (tone < 1 || tone > 5) return syllable;

	// Find the vowel to add the tone mark to (following standard rules)
	// Rule: a/e always get the mark, otherwise mark the second vowel in a pair
	const vowels = 'aeiouüv';
	let result = base.toLowerCase();
	
	// Priority: a or e always gets the mark
	if (result.includes('a')) {
		const idx = result.indexOf('a');
		result = result.slice(0, idx) + (toneMarks['a'][tone - 1]) + result.slice(idx + 1);
	} else if (result.includes('e')) {
		const idx = result.indexOf('e');
		result = result.slice(0, idx) + (toneMarks['e'][tone - 1]) + result.slice(idx + 1);
	} else if (result.includes('ou')) {
		// ou: mark the o
		const idx = result.indexOf('o');
		result = result.slice(0, idx) + (toneMarks['o'][tone - 1]) + result.slice(idx + 1);
	} else {
		// Otherwise find the last vowel
		let lastVowelIdx = -1;
		let lastVowel = '';
		for (let i = 0; i < result.length; i++) {
			const c = result[i];
			if (vowels.includes(c)) {
				lastVowelIdx = i;
				lastVowel = c === 'v' ? 'ü' : c;
			}
		}
		if (lastVowelIdx >= 0 && toneMarks[lastVowel]) {
			const replacement = toneMarks[lastVowel][tone - 1];
			result = result.slice(0, lastVowelIdx) + replacement + result.slice(lastVowelIdx + 1);
		}
	}
	
	// Replace v with ü for display
	result = result.replace(/v/g, 'ü');
	
	return result;
}

/**
 * Convert numbered pinyin string to tone-marked pinyin
 * e.g., "hao3 hao3" → "hǎo hǎo"
 */
export function numberedToToneMarked(pinyin: string): string {
	if (!pinyin) return '';
	
	// Split by spaces and convert each syllable
	return pinyin
		.split(/\s+/)
		.map(convertSyllable)
		.join(' ');
}

/**
 * Split pinyin into syllables matching characters
 * e.g., "hao3 hao3" with "好好" → ["hao3", "hao3"]
 */
export function splitPinyinBySyllables(pinyin: string): string[] {
	if (!pinyin) return [];
	return pinyin.split(/\s+/).filter(s => s.length > 0);
}

/**
 * Pair characters with their pinyin syllables
 * Returns array of {char, pinyin} objects
 */
export function pairCharsWithPinyin(
	chars: string,
	pinyin: string
): Array<{ char: string; pinyin: string }> {
	const syllables = splitPinyinBySyllables(pinyin);
	const charArray = [...chars];
	
	return charArray.map((char, i) => ({
		char,
		pinyin: syllables[i] ? numberedToToneMarked(syllables[i]) : ''
	}));
}
