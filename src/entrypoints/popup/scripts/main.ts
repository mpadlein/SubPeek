import { Settings } from "@/common/settings";
import { browserStorageLocalSV } from "@/common/storage";
import { ICON_HEART } from "@/entrypoints/content/constants";
import { html, render } from "lit-html";
import { createFavoritedLanguages } from "./favorited-languages";
import { createLanguageDropdown } from "./language-dropdown";

const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/lein.dev";

const dropdownTemplate = createLanguageDropdown(() => renderApp());
const favoritesTemplate = createFavoritedLanguages(() => renderApp());

function enabledSwitchTemplate() {
    const enabled = Settings.enabled.get();
    const onChange = (e: Event) => {
        Settings.enabled.set((e.target as HTMLInputElement).checked);
    };

    return html`
        <label class="switch" title=${enabled ? "Turn off" : "Turn on"}>
            <input
                type="checkbox"
                role="switch"
                class="switch-input"
                aria-label="Enable SubPeek"
                .checked=${enabled}
                @change=${onChange}
            />
            <span class="switch-track"></span>
        </label>
    `;
}

function headerTemplate() {
    return html`
        <header class="header">
            <img class="logo" src="/icon/128.png" alt="SubPeek logo" />
            <div class="header-text">
                <h1>SubPeek</h1>
                <span class="version"
                    >${browser.runtime.getManifest().version || ""}</span
                >
            </div>
            ${enabledSwitchTemplate()}
        </header>
    `;
}

function footerTemplate() {
    return html`
        <footer class="footer">
            <a
                class="footer-link"
                href=${BUY_ME_A_COFFEE_URL}
                target="_blank"
                rel="noopener noreferrer"
                title="Support SubPeek on Buy Me a Coffee"
            >
                <img
                    class="footer-badge"
                    src="/bmc-button.png"
                    alt="Buy me a coffee"
                    width="545"
                    height="153"
                />
            </a>
        </footer>
    `;
}

function appTemplate() {
    return html`
        ${headerTemplate()}
        <section class="settings-card">
            <div class="card-header">
                <svg
                    class="card-header-icon"
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                >
                    <path d=${ICON_HEART} fill="currentColor" />
                </svg>
                <h2>Favorite Languages</h2>
            </div>
            ${favoritesTemplate()} ${dropdownTemplate()}
        </section>
        ${footerTemplate()}
    `;
}

function renderApp() {
    render(appTemplate(), document.getElementById("app")!);
}

(async () => {
    await browserStorageLocalSV.ready();
    renderApp();
    Settings.langCodes.subscribe(renderApp);
    Settings.enabled.subscribe(renderApp);
})();
