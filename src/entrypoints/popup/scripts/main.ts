import { Settings } from "@/common/settings";
import { browserStorageLocalSV } from "@/common/storage";
import { ICON_HEART } from "@/entrypoints/content/constants";
import { html, render } from "lit-html";
import { createFavoritedLanguages } from "./favorited-languages";
import { createLanguageDropdown } from "./language-dropdown";

const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/lein.dev";

// Google Form opened in a new tab; `hl=en` pins the form chrome (Submit /
// Clear form) to English so it matches the English question text.
const FEEDBACK_FORM_URL =
    "https://docs.google.com/forms/d/e/1FAIpQLSfsnyyLlHckyDhdk30rz5ZZh_T6qP1OKWPVNthX8xcTZbiOEw/viewform?usp=pp_url&hl=en";
// Pre-filled "Version / browser" field so bug reports carry the context
// without asking the user for it. It rides along in the link; the extension
// itself never sends anything, and the form only records on Submit.
const FEEDBACK_CONTEXT_FIELD = "entry.883462684";
// Checked in order: Edge's UA also carries a Chrome/ token. Only the major
// is captured because Chromium freezes the rest at 0 (UA reduction).
const BROWSER_UA_TOKENS: [RegExp, string][] = [
    [/\bEdg\/(\d+)/, "Edge"],
    [/\bFirefox\/(\d+)/, "Firefox"],
    [/\bChrome\/(\d+)/, "Chrome"],
];

const dropdownTemplate = createLanguageDropdown(() => renderApp());
const favoritesTemplate = createFavoritedLanguages(() => renderApp());

function browserVersion(): string {
    for (const [pattern, name] of BROWSER_UA_TOKENS) {
        const major = navigator.userAgent.match(pattern)?.[1];
        if (major) return `${name} ${major}`;
    }
    return import.meta.env.BROWSER;
}

function feedbackUrl(): string {
    const url = new URL(FEEDBACK_FORM_URL);
    const version = browser.runtime.getManifest().version;
    url.searchParams.set(
        FEEDBACK_CONTEXT_FIELD,
        `${version} ${browserVersion()}`,
    );
    return url.href;
}

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
                class="footer-feedback"
                href=${feedbackUrl()}
                target="_blank"
                rel="noopener noreferrer"
                title="Report a bug or suggest an idea"
            >
                Send feedback
            </a>
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
