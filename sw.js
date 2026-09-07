/* Get Healthy service worker
   Offline-first: the app loads instantly from cache and works with no network.
   Each app open quietly checks GitHub for a newer index.html (via ETag); if the
   deployed version changed, the new copy is cached and open pages are told to
   show an "update available" banner. */

var CACHE = 'gethealthy-v2';
/* The font CSS is precached so the very first offline open still has the
   @font-face rules. The woff2 subsets themselves are fetched on demand (the
   browser only pulls the unicode ranges actually used) and land in the same
   cache via the runtime handler below, so they survive offline afterwards. */
var CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png',
            './fonts/wanted-sans/WantedSansVariable.css'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // core app shell must succeed; the font CSS is best-effort
      return c.addAll(CORE).catch(function () {
        return c.addAll(CORE.filter(function (u) { return u.indexOf('/fonts/') === -1; }));
      });
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

function put(cache, resp) {
  return cache.put('./index.html', resp.clone()).then(function () {
    return cache.put('./', resp.clone());
  });
}

function store(cache, resp) {
  return put(cache, resp).then(notifyUpdate);
}

// Fetch the live index.html; if it differs from the cached copy, refresh the
// cache and notify open pages.
//
// The ETag is used only as a cheap "definitely unchanged" signal: a matching
// If-None-Match costs a 304 with no re-download. A *differing* ETag is NOT
// treated as a change, because GitHub Pages builds the ETag from the file's
// mtime ("<hex mtime>-<hex size>") and its replicas unpack the site a second or
// two apart. The very same bytes therefore come back as "6a7c5a15-6f684" from
// one node and "6a7c5a16-6f684" from another, so a phone moving between edge
// nodes saw a fresh "update" on every single open. Only the body decides — and
// on an ETag miss we have already downloaded it anyway, so this costs nothing.
function revalidateIndex() {
  return caches.open(CACHE).then(function (cache) {
    return cache.match('./index.html').then(function (cached) {
      var cachedTag = cached && cached.headers.get('etag');
      var headers = cachedTag ? { 'If-None-Match': cachedTag } : {};
      return fetch('./index.html', { cache: 'no-store', headers: headers }).then(function (resp) {
        if (resp.status === 304 || !resp.ok) return;
        // Nothing cached yet (evicted, or a failed install): fill the cache, but
        // there is no update to announce — the page is already running this copy.
        if (!cached) return put(cache, resp);
        return Promise.all([resp.clone().text(), cached.clone().text()]).then(function (r) {
          if (r[0] === r[1]) return;  // same app, only the ETag/mtime differs
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
      // font subsets are content-addressed by filename and never change, so a
      // cache miss simply fetches once and stores forever
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
