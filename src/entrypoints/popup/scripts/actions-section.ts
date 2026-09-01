import { EXTENSION_EVENTS } from "@/common/constants";
import { html, nothing } from "lit-html";

export function createActionsSection(rerender: () => void) {
    let cacheCount: number | null = null;
    let cleared = false;

    function fetchCacheStats() {
        browser.runtime
            .sendMessage({ event: EXTENSION_EVENTS.getCacheSize })
            .then((data?: { count?: number }) => {
                cacheCount = data?.count ?? null;
                rerender();
            })
            .catch((error) => {
                // Background worker asleep or extension reloading.
                logger.error("Could not read cache stats:", error);
            });
    }

    function handleClearCache() {
        browser.runtime.sendMessage({ event: EXTENSION_EVENTS.clearCache });
        cleared = true;
        rerender();
        setTimeout(() => {
            cleared = false;
            fetchCacheStats();
        }, 1500);
    }

    fetchCacheStats();

    return function template() {
        return html`
            <section class="settings-card actions-card">
                <button
                    id="btn-clear-cache"
                    class="btn btn-secondary"
                    @click=${handleClearCache}
                >
                    ${cleared
                        ? html`Cleared!`
                        : html`
                              <svg viewBox="0 0 24 24" fill="none">
                                  <path
                                      d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"
                                      stroke="currentColor"
                                      stroke-width="2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                  />
                              </svg>
                              Clear Cache
                              ${cacheCount !== null
                                  ? html`<span>
                                        ${cacheCount}
                                        ${cacheCount === 1 ? "video" : "videos"}
                                    </span>`
                                  : nothing}
                          `}
                </button>
            </section>
        `;
    };
}
