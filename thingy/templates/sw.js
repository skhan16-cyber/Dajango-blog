const CACHE_NAME = 'django-app-v1';
const OFFLINE_URL = '/offline/';


const PRECACHE_ASSETS = [
  '/',
  '/offline/',
  '/static/css/main.css',
  '/static/js/main.js',

];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching assets');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );

  self.skipWaiting();
});


self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    )
  );

  self.clients.claim();
});


self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);


  if (request.method !== 'GET') {
    event.respondWith(handleMutation(request));
    return;
  }


  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }


  event.respondWith(cacheFirstStrategy(request));
});


async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({ error: 'You are offline. Please check your connection.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {

    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    return new Response('Offline', { status: 503 });
  }
}


async function handleMutation(request) {
  try {
    return await fetch(request);
  } catch {

    await saveOfflineRequest(request);
    return new Response(
      JSON.stringify({ queued: true, message: 'Request saved. Will sync when online.' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } }
    );
  }
}


async function saveOfflineRequest(request) {
  const db = await openDB();
  const body = await request.text();
  const tx = db.transaction('pendingRequests', 'readwrite');
  tx.objectStore('pendingRequests').add({
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
    timestamp: Date.now(),
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('offlineQueue', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('pendingRequests', {
        autoIncrement: true,
        keyPath: 'id',
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}


self.addEventListener('sync', (event) => {
  if (event.tag === 'replay-offline-requests') {
    event.waitUntil(replayOfflineRequests());
  }
});

async function replayOfflineRequests() {
  const db = await openDB();
  const tx = db.transaction('pendingRequests', 'readwrite');
  const store = tx.objectStore('pendingRequests');
  const all = await new Promise((res) => {
    const req = store.getAll();
    req.onsuccess = () => res(req.result);
  });

  for (const item of all) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
      });
      store.delete(item.id);
      console.log('[SW] Replayed offline request:', item.url);
    } catch {
      console.warn('[SW] Still offline, keeping queued:', item.url);
    }
  }
}