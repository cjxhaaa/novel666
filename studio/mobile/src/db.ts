// 手机本地存储：IndexedDB 里两张表，files 放同步下来的文件（键为“书编号/相对路径”），kv 放书目、配对信息。
const NAME = 'xingtu';
let dbp: Promise<IDBDatabase> | null = null;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('files');
      r.result.createObjectStore('kv');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function req<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return req((await db()).transaction('kv').objectStore('kv').get(key));
}

export async function kvSet(key: string, value: unknown) {
  const tx = (await db()).transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  await done(tx);
}

/** 写入一批文件；值为 null 的删掉 */
export async function putFiles(book: string, files: Record<string, string | null>) {
  const tx = (await db()).transaction('files', 'readwrite');
  const st = tx.objectStore('files');
  for (const [rel, text] of Object.entries(files)) {
    if (text == null) st.delete(`${book}/${rel}`);
    else st.put(text, `${book}/${rel}`);
  }
  await done(tx);
}

export async function getFiles(book: string, paths: string[]): Promise<Record<string, string>> {
  const st = (await db()).transaction('files').objectStore('files');
  const out: Record<string, string> = {};
  await Promise.all(
    paths.map(async (rel) => {
      const v = await req(st.get(`${book}/${rel}`));
      if (typeof v === 'string') out[rel] = v;
    }),
  );
  return out;
}

export async function getFile(book: string, rel: string): Promise<string | undefined> {
  return (await getFiles(book, [rel]))[rel];
}

export async function deleteBook(book: string) {
  const tx = (await db()).transaction('files', 'readwrite');
  tx.objectStore('files').delete(IDBKeyRange.bound(`${book}/`, `${book}/￿`));
  await done(tx);
}

export async function clearAll() {
  const tx = (await db()).transaction(['files', 'kv'], 'readwrite');
  tx.objectStore('files').clear();
  tx.objectStore('kv').clear();
  await done(tx);
}
