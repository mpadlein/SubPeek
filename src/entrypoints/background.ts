import { videoCache } from "@/common/cache";
import { EXTENSION_EVENTS } from "@/common/constants";
import { browserStorageLocalSV } from "@/common/storage";

async function handleGetCache(
    data: any,
    sendResponse: (response?: any) => void,
) {
    const videoId = data.videoId;
    const cacheData = await videoCache.get(videoId);

    sendResponse({
        videoId,
        cacheData,
    });
}

function handleSetCache(data: any, sendResponse: (response?: any) => void) {
    const videoId = data.videoId;
    videoCache.set(videoId, data.data).then(() => {
        sendResponse(true);
    });
}

function handleGetCacheSize(data: any, sendResponse: (response?: any) => void) {
    videoCache.getStats().then((data) => {
        sendResponse(data);
    });
}

function handleClearCache(data: any, sendResponse: (response?: any) => void) {
    videoCache.clear().then(() => {
        sendResponse(true);
    });
}

function handleOpenOptionsPage(
    data: any,
    sendResponse: (response?: any) => void,
) {
    // Content scripts cannot call runtime.openOptionsPage() themselves.
    Promise.resolve(browser.runtime.openOptionsPage())
        .then(() => sendResponse(true))
        .catch((error) => {
            logger.error("Failed to open options page:", error);
            sendResponse(false);
        });
}

export default defineBackground(() => {
    // Load persisted settings into memory *before* anything reads them —
    // cleanExpired() needs the user's cacheTTL, not the built-in default.
    browserStorageLocalSV
        .ready()
        .then(() => videoCache.cleanExpired())
        .catch((error) => logger.error("Startup cache cleanup failed:", error));

    // monkey patch to prevent wxt auto reload,
    if (import.meta.env.MODE == "development") {
        browser.tabs.reload = async () => {};
    }

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const { event, data } = message;
        switch (event) {
            case EXTENSION_EVENTS.getCacheVideoInfo:
                handleGetCache(data, sendResponse);
                return true;
            case EXTENSION_EVENTS.setCacheVideoInfo:
                handleSetCache(data, sendResponse);
                return true;
            case EXTENSION_EVENTS.getCacheSize:
                handleGetCacheSize(data, sendResponse);
                return true;
            case EXTENSION_EVENTS.clearCache:
                handleClearCache(data, sendResponse);
                return true;
            case EXTENSION_EVENTS.openOptionsPage:
                handleOpenOptionsPage(data, sendResponse);
                return true;
        }
        return false;
    });
});
