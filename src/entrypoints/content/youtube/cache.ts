/**
 * IndexedDB cache manager for video info
 */
import { VIDEO_CACHE_TIMEOUT } from "@/utils/config";
import { logger } from "@/utils/logger";
import type { CacheEntry, VideoInfo } from "./types";

const DB_NAME = "ytb2-video-cache";
const DB_VERSION = 1;
const STORE_NAME = "videoInfo";

/**
 * Manages video info caching with IndexedDB
 */
class VideoCache {
    private db: IDBDatabase | null = null;
    private dbPromise: Promise<IDBDatabase> | null = null;

    /**
     * Get or initialize the database connection
     */
    private async getDb(): Promise<IDBDatabase> {
        if (this.db) return this.db;
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                logger.error(
                    "VideoCache: Failed to open database",
                    request.error,
                );
                this.dbPromise = null;
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.db.onclose = () => {
                    this.db = null;
                    this.dbPromise = null;
                };
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, {
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

    /**
     * Get cached video info by video ID
     */
    async get(videoId: string): Promise<CacheEntry | null> {
        try {
            const db = await this.getDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, "readonly");
                const store = tx.objectStore(STORE_NAME);
                const request = store.get(videoId);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result || null);
            });
        } catch (error) {
            logger.error("VideoCache.get error:", error);
            return null;
        }
    }

    /**
     * Store video info in cache
     */
    async set(videoId: string, data: VideoInfo): Promise<void> {
        try {
            const db = await this.getDb();
            const entry: CacheEntry = {
                videoId,
                data,
                timestamp: Date.now() / 1000,
            };

            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, "readwrite");
                const store = tx.objectStore(STORE_NAME);
                const request = store.put(entry);

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        } catch (error) {
            logger.error("VideoCache.set error:", error);
        }
    }

    /**
     * Remove expired cache entries
     */
    async cleanExpired(): Promise<void> {
        try {
            const db = await this.getDb();
            const expiredThreshold = Date.now() / 1000 - VIDEO_CACHE_TIMEOUT;

            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, "readwrite");
                const store = tx.objectStore(STORE_NAME);
                const index = store.index("timestamp");
                const range = IDBKeyRange.upperBound(expiredThreshold);
                const request = index.openCursor(range);

                request.onerror = () => reject(request.error);
                request.onsuccess = (event) => {
                    const cursor = (
                        event.target as IDBRequest<IDBCursorWithValue>
                    ).result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    }
                };

                tx.oncomplete = () => resolve();
            });
        } catch (error) {
            logger.error("VideoCache.cleanExpired error:", error);
        }
    }

    /**
     * Clear all cached data
     */
    async clear(): Promise<void> {
        try {
            const db = await this.getDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, "readwrite");
                const store = tx.objectStore(STORE_NAME);
                const request = store.clear();

                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        } catch (error) {
            logger.error("VideoCache.clear error:", error);
        }
    }

    async count(): Promise<number> {
        try {
            const db = await this.getDb();
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            return store.count().result;
        } catch (error) {
            logger.error("VideoCache.count error:", error);
            return 0;
        }
    }
}

/** Singleton cache instance */
export const videoCache = new VideoCache();
