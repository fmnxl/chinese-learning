import type { StudyList } from './studyList';

const DB_NAME = 'chinese_learning_app';
const DB_VERSION = 1;
const STORE_NAME = 'study_list';

interface IDBWrapper {
	db: IDBDatabase | null;
	ready: Promise<void>;
}

const idbWrapper: IDBWrapper = {
	db: null,
	ready: Promise.resolve()
};

// Initialize IndexedDB
function initDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB not supported'));
			return;
		}

		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = () => {
			reject(request.error);
		};

		request.onsuccess = () => {
			resolve(request.result);
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// Create object store if it doesn't exist
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		};
	});
}

// Get the database instance
export async function getDB(): Promise<IDBDatabase> {
	if (idbWrapper.db) {
		return idbWrapper.db;
	}

	idbWrapper.db = await initDB();
	return idbWrapper.db;
}

// Save study list to IndexedDB
export async function saveStudyListIDB(data: StudyList): Promise<void> {
	try {
		const db = await getDB();
		const transaction = db.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.put(data, 'study_list');

		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (error) {
		console.error('Failed to save to IndexedDB:', error);
		throw error;
	}
}

// Load study list from IndexedDB
export async function loadStudyListIDB(): Promise<StudyList | null> {
	try {
		const db = await getDB();
		const transaction = db.transaction([STORE_NAME], 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.get('study_list');

		return new Promise((resolve, reject) => {
			request.onsuccess = () => {
				resolve(request.result || null);
			};
			request.onerror = () => reject(request.error);
		});
	} catch (error) {
		console.error('Failed to load from IndexedDB:', error);
		return null;
	}
}

// Check if IndexedDB is available
export function isIndexedDBAvailable(): boolean {
	return typeof indexedDB !== 'undefined';
}

// Migrate from localStorage to IndexedDB
export async function migrateFromLocalStorage(): Promise<boolean> {
	if (!isIndexedDBAvailable()) return false;

	try {
		// Check if there's data in localStorage
		const localData = localStorage.getItem('study_list');
		if (!localData) return false;

		// Check if IndexedDB already has data
		const idbData = await loadStudyListIDB();
		if (idbData) return false; // Already migrated

		// Parse and save to IndexedDB
		const parsedData = JSON.parse(localData) as StudyList;
		await saveStudyListIDB(parsedData);

		console.log('Successfully migrated study list from localStorage to IndexedDB');
		return true;
	} catch (error) {
		console.error('Migration from localStorage failed:', error);
		return false;
	}
}

// Calculate storage usage estimate
export function estimateLocalStorageUsage(data: StudyList): number {
	try {
		return JSON.stringify(data).length;
	} catch {
		return 0;
	}
}

// Check if we should use IndexedDB (based on data size)
export function shouldUseIndexedDB(data: StudyList): boolean {
	const LOCALSTORAGE_THRESHOLD = 50000; // ~50KB threshold
	const usage = estimateLocalStorageUsage(data);
	return isIndexedDBAvailable() && usage > LOCALSTORAGE_THRESHOLD;
}

// Clear all data from IndexedDB
export async function clearIndexedDB(): Promise<void> {
	try {
		const db = await getDB();
		const transaction = db.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.clear();

		return new Promise((resolve, reject) => {
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	} catch (error) {
		console.error('Failed to clear IndexedDB:', error);
		throw error;
	}
}

// Delete the entire database
export async function deleteDatabase(): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('IndexedDB not supported'));
			return;
		}

		// Close any existing connection
		if (idbWrapper.db) {
			idbWrapper.db.close();
			idbWrapper.db = null;
		}

		const request = indexedDB.deleteDatabase(DB_NAME);
		request.onsuccess = () => {
			console.log('IndexedDB database deleted');
			resolve();
		};
		request.onerror = () => reject(request.error);
		request.onblocked = () => {
			console.warn('IndexedDB delete blocked - close other tabs');
			reject(new Error('Database delete blocked'));
		};
	});
}
