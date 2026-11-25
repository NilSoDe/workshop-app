/** Versión web: localStorage (evita cargar SQLite/WASM en el navegador). */
const ls = () => (typeof localStorage === 'undefined' ? null : localStorage);

export const kv = {
  get: async (k: string) => ls()?.getItem(k) ?? null,
  set: async (k: string, v: string) => {
    ls()?.setItem(k, v);
  },
  remove: async (k: string) => {
    ls()?.removeItem(k);
  },
  getSync: (k: string) => ls()?.getItem(k) ?? null,
};
