export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function arrayEquals<T>(a: T[], b: T[]) {
    return (
        a.length === b.length && a.every((value, index) => value === b[index])
    );
}

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

export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
