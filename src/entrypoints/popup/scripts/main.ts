import { Settings } from "@/common/settings";
import { browserStorageLocalSV } from "@/common/storage";
import { html, render } from "lit-html";
import { createActionsSection } from "./actions-section";
import { createFavoritedLanguages } from "./favorited-languages";
import { createLanguageDropdown } from "./language-dropdown";
import { createOptionsSection } from "./options-section";

const dropdownTemplate = createLanguageDropdown(() => renderApp());
const favoritesTemplate = createFavoritedLanguages(() => renderApp());
const optionsTemplate = createOptionsSection(() => renderApp());
const actionsTemplate = createActionsSection(() => renderApp());

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
        ${optionsTemplate()} ${actionsTemplate()}
    `;
}

function renderApp() {
    render(appTemplate(), document.getElementById("app")!);
}

(async () => {
    await browserStorageLocalSV.ready();
    renderApp();
    Settings.langCodes.subscribe(renderApp);
    Settings.cacheTTL.subscribe(renderApp);
    Settings.renderEmpty.subscribe(renderApp);
    Settings.renderAudio.subscribe(renderApp);
})();
