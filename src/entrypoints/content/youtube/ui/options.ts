import { messaging } from "@/common/messaging";

/**
 * Click handler that opens the extension's options page (the settings UI, in
 * a tab). runtime.openOptionsPage() is not exposed to content scripts, so the
 * background script opens it for us. Shared by the gear button in the
 * in-page track popup and the "Choose languages" button next to the language
 * filter.
 */
export function openOptionsPage(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    messaging.openOptionsPage().catch((error: unknown) => {
        logger.error("Could not open options page:", error);
    });
}
