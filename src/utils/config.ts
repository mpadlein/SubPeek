// Configuration constants for YouTube Extension

// Settings interface for popup configuration
// export interface Settings {
// 	captionCodes: string[];
// 	cacheTTL: number;
// 	renderEmpty: boolean;
// }

// Default settings values
// export const DEFAULT_SETTINGS: Settings = {
// 	langCodes: ["en", "vi"],
// 	cacheTTL: 3600, // 1 hour in seconds
// 	renderEmpty: true,
// };

// Helper to load settings from storage
// export async function loadSettings(): Promise<Settings> {
// 	const data = await browser.storage.local.get("settings");
// 	const stored = (data.settings ?? {}) as Partial<Settings>;
// 	return { ...DEFAULT_SETTINGS, ...stored };
// }

// Legacy exports (for backward compatibility)
export const VIDEO_CACHE_TIMEOUT = 60 * 60; // 1 hour in seconds

export const userConfig = {
	captionCodes: ["en", "vi"],
	renderCodeInsteadOfName: true,
};

export const systemConfig = {
	renderEmpty: true,
};
