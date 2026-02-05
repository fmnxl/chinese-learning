import { writable } from 'svelte/store';
import type { Character } from '$lib/data/loader';

export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface ChatContext {
	char: string;
	pinyin?: string;
	definition?: string;
	radical?: number;
	strokes?: number;
	gradeLevel?: number;
	ids?: string;
	components?: string[];
	traditional?: string;
	simplified?: string;
	words?: string[];
}

export const chatOpen = writable(false);
export const chatContext = writable<ChatContext | null>(null);
export const chatMessages = writable<ChatMessage[]>([]);
export const isStreaming = writable(false);

export function openChat(char: string, charData: Character) {
	chatContext.set({
		char,
		pinyin: charData.pinyin,
		definition: charData.definition,
		radical: typeof charData.radical === 'string' ? parseInt(charData.radical) : charData.radical,
		strokes: charData.strokes,
		gradeLevel: charData.gradeLevel,
		ids: charData.ids,
		components: charData.components,
		traditional: charData.traditional || undefined,
		simplified: charData.simplified || undefined,
		words: charData.words?.slice(0, 10)
	});
	chatMessages.set([]);
	chatOpen.set(true);
}

export function closeChat() {
	chatOpen.set(false);
	isStreaming.set(false);
}

const API_KEY_STORAGE = 'openrouter_api_key';

export function getApiKey(): string | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem(API_KEY_STORAGE);
}

export function setApiKey(key: string) {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(API_KEY_STORAGE, key);
}

export function buildContextMessage(ctx: ChatContext): string {
	return `Character: ${ctx.char}
Pinyin: ${ctx.pinyin || 'Unknown'}
Definition: ${ctx.definition || 'Unknown'}
Radical: ${ctx.radical || 'Unknown'}
Stroke count: ${ctx.strokes || 'Unknown'}
Grade level: ${ctx.gradeLevel || 'Unknown'}
IDS decomposition: ${ctx.ids || 'None'}
Components: ${(ctx.components || []).join(', ') || 'None'}
Traditional form: ${ctx.traditional || 'Same'}
Simplified form: ${ctx.simplified || 'Same'}
Example words: ${(ctx.words || []).slice(0, 5).join(', ') || 'None'}`;
}

export const SYSTEM_PROMPT = `You are a Chinese language tutor specializing in character etymology and composition.

Given character data, provide helpful explanations about:
- Etymology and historical evolution of the character
- The meaning and role of each component (semantic vs phonetic)
- Mnemonics to help remember the character
- Example words and usage contexts
- Cultural context when relevant

Use simple language suitable for learners. Include pinyin for any Chinese characters you mention.
Be concise but thorough. Use markdown formatting for clarity.`;

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const MODEL = 'google/gemini-2.0-flash-001';
