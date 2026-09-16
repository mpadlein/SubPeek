import type { CacheEntry, VideoInfo } from "./types";

/**
 * The message protocol between the content script and the background script.
 *
 * Content scripts call the functions on `messaging`; the background script
 * registers one handler per message type with `listenForMessages()`. Both
 * sides share `Message` and `Responses`, so adding a message means adding it
 * to both and the compiler points at every caller and handler to update.
 */

/** Requests a content script can send to the background script. */
export type Message =
    | { type: "getCachedVideoInfo"; videoId: string }
    | { type: "saveVideoInfo"; videoId: string; info: VideoInfo }
    | { type: "openOptionsPage" };

export type MessageType = Message["type"];

/** What the background script replies with, per message type. */
export interface Responses {
    getCachedVideoInfo: CacheEntry | null;
    saveVideoInfo: void;
    openOptionsPage: void;
}

/** One async handler per message type; the resolved value is the reply. */
export type MessageHandlers = {
    [T in MessageType]: (
        message: Extract<Message, { type: T }>,
    ) => Promise<Responses[T]>;
};

function send<T extends MessageType>(
    message: Message & { type: T },
): Promise<Responses[T]> {
    return browser.runtime.sendMessage(message);
}

/** Content-script side of the protocol. */
export const messaging = {
    getCachedVideoInfo(videoId: string): Promise<CacheEntry | null> {
        return send({ type: "getCachedVideoInfo", videoId });
    },
    saveVideoInfo(videoId: string, info: VideoInfo): Promise<void> {
        return send({ type: "saveVideoInfo", videoId, info });
    },
    openOptionsPage(): Promise<void> {
        return send({ type: "openOptionsPage" });
    },
};

/**
 * Background side of the protocol: route every incoming message to the
 * handler for its type and send the resolved value back. Messages that are
 * not part of the protocol are left alone for other listeners.
 */
export function listenForMessages(handlers: MessageHandlers): void {
    browser.runtime.onMessage.addListener(
        (message: unknown, _sender, sendResponse) => {
            if (!isMessage(message, handlers)) return false;

            // Every handler accepts its own message type; the map lookup
            // widens that to the union, hence the cast.
            const handle = handlers[message.type] as (
                message: Message,
            ) => Promise<unknown>;

            handle(message).then(sendResponse, (error: unknown) => {
                logger.error(`Message "${message.type}" failed:`, error);
                sendResponse(undefined);
            });

            // Keep the channel open for the async reply; without this the
            // sender's promise settles with undefined before the handler runs.
            return true;
        },
    );
}

function isMessage(
    value: unknown,
    handlers: MessageHandlers,
): value is Message {
    if (typeof value !== "object" || value === null) return false;
    const type = (value as { type?: unknown }).type;
    return typeof type === "string" && type in handlers;
}
