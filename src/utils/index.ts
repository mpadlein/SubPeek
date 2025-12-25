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
