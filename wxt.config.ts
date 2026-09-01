import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        name: "YouTube Subtitles Extension",
        description: "Display subtitle availability on YouTube videos",
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
