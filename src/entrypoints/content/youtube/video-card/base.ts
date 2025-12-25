import { resolveVideoInfo } from "../api";
import { EVENT } from "../constants";
import { metricsProxy } from "../debugging";
import type { VideoInfo } from "../types";
import { EmbedComponent } from "../ui/embed";

export const anchorObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (
            mutation.type === "attributes" &&
            mutation.attributeName === "href"
        ) {
            metricsProxy.anchorOsvMatch++;
            const anchor = mutation.target as HTMLAnchorElement;
            anchor.dispatchEvent(new CustomEvent(EVENT.ANCHOR_HREF_CHANGE));
        }
    }
});

export abstract class VideoCard {
    static readonly TAG_NAME: string;

    protected root: HTMLElement;
    embedComponent: EmbedComponent;
    private anchor: HTMLAnchorElement;

    constructor(root: HTMLElement) {
        this.root = root;

        this.anchor = this.getAnchor();

        this.root.addEventListener(EVENT.ELEMENT_VISIBLE, () => {
            this.renderData();
            this.anchor.addEventListener(EVENT.ANCHOR_HREF_CHANGE, () => {
                this.renderData();
            });
        });

        anchorObserver.observe(this.anchor, {
            attributes: true,
            attributeFilter: ["href"],
        });
        metricsProxy.anchorOsv++;

        this.root.querySelector(".ytbext-container")?.remove();
        this.embedComponent = new EmbedComponent();
        this.insertBadgeContainer();
    }

    private getAnchor(): HTMLAnchorElement {
        const anchors = this.root.querySelectorAll(
            "h3 a[href^='/watch?v='], h4 a[href^='/watch?v=']",
        );
        if (anchors.length > 1) {
            throw new Error("Multiple anchors found in card");
        }
        const anchor = anchors[0];
        if (!anchor) {
            throw new Error("Could not find anchor element in card");
        }
        return anchor as HTMLAnchorElement;
    }

    getVideoUrl(): string {
        const thumbnail: HTMLAnchorElement | null =
            this.root.querySelector("a#thumbnail") ||
            this.root.querySelector("a[href^='/watch?v=']");

        if (!thumbnail) {
            throw new Error("Could not find video link in card");
        }

        return thumbnail.href;
    }

    /**
     * Render caption/audio data in the badge container
     */
    async renderData(): Promise<void> {
        this.embedComponent.setLoading();

        const videoUrl = this.getVideoUrl();
        const data = await resolveVideoInfo(videoUrl);
        const filtered: VideoInfo = {
            captions: data.captions.filter((t) => !t.auto),
            audioTracks: data.audioTracks.filter((t) => !t.origin),
        };

        this.embedComponent.setData(filtered);
        this.embedComponent.render();
    }

    /**
     * Insert the badge container into the video card
     * Each card type implements this differently based on its DOM structure
     */
    abstract insertBadgeContainer(): void;
}
