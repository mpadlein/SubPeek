/**
 * Video card registry - maps element types to card handlers
 */
import type { VideoCard } from "./base";
import { ChannelGridCard, ChannelVideoCard } from "./channel-card";
import { SearchResultCard } from "./search-card";
import { WatchSidebarCard } from "./watch-card";

const CARD_TYPES = [
    ChannelVideoCard,
    ChannelGridCard,
    SearchResultCard,
    WatchSidebarCard,
] as const;

type VideoCardConstructor = new (parent: HTMLElement) => VideoCard;

const cardRegistry: Map<string, VideoCardConstructor> = new Map(
    CARD_TYPES.map((cls) => [cls.TAG_NAME, cls]),
);

export function createVideoCard(element: HTMLElement): VideoCard | null {
    const CardClass = cardRegistry.get(element.tagName);
    return CardClass ? new CardClass(element) : null;
}

export function getCardClass(
    element: HTMLElement,
): VideoCardConstructor | null {
    return cardRegistry.get(element.tagName) ?? null;
}

export function getAllTags(): string[] {
    return Array.from(cardRegistry.keys());
}
