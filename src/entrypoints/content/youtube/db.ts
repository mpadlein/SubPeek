import { logger } from "@/utils/logger";
import { VIDEO_CACHE_TIMEOUT } from "@/utils/config";
import { VideoInfo } from ".";

interface CacheEntry {
	videoId: string;
	data: VideoInfo;
	timestamp: number;
}

class VideoInfoCacheManager {
	private readonly dbName = "ytb-video-cache";
	private readonly dbVersion = 1;
	private readonly storeName = "videoInfo";
	private db: IDBDatabase | null = null;
	private dbPromise: Promise<IDBDatabase> | null = null;

	private getDatabase(): Promise<IDBDatabase> {
		if (this.db) {
			return Promise.resolve(this.db);
		}

		if (this.dbPromise) {
			return this.dbPromise;
		}

		this.dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.dbVersion);

			request.onerror = () => {
				logger.error(
					"VideoInfoCacheManager.getDatabase error:",
					request.error
				);
				this.dbPromise = null;
				reject(request.error);
			};

			request.onsuccess = () => {
				logger.debug("VideoInfoCacheManager.getDatabase success");
				this.db = request.result;
				this.db.onclose = () => {
					this.db = null;
					this.dbPromise = null;
				};
				resolve(this.db);
			};

			request.onupgradeneeded = (event) => {
				logger.debug(
					"VideoInfoCacheManager.getDatabase upgrade needed"
				);
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					const store = db.createObjectStore(this.storeName, {
						keyPath: "videoId",
					});
					store.createIndex("timestamp", "timestamp", {
						unique: false,
					});
				}
			};
		});

		return this.dbPromise;
	}

	async get(videoId: string): Promise<CacheEntry | null> {
		try {
			const db = await this.getDatabase();
			return new Promise((resolve, reject) => {
				const transaction = db.transaction(this.storeName, "readonly");
				const store = transaction.objectStore(this.storeName);
				const request = store.get(videoId);

				request.onerror = () => {
					logger.error(
						"VideoInfoCacheManager.get error: " + videoId,
						request.error
					);
					reject(request.error);
				};
				request.onsuccess = () => {
					logger.debug(
						"VideoInfoCacheManager.get success: " + videoId
					);
					resolve(request.result || null);
				};
			});
		} catch (e) {
			logger.error("VideoInfoCacheManager.get error:", e);
			return null;
		}
	}

	async set(videoId: string, data: VideoInfo): Promise<void> {
		try {
			const db = await this.getDatabase();
			const entry: CacheEntry = {
				videoId,
				data,
				timestamp: Date.now() / 1000,
			};
			return new Promise((resolve, reject) => {
				const transaction = db.transaction(this.storeName, "readwrite");
				const store = transaction.objectStore(this.storeName);
				const request = store.put(entry);

				request.onerror = () => {
					logger.error(
						"VideoInfoCacheManager.set error: " + videoId,
						request.error
					);
					reject(request.error);
				};
				request.onsuccess = () => {
					logger.debug(
						"VideoInfoCacheManager.set success: " + videoId
					);
					resolve();
				};
			});
		} catch (e) {
			logger.error("VideoInfoCacheManager.set error:", e);
		}
	}

	async cleanExpired(): Promise<void> {
		try {
			const db = await this.getDatabase();
			const expiredThreshold = Date.now() / 1000 - VIDEO_CACHE_TIMEOUT;

			return new Promise((resolve, reject) => {
				const transaction = db.transaction(this.storeName, "readwrite");
				const store = transaction.objectStore(this.storeName);
				const index = store.index("timestamp");
				const range = IDBKeyRange.upperBound(expiredThreshold);
				const request = index.openCursor(range);

				request.onerror = () => {
					logger.error(
						"VideoInfoCacheManager.cleanExpired error",
						request.error
					);
					reject(request.error);
				};
				request.onsuccess = (event) => {
					const cursor = (
						event.target as IDBRequest<IDBCursorWithValue>
					).result;
					if (cursor) {
						cursor.delete();
						cursor.continue();
					}
				};

				transaction.oncomplete = () => resolve();
			});
		} catch (e) {
			logger.error("VideoInfoCacheManager.cleanExpired error:", e);
		}
	}

	async cleanAll(): Promise<void> {
		try {
			const db = await this.getDatabase();
			return new Promise((resolve, reject) => {
				const transaction = db.transaction(this.storeName, "readwrite");
				const store = transaction.objectStore(this.storeName);
				const request = store.clear();

				request.onerror = () => {
					logger.error(
						"VideoInfoCacheManager.cleanAll error",
						request.error
					);
					reject(request.error);
				};
				request.onsuccess = () => resolve();
			});
		} catch (e) {
			logger.error("VideoInfoCacheManager.cleanAll error:", e);
		}
	}
}

export const videoInfoCacheManager = new VideoInfoCacheManager();
