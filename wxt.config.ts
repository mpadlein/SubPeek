import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        name: "SubPeek - Caption & Dub Labels for YouTube",
        description:
            "See which YouTube videos have captions and dubbed audio in your languages, right on the thumbnail.",
        permissions: ["storage"],
        host_permissions: [
            "https://www.youtube.com/*",
            "https://youtube.com/*",
        ],
        // The settings UI doubles as the options page so the gear button in the
        // in-page track popup has something to open.
        options_ui: {
            page: "popup.html",
            open_in_tab: true,
        },
    },
    srcDir: "src",
});
