import {
    listenForMessages,
    messaging,
    type MessageHandlers,
} from "@/common/messaging";
import type { CacheEntry } from "@/common/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// fakeBrowser delivers runtime.sendMessage() to the onMessage listeners of the
// same process, so both sides of the protocol can be exercised together.

const entry: CacheEntry = {
    videoId: "abc",
    data: { captions: [], audioTracks: [] },
    timestamp: 1,
};

function handlers(overrides: Partial<MessageHandlers> = {}): MessageHandlers {
    return {
        getCachedVideoInfo: vi.fn(async ({ videoId }: { videoId: string }) =>
            videoId === "abc" ? entry : null,
        ),
        saveVideoInfo: vi.fn(async () => {}),
        openOptionsPage: vi.fn(async () => {}),
        ...overrides,
    };
}

describe("messaging", () => {
    beforeEach(() => fakeBrowser.reset());

    it("routes each message to its handler and returns the reply", async () => {
        const h = handlers();
        listenForMessages(h);

        await expect(messaging.getCachedVideoInfo("abc")).resolves.toEqual(
            entry,
        );
        await expect(messaging.getCachedVideoInfo("zzz")).resolves.toBeNull();

        await messaging.saveVideoInfo("abc", entry.data);
        expect(h.saveVideoInfo).toHaveBeenCalledWith({
            type: "saveVideoInfo",
            videoId: "abc",
            info: entry.data,
        });

        await messaging.openOptionsPage();
        expect(h.openOptionsPage).toHaveBeenCalledWith({
            type: "openOptionsPage",
        });
    });

    it("leaves messages that are not part of the protocol to other listeners", async () => {
        const h = handlers();
        listenForMessages(h);

        // No listener claims these, so fakeBrowser resolves with undefined.
        await expect(
            fakeBrowser.runtime.sendMessage({ type: "somethingElse" }),
        ).resolves.toBeUndefined();
        await expect(
            fakeBrowser.runtime.sendMessage("plain string"),
        ).resolves.toBeUndefined();

        expect(h.getCachedVideoInfo).not.toHaveBeenCalled();
        expect(h.saveVideoInfo).not.toHaveBeenCalled();
        expect(h.openOptionsPage).not.toHaveBeenCalled();
    });

    it("logs a failing handler and still replies so the sender does not hang", async () => {
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});
        listenForMessages(
            handlers({
                getCachedVideoInfo: async () => {
                    throw new Error("db down");
                },
            }),
        );

        await expect(
            messaging.getCachedVideoInfo("abc"),
        ).resolves.toBeUndefined();
        expect(consoleError).toHaveBeenCalledWith(
            "[SubPeek] ERROR",
            expect.stringContaining("getCachedVideoInfo"),
            expect.any(Error),
        );
        consoleError.mockRestore();
    });
});
