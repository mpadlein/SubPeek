import { BRIDGE, type YtcfgSnapshot } from "../constants";

/**
 * ISOLATED-world half of the ytcfg bridge.
 *
 * The listener is registered at module load (document_start), well before
 * ytcfg-bridge.content.ts posts at document_end, so the message can never be
 * missed. Resolves to `null` when the page has no usable config — callers
 * should fall back to scraping the watch page.
 */

/**
 * Safety net for the bridge never reporting at all: a browser that ignores
 * `world: "MAIN"`, or a page where the script failed to run. Without it the
 * content script would wait forever and render no badges.
 */
const BRIDGE_TIMEOUT_MS = 5_000;

let settle: (value: YtcfgSnapshot | null) => void;
const ready = new Promise<YtcfgSnapshot | null>((resolve) => {
    settle = resolve;
});

let timer: ReturnType<typeof setTimeout>;

function finish(value: YtcfgSnapshot | null) {
    clearTimeout(timer);
    window.removeEventListener("message", onMessage);
    settle(value);
}

function onMessage(event: MessageEvent) {
    // Same-window, same-origin only. The payload never contributes to a URL —
    // the InnerTube endpoint is built from location.origin — so a spoofed
    // message can at worst cause a failed request and a fallback.
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    if (event.data?.type !== BRIDGE.YTCFG_RESPONSE) return;

    const payload = event.data.payload;

    if (!payload?.context?.client) {
        logger.warn(
            "ytcfg bridge reported no config; using watch-page fallback",
        );
        finish(null);
        return;
    }

    logger.debug("ytcfg bridge reported", payload);

    finish({
        context: payload.context,
        clientName: payload.clientName,
        sts: payload.sts,
        loggedIn: !!payload.loggedIn,
    });
}

window.addEventListener("message", onMessage);

timer = setTimeout(() => {
    logger.warn("ytcfg bridge did not report in; using watch-page fallback");
    finish(null);
}, BRIDGE_TIMEOUT_MS);

/**
 * Resolves once the MAIN-world bridge reports in (or the wait times out).
 * Safe to await repeatedly - it is the same promise every time.
 */
export function whenYtcfgReady(): Promise<YtcfgSnapshot | null> {
    return ready;
}
