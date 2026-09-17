import { describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// Renders the real settings popup into happy-dom. The manifest is faked
// (fakeBrowser has no getManifest) and the user agent is set per test.
async function renderPopup(
    userAgent: string,
    stored: Record<string, unknown> = {},
) {
    fakeBrowser.reset();
    await fakeBrowser.storage.local.set(stored);
    vi.spyOn(fakeBrowser.runtime, "getManifest").mockReturnValue({
        manifest_version: 3,
        name: "SubPeek",
        version: "1.1.0",
    });
    Object.defineProperty(navigator, "userAgent", {
        value: userAgent,
        configurable: true,
    });
    document.body.innerHTML = '<div id="app"></div>';

    vi.resetModules();
    await import("@/entrypoints/popup/scripts/main");
    await flush();
    return document.getElementById("app")!;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const EDGE_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0";
const CHROME_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
const FIREFOX_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0";

function feedbackContext(app: HTMLElement): string | null {
    const link = app.querySelector<HTMLAnchorElement>(".footer-feedback");
    return new URL(link!.href).searchParams.get("entry.883462684");
}

/** The favorite tags, in display order. */
function favoriteCodes(app: HTMLElement): (string | undefined)[] {
    return Array.from(app.querySelectorAll(".tag-code")).map((el) =>
        el.textContent?.trim(),
    );
}

describe("settings popup", () => {
    it("shows the version and the enabled switch", async () => {
        const app = await renderPopup(CHROME_UA);

        expect(app.querySelector(".version")?.textContent?.trim()).toBe(
            "1.1.0",
        );
        expect(
            app.querySelector<HTMLInputElement>(".switch-input")?.checked,
        ).toBe(true);
    });

    it("pre-fills the feedback form with the version and browser major", async () => {
        expect(feedbackContext(await renderPopup(CHROME_UA))).toBe(
            "1.1.0 Chrome 152",
        );
        // Edge's UA also carries a Chrome/ token; Edge must win.
        expect(feedbackContext(await renderPopup(EDGE_UA))).toBe(
            "1.1.0 Edge 152",
        );
        expect(feedbackContext(await renderPopup(FIREFOX_UA))).toBe(
            "1.1.0 Firefox 148",
        );
    });

    it("lists the favorite languages and removes one on click", async () => {
        const app = await renderPopup(CHROME_UA, {
            "SETTINGS:langCodes": ["en", "ja"],
        });
        expect(favoriteCodes(app)).toEqual(["en", "ja"]);

        app.querySelector<HTMLButtonElement>(".tag-remove")!.click();
        await flush();

        expect(favoriteCodes(app)).toEqual(["ja"]);
    });

    it("moves a favorite down from its context menu", async () => {
        const app = await renderPopup(CHROME_UA, {
            "SETTINGS:langCodes": ["en", "ja", "fr"],
        });

        app.querySelector('.language-tag[data-code="en"]')!.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        );
        const moveDown = Array.from(
            app.querySelectorAll<HTMLButtonElement>(".ctx-menu-item"),
        ).find((button) => button.textContent?.includes("Move down"))!;
        moveDown.click();
        await flush();

        expect(favoriteCodes(app)).toEqual(["ja", "en", "fr"]);
    });

    it("re-renders when the stored switch state changes elsewhere", async () => {
        const app = await renderPopup(CHROME_UA);

        await fakeBrowser.storage.local.set({ "SETTINGS:enabled": false });

        expect(
            app.querySelector<HTMLInputElement>(".switch-input")?.checked,
        ).toBe(false);
    });
});
