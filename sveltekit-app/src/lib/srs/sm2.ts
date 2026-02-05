/**
 * SM-2 Spaced Repetition Algorithm Implementation
 *
 * Based on the SuperMemo 2 algorithm by Piotr Wozniak
 * https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 *
 * Quality ratings:
 * 0 - Complete blackout, no memory
 * 1 - Incorrect, but remembered upon seeing answer
 * 2 - Incorrect, but seemed easy after reveal
 * 3 - Correct with serious difficulty
 * 4 - Correct with hesitation
 * 5 - Perfect response, instant recall
 */

export interface SM2Response {
	interval: number; // Days until next review
	repetitions: number; // Number of successful reviews
	easeFactor: number; // Current ease factor (minimum 1.3)
	nextReview: number; // Unix timestamp for next review
}

export interface SM2Input {
	quality: number; // 0-5 rating
	repetitions: number; // Current repetition count
	easeFactor: number; // Current ease factor (default 2.5)
	interval: number; // Current interval in days
}

/**
 * Calculate the next review parameters using SM-2 algorithm
 */
export function calculateSM2(input: SM2Input): SM2Response {
	let { quality, repetitions, easeFactor, interval } = input;

	// Ensure quality is within bounds
	quality = Math.max(0, Math.min(5, Math.round(quality)));

	// Ensure ease factor minimum
	easeFactor = Math.max(1.3, easeFactor);

	if (quality < 3) {
		// Failed review - reset to beginning
		repetitions = 0;
		interval = 1;
	} else {
		// Successful review
		if (repetitions === 0) {
			interval = 1;
		} else if (repetitions === 1) {
			interval = 6;
		} else {
			interval = Math.round(interval * easeFactor);
		}
		repetitions += 1;
	}

	// Update ease factor using SM-2 formula
	// EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
	const efDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
	easeFactor = Math.max(1.3, easeFactor + efDelta);

	// Calculate next review timestamp
	const nextReview = Date.now() + interval * 24 * 60 * 60 * 1000;

	return {
		interval,
		repetitions,
		easeFactor,
		nextReview
	};
}

/**
 * Get default SM-2 values for a new item
 */
export function getDefaultSM2(): { easeFactor: number; repetitions: number; interval: number } {
	return {
		easeFactor: 2.5,
		repetitions: 0,
		interval: 0
	};
}

/**
 * Quality rating labels for UI
 */
export const QUALITY_LABELS = {
	0: { label: 'Again', description: 'Complete blackout', color: '#dc2626' },
	1: { label: 'Hard', description: 'Incorrect, remembered after', color: '#ea580c' },
	2: { label: 'Difficult', description: 'Incorrect, seemed easy', color: '#d97706' },
	3: { label: 'Good', description: 'Correct with difficulty', color: '#65a30d' },
	4: { label: 'Easy', description: 'Correct with hesitation', color: '#22c55e' },
	5: { label: 'Perfect', description: 'Instant recall', color: '#10b981' }
} as const;

/**
 * Simplified 4-button rating system (common in apps like Anki)
 * Maps to SM-2 quality ratings
 */
export const SIMPLE_RATINGS = {
	again: 0, // Complete fail
	hard: 2, // Struggled but got close
	good: 4, // Normal success
	easy: 5 // Effortless
} as const;

export type SimpleRating = keyof typeof SIMPLE_RATINGS;

/**
 * Calculate SM-2 using simplified 4-button system
 */
export function calculateSM2Simple(
	rating: SimpleRating,
	repetitions: number,
	easeFactor: number,
	interval: number
): SM2Response {
	return calculateSM2({
		quality: SIMPLE_RATINGS[rating],
		repetitions,
		easeFactor,
		interval
	});
}

/**
 * Check if an item is due for review
 */
export function isDueForReview(nextReview: number | undefined): boolean {
	if (!nextReview) return true; // New items are always due
	return Date.now() >= nextReview;
}

/**
 * Calculate how overdue an item is (in hours)
 * Positive = overdue, Negative = not yet due
 */
export function getOverdueHours(nextReview: number | undefined): number {
	if (!nextReview) return Infinity; // New items are infinitely overdue
	return (Date.now() - nextReview) / (1000 * 60 * 60);
}

/**
 * Format interval for display
 */
export function formatInterval(days: number): string {
	if (days < 1) return 'Today';
	if (days === 1) return '1 day';
	if (days < 7) return `${days} days`;
	if (days < 30) {
		const weeks = Math.round(days / 7);
		return weeks === 1 ? '1 week' : `${weeks} weeks`;
	}
	if (days < 365) {
		const months = Math.round(days / 30);
		return months === 1 ? '1 month' : `${months} months`;
	}
	const years = Math.round(days / 365);
	return years === 1 ? '1 year' : `${years} years`;
}

/**
 * Get learning stage based on repetitions
 */
export function getLearningStage(
	repetitions: number
): 'new' | 'learning' | 'reviewing' | 'graduated' {
	if (repetitions === 0) return 'new';
	if (repetitions < 3) return 'learning';
	if (repetitions < 10) return 'reviewing';
	return 'graduated';
}

/**
 * Get stage color for UI
 */
export function getStageColor(stage: ReturnType<typeof getLearningStage>): string {
	switch (stage) {
		case 'new':
			return '#3b82f6'; // Blue
		case 'learning':
			return '#f59e0b'; // Amber
		case 'reviewing':
			return '#22c55e'; // Green
		case 'graduated':
			return '#8b5cf6'; // Purple
	}
}
