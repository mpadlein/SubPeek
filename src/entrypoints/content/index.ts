import { browserStorageLocalSV } from "@/common/storage";
import start from "./main";
import "./youtube/styles/_debugging.scss";
import "./youtube/styles/_embed-thumbnail.scss";
import "./youtube/styles/_popup.scss";
import "./youtube/styles/_tooltip.scss";
import "./youtube/styles/index.scss";
import { whenYtcfgReady } from "./youtube/ytcfg";

export default defineContentScript({
    matches: ["https://www.youtube.com/*", "https://youtube.com/*"],
    runAt: "document_end",
    cssInjectionMode: "manifest",

    async main() {
        await browserStorageLocalSV.ready();
        await whenYtcfgReady();
        start();
    },
});
