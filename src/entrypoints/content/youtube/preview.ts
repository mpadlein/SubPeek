import { CSS } from "../constants";
import { createEmbedContainer, initEmbed } from "./ui/embed";

// Hovering a card on the home, search and subscriptions pages starts
// YouTube's inline preview: one global <ytd-video-preview> element that is
// positioned over the card from outside the card's DOM, with the real video
// player inside. It covers the badge in the card (no z-index inside the card
// can escape the wrapper's stacking context), so while the preview is active
// the badge is mirrored into the preview's own player box, where it paints
// above the video and stays clickable.

const PREVIEW_SELECTOR = "ytd-video-preview";
const PREVIEW_PLAYER_BOX = "#player-container-wrapper";
const PREVIEW_LINK = "a#media-container-link";
let watchedPreviews = new WeakSet<Element>();

const previewObserver = new MutationObserver((mutations) => {
    const previews = new Set<HTMLElement>();
    for (const mutation of mutations) {
        const target = mutation.target;
        if (!(target instanceof Element)) continue;
        const preview = target.closest<HTMLElement>(PREVIEW_SELECTOR);
        if (preview) previews.add(preview);
    }
    previews.forEach(syncPreviewOverlay);
});

function watchPreview(preview: HTMLElement): void {
    if (watchedPreviews.has(preview)) return;
    watchedPreviews.add(preview);
    // `active` toggles on the preview itself; the link's href says which video
    // it shows and changes when the same element moves on to another card.
    previewObserver.observe(preview, {
        attributes: true,
        attributeFilter: ["active", "href"],
        subtree: true,
    });
    syncPreviewOverlay(preview);
}

function syncPreviewOverlay(preview: HTMLElement): void {
    const host = preview.querySelector<HTMLElement>(`.${CSS.PREVIEW_HOST}`);
    const playerBox = preview.querySelector<HTMLElement>(PREVIEW_PLAYER_BOX);
    const videoUrl = preview.hasAttribute("active")
        ? preview.querySelector<HTMLAnchorElement>(PREVIEW_LINK)?.href
        : undefined;

    if (!videoUrl || !playerBox) {
        host?.remove();
        return;
    }

    const container = host?.querySelector<HTMLElement>(`.${CSS.CONTAINER}`);
    if (
        host?.parentElement === playerBox &&
        container?.dataset.href === videoUrl
    ) {
        return;
    }
    host?.remove();

    const newHost = document.createElement("div");
    newHost.classList.add(CSS.PREVIEW_HOST);
    const newContainer = createEmbedContainer(videoUrl);
    newHost.appendChild(newContainer);
    playerBox.appendChild(newHost);
    initEmbed(newContainer, videoUrl);
}

/** Preview elements inside `root`, plus `root` itself when it is one. */
function findPreviews(root: ParentNode): HTMLElement[] {
    const previews = Array.from(
        root.querySelectorAll<HTMLElement>(PREVIEW_SELECTOR),
    );
    if (root instanceof HTMLElement && root.matches(PREVIEW_SELECTOR)) {
        previews.push(root);
    }
    return previews;
}

// ─── Public API ──────────────────────────────────────────────────────

/** Starts mirroring badges into every preview element found in `root`. */
export function watchPreviewsIn(root: ParentNode): void {
    findPreviews(root).forEach(watchPreview);
}

/** Stops observing previews and removes every mirrored badge. */
export function stopPreviews(): void {
    previewObserver.disconnect();
    watchedPreviews = new WeakSet();
    document
        .querySelectorAll<HTMLElement>(`.${CSS.PREVIEW_HOST}`)
        .forEach((host) => host.remove());
}
