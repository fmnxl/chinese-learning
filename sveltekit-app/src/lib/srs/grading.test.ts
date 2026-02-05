import { describe, it, expect } from 'vitest';
import {
	toneMarkersToNumbers,
	normalizePinyin,
	stripTones,
	calculatePinyinSimilarity,
	calculateBaseReadingTime,
	calculateTimeScore,
	mapQualityToSM2,
	gradeAnswer
} from './grading';

describe('toneMarkersToNumbers', () => {
	it('should convert ā → a1, á → a2, ǎ → a3, à → a4', () => {
		expect(toneMarkersToNumbers('ā')).toBe('a1');
		expect(toneMarkersToNumbers('á')).toBe('a2');
		expect(toneMarkersToNumbers('ǎ')).toBe('a3');
		expect(toneMarkersToNumbers('à')).toBe('a4');
	});

	it('should convert all vowels (a, e, i, o, u, ü)', () => {
		expect(toneMarkersToNumbers('ē')).toBe('e1');
		expect(toneMarkersToNumbers('í')).toBe('i2');
		expect(toneMarkersToNumbers('ǒ')).toBe('o3');
		expect(toneMarkersToNumbers('ù')).toBe('u4');
		expect(toneMarkersToNumbers('ǖ')).toBe('v1');
	});

	it('should handle ü → v conversion', () => {
		expect(toneMarkersToNumbers('lǜ')).toBe('lv4');
		expect(toneMarkersToNumbers('nǚ')).toBe('nv3');
	});

	it('should preserve already-numbered pinyin', () => {
		expect(toneMarkersToNumbers('zhong1')).toBe('zhong1');
		expect(toneMarkersToNumbers('guo2')).toBe('guo2');
	});

	it('should handle neutral tone (no marker)', () => {
		expect(toneMarkersToNumbers('ma')).toBe('ma');
		expect(toneMarkersToNumbers('de')).toBe('de');
	});

	it('should handle full words with multiple syllables', () => {
		expect(toneMarkersToNumbers('zhōngguó')).toBe('zhong1guo2');
		expect(toneMarkersToNumbers('nǐ hǎo')).toBe('ni3 hao3');
	});
});

describe('normalizePinyin', () => {
	it('should normalize tone markers and remove spaces', () => {
		expect(normalizePinyin('zhōng guó')).toBe('zhong1guo2');
		expect(normalizePinyin('Nǐ Hǎo')).toBe('ni3hao3');
	});

	it('should handle already normalized pinyin', () => {
		expect(normalizePinyin('zhong1guo2')).toBe('zhong1guo2');
	});
});

describe('stripTones', () => {
	it('should remove tone numbers', () => {
		expect(stripTones('zhong1guo2')).toBe('zhongguo');
		expect(stripTones('zhōngguó')).toBe('zhongguo');
	});
});

describe('calculatePinyinSimilarity', () => {
	it('should return 1.0 for identical pinyin', () => {
		expect(calculatePinyinSimilarity('zhōng', 'zhōng')).toBe(1.0);
		expect(calculatePinyinSimilarity('zhong1', 'zhong1')).toBe(1.0);
	});

	it('should return 1.0 for numbered vs marked tones', () => {
		expect(calculatePinyinSimilarity('zhōng', 'zhong1')).toBe(1.0);
		expect(calculatePinyinSimilarity('guó', 'guo2')).toBe(1.0);
	});

	it('should return 0.6 for correct syllables, wrong tone', () => {
		expect(calculatePinyinSimilarity('shì', 'shi1')).toBe(0.6);
		expect(calculatePinyinSimilarity('shi4', 'shi1')).toBe(0.6);
	});

	it('should return 0.6 for missing tone (partial match)', () => {
		expect(calculatePinyinSimilarity('shì', 'shi')).toBe(0.6);
		expect(calculatePinyinSimilarity('zhōng', 'zhong')).toBe(0.6);
	});

	it('should handle multi-syllable words', () => {
		expect(calculatePinyinSimilarity('zhōngguó', 'zhong1guo2')).toBe(1.0);
		expect(calculatePinyinSimilarity('zhōngguó', 'zhongguo')).toBe(0.6);
	});

	it('should return 0 for completely wrong answer', () => {
		expect(calculatePinyinSimilarity('zhōng', 'ma')).toBe(0);
		expect(calculatePinyinSimilarity('hǎo', 'bad')).toBe(0);
	});

	it('should be case-insensitive', () => {
		expect(calculatePinyinSimilarity('Zhōng', 'zhong1')).toBe(1.0);
		expect(calculatePinyinSimilarity('ZHONG1', 'zhōng')).toBe(1.0);
	});

	it('should ignore spaces', () => {
		expect(calculatePinyinSimilarity('nǐ hǎo', 'ni3hao3')).toBe(1.0);
	});
});

describe('calculateBaseReadingTime', () => {
	it('should return 2300ms for single character (2s + 0.3s)', () => {
		expect(calculateBaseReadingTime(1)).toBe(2300);
	});

	it('should scale with character count', () => {
		expect(calculateBaseReadingTime(5)).toBe(3500); // 2000 + 5*300
		expect(calculateBaseReadingTime(10)).toBe(5000); // 2000 + 10*300
	});

	it('should return 2000ms for empty string', () => {
		expect(calculateBaseReadingTime(0)).toBe(2000);
	});
});

describe('calculateTimeScore', () => {
	it('should return 1.0 for answer within 1.5x base time', () => {
		expect(calculateTimeScore(2000, 2000)).toBe(1.0); // Exact
		expect(calculateTimeScore(3000, 2000)).toBe(1.0); // 1.5x
	});

	it('should return 0.7 for answer within 3x base time', () => {
		expect(calculateTimeScore(4000, 2000)).toBe(0.7); // 2x
		expect(calculateTimeScore(6000, 2000)).toBe(0.7); // 3x
	});

	it('should return 0.4 for answer within 5x base time', () => {
		expect(calculateTimeScore(8000, 2000)).toBe(0.4); // 4x
		expect(calculateTimeScore(10000, 2000)).toBe(0.4); // 5x
	});

	it('should return 0.2 for very slow answers', () => {
		expect(calculateTimeScore(15000, 2000)).toBe(0.2); // 7.5x
		expect(calculateTimeScore(30000, 2000)).toBe(0.2); // 15x
	});
});

describe('mapQualityToSM2', () => {
	it('should map 0.9-1.0 quality to SM-2 quality 5 (Easy)', () => {
		expect(mapQualityToSM2(1.0)).toBe(5);
		expect(mapQualityToSM2(0.95)).toBe(5);
		expect(mapQualityToSM2(0.9)).toBe(5);
	});

	it('should map 0.7-0.9 quality to SM-2 quality 4 (Good)', () => {
		expect(mapQualityToSM2(0.89)).toBe(4);
		expect(mapQualityToSM2(0.7)).toBe(4);
	});

	it('should map 0.5-0.7 quality to SM-2 quality 3 (Hard)', () => {
		expect(mapQualityToSM2(0.69)).toBe(3);
		expect(mapQualityToSM2(0.5)).toBe(3);
	});

	it('should map 0.3-0.5 quality to SM-2 quality 2', () => {
		expect(mapQualityToSM2(0.49)).toBe(2);
		expect(mapQualityToSM2(0.3)).toBe(2);
	});

	it('should map 0.1-0.3 quality to SM-2 quality 1', () => {
		expect(mapQualityToSM2(0.29)).toBe(1);
		expect(mapQualityToSM2(0.1)).toBe(1);
	});

	it('should map 0-0.1 quality to SM-2 quality 0 (Again)', () => {
		expect(mapQualityToSM2(0.09)).toBe(0);
		expect(mapQualityToSM2(0)).toBe(0);
	});
});

describe('gradeAnswer', () => {
	it('should return exact match for correct pinyin with tone', async () => {
		const result = await gradeAnswer({
			answerMode: 'typing',
			questionType: 'recognition',
			correctAnswer: 'shì',
			userAnswer: 'shi4',
			responseTimeMs: 3000,
			questionCharCount: 1
		});

		expect(result.correctness).toBe('exact');
		expect(result.correctnessScore).toBe(1.0);
	});

	it('should return partial match for correct pinyin without tone', async () => {
		const result = await gradeAnswer({
			answerMode: 'typing',
			questionType: 'recognition',
			correctAnswer: 'shì',
			userAnswer: 'shi',
			responseTimeMs: 3000,
			questionCharCount: 1
		});

		expect(result.correctness).toBe('partial');
		expect(result.correctnessScore).toBe(0.6);
	});

	it('should return wrong for completely incorrect answer', async () => {
		const result = await gradeAnswer({
			answerMode: 'typing',
			questionType: 'recognition',
			correctAnswer: 'shì',
			userAnswer: 'ma',
			responseTimeMs: 3000,
			questionCharCount: 1
		});

		expect(result.correctness).toBe('wrong');
		expect(result.correctnessScore).toBe(0);
	});

	it('should return skipped for null userAnswer', async () => {
		const result = await gradeAnswer({
			answerMode: 'multiple_choice',
			questionType: 'recognition',
			correctAnswer: 'shì',
			userAnswer: null,
			responseTimeMs: 5000,
			questionCharCount: 1
		});

		expect(result.correctness).toBe('skipped');
		expect(result.sm2Quality).toBe(0);
	});

	it('should apply guess penalty for suspiciously fast MCQ answers', async () => {
		const fastResult = await gradeAnswer({
			answerMode: 'multiple_choice',
			questionType: 'recognition',
			correctAnswer: 'shì',
			userAnswer: 'shi4',
			responseTimeMs: 1000, // Very fast
			questionCharCount: 1
		});

		const normalResult = await gradeAnswer({
			answerMode: 'multiple_choice',
			questionType: 'recognition',
			correctAnswer: 'shì',
			userAnswer: 'shi4',
			responseTimeMs: 3000, // Normal speed
			questionCharCount: 1
		});

		// Fast answer should have lower score due to guess penalty
		expect(fastResult.correctnessScore).toBeLessThan(normalResult.correctnessScore);
	});

	it('should calculate combined quality score correctly', async () => {
		const result = await gradeAnswer({
			answerMode: 'typing',
			questionType: 'recognition',
			correctAnswer: 'shì',
			userAnswer: 'shi4',
			responseTimeMs: 2300, // Just at base time
			questionCharCount: 1
		});

		// Exact (1.0) * 0.6 + Fast (1.0) * 0.4 = 1.0
		expect(result.qualityScore).toBe(1.0);
		expect(result.sm2Quality).toBe(5);
	});
});
