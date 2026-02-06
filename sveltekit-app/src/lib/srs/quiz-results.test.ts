import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { studyList, isInStudyList } from '$lib/stores/studyList';
import { quizSession, quizConfig, sessionStats } from './quiz';

describe('Quiz Results Review', () => {
	beforeEach(() => {
		quizSession.reset();
		studyList.clearAll();
	});

	describe('QuizResult data structure', () => {
		it('should track wasCorrect for each result', () => {
			quizSession.startWithItems(['一', '二'], { ...get(quizConfig), deckSize: 2 });

			quizSession.submitWithQuality(5, true);
			quizSession.submitWithQuality(0, false);

			const session = get(quizSession);
			expect(session.results[0].wasCorrect).toBe(true);
			expect(session.results[1].wasCorrect).toBe(false);
		});

		it('should include item type and id in each result', () => {
			quizSession.startWithItems(['一'], get(quizConfig));
			quizSession.submitWithQuality(4, true);

			const session = get(quizSession);
			const result = session.results[0];

			expect(result.item).toBeDefined();
			expect(result.item.type).toBe('character');
			expect(result.item.id).toBe('一');
		});

		it('should store rating for each result', () => {
			quizSession.startWithItems(['一'], get(quizConfig));
			quizSession.submitWithQuality(4, true);

			const session = get(quizSession);
			expect(session.results[0].rating).toBeDefined();
		});
	});

	describe('sessionStats accuracy', () => {
		it('should calculate correct/incorrect counts accurately', () => {
			quizSession.startWithItems(['一', '二', '三', '四'], { ...get(quizConfig), deckSize: 4 });

			quizSession.submitWithQuality(5, true); // correct
			quizSession.submitWithQuality(4, true); // correct
			quizSession.submitWithQuality(0, false); // incorrect
			quizSession.submitWithQuality(2, false); // incorrect

			const stats = get(sessionStats);
			expect(stats.correct).toBe(2);
			expect(stats.incorrect).toBe(2);
			expect(stats.totalReviewed).toBe(4);
		});

		it('should handle empty results array', () => {
			quizSession.startWithItems([], get(quizConfig));

			const stats = get(sessionStats);
			expect(stats.totalReviewed).toBe(0);
			expect(stats.correct).toBe(0);
			expect(stats.incorrect).toBe(0);
		});

		it('should update stats after each submission', () => {
			quizSession.startWithItems(['一', '二'], { ...get(quizConfig), deckSize: 2 });

			quizSession.submitWithQuality(4, true);
			let stats = get(sessionStats);
			expect(stats.totalReviewed).toBe(1);
			expect(stats.correct).toBe(1);

			quizSession.submitWithQuality(0, false);
			stats = get(sessionStats);
			expect(stats.totalReviewed).toBe(2);
			expect(stats.incorrect).toBe(1);
		});
	});
});

describe('Study List Integration', () => {
	beforeEach(() => {
		studyList.clearAll();
	});

	it('should add character to study list via addItem', () => {
		studyList.addItem('character', '一');

		const list = get(studyList);
		expect(list.items.length).toBe(1);
		expect(list.items[0].id).toBe('一');
		expect(list.items[0].type).toBe('character');
	});

	it('should not duplicate items already in study list', () => {
		studyList.addItem('character', '一');
		studyList.addItem('character', '一');

		const list = get(studyList);
		expect(list.items.length).toBe(1);
	});

	it('should detect existing items via isInStudyList', () => {
		const checkFn = get(isInStudyList);
		expect(checkFn('character', '一')).toBe(false);

		studyList.addItem('character', '一');

		const checkFnAfter = get(isInStudyList);
		expect(checkFnAfter('character', '一')).toBe(true);
	});

	it('should handle both characters and words', () => {
		studyList.addItem('character', '一');
		studyList.addItem('word', '你好');

		const list = get(studyList);
		expect(list.items.length).toBe(2);

		const checkFn = get(isInStudyList);
		expect(checkFn('character', '一')).toBe(true);
		expect(checkFn('word', '你好')).toBe(true);
		expect(checkFn('character', '你好')).toBe(false);
	});
});
