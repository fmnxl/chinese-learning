import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	quizConfig,
	quizSession,
	currentCard,
	sessionProgress,
	sessionStats,
	type QuizConfig
} from './quiz';

describe('Quiz System', () => {
	describe('quizConfig store', () => {
		beforeEach(() => {
			quizConfig.reset();
		});

		it('should have default configuration', () => {
			const config = get(quizConfig);

			expect(config.mode).toBe('recognition');
			expect(config.answerMode).toBe('self_rate');
			expect(config.deckSize).toBe(10);
			expect(config.includeNew).toBe(true);
			expect(config.newCardsLimit).toBe(5);
			expect(config.source.type).toBe('study_list');
			expect(config.scriptFilter).toBe('simplified');
		});

		it('should update mode', () => {
			quizConfig.setMode('recall');
			expect(get(quizConfig).mode).toBe('recall');

			quizConfig.setMode('typing');
			expect(get(quizConfig).mode).toBe('typing');
		});

		it('should update deck size', () => {
			quizConfig.setDeckSize(20);
			expect(get(quizConfig).deckSize).toBe(20);
		});

		it('should update includeNew', () => {
			quizConfig.setIncludeNew(false);
			expect(get(quizConfig).includeNew).toBe(false);
		});

		it('should update answer mode', () => {
			quizConfig.setAnswerMode('multiple_choice');
			expect(get(quizConfig).answerMode).toBe('multiple_choice');
		});

		it('should update script filter', () => {
			quizConfig.setScriptFilter('traditional');
			expect(get(quizConfig).scriptFilter).toBe('traditional');

			quizConfig.setScriptFilter('both');
			expect(get(quizConfig).scriptFilter).toBe('both');
		});

		it('should update source', () => {
			quizConfig.setSource({ type: 'grade', gradeMin: 1, gradeMax: 2 });
			const config = get(quizConfig);

			expect(config.source.type).toBe('grade');
			expect(config.source.gradeMin).toBe(1);
			expect(config.source.gradeMax).toBe(2);
		});

		it('should reset to defaults', () => {
			quizConfig.setMode('typing');
			quizConfig.setDeckSize(50);
			quizConfig.setIncludeNew(false);

			quizConfig.reset();

			const config = get(quizConfig);
			expect(config.mode).toBe('recognition');
			expect(config.deckSize).toBe(10);
			expect(config.includeNew).toBe(true);
		});
	});

	describe('quizSession store', () => {
		beforeEach(() => {
			quizSession.reset();
		});

		it('should have empty initial state', () => {
			const session = get(quizSession);

			expect(session.cards).toEqual([]);
			expect(session.currentIndex).toBe(0);
			expect(session.isRevealed).toBe(false);
			expect(session.isComplete).toBe(false);
			expect(session.startTime).toBe(0);
			expect(session.results).toEqual([]);
		});

		it('should mark session as complete when starting with empty items', () => {
			quizSession.startWithItems([], get(quizConfig));
			const session = get(quizSession);

			expect(session.isComplete).toBe(true);
			expect(session.cards).toEqual([]);
		});

		it('should start session with provided characters', () => {
			const characters = ['一', '二', '三'];
			quizSession.startWithItems(characters, { ...get(quizConfig), deckSize: 3 });

			const session = get(quizSession);

			expect(session.cards.length).toBe(3);
			expect(session.isComplete).toBe(false);
			expect(session.startTime).toBeGreaterThan(0);
		});

		it('should respect deck size when starting with items', () => {
			const characters = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
			quizSession.startWithItems(characters, { ...get(quizConfig), deckSize: 5 });

			const session = get(quizSession);
			expect(session.cards.length).toBe(5);
		});

		it('should set cards as new when starting with items', () => {
			const characters = ['一', '二'];
			quizSession.startWithItems(characters, { ...get(quizConfig), deckSize: 2 });

			const session = get(quizSession);
			for (const card of session.cards) {
				expect(card.isNew).toBe(true);
			}
		});

		it('should reveal current card', () => {
			quizSession.startWithItems(['一'], get(quizConfig));

			expect(get(quizSession).isRevealed).toBe(false);

			quizSession.reveal();

			expect(get(quizSession).isRevealed).toBe(true);
		});

		it('should reset session', () => {
			quizSession.startWithItems(['一', '二'], get(quizConfig));
			quizSession.reveal();

			quizSession.reset();

			const session = get(quizSession);
			expect(session.cards).toEqual([]);
			expect(session.isRevealed).toBe(false);
		});
	});

	describe('derived stores', () => {
		beforeEach(() => {
			quizSession.reset();
		});

		it('currentCard should return null for empty session', () => {
			expect(get(currentCard)).toBeNull();
		});

		it('currentCard should return first card after starting', () => {
			quizSession.startWithItems(['一'], get(quizConfig));
			const card = get(currentCard);

			expect(card).not.toBeNull();
			expect(card?.item.id).toBe('一');
		});

		it('sessionProgress should show 0% for new session', () => {
			quizSession.startWithItems(['一', '二'], get(quizConfig));
			const progress = get(sessionProgress);

			expect(progress.current).toBe(0);
			expect(progress.total).toBe(2);
			expect(progress.percentage).toBe(0);
		});

		it('sessionProgress should handle empty session', () => {
			const progress = get(sessionProgress);

			expect(progress.current).toBe(0);
			expect(progress.total).toBe(0);
			expect(progress.percentage).toBe(0);
		});

		it('sessionStats should start with zeros', () => {
			const stats = get(sessionStats);

			expect(stats.totalReviewed).toBe(0);
			expect(stats.correct).toBe(0);
			expect(stats.incorrect).toBe(0);
			expect(stats.averageTime).toBe(0);
			expect(stats.newLearned).toBe(0);
		});
	});

	describe('quiz results tracking', () => {
		beforeEach(() => {
			quizSession.reset();
		});

		it('should record result after submitWithQuality', () => {
			quizSession.startWithItems(['一'], get(quizConfig));

			quizSession.submitWithQuality(4, true);

			const session = get(quizSession);
			expect(session.results.length).toBe(1);
			expect(session.results[0].item.id).toBe('一');
		});

		it('should record wasCorrect=true for quality >= 3', () => {
			quizSession.startWithItems(['一', '二'], { ...get(quizConfig), deckSize: 2 });

			quizSession.submitWithQuality(4, true);
			quizSession.submitWithQuality(5, true);

			const session = get(quizSession);
			expect(session.results[0].wasCorrect).toBe(true);
			expect(session.results[1].wasCorrect).toBe(true);
		});

		it('should record wasCorrect=false for quality < 3', () => {
			quizSession.startWithItems(['一', '二'], { ...get(quizConfig), deckSize: 2 });

			quizSession.submitWithQuality(0, false);
			quizSession.submitWithQuality(2, false);

			const session = get(quizSession);
			expect(session.results[0].wasCorrect).toBe(false);
			expect(session.results[1].wasCorrect).toBe(false);
		});

		it('should preserve item type and id in results', () => {
			quizSession.startWithItems(['一'], get(quizConfig));

			quizSession.submitWithQuality(4, true);

			const session = get(quizSession);
			expect(session.results[0].item.type).toBe('character');
			expect(session.results[0].item.id).toBe('一');
		});

		it('should accumulate results across session', () => {
			quizSession.startWithItems(['一', '二', '三'], { ...get(quizConfig), deckSize: 3 });

			quizSession.submitWithQuality(4, true);
			quizSession.submitWithQuality(0, false);
			quizSession.submitWithQuality(5, true);

			const session = get(quizSession);
			expect(session.results.length).toBe(3);
			expect(session.isComplete).toBe(true);
		});

		it('should update sessionStats after submissions', () => {
			quizSession.startWithItems(['一', '二', '三'], { ...get(quizConfig), deckSize: 3 });

			quizSession.submitWithQuality(4, true);
			quizSession.submitWithQuality(0, false);
			quizSession.submitWithQuality(5, true);

			const stats = get(sessionStats);
			expect(stats.totalReviewed).toBe(3);
			expect(stats.correct).toBe(2);
			expect(stats.incorrect).toBe(1);
		});
	});
});
