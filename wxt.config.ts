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
    },
    srcDir: "src",
});
