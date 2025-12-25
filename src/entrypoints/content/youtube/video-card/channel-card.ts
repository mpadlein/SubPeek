import { VideoCard } from "./base";

export class ChannelVideoCard extends VideoCard {
    static readonly TAG_NAME = "YTD-RICH-ITEM-RENDERER";

    insertBadgeContainer(): void {
        const dismissible = this.root.querySelector("#dismissible");

        if (dismissible) {
            // Try to insert before metadata section
            const metadata = dismissible.querySelector("#details, #meta");
            if (metadata) {
                dismissible.insertBefore(this.embedComponent.root, metadata);
                return;
            }
            dismissible.appendChild(this.embedComponent.root);
        } else {
            // Fallback for new layout
            const textContainer = this.root.querySelector(
                ".yt-lockup-metadata-view-model__text-container",
            );
            if (textContainer) {
                textContainer.appendChild(this.embedComponent.root);
                return;
            }
            console.error("ChannelVideoCard: Could not find insertion point");
        }
    }
}

export class ChannelGridCard extends VideoCard {
    static readonly TAG_NAME = "YTD-GRID-VIDEO-RENDERER";

    insertBadgeContainer(): void {
        const dismissible = this.root.querySelector("#dismissible");

        if (dismissible) {
            const metadata = dismissible.querySelector("#details, #meta");
            if (metadata) {
                dismissible.insertBefore(this.embedComponent.root, metadata);
                return;
            }
            dismissible.appendChild(this.embedComponent.root);
        } else {
            const textContainer = this.root.querySelector(
                ".yt-lockup-metadata-view-model__text-container",
            );
            textContainer?.appendChild(this.embedComponent.root);
        }
    }
}
