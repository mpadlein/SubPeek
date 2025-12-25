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

function handleGetCacheSize(data: any, sendResponse: (response?: any) => void) {
    videoCache.getSizeUsage().then((data) => {
        sendResponse(data);
    });
}

function handleClearCache(data: any, sendResponse: (response?: any) => void) {
    videoCache.clear().then(() => {
        sendResponse(true);
    });
}

export default defineBackground(() => {
    // Enable session storage access from content scripts
    browser.storage.session.setAccessLevel({
        accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
    });

    browser.tabs.reload = async () => {};

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
        }
        return false;
    });
});
