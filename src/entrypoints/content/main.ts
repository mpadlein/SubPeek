import { stopPreviews, watchPreviewsIn } from "./youtube/preview";
import { stopThumbnails, trackThumbnailsIn } from "./youtube/thumbnails";
import { closePopup } from "./youtube/ui/popup";

logger.debug("Content script loaded");

// One observer for everything YouTube adds to the page. Each added element is
// handed to the thumbnail and hover-preview modules, which pick out whatever
// in it is theirs.
const addedNodesObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;
            watchPreviewsIn(node);
            trackThumbnailsIn(node);
        }
    }
});

// ─── Lifecycle ───────────────────────────────────────────────────────
//
// start() and stop() are mirror images, driven by Settings.enabled. Both are
// idempotent so the storage listener can call them freely.

let running = false;

export function start(): void {
    if (running) return;
    running = true;

    addedNodesObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
    watchPreviewsIn(document);
    trackThumbnailsIn(document);
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
    closePopup();
    stopPreviews();
    stopThumbnails();
}
