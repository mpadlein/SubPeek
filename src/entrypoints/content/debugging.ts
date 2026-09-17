import { html, render } from "lit-html";
import { CSS_PREFIX } from "./constants";

// Dev-only metrics overlay. Production code increments `metricsProxy` freely:
// every write re-renders the overlay, which is a no-op while it is not
// mounted, and mountMetricsOverlay() itself is a no-op outside dev builds.

const OVERLAY_ID = `${CSS_PREFIX}-debugging`;
const CLASS_TOGGLE = `${OVERLAY_ID}-toggle`;
const CLASS_KEY = `${OVERLAY_ID}-key`;
const CLASS_VALUE = `${OVERLAY_ID}-value`;

const metrics = {
    fetchInnerTube: 0,
    fetchFallback: 0,
    rateLimited: 0,
    cacheHit: 0,
    observedThumbnails: 0,
    visibleThumbnails: 0,
};

type Metrics = typeof metrics;

const isMetric = (prop: string | symbol): prop is keyof Metrics =>
    typeof prop === "string" && prop in metrics;

export const metricsProxy = new Proxy(metrics, {
    get: (target, prop) => (isMetric(prop) ? target[prop] : 0),
    set(target, prop, value: number) {
        if (!isMetric(prop)) return false;
        target[prop] = value;
        updateMetrics();
        return true;
    },
});

let container: HTMLElement | null = null;
let open = true;

function toggleOpen() {
    open = !open;
    updateMetrics();
}

function metricsTemplate() {
    if (!open) {
        return html`
            <button class="${CLASS_TOGGLE}" @click=${toggleOpen}>dbg</button>
        `;
    }

    return html`
        <button class="${CLASS_TOGGLE}" @click=${toggleOpen}>×</button>
        <table>
            ${Object.entries(metrics).map(
                ([key, value]) => html`
                    <tr>
                        <td class="${CLASS_KEY}">${key}</td>
                        <td class="${CLASS_VALUE}">${value}</td>
                    </tr>
                `,
            )}
        </table>
    `;
}

function updateMetrics() {
    if (!container) return;
    render(metricsTemplate(), container);
}

/** Adds the overlay to the page; a no-op in production builds. */
export function mountMetricsOverlay(): void {
    if (!import.meta.env.DEV || container) return;
    container = document.createElement("div");
    container.id = OVERLAY_ID;
    document.body.appendChild(container);
    updateMetrics();
}

export function unmountMetricsOverlay(): void {
    container?.remove();
    container = null;
}
