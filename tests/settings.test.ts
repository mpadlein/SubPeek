import { describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// The storage wrapper is a singleton with an in-memory copy of storage, so
// every test starts from fresh modules on top of a reset fake browser.
async function load(stored: Record<string, unknown> = {}) {
    fakeBrowser.reset();
    await fakeBrowser.storage.local.set(stored);
    vi.resetModules();
    const { Settings } = await import("@/common/settings");
    await Settings.ready();
    return Settings;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Settings", () => {
    it("falls back to the defaults when storage is empty", async () => {
        const Settings = await load();

        expect(Settings.enabled.get()).toBe(true);
        expect(Settings.langCodes.get()).toEqual(["en"]);
    });

    it("reads stored values on ready()", async () => {
        const Settings = await load({
            "SETTINGS:enabled": false,
            "SETTINGS:langCodes": ["fr", "de"],
        });

        expect(Settings.enabled.get()).toBe(false);
        expect(Settings.langCodes.get()).toEqual(["fr", "de"]);
    });

    it("keeps favorites unique and in insertion order", async () => {
        const Settings = await load();

        Settings.langCodes.add("fr");
        Settings.langCodes.add("fr");
        expect(Settings.langCodes.get()).toEqual(["en", "fr"]);

        Settings.langCodes.remove("en");
        expect(Settings.langCodes.get()).toEqual(["fr"]);
    });

    it("persists writes to browser.storage.local", async () => {
        const Settings = await load();

        Settings.enabled.set(false);
        await flush();

        expect(await fakeBrowser.storage.local.get("SETTINGS:enabled")).toEqual(
            { "SETTINGS:enabled": false },
        );
    });

    it("notifies subscribers of changes made in another context", async () => {
        const Settings = await load();
        const listener = vi.fn();
        Settings.enabled.subscribe(listener);

        // The popup page writes through its own storage wrapper; the only
        // link to this context is the storage.onChanged event.
        await fakeBrowser.storage.local.set({ "SETTINGS:enabled": false });

        expect(listener).toHaveBeenCalledOnce();
        expect(Settings.enabled.get()).toBe(false);
    });

    it("calls a subscriber right away when init is requested", async () => {
        const Settings = await load();
        const listener = vi.fn();

        Settings.langCodes.subscribe(listener, true);

        expect(listener).toHaveBeenCalledOnce();
    });

    it("stops notifying once unsubscribed", async () => {
        const Settings = await load();
        const listener = vi.fn();
        const unsubscribe = Settings.enabled.subscribe(listener);

        unsubscribe();
        await fakeBrowser.storage.local.set({ "SETTINGS:enabled": false });

        expect(listener).not.toHaveBeenCalled();
    });

    it("keeps notifying the other subscribers when one throws", async () => {
        const Settings = await load();
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        const bad = vi.fn(() => {
            throw new Error("boom");
        });
        const good = vi.fn();
        Settings.langCodes.subscribe(bad);
        Settings.langCodes.subscribe(good);

        await fakeBrowser.storage.local.set({ "SETTINGS:langCodes": ["ja"] });

        expect(good).toHaveBeenCalledOnce();
        expect(consoleError).toHaveBeenCalledOnce();
        consoleError.mockRestore();
    });

    it("works when add and remove are detached from Settings", async () => {
        const Settings = await load();
        const { add, remove } = Settings.langCodes;

        add("fr");
        remove("en");

        expect(Settings.langCodes.get()).toEqual(["fr"]);
    });
});
