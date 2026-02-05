import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	getDB,
	saveStudyListIDB,
	loadStudyListIDB,
	isIndexedDBAvailable,
	clearIndexedDB,
	deleteDatabase,
	estimateLocalStorageUsage,
	shouldUseIndexedDB
} from './idb';
import type { StudyList } from './studyList';

// Helper to create mock study list
const createMockStudyList = (itemCount: number = 3): StudyList => ({
	items: Array.from({ length: itemCount }, (_, i) => ({
		type: 'character' as const,
		id: `char-${i}`,
		addedAt: Date.now() - i * 1000,
		easeFactor: 2.5,
		repetitions: i,
		correctCount: i * 2,
		incorrectCount: 0
	})),
	createdAt: Date.now() - 1000 * 60 * 60 * 24,
	lastModified: Date.now()
});

describe('IndexedDB Storage', () => {
	beforeEach(async () => {
		// Clean up before each test
		try {
			await deleteDatabase();
		} catch {
			// Database might not exist yet
		}
	});

	afterEach(async () => {
		// Clean up after each test
		try {
			await deleteDatabase();
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('isIndexedDBAvailable', () => {
		it('should return true when IndexedDB is available', () => {
			// fake-indexeddb provides IndexedDB in test environment
			expect(isIndexedDBAvailable()).toBe(true);
		});
	});

	describe('getDB', () => {
		it('should return a database instance', async () => {
			const db = await getDB();
			expect(db).toBeDefined();
			expect(db.name).toBe('chinese_learning_app');
		});

		it('should return the same instance on subsequent calls', async () => {
			const db1 = await getDB();
			const db2 = await getDB();
			expect(db1).toBe(db2);
		});
	});

	describe('saveStudyListIDB / loadStudyListIDB', () => {
		it('should save and load study list correctly', async () => {
			const mockList = createMockStudyList(5);

			await saveStudyListIDB(mockList);
			const loaded = await loadStudyListIDB();

			expect(loaded).not.toBeNull();
			expect(loaded?.items.length).toBe(5);
			expect(loaded?.items[0].id).toBe('char-0');
		});

		it('should return null when no data exists', async () => {
			const loaded = await loadStudyListIDB();
			expect(loaded).toBeNull();
		});

		it('should overwrite existing data on save', async () => {
			const list1 = createMockStudyList(3);
			const list2 = createMockStudyList(7);

			await saveStudyListIDB(list1);
			await saveStudyListIDB(list2);

			const loaded = await loadStudyListIDB();
			expect(loaded?.items.length).toBe(7);
		});

		it('should preserve all item fields', async () => {
			const mockList: StudyList = {
				items: [
					{
						type: 'character',
						id: '汉',
						addedAt: 1000000,
						nextReview: 2000000,
						interval: 5,
						easeFactor: 2.8,
						repetitions: 3,
						lastReview: 1500000,
						correctCount: 10,
						incorrectCount: 2
					}
				],
				createdAt: 500000,
				lastModified: 1500000
			};

			await saveStudyListIDB(mockList);
			const loaded = await loadStudyListIDB();

			expect(loaded?.items[0]).toEqual(mockList.items[0]);
			expect(loaded?.createdAt).toBe(mockList.createdAt);
			expect(loaded?.lastModified).toBe(mockList.lastModified);
		});
	});

	describe('clearIndexedDB', () => {
		it('should clear all data from the store', async () => {
			const mockList = createMockStudyList(3);
			await saveStudyListIDB(mockList);

			await clearIndexedDB();

			const loaded = await loadStudyListIDB();
			expect(loaded).toBeNull();
		});
	});

	describe('estimateLocalStorageUsage', () => {
		it('should return the serialized size of data', () => {
			const mockList = createMockStudyList(10);
			const size = estimateLocalStorageUsage(mockList);

			// Should be a positive number
			expect(size).toBeGreaterThan(0);

			// Should roughly match JSON.stringify length
			expect(size).toBe(JSON.stringify(mockList).length);
		});

		it('should return 0 for empty list', () => {
			const emptyList: StudyList = {
				items: [],
				createdAt: Date.now(),
				lastModified: Date.now()
			};
			const size = estimateLocalStorageUsage(emptyList);
			expect(size).toBeGreaterThan(0); // Still has metadata
		});
	});

	describe('shouldUseIndexedDB', () => {
		it('should return false for small data sets', () => {
			const smallList = createMockStudyList(5);
			// Small list is under 50KB threshold
			expect(shouldUseIndexedDB(smallList)).toBe(false);
		});

		it('should return true for large data sets', () => {
			// Create a large list that exceeds 50KB
			const largeList: StudyList = {
				items: Array.from({ length: 500 }, (_, i) => ({
					type: 'character' as const,
					id: `char-${i}-${'x'.repeat(100)}`, // Make IDs longer
					addedAt: Date.now(),
					easeFactor: 2.5,
					repetitions: i,
					correctCount: i * 2,
					incorrectCount: i
				})),
				createdAt: Date.now(),
				lastModified: Date.now()
			};

			// This should be over 50KB
			expect(estimateLocalStorageUsage(largeList)).toBeGreaterThan(50000);
			expect(shouldUseIndexedDB(largeList)).toBe(true);
		});
	});
});
