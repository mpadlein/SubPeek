/**
 * IndexedDB cache manager for video info
 */
import { logger } from "@/utils/logger";
import { IDBStore } from "./idb";
import { Settings } from "./settings";
import type { CacheEntry, VideoInfo } from "./types";

class VideoCache {
    private store = new IDBStore<CacheEntry>("ytb2-video-cache", "videoInfo", 1, {
        keyPath: "videoId",
        indexes: [{ name: "timestamp", keyPath: "timestamp" }],
    });

    async get(videoId: string): Promise<CacheEntry | null> {
        try {
            return await this.store.get(videoId);
        } catch (error) {
            logger.error("VideoCache.get error:", error);
            return null;
        }
    }

    async set(videoId: string, data: VideoInfo): Promise<void> {
        try {
            await this.store.put({
                videoId,
                data,
                timestamp: Date.now() / 1000,
            });
        } catch (error) {
            logger.error("VideoCache.set error:", error);
        }
    }

    async cleanExpired(): Promise<void> {
        try {
            const expiredThreshold =
                Date.now() / 1000 - Settings.cacheTTL.get();
            await this.store.deleteByIndexRange(
                "timestamp",
                IDBKeyRange.upperBound(expiredThreshold),
            );
        } catch (error) {
            logger.error("VideoCache.cleanExpired error:", error);
        }
    }

    async clear(): Promise<void> {
        try {
            await this.store.clear();
        } catch (error) {
            logger.error("VideoCache.clear error:", error);
        }
    }

    async getSizeUsage(): Promise<{
        count: number | undefined;
        size: number | undefined;
    }> {
        try {
            const count = await this.store.count();
            const estimate = await navigator.storage.estimate();
            return { count, size: estimate.usage };
        } catch (error) {
            logger.error("VideoCache.count error:", error);
            return { count: undefined, size: undefined };
        }
    }
}

/** Singleton cache instance */
export const videoCache = new VideoCache();
