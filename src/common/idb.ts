/**
 * Lightweight IDBDatabase wrapper with a Promise-based API for one object
 * store. The store holds disposable data (a cache), so a version bump simply
 * drops and recreates it.
 */

interface StoreSchema {
    keyPath: string;
    indexes?: { name: string; keyPath: string; unique?: boolean }[];
}

export class IDBStore<T> {
    private db: IDBDatabase | null = null;
    private dbPromise: Promise<IDBDatabase> | null = null;

    constructor(
        private dbName: string,
        private storeName: string,
        private version: number,
        private schema: StoreSchema,
    ) {}

    private open(): Promise<IDBDatabase> {
        if (this.db) return Promise.resolve(this.db);
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            const fail = (error: Error) => {
                this.dbPromise = null;
                reject(error);
            };

            request.onerror = () =>
                fail(request.error ?? new Error("IndexedDB open failed"));
            // Another tab still holds an older version open, so the upgrade
            // cannot proceed; fail instead of leaving every caller pending.
            request.onblocked = () =>
                fail(new Error("IndexedDB open blocked by another connection"));

            request.onupgradeneeded = () => {
                const db = request.result;
                if (db.objectStoreNames.contains(this.storeName)) {
                    db.deleteObjectStore(this.storeName);
                }
                const store = db.createObjectStore(this.storeName, {
                    keyPath: this.schema.keyPath,
                });
                for (const index of this.schema.indexes ?? []) {
                    store.createIndex(index.name, index.keyPath, {
                        unique: index.unique ?? false,
                    });
                }
            };

            request.onsuccess = () => {
                const db = request.result;
                this.db = db;
                const forget = () => {
                    this.db = null;
                    this.dbPromise = null;
                };
                db.onclose = forget;
                // Let another tab upgrade the database instead of blocking it.
                db.onversionchange = () => {
                    db.close();
                    forget();
                };
                resolve(db);
            };
        });

        return this.dbPromise;
    }

    /** Runs `fn` inside a transaction and settles once the transaction does. */
    private transaction<R>(
        mode: IDBTransactionMode,
        fn: (store: IDBObjectStore) => R,
    ): Promise<R> {
        return this.open().then(
            (db) =>
                new Promise<R>((resolve, reject) => {
                    const tx = db.transaction(this.storeName, mode);
                    const result = fn(tx.objectStore(this.storeName));
                    tx.oncomplete = () => resolve(result);
                    tx.onerror = () =>
                        reject(tx.error ?? new Error("Transaction failed"));
                    // e.g. QuotaExceededError on put; without this the
                    // promise would never settle.
                    tx.onabort = () =>
                        reject(tx.error ?? new Error("Transaction aborted"));
                }),
        );
    }

    private request<R>(
        mode: IDBTransactionMode,
        fn: (store: IDBObjectStore) => IDBRequest<R>,
    ): Promise<R> {
        return this.transaction(mode, fn).then((request) => request.result);
    }

    get(key: IDBValidKey): Promise<T | null> {
        return this.request(
            "readonly",
            (store) => store.get(key) as IDBRequest<T | undefined>,
        ).then((value) => value ?? null);
    }

    put(value: T): Promise<void> {
        return this.request("readwrite", (store) => store.put(value)).then(
            () => undefined,
        );
    }

    deleteByIndexRange(indexName: string, range: IDBKeyRange): Promise<void> {
        return this.transaction("readwrite", (store) => {
            const cursorRequest = store.index(indexName).openCursor(range);
            cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
        });
    }
}
