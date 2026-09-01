import { BRIDGE, type YtcfgSnapshot } from "./content/constants";

export default defineContentScript({
    matches: ["https://www.youtube.com/*", "https://youtube.com/*"],
    world: "MAIN",
    runAt: "document_end",

    main() {
        const post = (payload: YtcfgSnapshot | null) => {
            window.postMessage(
                { type: BRIDGE.YTCFG_RESPONSE, payload },
                location.origin,
            );
        };

        const cfg = (window as any).ytcfg?.data_;
        const context = cfg?.INNERTUBE_CONTEXT;

        if (!context?.client) {
            logger.error(
                "ytcfg not found in page context — InnerTube disabled, falling back to watch-page scraping",
            );
            post(null);
            return;
        }

        logger.debug("ytcfg found", cfg);

        post({
            context,
            clientName: cfg.INNERTUBE_CONTEXT_CLIENT_NAME,
            sts: cfg.STS,
            loggedIn: !!cfg.LOGGED_IN,
        });
    },
});
