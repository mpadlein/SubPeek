// Content script for YouTube caption display
import { loadSettings } from "@/common/storage";
import { startObserver } from "./youtube";
import "./youtube/styles/_badge.scss";
import "./youtube/styles/_debugging.scss";
import "./youtube/styles/_popup.scss";
import "./youtube/styles/_tooltip.scss";
import "./youtube/styles/index.scss";

export default defineContentScript({
    matches: ["https://www.youtube.com/*", "https://youtube.com/*"],
    runAt: "document_end",
    cssInjectionMode: "manifest",

    main() {
        startObserver();
        loadSettings().then((settings) => {
            console.log("settings", settings);
        });
    },
});
