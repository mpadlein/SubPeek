type Listener = () => void;
type AreaName = "local" | "sync" | "session";

/**
 * Reactive wrapper around one `browser.storage` area: an in-memory copy for
 * synchronous reads, writes that go straight through, and per-key listeners
 * fed by `storage.onChanged`, so a change made in the popup page reaches the
 * content scripts as well.
 */
export class ReactiveStorage {
    private cache = new Map<string, unknown>();
    private readonly area: Browser.storage.StorageArea;
    // A plain listener map, not an EventTarget: a `new EventTarget()` created
    // inside a Firefox content script never delivers events to its listeners
    // (dispatchEvent returns true, nothing runs), so subscribers silently
    // stopped following changes there while the cache below still updated.
    private readonly listeners = new Map<string, Set<Listener>>();

    constructor(areaName: AreaName) {
        this.area = browser.storage[areaName];

        browser.storage.onChanged.addListener((changes, changedArea) => {
            if (changedArea !== areaName) return;

            for (const [key, change] of Object.entries(changes)) {
                if (change.newValue === undefined) {
                    this.cache.delete(key);
                } else {
                    this.cache.set(key, change.newValue);
                }
                this.notify(key);
            }
        });
    }

    /** Loads the current contents; await it once before the first `get()`. */
    async ready(): Promise<void> {
        const data = await this.area.get(null);
        this.cache = new Map(Object.entries(data));
    }

    get<T>(key: string, defaultValue: T): T {
        return this.cache.has(key) ? (this.cache.get(key) as T) : defaultValue;
    }

    set(key: string, value: unknown): void {
        this.cache.set(key, value);
        this.area.set({ [key]: value }).catch((error) => {
            logger.error("Error setting storage:", error);
        });
    }

    /** `init: true` also calls `listener` right away. */
    subscribe(key: string, listener: Listener, init = false): void {
        let set = this.listeners.get(key);
        if (!set) {
            set = new Set();
            this.listeners.set(key, set);
        }
        set.add(listener);
        if (init) listener();
    }

    private notify(key: string): void {
        this.listeners.get(key)?.forEach((listener) => {
            // One failing subscriber must not starve the others, as
            // EventTarget guaranteed.
            try {
                listener();
            } catch (error) {
                logger.error("Storage listener failed:", key, error);
            }
        });
    }
}
