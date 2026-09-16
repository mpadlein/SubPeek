import { videoCache } from "@/common/cache";
import { EXTENSION_EVENTS } from "@/common/constants";

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

function handleOpenOptionsPage(sendResponse: (response?: any) => void) {
    // Content scripts cannot call runtime.openOptionsPage() themselves.
    Promise.resolve(browser.runtime.openOptionsPage())
        .then(() => sendResponse(true))
        .catch((error) => {
            logger.error("Failed to open options page:", error);
            sendResponse(false);
        });
}

export default defineBackground(() => {
    videoCache
        .cleanExpired()
        .catch((error) => logger.error("Startup cache cleanup failed:", error));

    // monkey patch to prevent wxt auto reload,
    if (import.meta.env.MODE == "development") {
        browser.tabs.reload = async () => {};
    }

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        const { event, data } = message;
        switch (event) {
            case EXTENSION_EVENTS.getCacheVideoInfo:
                handleGetCache(data, sendResponse);
                return true;
            case EXTENSION_EVENTS.setCacheVideoInfo:
                handleSetCache(data, sendResponse);
                return true;
            case EXTENSION_EVENTS.openOptionsPage:
                handleOpenOptionsPage(sendResponse);
                return true;
        }
        return false;
    });
});
