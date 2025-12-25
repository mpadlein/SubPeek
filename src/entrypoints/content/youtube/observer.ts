/**
 * Flow:
 * - Card observer: detect new card
 * - Intersection observer: detect card view port
 * - Anchor observer: detect anchor changes href -> rerender card
 */

import { EVENT } from "./constants";
import { metricsProxy } from "./debugging";
import { getAllTags, getCardClass } from "./video-card/registry";

export const videoCardIntersectionObserver = new IntersectionObserver(
    (entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                metricsProxy.itsOsvMatch++;
                const element = entry.target as HTMLElement;
                element.dispatchEvent(new CustomEvent(EVENT.ELEMENT_VISIBLE));
                videoCardIntersectionObserver.unobserve(element);
            }
        }
    },
);

function handleElement(element: HTMLElement): void {
    const cls = getCardClass(element);
    if (!cls) return;
    new cls(element);
    videoCardIntersectionObserver.observe(element);
    metricsProxy.itsOsv++;
}

const videoCardObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === "childList") {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                const element = node as HTMLElement;
                handleElement(element);
            });
        }
    }
});

export function startObserver(): void {
    document
        .querySelectorAll(getAllTags().join(","))
        .forEach((e) => handleElement(e as HTMLElement));
    videoCardObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
}
