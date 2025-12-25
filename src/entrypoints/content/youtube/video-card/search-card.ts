import { VideoCard } from "./base";

export class SearchResultCard extends VideoCard {
    static readonly TAG_NAME = "YTD-VIDEO-RENDERER";

    insertBadgeContainer(): void {
        const dismissible = this.root.querySelector("#dismissible");

        if (dismissible) {
            const metadata = dismissible.querySelector("#details, #meta");
            metadata?.appendChild(this.embedComponent.root);
        } else {
            console.error(
                "SearchResultCard: Could not find dismissible element",
            );
        }
    }
}
