import { videoCache } from "@/common/cache";
import { listenForMessages } from "@/common/messaging";

export default defineBackground(() => {
    videoCache
        .cleanExpired()
        .catch((error) => logger.error("Startup cache cleanup failed:", error));

    // monkey patch to prevent wxt auto reload,
    if (import.meta.env.MODE == "development") {
        browser.tabs.reload = async () => {};
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
