import { Settings } from "@/common/settings";
import { start, stop } from "./main";
import "./youtube/styles/index.scss";
import { getYtcfg } from "./youtube/ytcfg";

export default defineContentScript({
    matches: ["https://www.youtube.com/*", "https://youtube.com/*"],
    runAt: "document_end",
    cssInjectionMode: "manifest",

    async main() {
        await Settings.ready();

        getYtcfg();

        // `init: true` applies the stored value right away; afterwards the
        // storage listener follows the toggle from the popup or any tab.
        Settings.enabled.subscribe(() => {
            if (Settings.enabled.get()) start();
            else stop();
        }, true);
    },
});
