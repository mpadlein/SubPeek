import { balancedObject } from "@/entrypoints/content/youtube/ytcfg";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("balancedObject", () => {
    it("returns the object literal that starts at the given index", () => {
        const text = 'var x = {"a":{"b":[1,2]}}; more';
        expect(balancedObject(text, text.indexOf("{"))).toBe(
            '{"a":{"b":[1,2]}}',
        );
    });

    it("ignores braces inside strings", () => {
        const text = '{"code":"if (x) { return {}; }"} tail';
        expect(balancedObject(text, 0)).toBe(
            '{"code":"if (x) { return {}; }"}',
        );
    });

    it("ignores escaped quotes inside strings", () => {
        const text = '{"say":"he said \\"}\\" and left"}';
        expect(balancedObject(text, 0)).toBe(text);
    });

    it("returns null when the object is never closed", () => {
        expect(balancedObject('{"a":{"b":1}', 0)).toBeNull();
    });
});

describe("getYtcfg", () => {
    // getYtcfg() memoises its result, so every test gets a fresh module.
    async function loadYtcfg(scripts: string) {
        document.head.innerHTML = scripts;
        vi.resetModules();
        const { getYtcfg } =
            await import("@/entrypoints/content/youtube/ytcfg");
        return getYtcfg();
    }

    beforeEach(() => {
        document.head.innerHTML = "";
    });

    it("merges the keys it needs from every ytcfg.set() call", async () => {
        const cfg = await loadYtcfg(`
            <script>ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"clientVersion":"2.20260901"}},"OTHER":1});</script>
            <script>window.ytcfg.set({"STS":20260,"LOGGED_IN":true,"INNERTUBE_CONTEXT_CLIENT_NAME":1});</script>
        `);
        expect(cfg).toEqual({
            context: { client: { clientVersion: "2.20260901" } },
            clientName: 1,
            sts: 20260,
            loggedIn: true,
        });
    });

    it("skips external scripts, unrelated scripts and unparsable calls", async () => {
        const cfg = await loadYtcfg(`
            <script src="https://www.youtube.com/s/desktop/base.js"></script>
            <script>var unrelated = {"INNERTUBE_CONTEXT":"decoy"};</script>
            <script>ytcfg.set({not json});</script>
            <script>ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"clientVersion":"2.1"}}});</script>
        `);
        expect(cfg?.context.client.clientVersion).toBe("2.1");
        expect(cfg?.loggedIn).toBe(false);
    });

    it("returns null when no script carries an InnerTube context", async () => {
        const cfg = await loadYtcfg(`<script>ytcfg.set({"STS":1});</script>`);
        expect(cfg).toBeNull();
    });

    it("reads the page once and keeps the result", async () => {
        document.head.innerHTML = `<script>ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"clientVersion":"2.1"}}});</script>`;
        vi.resetModules();
        const { getYtcfg } =
            await import("@/entrypoints/content/youtube/ytcfg");
        const first = getYtcfg();
        document.head.innerHTML = `<script>ytcfg.set({"INNERTUBE_CONTEXT":{"client":{"clientVersion":"9.9"}}});</script>`;
        expect(getYtcfg()).toBe(first);
        expect(first?.context.client.clientVersion).toBe("2.1");
    });
});
