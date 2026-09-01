// TODO: dead code
export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// TODO: dead code
export function arrayEquals<T>(a: T[], b: T[]) {
    return (
        a.length === b.length && a.every((value, index) => value === b[index])
    );
}

// TODO: dead code
export function lazyLoad<T>(fn: () => T): () => T {
    let value: T;
    let isLoaded = false;
    return () => {
        if (!isLoaded) {
            value = fn();
            isLoaded = true;
        }
        return value;
    };
}

// TODO: dead code — last caller removed when the cache readout switched from
// bytes to a record count. Note: sizes[i] is undefined above 1 TB.
export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
