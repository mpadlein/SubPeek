import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

vi.mock("@/entrypoints/content/youtube/api", () => ({
    resolveVideoInfo: vi.fn(() => new Promise(() => {})),
}));

// thumbnails.ts mounts the overlay from its IntersectionObserver callback;
// hand the module a fake whose callback a test can fire by hand.
type Intersection = (entries: Partial<IntersectionObserverEntry>[]) => void;
const intersections: Intersection[] = [];
vi.stubGlobal(
    "IntersectionObserver",
    class {
        constructor(callback: Intersection) {
            intersections.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

const STATE_ATTR = "data-ytbext-filter";
const stateOf = (id: string) =>
    document.getElementById(id)!.getAttribute(STATE_ATTR);

/**
 * A search-result card whose thumbnail links to `href`. The image sits in a
 * box inside the anchor, as on YouTube; the thumbnail selector needs that.
 */
function card(id: string, href: string): string {
    return `<ytd-video-renderer id="${id}"><a href="${href}"><div><img src="${id}.jpg"></div></a></ytd-video-renderer>`;
}

async function loadThumbnails() {
    fakeBrowser.reset();
    document.body.innerHTML = "";
    vi.resetModules();
    const { Settings } = await import("@/common/settings");
    await Settings.ready();
    return import("@/entrypoints/content/youtube/thumbnails");
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("trackThumbnailsIn", () => {
    it("marks the card of a watch thumbnail as pending for the filter", async () => {
        const { trackThumbnailsIn, stopThumbnails } = await loadThumbnails();
        document.body.innerHTML = card("video", "/watch?v=abc");

        trackThumbnailsIn(document);

        expect(stateOf("video")).toBe("pending");
        stopThumbnails();
    });

    it("leaves a card it does not track without a state", async () => {
        const { trackThumbnailsIn, stopThumbnails } = await loadThumbnails();
        document.body.innerHTML =
            card("short", "/shorts/abc") + card("list", "/playlist?list=PL1");

        trackThumbnailsIn(document);

        expect(stateOf("short")).toBeNull();
        expect(stateOf("list")).toBeNull();
        stopThumbnails();
    });

    it("leaves a known card alone when another thumbnail in it is tracked", async () => {
        const { trackThumbnailsIn, stopThumbnails } = await loadThumbnails();
        document.body.innerHTML = card("video", "/watch?v=abc");
        trackThumbnailsIn(document);
        const known = document.getElementById("video")!;
        known.setAttribute(STATE_ATTR, "shown");

        // YouTube adds a second image under the same watch link (a hover
        // asset, say); the card's video has not changed.
        known
            .querySelector("a > div")!
            .insertAdjacentHTML("beforeend", '<img src="hover.jpg">');
        trackThumbnailsIn(document);

        expect(stateOf("video")).toBe("shown");
        stopThumbnails();
    });

    it("puts a recycled card back to pending when its video changes", async () => {
        const { trackThumbnailsIn, stopThumbnails } = await loadThumbnails();
        document.body.innerHTML = card("video", "/watch?v=abc");
        trackThumbnailsIn(document);
        const img = document.querySelector("img")!;
        intersections.at(-1)!([{ target: img, isIntersecting: true }]);
        const known = document.getElementById("video")!;
        known.setAttribute(STATE_ATTR, "hidden");

        // YouTube reuses the card for another video: the anchor's href and
        // the image's src change, the elements stay put.
        known.querySelector("a")!.setAttribute("href", "/watch?v=xyz");
        img.setAttribute("src", "xyz.jpg");
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(stateOf("video")).toBe("pending");
        stopThumbnails();
    });

    it("marks a thumbnail once", async () => {
        const { trackThumbnailsIn, stopThumbnails } = await loadThumbnails();
        document.body.innerHTML = card("video", "/watch?v=abc");
        trackThumbnailsIn(document);
        document.getElementById("video")!.setAttribute(STATE_ATTR, "shown");

        trackThumbnailsIn(document);

        expect(stateOf("video")).toBe("shown");
        stopThumbnails();
    });
});
