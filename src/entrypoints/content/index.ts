import { browserStorageLocalSV } from "@/common/storage";
import start from "./main";
import "./youtube/styles/index.scss";
import { getYtcfg } from "./youtube/ytcfg";

export default defineContentScript({
    matches: ["https://www.youtube.com/*", "https://youtube.com/*"],
    runAt: "document_end",
    cssInjectionMode: "manifest",

    async main() {
        await browserStorageLocalSV.ready();

        getYtcfg();
        start();
    },
});
