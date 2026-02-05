/**
 * Automatic SRS Grading System
 *
 * Grades quiz answers based on:
 * - Correctness (exact, partial, wrong, skipped)
 * - Response time (fast = confident, slow = uncertain)
 * - LLM semantic similarity (for near-misses)
 */

// Tone marker to number conversion map
const TONE_MARKERS: Record<string, { base: string; tone: number }> = {
	ā: { base: 'a', tone: 1 },
	á: { base: 'a', tone: 2 },
	ǎ: { base: 'a', tone: 3 },
	à: { base: 'a', tone: 4 },
	ē: { base: 'e', tone: 1 },
	é: { base: 'e', tone: 2 },
	ě: { base: 'e', tone: 3 },
	è: { base: 'e', tone: 4 },
	ī: { base: 'i', tone: 1 },
	í: { base: 'i', tone: 2 },
	ǐ: { base: 'i', tone: 3 },
	ì: { base: 'i', tone: 4 },
	ō: { base: 'o', tone: 1 },
	ó: { base: 'o', tone: 2 },
	ǒ: { base: 'o', tone: 3 },
	ò: { base: 'o', tone: 4 },
	ū: { base: 'u', tone: 1 },
	ú: { base: 'u', tone: 2 },
	ǔ: { base: 'u', tone: 3 },
	ù: { base: 'u', tone: 4 },
	ǖ: { base: 'v', tone: 1 },
	ǘ: { base: 'v', tone: 2 },
	ǚ: { base: 'v', tone: 3 },
	ǜ: { base: 'v', tone: 4 },
	ü: { base: 'v', tone: 0 }
};

export interface AnswerParams {
	answerMode: 'multiple_choice' | 'typing';
	questionType: 'recognition' | 'recall';
	correctAnswer: string;
	userAnswer: string | null; // null = "I don't know"
	responseTimeMs: number;
	questionCharCount: number;
	correctDefinition?: string; // For LLM similarity check
}

export interface GradingResult {
	correctness: 'exact' | 'partial' | 'wrong' | 'skipped';
	correctnessScore: number; // 0-1
	timeScore: number; // 0-1
	qualityScore: number; // 0-1 combined score
	sm2Quality: 0 | 1 | 2 | 3 | 4 | 5;
	details: {
		baseTimeMs: number;
		actualTimeMs: number;
		pinyinSimilarity?: number;
		meaningSimilarity?: number;
	};
}

/**
 * Convert pinyin with tone markers to numbered format
 * e.g., "zhōng" → "zhong1", "guó" → "guo2", "zhōngguó" → "zhong1guo2"
 *
 * The challenge is detecting syllable boundaries in concatenated pinyin.
 * We insert the tone number when we encounter letters that can ONLY start
 * a new syllable (like 'g' after 'ng' is ambiguous, but 'g' after a vowel
 * followed by nothing or after completed finals like 'ng' is clear).
 */
export function toneMarkersToNumbers(pinyin: string): string {
	// True initial consonants that can start a syllable and NEVER end one
	const TRUE_INITIALS = new Set([
		'b',
		'p',
		'm',
		'f',
		'd',
		't',
		'l',
		'j',
		'q',
		'x',
		'z',
		'c',
		's',
		'r',
		'y',
		'w',
		'k',
		'h'
	]);

	let result = '';
	let currentTone = 0;
	const chars = [...pinyin];

	for (let i = 0; i < chars.length; i++) {
		const origChar = chars[i];
		const char = origChar.toLowerCase();
		const mapping = TONE_MARKERS[origChar];
		const nextChar = i + 1 < chars.length ? chars[i + 1].toLowerCase() : '';

		if (mapping) {
			// Tone-marked vowel
			result += mapping.base;
			if (mapping.tone > 0) {
				currentTone = mapping.tone;
			}
		} else if (char >= '1' && char <= '4') {
			// Already has tone number
			result += char;
			currentTone = 0;
		} else if (char === ' ' || char === "'") {
			// Explicit syllable separator
			if (currentTone > 0) {
				result += currentTone.toString();
				currentTone = 0;
			}
			result += char;
		} else if (char === 'g' && result.endsWith('n') && currentTone > 0) {
			// 'g' after 'n' with pending tone = part of -ng final, don't insert tone yet
			result += char;
		} else if (TRUE_INITIALS.has(char) && currentTone > 0) {
			// Unambiguous syllable starter with pending tone
			result += currentTone.toString();
			currentTone = 0;
			result += char;
		} else if (char === 'g' && currentTone > 0 && !result.endsWith('n')) {
			// 'g' not after 'n' = new syllable (like in guo after zhong)
			result += currentTone.toString();
			currentTone = 0;
			result += char;
		} else if (char === 'n' && currentTone > 0 && nextChar !== 'g' && TRUE_INITIALS.has(nextChar)) {
			// 'n' followed by a true initial = end of -n final, insert tone after 'n'
			result += char;
			result += currentTone.toString();
			currentTone = 0;
		} else {
			result += char;
		}
	}

	// Append final tone if any
	if (currentTone > 0) {
		result += currentTone.toString();
	}

	return result;
}

/**
 * Normalize pinyin for comparison
 * - Convert tone markers to numbers
 * - Lowercase
 * - Remove spaces
 */
export function normalizePinyin(pinyin: string): string {
	return toneMarkersToNumbers(pinyin).replace(/\s+/g, '').toLowerCase();
}

/**
 * Strip tones from pinyin (for partial matching)
 */
export function stripTones(pinyin: string): string {
	return normalizePinyin(pinyin).replace(/[1-4]/g, '');
}

/**
 * Calculate similarity between correct and user pinyin
 * Returns: 1.0 (exact), 0.6-0.8 (partial - wrong/missing tone), 0 (wrong)
 */
export function calculatePinyinSimilarity(correct: string, user: string): number {
	const normalizedCorrect = normalizePinyin(correct);
	const normalizedUser = normalizePinyin(user);

	// Exact match
	if (normalizedCorrect === normalizedUser) {
		return 1.0;
	}

	// Strip tones and compare
	const correctNoTone = stripTones(correct);
	const userNoTone = stripTones(user);

	// Correct syllables, wrong or missing tones
	if (correctNoTone === userNoTone) {
		// Check if user provided any tones
		const userHasTones = /[1-4]/.test(normalizedUser);
		if (userHasTones) {
			// Wrong tone = 0.6
			return 0.6;
		} else {
			// Missing tone = 0.6 (partial match)
			return 0.6;
		}
	}

	// Completely wrong
	return 0.0;
}

/**
 * Calculate base reading time for a question
 * Formula: 2s + (0.3s × character_count)
 */
export function calculateBaseReadingTime(charCount: number): number {
	return 2000 + charCount * 300; // in ms
}

/**
 * Calculate time score based on response time vs base time
 */
export function calculateTimeScore(responseTimeMs: number, baseTimeMs: number): number {
	const ratio = responseTimeMs / baseTimeMs;

	if (ratio <= 1.5) return 1.0; // Fast/confident
	if (ratio <= 3.0) return 0.7; // Normal
	if (ratio <= 5.0) return 0.4; // Slow
	return 0.2; // Very slow
}

/**
 * Map quality score (0-1) to SM-2 quality (0-5)
 */
export function mapQualityToSM2(quality: number): 0 | 1 | 2 | 3 | 4 | 5 {
	if (quality >= 0.9) return 5;
	if (quality >= 0.7) return 4;
	if (quality >= 0.5) return 3;
	if (quality >= 0.3) return 2;
	if (quality >= 0.1) return 1;
	return 0;
}

/**
 * Main grading function
 */
export async function gradeAnswer(params: AnswerParams): Promise<GradingResult> {
	const { correctAnswer, userAnswer, responseTimeMs, questionCharCount, answerMode } = params;

	const baseTimeMs = calculateBaseReadingTime(questionCharCount);

	// Handle "I don't know" (null answer)
	if (userAnswer === null) {
		return {
			correctness: 'skipped',
			correctnessScore: 0,
			timeScore: 0.5, // Neutral time score for skips
			qualityScore: 0,
			sm2Quality: 0,
			details: { baseTimeMs, actualTimeMs: responseTimeMs }
		};
	}

	// Calculate pinyin similarity
	const pinyinSimilarity = calculatePinyinSimilarity(correctAnswer, userAnswer);

	// Determine correctness
	let correctness: GradingResult['correctness'];
	let correctnessScore: number;
	let meaningSimilarity: number | undefined;

	if (pinyinSimilarity >= 1.0) {
		correctness = 'exact';
		correctnessScore = 1.0;
	} else if (pinyinSimilarity >= 0.5) {
		correctness = 'partial';
		correctnessScore = 0.6;
	} else {
		// Pinyin doesn't match - try LLM meaning check for typing mode
		if (answerMode === 'typing' && params.correctDefinition) {
			meaningSimilarity = await assessMeaningSimilarity(params.correctDefinition, userAnswer);
			
			if (meaningSimilarity >= 0.8) {
				// User typed the meaning instead of pinyin - accept as partial
				correctness = 'partial';
				correctnessScore = 0.7; // Slightly higher than pinyin partial
			} else if (meaningSimilarity >= 0.5) {
				// Related meaning
				correctness = 'partial';
				correctnessScore = 0.4;
			} else {
				correctness = 'wrong';
				correctnessScore = 0;
			}
		} else {
			correctness = 'wrong';
			correctnessScore = 0;
		}
	}

	// Calculate time score
	let timeScore = calculateTimeScore(responseTimeMs, baseTimeMs);

	// Multiple choice adjustment: suspiciously fast correct answers
	if (answerMode === 'multiple_choice' && correctness === 'exact' && responseTimeMs < 2000) {
		// Might be lucky guess - reduce score
		correctnessScore *= 0.7;
	}

	// Calculate combined quality score
	// Weights: Correctness 60%, Time 40%
	const qualityScore = correctnessScore * 0.6 + timeScore * 0.4;

	return {
		correctness,
		correctnessScore,
		timeScore,
		qualityScore,
		sm2Quality: mapQualityToSM2(qualityScore),
		details: {
			baseTimeMs,
			actualTimeMs: responseTimeMs,
			pinyinSimilarity,
			meaningSimilarity
		}
	};
}

/**
 * LLM semantic similarity using OpenRouter API
 * Returns a similarity score 0-1 for how close the user's answer is to the correct definition
 */
export async function assessMeaningSimilarity(
	correctDef: string,
	userAnswer: string
): Promise<number> {
	// Check if we have an API key
	if (typeof localStorage === 'undefined') return 0;
	const apiKey = localStorage.getItem('openrouter_api_key');
	if (!apiKey) return 0;

	// Skip for very short answers (likely just initials or typos)
	if (userAnswer.trim().length < 2) return 0;

	try {
		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: 'google/gemini-2.0-flash-001',
				messages: [
					{
						role: 'system',
						content: `You are a semantic similarity judge for Chinese vocabulary learning.
Compare meanings and return a similarity score from 0.0 to 1.0.
Output ONLY a JSON object with a "score" field, nothing else.

Scoring guide:
- 1.0: Exact or nearly exact meaning match
- 0.8: Very close meaning (synonym, minor nuance difference)
- 0.6: Related meaning (same concept family)
- 0.3: Loosely related (tangential connection)
- 0.0: Completely different or wrong meaning`
					},
					{
						role: 'user',
						content: `Correct definition: "${correctDef}"
User's answer: "${userAnswer}"

Return only: {"score": X.X}`
					}
				],
				max_tokens: 20,
				temperature: 0.1
			})
		});

		if (!response.ok) {
			console.warn('LLM similarity API error:', response.status);
			return 0;
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content || '';

		// Parse the score from the response
		const match = content.match(/"score"\s*:\s*([\d.]+)/);
		if (match) {
			const score = parseFloat(match[1]);
			return isNaN(score) ? 0 : Math.min(1, Math.max(0, score));
		}

		return 0;
	} catch (error) {
		console.warn('LLM similarity check failed:', error);
		return 0;
	}
}
