import { browserStorageLocalSV } from "./storage";

const PREFIX = "SETTINGS:";
const DEFAULT_SETTINGS = {
    enabled: true,
    langCodes: ["en"],
};

function createAccessor<T>(key: string, defaultValue: T) {
    const fullKey = PREFIX + key;
    return {
        get() {
            return browserStorageLocalSV.get<T>(fullKey, defaultValue);
        },
        set(value: T) {
            browserStorageLocalSV.set(fullKey, value);
        },
        subscribe(callback: () => void, init: boolean = false) {
            browserStorageLocalSV.subscribe(fullKey, callback, init);
        },
    };
}

export const Settings = {
    enabled: createAccessor("enabled", DEFAULT_SETTINGS.enabled),
    langCodes: {
        ...createAccessor("langCodes", DEFAULT_SETTINGS.langCodes),
        add: function (s: string) {
            const current = this.get();
            if (current.includes(s)) return;
            this.set([...current, s]);
        },
        remove: function (s: string) {
            const updated = this.get().filter((code) => code !== s);
            this.set(updated);
        },
    },
};
