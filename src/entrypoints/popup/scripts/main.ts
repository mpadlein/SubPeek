import { Settings } from "@/common/settings";
import { browserStorageLocalSV } from "@/common/storage";
import { ICON_HEART } from "@/entrypoints/content/constants";
import { html, render } from "lit-html";
import { createFavoritedLanguages } from "./favorited-languages";
import { createLanguageDropdown } from "./language-dropdown";

const dropdownTemplate = createLanguageDropdown(() => renderApp());
const favoritesTemplate = createFavoritedLanguages(() => renderApp());

function headerTemplate() {
    return html`
        <header class="header">
            <img class="logo" src="/icon/128.png" alt="SubPeek logo" />
            <div class="header-text">
                <h1>SubPeek</h1>
                <span class="version">Settings</span>
            </div>
        </header>
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
    `;
}

function renderApp() {
    render(appTemplate(), document.getElementById("app")!);
}

(async () => {
    await browserStorageLocalSV.ready();
    renderApp();
    Settings.langCodes.subscribe(renderApp);
})();
