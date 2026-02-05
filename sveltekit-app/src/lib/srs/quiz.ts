import { writable, derived, get } from 'svelte/store';
import { studyList, type StudyItem } from '$lib/stores/studyList';
import {
	calculateSM2,
	calculateSM2Simple,
	isDueForReview,
	getOverdueHours,
	type SimpleRating
} from './sm2';

/**
 * Quiz mode types - what's shown on the question
 */
export type QuizMode = 'recognition' | 'recall' | 'typing';

/**
 * Answer mode types - how the user responds
 */
export type AnswerMode = 'self_rate' | 'multiple_choice' | 'typing';

/**
 * Quiz source types - where the characters come from
 */
export type QuizSourceType = 'study_list' | 'grade' | 'frequency';

/**
 * Character script filter
 */
export type CharacterScript = 'simplified' | 'traditional' | 'both';

export interface QuizSource {
	type: QuizSourceType;
	// For grade source
	gradeMin?: number;
	gradeMax?: number;
	// For frequency source
	freqMin?: number;
	freqMax?: number;
}

export interface QuizConfig {
	mode: QuizMode;
	answerMode: AnswerMode;
	deckSize: number;
	includeNew: boolean;
	newCardsLimit: number;
	source: QuizSource;
	scriptFilter: CharacterScript;
}

export interface QuizCard {
	item: StudyItem;
	isNew: boolean;
	overdueHours: number;
}

export interface QuizSession {
	cards: QuizCard[];
	currentIndex: number;
	isRevealed: boolean;
	isComplete: boolean;
	startTime: number;
	results: QuizResult[];
}

export interface QuizResult {
	item: StudyItem;
	rating: SimpleRating;
	responseTime: number; // milliseconds
	wasCorrect: boolean;
}

export interface QuizStats {
	totalReviewed: number;
	correct: number;
	incorrect: number;
	averageTime: number;
	newLearned: number;
}

// Grade options for UI
export const GRADE_OPTIONS = [
	{ label: 'Grade 1', min: 1, max: 1 },
	{ label: 'Grade 2', min: 2, max: 2 },
	{ label: 'Grade 3', min: 3, max: 3 },
	{ label: 'Grades 1-2', min: 1, max: 2 },
	{ label: 'Grades 1-3', min: 1, max: 3 },
	{ label: 'Grades 4-6', min: 4, max: 6 }
];

// Frequency options for UI
export const FREQUENCY_OPTIONS = [
	{ label: 'Top 100', min: 1, max: 100 },
	{ label: 'Top 250', min: 1, max: 250 },
	{ label: 'Top 500', min: 1, max: 500 },
	{ label: 'Top 1000', min: 1, max: 1000 },
	{ label: '101-500', min: 101, max: 500 },
	{ label: '501-1000', min: 501, max: 1000 }
];

// Default quiz configuration
const DEFAULT_CONFIG: QuizConfig = {
	mode: 'recognition',
	answerMode: 'self_rate',
	deckSize: 10,
	includeNew: true,
	newCardsLimit: 5,
	source: { type: 'study_list' },
	scriptFilter: 'simplified'
};

// Quiz configuration store
function createQuizConfigStore() {
	// Load from localStorage
	let initial = DEFAULT_CONFIG;
	if (typeof localStorage !== 'undefined') {
		try {
			const saved = localStorage.getItem('quiz_config');
			if (saved) {
				initial = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
			}
		} catch (e) {
			console.error('Failed to load quiz config:', e);
		}
	}

	const { subscribe, set, update } = writable<QuizConfig>(initial);

	return {
		subscribe,
		setMode: (mode: QuizMode) => {
			update((config) => {
				const newConfig = { ...config, mode };
				saveConfig(newConfig);
				return newConfig;
			});
		},
		setDeckSize: (size: number) => {
			update((config) => {
				const newConfig = { ...config, deckSize: size };
				saveConfig(newConfig);
				return newConfig;
			});
		},
		setIncludeNew: (include: boolean) => {
			update((config) => {
				const newConfig = { ...config, includeNew: include };
				saveConfig(newConfig);
				return newConfig;
			});
		},
		setSource: (source: QuizSource) => {
			update((config) => {
				const newConfig = { ...config, source };
				saveConfig(newConfig);
				return newConfig;
			});
		},
		setAnswerMode: (answerMode: AnswerMode) => {
			update((config) => {
				const newConfig = { ...config, answerMode };
				saveConfig(newConfig);
				return newConfig;
			});
		},
		setScriptFilter: (scriptFilter: CharacterScript) => {
			update((config) => {
				const newConfig = { ...config, scriptFilter };
				saveConfig(newConfig);
				return newConfig;
			});
		},
		reset: () => {
			set(DEFAULT_CONFIG);
			saveConfig(DEFAULT_CONFIG);
		}
	};
}

function saveConfig(config: QuizConfig) {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('quiz_config', JSON.stringify(config));
	}
}

export const quizConfig = createQuizConfigStore();

// Empty session state
const EMPTY_SESSION: QuizSession = {
	cards: [],
	currentIndex: 0,
	isRevealed: false,
	isComplete: false,
	startTime: 0,
	results: []
};

// Quiz session store
function createQuizSessionStore() {
	const { subscribe, set, update } = writable<QuizSession>(EMPTY_SESSION);

	return {
		subscribe,
		// Start session from study list (SRS-based)
		startSession: (config: QuizConfig) => {
			const list = get(studyList);
			const queue = buildReviewQueue(list.items, config);

			set({
				cards: queue,
				currentIndex: 0,
				isRevealed: false,
				isComplete: queue.length === 0,
				startTime: Date.now(),
				results: []
			});
		},
		// Start session with pre-built character list (for grade/frequency quizzes)
		startWithItems: (characters: string[], config: QuizConfig) => {
			// Convert characters to StudyItem-like objects
			const items: StudyItem[] = characters.map((char) => ({
				type: 'character' as const,
				id: char,
				addedAt: Date.now(),
				easeFactor: 2.5,
				repetitions: 0
			}));

			// Shuffle BEFORE slicing to get random selection each time
			const shuffledItems = shuffleArray(items);

			// For non-study-list sources, all items are "new"
			const queue: QuizCard[] = shuffledItems.slice(0, config.deckSize).map((item) => ({
				item,
				isNew: true,
				overdueHours: 0
			}));

			set({
				cards: queue,
				currentIndex: 0,
				isRevealed: false,
				isComplete: queue.length === 0,
				startTime: Date.now(),
				results: []
			});
		},
		reveal: () => {
			update((session) => ({ ...session, isRevealed: true }));
		},
		submitRating: (rating: SimpleRating) => {
			update((session) => {
				if (session.isComplete || session.currentIndex >= session.cards.length) {
					return session;
				}

				const card = session.cards[session.currentIndex];
				const responseTime = Date.now() - session.startTime;

				// Calculate new SRS values
				const currentItem = card.item;
				const srsResult = calculateSM2Simple(
					rating,
					currentItem.repetitions || 0,
					currentItem.easeFactor || 2.5,
					currentItem.interval || 0
				);

				// Update the study list item
				studyList.updateItem(currentItem.type, currentItem.id, {
					repetitions: srsResult.repetitions,
					easeFactor: srsResult.easeFactor,
					interval: srsResult.interval,
					nextReview: srsResult.nextReview,
					lastReview: Date.now(),
					correctCount:
						rating !== 'again'
							? (currentItem.correctCount || 0) + 1
							: currentItem.correctCount || 0,
					incorrectCount:
						rating === 'again'
							? (currentItem.incorrectCount || 0) + 1
							: currentItem.incorrectCount || 0
				});

				// Add result
				const result: QuizResult = {
					item: currentItem,
					rating,
					responseTime,
					wasCorrect: rating !== 'again'
				};

				const newResults = [...session.results, result];
				const nextIndex = session.currentIndex + 1;
				const isComplete = nextIndex >= session.cards.length;

				return {
					...session,
					currentIndex: nextIndex,
					isRevealed: false,
					isComplete,
					results: newResults
				};
			});
		},
		/**
		 * Submit with direct SM-2 quality (0-5) for automatic grading
		 */
		submitWithQuality: (quality: 0 | 1 | 2 | 3 | 4 | 5, wasCorrect: boolean) => {
			update((session) => {
				if (session.isComplete || session.currentIndex >= session.cards.length) {
					return session;
				}

				const card = session.cards[session.currentIndex];
				const responseTime = Date.now() - session.startTime;

				// Calculate new SRS values using direct quality
				const currentItem = card.item;
				const srsResult = calculateSM2({
					quality,
					repetitions: currentItem.repetitions || 0,
					easeFactor: currentItem.easeFactor || 2.5,
					interval: currentItem.interval || 0
				});

				// Update the study list item
				studyList.updateItem(currentItem.type, currentItem.id, {
					repetitions: srsResult.repetitions,
					easeFactor: srsResult.easeFactor,
					interval: srsResult.interval,
					nextReview: srsResult.nextReview,
					lastReview: Date.now(),
					correctCount: wasCorrect
						? (currentItem.correctCount || 0) + 1
						: currentItem.correctCount || 0,
					incorrectCount: !wasCorrect
						? (currentItem.incorrectCount || 0) + 1
						: currentItem.incorrectCount || 0
				});

				// Map quality to simple rating for result tracking
				const rating: SimpleRating = quality >= 4 ? 'good' : quality >= 3 ? 'hard' : 'again';

				// Add result
				const result: QuizResult = {
					item: currentItem,
					rating,
					responseTime,
					wasCorrect
				};

				const newResults = [...session.results, result];
				const nextIndex = session.currentIndex + 1;
				const isComplete = nextIndex >= session.cards.length;

				return {
					...session,
					currentIndex: nextIndex,
					isRevealed: false,
					isComplete,
					results: newResults
				};
			});
		},
		reset: () => {
			set(EMPTY_SESSION);
		}
	};
}

export const quizSession = createQuizSessionStore();

/**
 * Build review queue from study list items
 */
function buildReviewQueue(items: StudyItem[], config: QuizConfig): QuizCard[] {
	const dueItems: QuizCard[] = [];
	const newItems: QuizCard[] = [];

	for (const item of items) {
		const overdueHours = getOverdueHours(item.nextReview);
		const isNew = !item.nextReview || (item.repetitions || 0) === 0;

		if (isNew) {
			newItems.push({ item, isNew: true, overdueHours });
		} else if (isDueForReview(item.nextReview)) {
			dueItems.push({ item, isNew: false, overdueHours });
		}
	}

	// Sort due items by how overdue they are (most overdue first)
	dueItems.sort((a, b) => b.overdueHours - a.overdueHours);

	// Build final queue
	const queue: QuizCard[] = [];

	// Add due items first
	queue.push(...dueItems.slice(0, config.deckSize));

	// Add new items if enabled and we have room
	if (config.includeNew) {
		const remainingSlots = config.deckSize - queue.length;
		const newToAdd = Math.min(remainingSlots, config.newCardsLimit, newItems.length);
		queue.push(...newItems.slice(0, newToAdd));
	}

	// Shuffle for variety (optional - keeps some randomness)
	return shuffleArray(queue);
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray<T>(array: T[]): T[] {
	const result = [...array];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

// Derived stores for UI
export const currentCard = derived(quizSession, ($session) => {
	if ($session.isComplete || $session.currentIndex >= $session.cards.length) {
		return null;
	}
	return $session.cards[$session.currentIndex];
});

export const sessionProgress = derived(quizSession, ($session) => {
	const total = $session.cards.length;
	const current = $session.currentIndex;
	const percentage = total > 0 ? (current / total) * 100 : 0;
	return { current, total, percentage };
});

export const sessionStats = derived(quizSession, ($session): QuizStats => {
	const results = $session.results;
	const correct = results.filter((r) => r.wasCorrect).length;
	const incorrect = results.filter((r) => !r.wasCorrect).length;
	const totalTime = results.reduce((sum, r) => sum + r.responseTime, 0);
	const newLearned = results.filter((r) => r.wasCorrect && !r.item.nextReview).length;

	return {
		totalReviewed: results.length,
		correct,
		incorrect,
		averageTime: results.length > 0 ? totalTime / results.length : 0,
		newLearned
	};
});

// Review queue status (for display in sidebar)
export const reviewQueueStats = derived(studyList, ($list) => {
	const now = Date.now();
	let due = 0;
	let newItems = 0;
	let learning = 0;

	for (const item of $list.items) {
		const isNew = !item.nextReview || (item.repetitions || 0) === 0;
		if (isNew) {
			newItems++;
		} else if (item.nextReview && item.nextReview <= now) {
			due++;
		} else if ((item.repetitions || 0) < 3) {
			learning++;
		}
	}

	return { due, newItems, learning, total: $list.items.length };
});
