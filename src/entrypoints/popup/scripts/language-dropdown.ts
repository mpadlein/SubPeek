import { Settings } from "@/common/settings";
import { html, nothing } from "lit-html";
import { getLanguagesFilter, getPopularLanguages } from "./lib/languages";
import { type LanguageItem } from "./types";

const SEARCH_DISPLAY_LIMIT = 10;

export function createLanguageDropdown(rerender: () => void) {
    let searchText = "";
    let dropdownOpen = false;
    let expanded = false;
    // Keyboard-highlighted row. With a search term the first match is always
    // highlighted so Enter/Tab picks it; with a blank input nothing is until
    // the user arrows down.
    let activeIndex = -1;

    function visibleLanguages(): LanguageItem[] {
        if (searchText.length > 0) {
            return getLanguagesFilter(searchText).slice(
                0,
                SEARCH_DISPLAY_LIMIT,
            );
        }
        return getPopularLanguages();
    }

    function resetActiveIndex() {
        activeIndex = searchText.length > 0 ? 0 : -1;
    }

    function handleInput(e: InputEvent) {
        searchText = (e.target as HTMLInputElement).value;
        dropdownOpen = true;
        resetActiveIndex();
        rerender();
    }

    function handleFocus() {
        dropdownOpen = true;
        rerender();
    }

    function handleKeydown(e: KeyboardEvent) {
        switch (e.key) {
            case "ArrowDown":
            case "ArrowUp": {
                e.preventDefault();
                const count = visibleLanguages().length;
                if (count === 0) return;
                const step = e.key === "ArrowDown" ? 1 : -1;
                if (!dropdownOpen) {
                    dropdownOpen = true;
                    resetActiveIndex();
                }
                activeIndex = (activeIndex + step + count) % count;
                rerender();
                document
                    .querySelector(".language-dropdown li.active")
                    ?.scrollIntoView({ block: "nearest" });
                return;
            }
            case "Enter":
            case "Tab": {
                if (!dropdownOpen || activeIndex < 0) return;
                const lang = visibleLanguages()[activeIndex];
                if (!lang) return;
                // Tab would otherwise move focus out of the input; keep it
                // here so several languages can be added in a row.
                e.preventDefault();
                handleSelect(lang.code);
                return;
            }
            case "Escape": {
                if (!dropdownOpen) return;
                e.preventDefault();
                dropdownOpen = false;
                searchText = "";
                resetActiveIndex();
                rerender();
                return;
            }
        }
    }

    function handleExpand() {
        expanded = true;
        dropdownOpen = true;
        rerender();
        // lit-html renders synchronously, so the input exists now.
        document.getElementById("language-search")?.focus();
    }

    function handleSelect(code: string) {
        Settings.langCodes.add(code);
        searchText = "";
        dropdownOpen = false;
        resetActiveIndex();
        // add() no-ops for an already-favorited code, so no storage event
        // arrives to re-render; render the state change explicitly.
        rerender();
    }

    function dropdownItemTemplate(lang: LanguageItem, index: number) {
        const classes = [
            lang.isFavorited ? "selected" : "",
            lang.isRecommended ? "recommended" : "",
            index === activeIndex ? "active" : "",
        ]
            .filter(Boolean)
            .join(" ");

        return html`
            <li
                data-code="${lang.code}"
                class="${classes}"
                @click=${() => handleSelect(lang.code)}
            >
                <div class="lang-info">
                    <span class="lang-name">${lang.name}</span>
                </div>
                <div class="lang-meta">
                    ${lang.isRecommended
                        ? html`<span class="recommend-badge">Recommended</span>`
                        : nothing}
                    <span class="lang-code">${lang.code}</span>
                </div>
            </li>
        `;
    }

    document.addEventListener("click", (e) => {
        if (
            !(e.target as HTMLElement).closest(".language-selector") &&
            (dropdownOpen || expanded)
        ) {
            dropdownOpen = false;
            expanded = false;
            searchText = "";
            resetActiveIndex();
            rerender();
        }
    });

    return function template() {
        if (!expanded) {
            return html`
                <div class="language-selector">
                    <button class="add-language-row" @click=${handleExpand}>
                        <svg viewBox="0 0 24 24" fill="none">
                            <path
                                d="M12 5v14M5 12h14"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                            />
                        </svg>
                        <span>Add language</span>
                    </button>
                </div>
            `;
        }

        const languages = visibleLanguages();

        return html`
            <div class="language-selector">
                <div class="search-container">
                    <svg class="search-icon" viewBox="0 0 24 24" fill="none">
                        <circle
                            cx="11"
                            cy="11"
                            r="7"
                            stroke="currentColor"
                            stroke-width="2"
                        />
                        <path
                            d="M16 16l4 4"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                        />
                    </svg>
                    <input
                        type="text"
                        id="language-search"
                        placeholder="Add languages..."
                        autocomplete="off"
                        .value=${searchText}
                        @input=${handleInput}
                        @focus=${handleFocus}
                        @keydown=${handleKeydown}
                    />
                </div>
                ${dropdownOpen
                    ? html`
                          <ul class="language-dropdown">
                              ${languages.length === 0
                                  ? html`<li class="no-results">
                                        No languages found
                                    </li>`
                                  : languages.map(dropdownItemTemplate)}
                          </ul>
                      `
                    : nothing}
            </div>
        `;
    };
}
