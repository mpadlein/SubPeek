import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

vi.mock("@/entrypoints/content/youtube/api", () => ({
    resolveVideoInfo: vi.fn(() => new Promise(() => {})),
}));

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
