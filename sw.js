/* Get Healthy service worker
   Offline-first: the app loads instantly from cache and works with no network.
   Each app open quietly checks GitHub for a newer index.html (via ETag); if the
   deployed version changed, the new copy is cached and open pages are told to
   show an "update available" banner. */

var CACHE = 'gethealthy-v1';
var CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(CORE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k !== CACHE;
      }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function notifyUpdate() {
  return self.clients.matchAll({ type: 'window' }).then(function (clients) {
    clients.forEach(function (c) { c.postMessage('UPDATE_AVAILABLE'); });
  });
}

function store(cache, resp) {
  return cache.put('./index.html', resp.clone()).then(function () {
    return cache.put('./', resp.clone());
  }).then(notifyUpdate);
}

// Fetch the live index.html; if it differs from the cached copy, refresh the
// cache and notify open pages. Prefers ETag (unchanged files cost only a 304,
// no re-download) and falls back to comparing the body when no ETag is sent.
function revalidateIndex() {
  return caches.open(CACHE).then(function (cache) {
    return cache.match('./index.html').then(function (cached) {
      var cachedTag = cached && cached.headers.get('etag');
      var headers = cachedTag ? { 'If-None-Match': cachedTag } : {};
      return fetch('./index.html', { cache: 'no-store', headers: headers }).then(function (resp) {
        if (resp.status === 304 || !resp.ok) return;
        var newTag = resp.headers.get('etag');
        if (cachedTag && newTag) {
          if (newTag === cachedTag) return;
          return store(cache, resp);
        }
        if (!cached) return store(cache, resp);
        return Promise.all([resp.clone().text(), cached.clone().text()]).then(function (r) {
          if (r[0] === r[1]) return;
          return store(cache, resp);
        });
      }).catch(function () { /* offline: keep serving cache */ });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var isNav = req.mode === 'navigate' ||
    url.pathname.charAt(url.pathname.length - 1) === '/' ||
    /index\.html$/.test(url.pathname);

  if (isNav) {
    e.respondWith(
      caches.open(CACHE).then(function (cache) {
        return cache.match('./index.html').then(function (cached) {
          return cached || fetch(req);
        });
      })
    );
    e.waitUntil(revalidateIndex());
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function () { return cached; });
    })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'CHECK_UPDATE') revalidateIndex();
});
