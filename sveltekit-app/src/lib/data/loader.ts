// Data loader for Chinese radicals app
// Singleton pattern to avoid re-fetching the 23MB JSON

export interface Radical {
	char: string;
	pinyin: string;
	meaning: string;
	characters: string[];
}

export interface Character {
	char: string;
	pinyin?: string;
	definition?: string;
	radical?: string;
	strokes?: number;
	gradeLevel?: number;
	charFrequency?: number;
	ids?: string;
	components?: string[];
	words?: string[];
	appearsIn?: string[];
	simplified?: string | null;
	traditional?: string | null;
}

export interface Word {
	word: string;
	pinyin?: string;
	definition?: string;
	frequency?: number;          // Frequency rank from JSON
	gradeLevel?: number;         // HSK 1-6
	gradeLevelDerived?: boolean; // true if inferred from characters
}

interface RadicalsData {
	radicals: Record<string, Radical>;
	characters: Record<string, Character>;
	words: Record<string, Word>;
}

let cachedData: RadicalsData | null = null;

export async function loadData(): Promise<RadicalsData> {
	if (cachedData) return cachedData;

	const response = await fetch('/data/radicals.json');
	if (!response.ok) {
		throw new Error(`Failed to load data: ${response.status}`);
	}

	const data: RadicalsData = await response.json();
	
	// Post-process: inherit gradeLevel and charFrequency between simplified/traditional variants
	for (const [char, charData] of Object.entries(data.characters)) {
		// If this is a simplified character with no grade, inherit from traditional
		if (charData.traditional && (!charData.gradeLevel || charData.gradeLevel === 0)) {
			const traditionalData = data.characters[charData.traditional];
			if (traditionalData?.gradeLevel && traditionalData.gradeLevel > 0) {
				charData.gradeLevel = traditionalData.gradeLevel;
			}
		}
		
		// If this is a traditional character, inherit better frequency from simplified
		if (charData.simplified) {
			const simplifiedData = data.characters[charData.simplified];
			if (simplifiedData?.charFrequency) {
				// Use the better (lower) frequency rank
				if (!charData.charFrequency || simplifiedData.charFrequency < charData.charFrequency) {
					charData.charFrequency = simplifiedData.charFrequency;
				}
			}
		}
		
		// Also check the reverse: if this is simplified, check if traditional has better freq
		if (charData.traditional) {
			const traditionalData = data.characters[charData.traditional];
			if (traditionalData?.charFrequency) {
				if (!charData.charFrequency || traditionalData.charFrequency < charData.charFrequency) {
					charData.charFrequency = traditionalData.charFrequency;
				}
			}
		}
	}
	
	cachedData = data;
	return cachedData;
}

export async function getRadical(id: string): Promise<Radical | undefined> {
	const data = await loadData();
	return data.radicals[id];
}

export async function getCharacter(char: string): Promise<Character | undefined> {
	const data = await loadData();
	return data.characters[char];
}

export async function getWord(word: string): Promise<Word | undefined> {
	const data = await loadData();
	return data.words[word];
}

export async function getAllRadicals(): Promise<Radical[]> {
	const data = await loadData();
	return Object.values(data.radicals);
}

export async function getRadicalById(id: string): Promise<Radical & { id: string } | undefined> {
	const data = await loadData();
	const radical = data.radicals[id];
	if (!radical) return undefined;
	return { ...radical, id };
}
