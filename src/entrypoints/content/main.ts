import { CSS, EVENT } from "./constants";
import { metricsProxy } from "./debugging";
import { initEmbed } from "./youtube/ui/embed";

logger.debug("Content script loaded");

const srcObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        const img = mutation.target as HTMLImageElement;
        const anchor = img.closest('a[href^="/watch?"]') as HTMLAnchorElement;
        if (!anchor) continue;

        const newVideoUrl = anchor.href;
        const wrapper = img.closest(`.${CSS.THUMBNAIL_WRAPPER}`);
        const container = wrapper?.querySelector(
            `.${CSS.CONTAINER}`,
        ) as HTMLElement;
        if (
            !container ||
            !newVideoUrl ||
            newVideoUrl === container.dataset.href
        )
            continue;

        const newContainer = createEmbedContainer(newVideoUrl);
        container.replaceWith(newContainer);
        initEmbed(newContainer, newVideoUrl);
    }
});

const intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            metricsProxy.itsOsvMatch++;
            const element = entry.target as HTMLElement;
            element.dispatchEvent(new CustomEvent(EVENT.ELEMENT_VISIBLE));
            intersectionObserver.unobserve(element);
        }
    }
});

const setImgTagProcessed = (img: HTMLImageElement) => {
    img.setAttribute("data-ytbext-processed", "true");
};
const removeImgTagProcessed = (img: HTMLImageElement) => {
    img.removeAttribute("data-ytbext-processed");
};
const getImgTagProcessed = (img: HTMLImageElement) => {
    return img.getAttribute("data-ytbext-processed") === "true";
};

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

function sweepDetachedImgs() {
    for (const img of pendingImgs) {
        if (img.isConnected) continue;
        intersectionObserver.unobserve(img);
        pendingImgs.delete(img);
        removeImgTagProcessed(img);
    }
}

function observeImg(img: HTMLImageElement) {
    // once: a swept-then-readded img goes through observeImg again, and a
    // second permanent listener would double-mount on a single dispatch.
    img.addEventListener(
        EVENT.ELEMENT_VISIBLE,
        () => {
            pendingImgs.delete(img);
            mountOverlay(img);
        },
        { once: true },
    );

    intersectionObserver.observe(img);
    pendingImgs.add(img);
    if (pendingImgs.size > SWEEP_THRESHOLD) sweepDetachedImgs();
    metricsProxy.itsOsv++;
}

const imgAddedObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const element = node as HTMLElement;

                findPreviews(element).forEach(watchPreview);

                let imgs: HTMLImageElement[] = [];
                switch (element.tagName) {
                    case "IMG":
                        if (element.closest('a[href^="/watch?"]')) {
                            imgs.push(element as HTMLImageElement);
                        }
                        break;
                    case "A":
                        if (
                            element.getAttribute("href")?.startsWith("/watch?")
                        ) {
                            const img = element.querySelector(
                                ":not(.ytThumbnailViewModelBlurredImage) > img",
                            ) as HTMLImageElement;
                            if (img) imgs.push(img);
                        }
                        break;
                    default:
                        imgs.push(
                            ...(element.querySelectorAll(
                                'a[href^="/watch?"] :not(.ytThumbnailViewModelBlurredImage) > img',
                            ) as NodeListOf<HTMLImageElement>),
                        );
                        break;
                }

                imgs.forEach((img) => {
                    if (getImgTagProcessed(img)) return;
                    setImgTagProcessed(img);
                    observeImg(img);
                });
            });
        }
    }
});

function createEmbedContainer(videoUrl: string): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add(
        CSS.CONTAINER,
        CSS.CONTAINER_THUMBNAIL,
        CSS.CORNER_BOTTOM_LEFT,
    );
    container.dataset.href = videoUrl;
    container.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
    return container;
}

function mountOverlay(img: HTMLImageElement) {
    const anchor = img.closest('a[href^="/watch?"]') as HTMLAnchorElement;
    if (!anchor) return;

    const videoUrl = anchor.href;
    if (!videoUrl) return;

    const imgParent = img.parentElement as HTMLElement;
    if (!imgParent) {
        return;
    }

    const wrapper = document.createElement("div");
    imgParent.appendChild(wrapper);

    wrapper.classList.add(CSS.THUMBNAIL_WRAPPER);

    wrapper.appendChild(img);

    const container = createEmbedContainer(videoUrl);
    wrapper.appendChild(container);
    initEmbed(container, videoUrl);

    srcObserver.observe(img, { attributes: true, attributeFilter: ["src"] });
}

// ─── Inline hover preview ────────────────────────────────────────────
//
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
const watchedPreviews = new WeakSet<Element>();

const previewObserver = new MutationObserver((mutations) => {
    const previews = new Set<HTMLElement>();
    for (const mutation of mutations) {
        const preview = (mutation.target as Element).closest(PREVIEW_SELECTOR);
        if (preview) previews.add(preview as HTMLElement);
    }
    previews.forEach((preview) => syncPreviewOverlay(preview));
});

function watchPreview(preview: HTMLElement) {
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

function syncPreviewOverlay(preview: HTMLElement) {
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

function findPreviews(element: HTMLElement): HTMLElement[] {
    if (element.matches(PREVIEW_SELECTOR)) return [element];
    return Array.from(element.querySelectorAll<HTMLElement>(PREVIEW_SELECTOR));
}

export default function start(): void {
    imgAddedObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    document
        .querySelectorAll<HTMLElement>(PREVIEW_SELECTOR)
        .forEach(watchPreview);

    document
        .querySelectorAll<HTMLImageElement>(
            'a[href^="/watch?"] :not(.ytThumbnailViewModelBlurredImage) > img',
        )
        .forEach((img) => {
            if (getImgTagProcessed(img)) return;
            setImgTagProcessed(img);
            observeImg(img);
        });
}
