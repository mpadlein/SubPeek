import { browserStorageLocalSV } from "./storage";

const PREFIX = "SETTINGS:";
const DEFAULT_SETTINGS = {
    langCodes: ["en", "vi"],
    cacheTTL: 3600,
    renderEmpty: true,
    renderAudio: false,
    renderCodeInsteadOfName: true, // deprecated
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
    langCodes: {
        ...createAccessor("langCodes", DEFAULT_SETTINGS.langCodes),
        add: function (s: string) {
            const current = this.get();
            // Adding an already-favorited code would duplicate the tag in the
            // popup and make remove()/indexOf() ambiguous.
            if (current.includes(s)) return;
            this.set([...current, s]);
        },
        remove: function (s: string) {
            const updated = this.get().filter((code) => code !== s);
            this.set(updated);
        },
    },
    cacheTTL: createAccessor("cacheTTL", DEFAULT_SETTINGS.cacheTTL),
    renderEmpty: createAccessor("renderEmpty", DEFAULT_SETTINGS.renderEmpty),
    renderAudio: createAccessor("renderAudio", DEFAULT_SETTINGS.renderAudio),

    // deprecated
    renderCodeInsteadOfName: createAccessor(
        "renderCodeInsteadOfName",
        DEFAULT_SETTINGS.renderCodeInsteadOfName,
    ),
};
