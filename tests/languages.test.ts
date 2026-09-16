import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// Settings keeps an in-memory copy of storage, so every test gets fresh
// modules on top of a reset fake browser.
async function load(favorites: string[], browserLanguage = "en-US") {
    fakeBrowser.reset();
    Object.defineProperty(navigator, "language", {
        value: browserLanguage,
        configurable: true,
    });
    vi.resetModules();
    const { Settings } = await import("@/common/settings");
    Settings.langCodes.set(favorites);
    return import("@/entrypoints/popup/scripts/lib/languages");
}

describe("getPopularLanguages", () => {
    beforeEach(() => fakeBrowser.reset());

    it("orders favorites, then recommended, then the popular list", async () => {
        const { getPopularLanguages } = await load(["ja", "de"]);
        const codes = getPopularLanguages().map((l) => l.code);

        expect(codes.slice(0, 3)).toEqual(["ja", "de", "en"]);
        expect(codes.slice(3, 6)).toEqual(["es", "pt", "ru"]);
        expect(codes).toHaveLength(18);
    });

    it("recommends the browser language next to English", async () => {
        const { getPopularLanguages } = await load([], "fr");
        const languages = getPopularLanguages();

        expect(languages.slice(0, 2).map((l) => l.code)).toEqual(["en", "fr"]);
        expect(languages[1]?.isRecommended).toBe(true);
        expect(languages[2]?.isRecommended).toBe(false);
    });
});

describe("getLanguagesFilter", () => {
    it("matches on name, native name and code, prefix matches first", async () => {
        const { getLanguagesFilter } = await load([]);
        const results = getLanguagesFilter("ja");

        expect(results[0]?.code).toBe("ja");
        for (const lang of results) {
            const haystack = [lang.code, lang.name, lang.nativeName]
                .join(" ")
                .toLowerCase();
            expect(haystack).toContain("ja");
        }
    });

    it("is case-insensitive and keeps favorites first within a match tier", async () => {
        const { getLanguagesFilter } = await load(["pt"]);
        const codes = getLanguagesFilter("PORT").map((l) => l.code);

        expect(codes[0]).toBe("pt");
        expect(codes).toContain("pt-BR");
    });

    it("returns nothing for a query that matches no language", async () => {
        const { getLanguagesFilter } = await load([]);
        expect(getLanguagesFilter("zzzz")).toEqual([]);
    });
});

describe("getNameOfCode", () => {
    it("falls back to the code itself for unknown languages", async () => {
        const { getNameOfCode } = await load([]);
        expect(getNameOfCode("fr")).toBe("French");
        expect(getNameOfCode("xx-XX")).toBe("xx-XX");
    });
});
