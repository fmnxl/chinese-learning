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
	rank?: number;
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

	cachedData = await response.json();
	return cachedData!;
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
