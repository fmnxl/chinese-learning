import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	calculateSM2,
	calculateSM2Simple,
	getDefaultSM2,
	isDueForReview,
	getOverdueHours,
	formatInterval,
	getLearningStage,
	getStageColor,
	SIMPLE_RATINGS
} from './sm2';

describe('SM-2 Algorithm', () => {
	describe('calculateSM2', () => {
		it('should reset repetitions and interval on failed review (quality < 3)', () => {
			const result = calculateSM2({
				quality: 2,
				repetitions: 5,
				easeFactor: 2.5,
				interval: 30
			});

			expect(result.repetitions).toBe(0);
			expect(result.interval).toBe(1);
		});

		it('should set interval to 1 day on first successful review', () => {
			const result = calculateSM2({
				quality: 4,
				repetitions: 0,
				easeFactor: 2.5,
				interval: 0
			});

			expect(result.repetitions).toBe(1);
			expect(result.interval).toBe(1);
		});

		it('should set interval to 6 days on second successful review', () => {
			const result = calculateSM2({
				quality: 4,
				repetitions: 1,
				easeFactor: 2.5,
				interval: 1
			});

			expect(result.repetitions).toBe(2);
			expect(result.interval).toBe(6);
		});

		it('should multiply interval by ease factor on subsequent reviews', () => {
			const result = calculateSM2({
				quality: 4,
				repetitions: 2,
				easeFactor: 2.5,
				interval: 6
			});

			expect(result.repetitions).toBe(3);
			expect(result.interval).toBe(15); // 6 * 2.5 = 15
		});

		it('should decrease ease factor on difficult reviews', () => {
			const result = calculateSM2({
				quality: 3,
				repetitions: 3,
				easeFactor: 2.5,
				interval: 15
			});

			expect(result.easeFactor).toBeLessThan(2.5);
		});

		it('should increase ease factor on easy reviews', () => {
			const result = calculateSM2({
				quality: 5,
				repetitions: 3,
				easeFactor: 2.5,
				interval: 15
			});

			expect(result.easeFactor).toBeGreaterThan(2.5);
		});

		it('should never let ease factor drop below 1.3', () => {
			const result = calculateSM2({
				quality: 0,
				repetitions: 3,
				easeFactor: 1.3,
				interval: 15
			});

			expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
		});

		it('should clamp quality to 0-5 range', () => {
			const resultLow = calculateSM2({
				quality: -1,
				repetitions: 0,
				easeFactor: 2.5,
				interval: 0
			});
			const resultHigh = calculateSM2({
				quality: 10,
				repetitions: 0,
				easeFactor: 2.5,
				interval: 0
			});

			// Both should produce valid results
			expect(resultLow.interval).toBeGreaterThanOrEqual(1);
			expect(resultHigh.interval).toBeGreaterThanOrEqual(1);
		});

		it('should set nextReview timestamp in the future', () => {
			const now = Date.now();
			const result = calculateSM2({
				quality: 4,
				repetitions: 0,
				easeFactor: 2.5,
				interval: 0
			});

			expect(result.nextReview).toBeGreaterThan(now);
		});
	});

	describe('calculateSM2Simple', () => {
		it('should map "again" to quality 0', () => {
			const result = calculateSM2Simple('again', 3, 2.5, 15);
			expect(result.repetitions).toBe(0); // Failed review
		});

		it('should map "hard" to quality 2', () => {
			const result = calculateSM2Simple('hard', 3, 2.5, 15);
			expect(result.repetitions).toBe(0); // Still a fail
		});

		it('should map "good" to quality 4', () => {
			const result = calculateSM2Simple('good', 3, 2.5, 15);
			expect(result.repetitions).toBe(4); // Successful
		});

		it('should map "easy" to quality 5', () => {
			const result = calculateSM2Simple('easy', 3, 2.5, 15);
			expect(result.repetitions).toBe(4);
			expect(result.easeFactor).toBeGreaterThan(2.5);
		});
	});

	describe('getDefaultSM2', () => {
		it('should return default values for new items', () => {
			const defaults = getDefaultSM2();

			expect(defaults.easeFactor).toBe(2.5);
			expect(defaults.repetitions).toBe(0);
			expect(defaults.interval).toBe(0);
		});
	});

	describe('isDueForReview', () => {
		it('should return true for undefined nextReview (new items)', () => {
			expect(isDueForReview(undefined)).toBe(true);
		});

		it('should return true for past timestamps', () => {
			const pastTime = Date.now() - 1000 * 60 * 60; // 1 hour ago
			expect(isDueForReview(pastTime)).toBe(true);
		});

		it('should return false for future timestamps', () => {
			const futureTime = Date.now() + 1000 * 60 * 60; // 1 hour from now
			expect(isDueForReview(futureTime)).toBe(false);
		});
	});

	describe('getOverdueHours', () => {
		it('should return Infinity for undefined nextReview', () => {
			expect(getOverdueHours(undefined)).toBe(Infinity);
		});

		it('should return positive value for overdue items', () => {
			const pastTime = Date.now() - 1000 * 60 * 60 * 2; // 2 hours ago
			expect(getOverdueHours(pastTime)).toBeCloseTo(2, 0);
		});

		it('should return negative value for not-yet-due items', () => {
			const futureTime = Date.now() + 1000 * 60 * 60 * 3; // 3 hours from now
			expect(getOverdueHours(futureTime)).toBeCloseTo(-3, 0);
		});
	});

	describe('formatInterval', () => {
		it('should format less than 1 day as "Today"', () => {
			expect(formatInterval(0)).toBe('Today');
			expect(formatInterval(0.5)).toBe('Today');
		});

		it('should format 1 day correctly', () => {
			expect(formatInterval(1)).toBe('1 day');
		});

		it('should format multiple days correctly', () => {
			expect(formatInterval(3)).toBe('3 days');
			expect(formatInterval(6)).toBe('6 days');
		});

		it('should format weeks correctly', () => {
			expect(formatInterval(7)).toBe('1 week');
			expect(formatInterval(14)).toBe('2 weeks');
			expect(formatInterval(21)).toBe('3 weeks');
		});

		it('should format months correctly', () => {
			expect(formatInterval(30)).toBe('1 month');
			expect(formatInterval(60)).toBe('2 months');
			expect(formatInterval(90)).toBe('3 months');
		});

		it('should format years correctly', () => {
			expect(formatInterval(365)).toBe('1 year');
			expect(formatInterval(730)).toBe('2 years');
		});
	});

	describe('getLearningStage', () => {
		it('should return "new" for 0 repetitions', () => {
			expect(getLearningStage(0)).toBe('new');
		});

		it('should return "learning" for 1-2 repetitions', () => {
			expect(getLearningStage(1)).toBe('learning');
			expect(getLearningStage(2)).toBe('learning');
		});

		it('should return "reviewing" for 3-9 repetitions', () => {
			expect(getLearningStage(3)).toBe('reviewing');
			expect(getLearningStage(9)).toBe('reviewing');
		});

		it('should return "graduated" for 10+ repetitions', () => {
			expect(getLearningStage(10)).toBe('graduated');
			expect(getLearningStage(100)).toBe('graduated');
		});
	});

	describe('getStageColor', () => {
		it('should return correct colors for each stage', () => {
			expect(getStageColor('new')).toBe('#3b82f6');
			expect(getStageColor('learning')).toBe('#f59e0b');
			expect(getStageColor('reviewing')).toBe('#22c55e');
			expect(getStageColor('graduated')).toBe('#8b5cf6');
		});
	});
});
