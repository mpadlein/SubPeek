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
            <div class="logo-placeholder">
                <svg
                    class="logo-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <rect
                        x="2"
                        y="4"
                        width="20"
                        height="16"
                        rx="3"
                        stroke="currentColor"
                        stroke-width="2"
                    />
                    <path
                        d="M6 15h4M11 15h7M6 11h8M15 11h3"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                    />
                </svg>
            </div>
            <div class="header-text">
                <h1>YT Subtitles</h1>
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
