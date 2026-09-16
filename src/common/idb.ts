/**
 * Lightweight IDBDatabase wrapper with Promise-based API
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

    private async open(): Promise<IDBDatabase> {
        if (this.db) return this.db;
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                this.dbPromise = null;
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.db.onclose = () => {
                    this.db = null;
                    this.dbPromise = null;
                };
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, {
                        keyPath: this.schema.keyPath,
                    });
                    for (const idx of this.schema.indexes ?? []) {
                        store.createIndex(idx.name, idx.keyPath, {
                            unique: idx.unique ?? false,
                        });
                    }
                }
            };
        });

        return this.dbPromise;
    }

    private run<R>(
        mode: IDBTransactionMode,
        fn: (store: IDBObjectStore) => IDBRequest<R>,
    ): Promise<R> {
        return this.open().then(
            (db) =>
                new Promise((resolve, reject) => {
                    const tx = db.transaction(this.storeName, mode);
                    const store = tx.objectStore(this.storeName);
                    const request = fn(store);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => resolve(request.result);
                    // Without this the promise never settles when the whole
                    // transaction aborts (e.g. QuotaExceededError on put).
                    tx.onabort = () =>
                        reject(tx.error ?? new Error("Transaction aborted"));
                }),
        );
    }

    get(key: IDBValidKey): Promise<T | null> {
        return this.run("readonly", (s) => s.get(key)).then((r) => r ?? null);
    }

    put(value: T): Promise<void> {
        return this.run("readwrite", (s) => s.put(value)).then(() => {});
    }

    deleteByIndexRange(indexName: string, range: IDBKeyRange): Promise<void> {
        return this.open().then(
            (db) =>
                new Promise((resolve, reject) => {
                    const tx = db.transaction(this.storeName, "readwrite");
                    const store = tx.objectStore(this.storeName);
                    const index = store.index(indexName);
                    const request = index.openCursor(range);

                    request.onerror = () => reject(request.error);
                    request.onsuccess = (event) => {
                        const cursor = (
                            event.target as IDBRequest<IDBCursorWithValue>
                        ).result;
                        if (cursor) {
                            cursor.delete();
                            cursor.continue();
                        }
                    };

                    tx.oncomplete = () => resolve();
                    // Only oncomplete resolved this promise, so an aborted or
                    // errored transaction left it pending forever.
                    tx.onerror = () =>
                        reject(tx.error ?? new Error("Transaction failed"));
                    tx.onabort = () =>
                        reject(tx.error ?? new Error("Transaction aborted"));
                }),
        );
    }
}
