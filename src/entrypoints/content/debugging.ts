import { html, render } from "lit-html";

const metrics = {
    fetchInnerTube: 0,
    fetchFallback: 0,
    rateLimited: 0,
    cacheHit: 0,
    observedThumbnails: 0,
    visibleThumbnails: 0,
};

export const metricsProxy = new Proxy(metrics, {
    get(target, prop: string) {
        return prop in target ? target[prop as keyof typeof target] : 0;
    },
    set(target, prop: string, value) {
        target[prop as keyof typeof target] = value;
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
            <button class="ytb-debugging-toggle" @click=${toggleOpen}>
                dbg
            </button>
        `;
    }

    return html`
        <button class="ytb-debugging-toggle" @click=${toggleOpen}>×</button>
        <table>
            ${Object.entries(metrics).map(
                ([key, value]) => html`
                    <tr>
                        <td class="ytb-debugging-key">${key}</td>
                        <td class="ytb-debugging-value">${value}</td>
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

function init() {
    container = document.createElement("div");
    container.id = "ytb-debugging";
    document.body.appendChild(container);
    updateMetrics();
}

if (import.meta.env.DEV) {
    init();
}
