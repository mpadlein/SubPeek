import { ReactiveStorage } from "./storage";

const PREFIX = "SETTINGS:";
const storage = new ReactiveStorage("local");

function createAccessor<T>(key: string, defaultValue: T) {
    const fullKey = PREFIX + key;
    return {
        get: (): T => storage.get(fullKey, defaultValue),
        set: (value: T): void => storage.set(fullKey, value),
        /** `init: true` also calls back right away with the current value. */
        subscribe: (callback: () => void, init = false): void =>
            storage.subscribe(fullKey, callback, init),
    };
}

const enabled = createAccessor("enabled", true);
const langCodes = createAccessor<string[]>("langCodes", ["en"]);

/**
 * User settings, reactive: read synchronously with `get()`, write with
 * `set()`, and `subscribe()` to be told whenever the value changes in any
 * extension context. Await `Settings.ready()` once per context before reading.
 */
export const Settings = {
    ready: (): Promise<void> => storage.ready(),
    /** Global on/off switch. */
    enabled,
    /** Favorite language codes, in the order the user ranked them. */
    langCodes: {
        ...langCodes,
        add(code: string): void {
            const current = langCodes.get();
            if (!current.includes(code)) langCodes.set([...current, code]);
        },
        remove(code: string): void {
            langCodes.set(langCodes.get().filter((c) => c !== code));
        },
    },
};
