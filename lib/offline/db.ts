const DB_NAME = "hissa-offline"
const DB_VERSION = 1

type StoreName = "meta" | "groups" | "details" | "outbox"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta")
      if (!db.objectStoreNames.contains("groups")) db.createObjectStore("groups")
      if (!db.objectStoreNames.contains("details")) db.createObjectStore("details", { keyPath: "id" })
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Failed to open offline DB"))
  })
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })
}

async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (objectStore: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  const db = await openDb()
  try {
    const tx = db.transaction(store, mode)
    const objectStore = tx.objectStore(store)
    const result = fn(objectStore)
    const value = result instanceof Promise ? await result : await req(result)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"))
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"))
    })
    return value
  } finally {
    db.close()
  }
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore(store, "readonly", (objectStore) => objectStore.get(key))
}

export async function idbPut(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  await withStore(store, "readwrite", (objectStore) => (key !== undefined ? objectStore.put(value, key) : objectStore.put(value)))
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  await withStore(store, "readwrite", (objectStore) => objectStore.delete(key))
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return withStore(store, "readonly", (objectStore) => objectStore.getAll())
}

export async function idbClear(store: StoreName): Promise<void> {
  await withStore(store, "readwrite", (objectStore) => objectStore.clear())
}
