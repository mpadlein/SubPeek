import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: ({ browser }) => ({
        name: "SubPeek - Caption & Dub Labels for YouTube",
        description:
            "See which YouTube videos have captions and dubbed audio in your languages, right on the thumbnail.",
        permissions: ["storage"],
        host_permissions: [
            "https://www.youtube.com/*",
            "https://youtube.com/*",
        ],
        // Floor set by `@container` queries in the content-script CSS
        // (Chrome 105 / Firefox 110); AbortSignal.timeout needs 103 / 100.
        // Keep in sync with `vite.build.target` below.
        minimum_chrome_version: "105",
        // The settings UI doubles as the options page so the gear button in the
        // in-page track popup has something to open.
        options_ui: {
            page: "popup.html",
            open_in_tab: true,
        },
        // Chrome warns about unrecognized manifest keys, so only emit the
        // Firefox-specific block when building for Firefox.
        ...(browser === "firefox" && {
            browser_specific_settings: {
                gecko: {
                    id: "subpeek2@mpadlein",
                    strict_min_version: "110.0",
                    data_collection_permissions: { required: ["none"] },
                },
            },
        }),
    }),
    srcDir: "src",
    // Transpile to the same browsers the manifest admits, instead of Vite's
    // default "baseline-widely-available" (chrome111 / firefox114).
    vite: () => ({
        build: { target: ["chrome105", "firefox110"] },
    }),
    zip: {
        // Keep local-only and non-build files out of the AMO sources zip.
        excludeSources: [
            "docs/**",
            ".temp/**",
            "store-assets/**",
            "probes/**",
            "CLAUDE.md",
            "TODO.md",
        ],
    },
});
