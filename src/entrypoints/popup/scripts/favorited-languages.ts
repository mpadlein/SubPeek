import { Settings } from "@/common/settings";
import { html, nothing } from "lit-html";
import { getNameOfCode } from "./lib/languages";

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

    function handleMoveUp(code: string) {
        const codes = [...Settings.langCodes.get()];
        const i = codes.indexOf(code);
        if (i <= 0) return;
        [codes[i - 1], codes[i]] = [codes[i] as string, codes[i - 1] as string];
        Settings.langCodes.set(codes);
        closeMenu();
    }

    function handleMoveDown(code: string) {
        const codes = [...Settings.langCodes.get()];
        const i = codes.indexOf(code);
        if (i === -1 || i >= codes.length - 1) return;
        [codes[i], codes[i + 1]] = [codes[i + 1] as string, codes[i] as string];
        Settings.langCodes.set(codes);
        closeMenu();
    }

    function handleContextMenu(e: MouseEvent, code: string) {
        e.preventDefault();
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
                    @click=${() => handleMoveUp(code)}
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
                    @click=${() => handleMoveDown(code)}
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
        const name = getNameOfCode(code);
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
