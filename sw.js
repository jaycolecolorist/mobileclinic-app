/* Mobile Clinic preview: decrypts the app for this device after the password is entered. Holds no secrets. */
const BASE = "/mobileclinic-app/";
let keyP = null;
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('mc-lock', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function rawKey() { const db = await idb(); return new Promise((res) => { const q = db.transaction('k').objectStore('k').get('key'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
async function getKey() {
  if (!keyP) keyP = rawKey().then((raw) => (raw ? crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']) : null));
  const k = await keyP; if (!k) keyP = null; return k;
}
async function dec(url, key) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status + ' ' + url);
  const b = new Uint8Array(await r.arrayBuffer());
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12));
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (e) => { if (e.data === 'key-updated') keyP = null; });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || !u.pathname.startsWith(BASE)) return;
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      const key = await getKey().catch(() => null);
      if (key) { try { return new Response(await dec(BASE + 'app.html.enc', key), { headers: { 'content-type': 'text/html; charset=utf-8' } }); } catch (_) {} }
      return fetch(BASE + 'lock.html', { cache: 'no-cache' });
    })());
    return;
  }
  if (u.pathname.startsWith(BASE + '_expo/') && u.pathname.endsWith('.js')) {
    e.respondWith((async () => {
      const key = await getKey();
      if (!key) return new Response('', { status: 403 });
      return new Response(await dec(u.pathname + '.enc', key), { headers: { 'content-type': 'application/javascript; charset=utf-8' } });
    })());
  }
});
