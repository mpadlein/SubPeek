import { Settings } from "@/common/settings";
import { mountMetricsOverlay, unmountMetricsOverlay } from "./debugging";
import { mountFilterIn, startFilter, stopFilter } from "./youtube/filter";
import { stopPreviews, watchPreviewsIn } from "./youtube/preview";
import { stopThumbnails, trackThumbnailsIn } from "./youtube/thumbnails";
import { closePopup } from "./youtube/ui/popup";
import { rerenderEmbeds } from "./youtube/ui/rerender";

logger.debug("Content script loaded");

// One observer for everything YouTube adds to the page. Each added element is
// handed to the thumbnail, hover-preview and filter modules, which pick out
// whatever in it is theirs.
const addedNodesObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            watchPreviewsIn(node);
            trackThumbnailsIn(node);
            mountFilterIn(node);
        }
    }
});

// ─── Lifecycle ───────────────────────────────────────────────────────
//
// start() and stop() are mirror images, driven by Settings.enabled. Both are
// idempotent so the storage listener can call them freely. No module touches
// the page or subscribes to settings at import time; it all happens here, so
// stop() can undo all of it.

let running = false;
let unsubscribeFavorites: (() => void) | null = null;

export function start(): void {
    if (running) return;
    running = true;

    mountMetricsOverlay();
    // Badges show only favorite languages, so every embed redraws when the
    // list changes (in the settings popup or from another tab).
    unsubscribeFavorites = Settings.langCodes.subscribe(() => {
        logger.debug("Favorites changed, re-rendering embeds");
        rerenderEmbeds();
    });
    addedNodesObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
    watchPreviewsIn(document);
    trackThumbnailsIn(document);
    startFilter();
}

/**
 * Stop watching the page and leave it as if the extension had never touched
 * it: no observers, no badge nodes, every <img> back under its own parent.
 * A later start() then re-scans from scratch, which is cheap thanks to the
 * background cache.
 */
export function stop(): void {
    if (!running) return;
    running = false;

    addedNodesObserver.disconnect();
    unsubscribeFavorites?.();
    unsubscribeFavorites = null;
    closePopup();
    stopFilter();
    stopPreviews();
    stopThumbnails();
    unmountMetricsOverlay();
}
