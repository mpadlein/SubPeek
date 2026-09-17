import { CSS, CSS_PREFIX } from "../constants";
import { metricsProxy } from "../debugging";
import { createEmbedContainer, initEmbed } from "./ui/embed";

// Finds video thumbnails, waits until they scroll into view and mounts the
// badge overlay on each one. main.ts feeds it the DOM (the initial page and
// every added node) and tears everything down through stopThumbnails().

const WATCH_LINK_SELECTOR = 'a[href^="/watch?"]';
// YouTube renders a blurred copy of some thumbnails as a backdrop; skip those.
const THUMBNAIL_IMG_SELECTOR = ":not(.ytThumbnailViewModelBlurredImage) > img";
const THUMBNAIL_SELECTOR = `${WATCH_LINK_SELECTOR} ${THUMBNAIL_IMG_SELECTOR}`;

const PROCESSED_ATTR = `data-${CSS_PREFIX}-processed`;
const isProcessed = (img: HTMLImageElement) => img.hasAttribute(PROCESSED_ATTR);
const markProcessed = (img: HTMLImageElement) =>
    img.setAttribute(PROCESSED_ATTR, "true");
const unmarkProcessed = (img: HTMLImageElement) =>
    img.removeAttribute(PROCESSED_ATTR);

/**
 * Images handed to the IntersectionObserver that have not become visible yet.
 *
 * IntersectionObserver holds a *strong* reference to every observed target, so
 * a thumbnail that YouTube discards during infinite scroll before it ever
 * scrolls into view is kept alive forever. (A WeakRef cannot help: the
 * observer's own reference is what keeps the element reachable.) Only
 * unobserve() releases it, so track the pending set and sweep it.
 */
const pendingImgs = new Set<HTMLImageElement>();
const SWEEP_THRESHOLD = 200;

// Mounts directly rather than via a per-image event listener: stop() has no
// handle on such listeners, and a stale one surviving a stop/start cycle
// would double-mount next to the fresh one.
const intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        const img = entry.target;
        if (!entry.isIntersecting || !(img instanceof HTMLImageElement)) {
            continue;
        }
        metricsProxy.visibleThumbnails++;
        intersectionObserver.unobserve(img);
        pendingImgs.delete(img);
        mountOverlay(img);
    }
});

// YouTube recycles video cards during SPA navigation: the <img> stays put
// while its src and the anchor's href change. Replace the badge container
// whenever the video behind a mounted thumbnail changes.
const srcObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        const img = mutation.target;
        if (!(img instanceof HTMLImageElement)) continue;

        const videoUrl =
            img.closest<HTMLAnchorElement>(WATCH_LINK_SELECTOR)?.href;
        const container = img
            .closest(`.${CSS.THUMBNAIL_WRAPPER}`)
            ?.querySelector<HTMLElement>(`.${CSS.CONTAINER}`);
        if (!videoUrl || !container || videoUrl === container.dataset.href) {
            continue;
        }

        const newContainer = createEmbedContainer(videoUrl);
        container.replaceWith(newContainer);
        void initEmbed(newContainer, videoUrl);
    }
});

function sweepDetachedImgs(): void {
    for (const img of pendingImgs) {
        if (img.isConnected) continue;
        intersectionObserver.unobserve(img);
        pendingImgs.delete(img);
        unmarkProcessed(img);
    }
}

function observeVisibility(img: HTMLImageElement): void {
    intersectionObserver.observe(img);
    pendingImgs.add(img);
    if (pendingImgs.size > SWEEP_THRESHOLD) sweepDetachedImgs();
    metricsProxy.observedThumbnails++;
}

/**
 * Moves the <img> into a wrapper (the container-query root) and appends the
 * badge container as its sibling.
 */
function mountOverlay(img: HTMLImageElement): void {
    const videoUrl = img.closest<HTMLAnchorElement>(WATCH_LINK_SELECTOR)?.href;
    const imgParent = img.parentElement;
    if (!videoUrl || !imgParent) return;

    const wrapper = document.createElement("div");
    wrapper.classList.add(CSS.THUMBNAIL_WRAPPER);
    imgParent.appendChild(wrapper);
    wrapper.appendChild(img);

    const container = createEmbedContainer(videoUrl);
    wrapper.appendChild(container);
    void initEmbed(container, videoUrl);

    srcObserver.observe(img, { attributes: true, attributeFilter: ["src"] });
}

/** Thumbnail <img>s inside `root`, plus `root` itself when it is one. */
function findThumbnailImgs(root: ParentNode): HTMLImageElement[] {
    const imgs = Array.from(
        root.querySelectorAll<HTMLImageElement>(THUMBNAIL_SELECTOR),
    );
    if (root instanceof HTMLImageElement && root.matches(THUMBNAIL_SELECTOR)) {
        imgs.push(root);
    }
    return imgs;
}

// ─── Public API ──────────────────────────────────────────────────────

/** Starts tracking every thumbnail in `root` that is not tracked yet. */
export function trackThumbnailsIn(root: ParentNode): void {
    for (const img of findThumbnailImgs(root)) {
        if (isProcessed(img)) continue;
        markProcessed(img);
        observeVisibility(img);
    }
}

/**
 * Stops observing and puts every <img> back under its own parent, which takes
 * the wrappers and badge containers with it, so the page looks untouched.
 */
export function stopThumbnails(): void {
    intersectionObserver.disconnect();
    srcObserver.disconnect();
    pendingImgs.clear();

    document
        .querySelectorAll<HTMLElement>(`.${CSS.THUMBNAIL_WRAPPER}`)
        .forEach((wrapper) => {
            const img = wrapper.querySelector(":scope > img");
            if (img) wrapper.replaceWith(img);
            else wrapper.remove();
        });

    document
        .querySelectorAll<HTMLImageElement>(`img[${PROCESSED_ATTR}]`)
        .forEach(unmarkProcessed);
}
