import { Settings } from "@/common/settings";
import { html, nothing } from "lit-html";
import { getLanguagesFilter, getPopularLanguages } from "./lib/languages";
import { LanguageItem } from "./types";

export function createLanguageDropdown(rerender: () => void) {
    let searchText = "";
    let dropdownOpen = false;
    let expanded = false;

    function handleInput(e: InputEvent) {
        searchText = (e.target as HTMLInputElement).value;
        dropdownOpen = true;
        rerender();
    }

    function handleFocus() {
        dropdownOpen = true;
        rerender();
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
        // add() no-ops for an already-favorited code, so no storage event
        // arrives to re-render; render the state change explicitly.
        rerender();
    }

    function dropdownItemTemplate(lang: LanguageItem) {
        const classes = [
            lang.isFavorited ? "selected" : "",
            lang.isRecommended ? "recommended" : "",
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
                        ? html`<span class="recommend-badge">Recommend</span>`
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

        let languages: LanguageItem[] = [];
        if (searchText.length > 0) {
            languages = getLanguagesFilter(searchText);
        } else {
            languages = getPopularLanguages();
        }
        const displayLimit = searchText ? 10 : languages.length;

        return html`
            <div class="language-selector">
                <div class="search-container">
                    <svg
                        class="search-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                    >
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
                    />
                </div>
                ${dropdownOpen
                    ? html`
                          <ul class="language-dropdown">
                              ${languages.length === 0
                                  ? html`<li class="no-results">
                                        No languages found
                                    </li>`
                                  : languages
                                        .slice(0, displayLimit)
                                        .map(dropdownItemTemplate)}
                          </ul>
                      `
                    : nothing}
            </div>
        `;
    };
}
