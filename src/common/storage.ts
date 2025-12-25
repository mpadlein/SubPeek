import { Settings, DEFAULT_SETTINGS } from "./types";

const STORAGE_KEY = "settings";

export async function loadSettings(): Promise<Settings> {
	const data = await browser.storage.local.get(STORAGE_KEY);
	const stored = (data[STORAGE_KEY] ?? {}) as Partial<Settings>;
	return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
	const current = await loadSettings();
	const updated = { ...current, ...settings };
	await browser.storage.local.set({ [STORAGE_KEY]: updated });
}
