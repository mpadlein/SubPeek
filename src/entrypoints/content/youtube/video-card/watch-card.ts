/**
 * Watch page sidebar video card (yt-lockup-view-model)
 */
import { VideoCard } from "./base";

/**
 * Lockup view model - used in watch page sidebar recommendations
 */
export class WatchSidebarCard extends VideoCard {
    static readonly TAG_NAME = "YT-LOCKUP-VIEW-MODEL";

    insertBadgeContainer(): void {
        const textContainer = this.root.querySelector(
            ".yt-lockup-metadata-view-model__text-container",
        );

        if (textContainer) {
            textContainer.appendChild(this.embedComponent.root);
        } else {
            console.error("WatchSidebarCard: Could not find text container");
        }
    }
}
