import { videoCache } from "@/common/cache";
import { listenForMessages } from "@/common/messaging";

export default defineBackground(() => {
    videoCache
        .cleanExpired()
        .catch((error) => logger.error("Startup cache cleanup failed:", error));

    // Dev only: WXT reloads open tabs after a rebuild; make that a no-op so
    // YouTube tabs keep their state.
    if (import.meta.env.DEV) {
        browser.tabs.reload = () => Promise.resolve();
    }

    listenForMessages({
        async getCachedVideoInfo({ videoId }) {
            return videoCache.get(videoId);
        },
        async saveVideoInfo({ videoId, info }) {
            await videoCache.set(videoId, info);
        },
        async openOptionsPage() {
            // Content scripts cannot call runtime.openOptionsPage() themselves.
            await browser.runtime.openOptionsPage();
        },
    });
});
