// /**
//  * Popup Settings Main Entry Point
//  */

// import { loadSettings } from "@/common/storage";

// // Section modules
// import {
//     initActionsSection,
//     setupActionsListeners,
// } from "./scripts/actions-section";
// import {
//     renderFavoriteLangs,
//     setSelectedLanguages,
//     setupFavoritedLanguagesListeners,
// } from "./scripts/favorited-languages";
// // import { setupLanguageDropdownListeners } from "./scripts/languageDropdown";
// import {
//     initOptionsSection,
//     setupOptionsListeners,
// } from "./scripts/options-section";

// // ===== Initialize =====
// async function init() {
//     const settings = await loadSettings();

//     // Initialize sections with settings
//     setSelectedLanguages(settings.langCodes);
//     renderFavoriteLangs();
//     initOptionsSection(settings);
//     initActionsSection();

//     // Setup all event listeners
//     setupLanguageDropdownListeners();
//     setupFavoritedLanguagesListeners();
//     setupOptionsListeners();
//     setupActionsListeners();
// }

// init();
