import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export interface StudyItem {
	type: 'character' | 'word';
	id: string; // The character or word itself
	addedAt: number; // Unix timestamp

	// SRS fields (populated after first review)
	nextReview?: number; // Unix timestamp for next review
	interval?: number; // Days until next review
	easeFactor?: number; // SM-2: starts at 2.5
	repetitions?: number; // Number of successful reviews
	lastReview?: number; // Last review timestamp

	// Performance tracking
	correctCount?: number;
	incorrectCount?: number;
}

export interface StudyList {
	items: StudyItem[];
	createdAt: number;
	lastModified: number;
}

const STORAGE_KEY = 'study_list';

// Initialize from localStorage
function loadFromStorage(): StudyList {
	if (!browser) {
		return {
			items: [],
			createdAt: Date.now(),
			lastModified: Date.now()
		};
	}

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (e) {
		console.error('Failed to load study list from localStorage:', e);
	}

	return {
		items: [],
		createdAt: Date.now(),
		lastModified: Date.now()
	};
}

// Save to localStorage
function saveToStorage(list: StudyList) {
	if (!browser) return;

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
	} catch (e) {
		console.error('Failed to save study list to localStorage:', e);
	}
}

// Create the main store
const createStudyListStore = () => {
	const { subscribe, set, update } = writable<StudyList>(loadFromStorage());

	return {
		subscribe,
		addItem: (type: 'character' | 'word', id: string) => {
			update((list) => {
				// Don't add duplicates
				if (list.items.some((item) => item.id === id && item.type === type)) {
					return list;
				}

				const newItem: StudyItem = {
					type,
					id,
					addedAt: Date.now(),
					// SRS defaults
					easeFactor: 2.5,
					repetitions: 0,
					correctCount: 0,
					incorrectCount: 0
				};

				const updatedList = {
					...list,
					items: [...list.items, newItem],
					lastModified: Date.now()
				};

				saveToStorage(updatedList);
				return updatedList;
			});
		},
		removeItem: (type: 'character' | 'word', id: string) => {
			update((list) => {
				const updatedList = {
					...list,
					items: list.items.filter((item) => !(item.id === id && item.type === type)),
					lastModified: Date.now()
				};

				saveToStorage(updatedList);
				return updatedList;
			});
		},
		updateItem: (type: 'character' | 'word', id: string, updates: Partial<StudyItem>) => {
			update((list) => {
				const updatedList = {
					...list,
					items: list.items.map((item) =>
						item.id === id && item.type === type ? { ...item, ...updates } : item
					),
					lastModified: Date.now()
				};

				saveToStorage(updatedList);
				return updatedList;
			});
		},
		clearAll: () => {
			const emptyList: StudyList = {
				items: [],
				createdAt: Date.now(),
				lastModified: Date.now()
			};

			set(emptyList);
			saveToStorage(emptyList);
		},
		exportToJSON: () => {
			const list = loadFromStorage();
			return JSON.stringify(list, null, 2);
		},
		importFromJSON: (json: string) => {
			try {
				const imported = JSON.parse(json) as StudyList;
				set(imported);
				saveToStorage(imported);
				return true;
			} catch (e) {
				console.error('Failed to import study list:', e);
				return false;
			}
		}
	};
};

export const studyList = createStudyListStore();

// Derived store: check if item is in list
export const isInStudyList = derived(studyList, ($list) => {
	return (type: 'character' | 'word', id: string) => {
		return $list.items.some((item) => item.id === id && item.type === type);
	};
});

// Derived store: get review queue (items due for review)
export const reviewQueue = derived(studyList, ($list) => {
	const now = Date.now();
	return $list.items
		.filter((item) => !item.nextReview || item.nextReview <= now)
		.sort((a, b) => {
			// Priority: overdue items first, then by interval (shorter = higher priority)
			const overdueA = a.nextReview ? now - a.nextReview : Infinity;
			const overdueB = b.nextReview ? now - b.nextReview : Infinity;
			return overdueB - overdueA;
		});
});

// Derived store: count by type
export const studyListStats = derived(studyList, ($list) => {
	const characters = $list.items.filter((item) => item.type === 'character').length;
	const words = $list.items.filter((item) => item.type === 'word').length;
	const dueForReview = $list.items.filter(
		(item) => !item.nextReview || item.nextReview <= Date.now()
	).length;

	return {
		total: $list.items.length,
		characters,
		words,
		dueForReview
	};
});
