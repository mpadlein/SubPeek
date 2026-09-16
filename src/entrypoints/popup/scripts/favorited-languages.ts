import { Settings } from "@/common/settings";
import { html, nothing } from "lit-html";
import { languageName } from "./lib/languages";

/**
 * The favorites section of the settings popup: one tag per language with a
 * remove button and a right-click menu to reorder. State (the open context
 * menu) lives in this closure; handlers call `rerender` to redraw the app and
 * the returned template function reads the state back.
 */
export function createFavoritedLanguages(rerender: () => void) {
    let contextMenu: { code: string; x: number; y: number } | null = null;

    function closeMenu() {
        if (!contextMenu) return;
        contextMenu = null;
        rerender();
    }

    function handleRemove(code: string) {
        Settings.langCodes.remove(code);
    }

    /** Moves `code` one place up (-1) or down (+1) among the favorites. */
    function moveFavorite(code: string, delta: -1 | 1) {
        const codes = [...Settings.langCodes.get()];
        const from = codes.indexOf(code);
        const to = from + delta;
        if (from === -1 || to < 0 || to >= codes.length) return;
        codes.splice(to, 0, ...codes.splice(from, 1));
        Settings.langCodes.set(codes);
        closeMenu();
    }

    function handleContextMenu(e: MouseEvent, code: string) {
        e.preventDefault();
        // A right-click on another tag while the menu is open must move the
        // menu, not close it: drop the pending close listeners before this
        // event bubbles up to them, and re-add them only after it has finished
        // bubbling (the setTimeout below), or the right-click that opened the
        // menu would close it again.
        document.removeEventListener("click", closeMenu);
        document.removeEventListener("contextmenu", closeMenu);
        const popup = document.getElementById("app")!;
        const rect = popup.getBoundingClientRect();
        contextMenu = {
            code,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
        rerender();
        setTimeout(() => {
            document.addEventListener("click", closeMenu, { once: true });
            document.addEventListener("contextmenu", closeMenu, {
                once: true,
            });
        });
    }

    function contextMenuTemplate() {
        if (!contextMenu) return nothing;
        const { code, x, y } = contextMenu;
        const codes = Settings.langCodes.get();
        const i = codes.indexOf(code);

        return html`
            <div class="ctx-menu" style="left: ${x}px; top: ${y}px;">
                <button
                    class="ctx-menu-item"
                    ?disabled=${i <= 0}
                    @click=${() => moveFavorite(code, -1)}
                >
                    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                        <path
                            d="M12 19V5M5 12l7-7 7 7"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                    Move up
                </button>
                <button
                    class="ctx-menu-item"
                    ?disabled=${i >= codes.length - 1}
                    @click=${() => moveFavorite(code, 1)}
                >
                    <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                        <path
                            d="M12 5v14M19 12l-7 7-7-7"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                    Move down
                </button>
            </div>
        `;
    }

    function languageTagTemplate(code: string) {
        const name = languageName(code);
        return html`
            <span
                class="language-tag"
                data-code="${code}"
                @contextmenu=${(e: MouseEvent) => handleContextMenu(e, code)}
            >
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
        return html`
            <div class="favorites-section">
                ${langCodes.length > 0
                    ? html`
                          <div class="selected-languages">
                              ${langCodes.map((code) =>
                                  languageTagTemplate(code),
                              )}
                          </div>
                      `
                    : html`
                          <div class="favorites-empty">
                              <span>No favorite languages yet.</span>
                          </div>
                      `}
                ${contextMenuTemplate()}
            </div>
        `;
    };
}
