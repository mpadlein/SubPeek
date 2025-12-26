/**
 * Popup Settings Main Entry Point
 */

import { EXTENSION_EVENTS } from "@/common/constants";
import { loadSettings, saveSettings } from "@/common/storage";
import {
    getLanguagesFilter,
    getNativeName,
    getPopularLanguages,
} from "./languages";
import "./style.css";
import { LanguageItem } from "./types";

// ===== DOM Elements =====
const elements = {
    languageSearch:
        document.querySelector<HTMLInputElement>("#language-search")!,
    languageDropdown:
        document.querySelector<HTMLUListElement>("#language-dropdown")!,
    selectedLanguages: document.querySelector<HTMLDivElement>(
        "#selected-languages",
    )!,
    favoritesCount:
        document.querySelector<HTMLSpanElement>("#favorites-count")!,
    favoritesEmpty: document.querySelector<HTMLDivElement>("#favorites-empty")!,
    cacheTTL: document.querySelector<HTMLSelectElement>("#cache-ttl")!,
    renderEmpty: document.querySelector<HTMLInputElement>("#render-empty")!,
    renderAudio: document.querySelector<HTMLInputElement>("#render-audio")!,
    clearCache: document.querySelector<HTMLButtonElement>("#btn-clear-cache")!,
    cacheSize: document.querySelector<HTMLSpanElement>("#cache-size")!,
};

// ===== State =====
let selectedLanguages: string[] = [];

// ===== Render Functions =====
async function renderLanguageDropdown(
    filter: string = "",
    forceShow: boolean = false,
) {
    const { languageDropdown } = elements;

    let languages: LanguageItem[] = [];
    if (filter.length > 0) {
        languages = await getLanguagesFilter(filter);
    } else {
        languages = await getPopularLanguages();
    }

    if (!forceShow && !filter) {
        languageDropdown.classList.add("hidden");
        return;
    }

    if (languages.length === 0) {
        languageDropdown.innerHTML = `<li class="no-results">No languages found</li>`;
        languageDropdown.classList.remove("hidden");
        return;
    }

    const displayLimit = filter ? 10 : languages.length;

    languageDropdown.innerHTML = languages
        .slice(0, displayLimit)
        .map((lang) => {
            const isSelected = selectedLanguages.includes(lang.code);
            return `
				<li data-code="${lang.code}" class="${isSelected ? "selected" : ""}${
                    lang.isRecommended ? " recommended" : ""
                }">
					<div class="lang-info">
						<span class="lang-name">${lang.name}</span>
					</div>
					<div class="lang-meta">
						${lang.isRecommended ? '<span class="recommend-badge">Recommend</span>' : ""}
						<span class="lang-code">${lang.code}</span>
					</div>
				</li>
			`;
        })
        .join("");

    languageDropdown.classList.remove("hidden");
}

function renderSelectedLanguages() {
    const {
        selectedLanguages: container,
        favoritesCount,
        favoritesEmpty,
    } = elements;

    // Update count badge
    favoritesCount.textContent =
        selectedLanguages.length > 0 ? `${selectedLanguages.length}` : "";

    // Show/hide empty state
    if (selectedLanguages.length === 0) {
        container.innerHTML = "";
        favoritesEmpty.classList.remove("hidden");
        return;
    }

    favoritesEmpty.classList.add("hidden");
    container.innerHTML = selectedLanguages
        .map((code, index) => {
            const nativeName = getNativeName(code);
            return `
				<span class="language-tag" data-code="${code}" data-index="${index}" draggable="true">
					<span class="tag-drag-handle" title="Drag to reorder">
						<svg viewBox="0 0 24 24" fill="none">
							<path d="M8 6h2M8 12h2M8 18h2M14 6h2M14 12h2M14 18h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						</svg>
					</span>
					<span class="tag-content">
						<span class="tag-name">${nativeName}</span>
						<span class="tag-code">${code}</span>
					</span>
					<button class="tag-remove" data-code="${code}" title="Remove ${nativeName}">
						<svg viewBox="0 0 24 24" fill="none">
							<path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						</svg>
					</button>
				</span>
			`;
        })
        .join("");

    // Setup drag-and-drop after rendering
    setupDragAndDrop();
}

// ===== Drag and Drop =====
let draggedElement: HTMLElement | null = null;
let draggedIndex: number = -1;

function setupDragAndDrop() {
    const container = elements.selectedLanguages;
    const tags = container.querySelectorAll<HTMLElement>(".language-tag");

    tags.forEach((tag) => {
        tag.addEventListener("dragstart", handleDragStart);
        tag.addEventListener("dragend", handleDragEnd);
        tag.addEventListener("dragover", handleDragOver);
        tag.addEventListener("dragenter", handleDragEnter);
        tag.addEventListener("dragleave", handleDragLeave);
        tag.addEventListener("drop", handleDrop);
    });
}

function handleDragStart(e: DragEvent) {
    const target = e.currentTarget as HTMLElement;
    draggedElement = target;
    draggedIndex = parseInt(target.dataset.index || "-1", 10);
    target.classList.add("dragging");

    // Required for Firefox
    e.dataTransfer?.setData("text/plain", target.dataset.code || "");
    e.dataTransfer!.effectAllowed = "move";
}

function handleDragEnd(e: DragEvent) {
    const target = e.currentTarget as HTMLElement;
    target.classList.remove("dragging");

    // Remove all drag-over states
    elements.selectedLanguages
        .querySelectorAll(".drag-over")
        .forEach((el) => el.classList.remove("drag-over"));

    draggedElement = null;
    draggedIndex = -1;
}

function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
}

function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    if (target !== draggedElement) {
        target.classList.add("drag-over");
    }
}

function handleDragLeave(e: DragEvent) {
    const target = e.currentTarget as HTMLElement;
    target.classList.remove("drag-over");
}

function handleDrop(e: DragEvent) {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.classList.remove("drag-over");

    const targetIndex = parseInt(target.dataset.index || "-1", 10);

    if (
        draggedIndex !== -1 &&
        targetIndex !== -1 &&
        draggedIndex !== targetIndex
    ) {
        // Reorder the array
        const [movedItem] = selectedLanguages.splice(draggedIndex, 1);
        selectedLanguages.splice(targetIndex, 0, movedItem);

        // Re-render and save
        renderSelectedLanguages();
        saveSettings({ langCodes: selectedLanguages });
    }
}

// ===== Actions =====
function addLanguage(code: string) {
    if (!selectedLanguages.includes(code)) {
        selectedLanguages.push(code);
        renderSelectedLanguages();
        saveSettings({ langCodes: selectedLanguages });
    }
    elements.languageSearch.value = "";
    elements.languageDropdown.classList.add("hidden");
}

function removeLanguage(code: string) {
    selectedLanguages = selectedLanguages.filter((c) => c !== code);
    renderSelectedLanguages();
    saveSettings({ langCodes: selectedLanguages });
}

// ===== Event Handlers =====
function setupEventListeners() {
    const {
        languageSearch,
        languageDropdown,
        selectedLanguages: langContainer,
        cacheTTL,
        renderEmpty,
        renderAudio,
        clearCache,
    } = elements;

    // Language search
    languageSearch.addEventListener("input", (e) => {
        renderLanguageDropdown((e.target as HTMLInputElement).value, true);
    });

    languageSearch.addEventListener("focus", () => {
        renderLanguageDropdown(languageSearch.value, true);
    });

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
        if (
            !languageSearch.contains(e.target as Node) &&
            !languageDropdown.contains(e.target as Node)
        ) {
            languageDropdown.classList.add("hidden");
        }
    });

    // Language selection
    languageDropdown.addEventListener("click", (e) => {
        const li = (e.target as HTMLElement).closest("li");
        if (li && !li.classList.contains("no-results")) {
            const code = li.dataset.code;
            if (code) addLanguage(code);
        }
    });

    // Remove language
    langContainer.addEventListener("click", (e) => {
        const button = (e.target as HTMLElement).closest(".tag-remove");
        if (button) {
            const code = (button as HTMLElement).dataset.code;
            if (code) removeLanguage(code);
        }
    });

    // Cache TTL
    cacheTTL.addEventListener("change", () => {
        saveSettings({ cacheTTL: parseInt(cacheTTL.value, 10) });
    });

    // Render empty toggle
    renderEmpty.addEventListener("change", () => {
        saveSettings({ renderEmpty: renderEmpty.checked });
    });

    // Render audio toggle
    renderAudio.addEventListener("change", () => {
        saveSettings({ renderAudio: renderAudio.checked });
    });

    // Clear cache
    clearCache.addEventListener("click", () => {
        browser.runtime.sendMessage({ event: EXTENSION_EVENTS.clearCache });

        clearCache.textContent = "Cleared!";
        setTimeout(() => {
            clearCache.innerHTML = `
				<svg viewBox="0 0 24 24" fill="none">
					<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				Clear Cache
			`;
        }, 1500);
    });
}

// ===== Initialize =====
async function init() {
    const settings = await loadSettings();

    selectedLanguages = settings.langCodes;
    renderSelectedLanguages();

    elements.cacheTTL.value = settings.cacheTTL.toString();
    elements.renderEmpty.checked = settings.renderEmpty;
    elements.renderAudio.checked = settings.renderAudio;

    setupEventListeners();

    browser.runtime
        .sendMessage({ event: EXTENSION_EVENTS.getCacheSize })
        .then((data: { count: number; size: number }) => {
            const { count, size } = data;
            elements.cacheSize.textContent = size ? formatBytes(size, 2) : "";
        });
}

init();

function formatBytes(bytes: number, decimals: number) {
    if (bytes == 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals || 2;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
