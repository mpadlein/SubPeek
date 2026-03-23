import { Settings } from "@/common/settings";
import { html, nothing } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { getNameOfCode } from "./lib/languages";
import { initSortable, type SortableInstance } from "./lib/sortable";

export function createFavoritedLanguages(rerender: () => void) {
    let sortable: SortableInstance | null = null;
    let prevCodes: string[] = [];

    function handleRemove(code: string) {
        Settings.langCodes.remove(code);
    }

    function handleReorder(fromIndex: number, toIndex: number) {
        const codes = [...Settings.langCodes.get()];
        const [moved] = codes.splice(fromIndex, 1);
        codes.splice(toIndex, 0, moved);
        Settings.langCodes.set(codes);
        rerender();
    }

    function languageTagTemplate(code: string) {
        const name = getNameOfCode(code);
        return html`
            <span class="language-tag" data-code="${code}">
                <span class="tag-drag-handle" title="Drag to reorder">
                    <svg viewBox="0 0 24 24" fill="none">
                        <path
                            d="M8 6h2M8 12h2M8 18h2M14 6h2M14 12h2M14 18h2"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                        />
                    </svg>
                </span>
                <span class="tag-content">
                    <span class="tag-name">${name}</span>
                    <span class="tag-code">${code}</span>
                </span>
                <button
                    class="tag-remove"
                    title="Remove ${name}"
                    @click=${() => handleRemove(code)}
                >
                    <svg viewBox="0 0 24 24" fill="none">
                        <path
                            d="M18 6L6 18M6 6l12 12"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                        />
                    </svg>
                </button>
            </span>
        `;
    }

    return function template() {
        const langCodes = Settings.langCodes.get();

        // Cleanup sortable when list becomes empty
        if (langCodes.length === 0 && sortable) {
            sortable.cleanup();
            sortable = null;
        }

        // Init or reconnect sortable after render
        if (langCodes.length > 0) {
            requestAnimationFrame(() => {
                const container = document.querySelector(
                    ".selected-languages",
                ) as HTMLElement | null;
                if (!container) return;

                if (!sortable) {
                    sortable = initSortable(container, {
                        onReorder: handleReorder,
                        getHandle: (el) =>
                            el.querySelector(".tag-drag-handle"),
                    });
                } else if (langCodes.join() !== prevCodes.join()) {
                    // Reconnect when items added/removed (not after reorder —
                    // repeat() preserves DOM nodes on reorder, so bindings survive)
                    sortable.reconnect();
                }
            });
        }

        prevCodes = langCodes;

        return html`
            <div class="favorites-section">
                <div class="favorites-header">
                    <span class="favorites-label">Favorited Languages</span>
                    ${langCodes.length > 0
                        ? html`<span class="favorites-count"
                              >${langCodes.length}</span
                          >`
                        : nothing}
                </div>
                ${langCodes.length > 0
                    ? html`
                          <div class="selected-languages">
                              ${repeat(
                                  langCodes,
                                  (code) => code,
                                  (code) => languageTagTemplate(code),
                              )}
                          </div>
                      `
                    : html`
                          <div class="favorites-empty">
                              <span
                                  >No favorited languages yet. Search and add
                                  languages above.</span
                              >
                          </div>
                      `}
            </div>
        `;
    };
}
