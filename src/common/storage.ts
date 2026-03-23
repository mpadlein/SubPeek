export type SubscribeStorageParams = {
    key: string;
    callback: () => any;
    init?: boolean;
};

class BrowserStorageSync {
    private storage: Map<string, any> = new Map();
    private storageApi: Browser.storage.StorageArea;
    private eventTarget: EventTarget = new EventTarget();

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
                this.eventTarget.dispatchEvent(
                    new CustomEvent(key, { detail: change }),
                );
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

    public subscribe(key: string, callback: () => void, init: boolean = false) {
        this.eventTarget.addEventListener(key, callback);
        init && callback();
    }
}

export const browserStorageLocalSV = new BrowserStorageSync(
    browser.storage.local,
);
