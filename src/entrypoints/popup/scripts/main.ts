import { Settings } from "@/common/settings";
import { browserStorageLocalSV } from "@/common/storage";
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
                <h2>Caption Languages</h2>
            </div>
            ${dropdownTemplate()} ${favoritesTemplate()}
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
