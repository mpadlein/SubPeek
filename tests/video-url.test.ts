import { extractVideoId } from "@/entrypoints/content/youtube/video-url";
import { describe, expect, it } from "vitest";

describe("extractVideoId", () => {
    it("reads the v parameter of a watch URL", () => {
        expect(
            extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s"),
        ).toBe("dQw4w9WgXcQ");
    });

    it("returns null for a watch URL without a video id", () => {
        expect(
            extractVideoId("https://www.youtube.com/watch?list=PL123"),
        ).toBeNull();
    });

    it("returns null for something that is not a URL", () => {
        expect(extractVideoId("not a url")).toBeNull();
    });
});
