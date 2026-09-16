type Listener = () => void;

class BrowserStorageSync {
    private storage: Map<string, any> = new Map();
    private storageApi: Browser.storage.StorageArea;
    // A plain listener map, not an EventTarget: a `new EventTarget()` created
    // inside a Firefox content script never delivers events to its listeners
    // (dispatchEvent returns true, nothing runs), so subscribers silently
    // stopped following changes there while the cache below still updated.
    private listeners: Map<string, Set<Listener>> = new Map();

    constructor(storageApi: Browser.storage.StorageArea) {
        this.storageApi = storageApi;

        let areaName = null;
        switch (storageApi) {
            case browser.storage.local:
                areaName = "local";
                break;
            case browser.storage.sync:
                areaName = "sync";
                break;
            case browser.storage.session:
                areaName = "session";
                break;
            default:
                throw new Error("Unsupported storage area");
        }

        browser.storage.onChanged.addListener((changes, area) => {
            if (area !== areaName) return;

            for (const [key, change] of Object.entries(changes)) {
                if (change.newValue === undefined) {
                    this.storage.delete(key);
                } else {
                    this.storage.set(key, change.newValue);
                }
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
        });
    }

    public async ready() {
        const data = await this.storageApi.get(null);
        this.storage = new Map(Object.entries(data));
    }

    public has(key: string): boolean {
        return this.storage.has(key);
    }

    public get<T>(key: string, default_value: T): T {
        if (!this.storage.has(key)) {
            return default_value;
        }
        return this.storage.get(key);
    }

    public set(key: string, value: any) {
        this.storage.set(key, value);
        this.storageApi.set({ [key]: value }).catch((error) => {
            logger.error("Error setting storage:", error);
        });
    }

    public subscribe(key: string, callback: Listener, init: boolean = false) {
        let set = this.listeners.get(key);
        if (!set) {
            set = new Set();
            this.listeners.set(key, set);
        }
        set.add(callback);
        init && callback();
    }
}

export const browserStorageLocalSV = new BrowserStorageSync(
    browser.storage.local,
);
