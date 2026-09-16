import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

// WxtVitest wires up the same auto-imports (`browser`, `logger`, ...), path
// aliases and import.meta.env that the extension code relies on, and swaps
// the `browser` global for @webext-core/fake-browser.
export default defineConfig({
    plugins: [WxtVitest()],
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "happy-dom",
        environmentOptions: {
            happyDOM: {
                // The content script builds absolute InnerTube URLs from
                // location.origin, so tests run "on" youtube.com.
                url: "https://www.youtube.com/",
                // Tests inject <script> tags to feed the ytcfg reader; the
                // page must not try to run them.
                settings: {
                    disableJavaScriptEvaluation: true,
                    disableJavaScriptFileLoading: true,
                    handleDisabledFileLoadingAsSuccess: true,
                },
            },
        },
    },
});
