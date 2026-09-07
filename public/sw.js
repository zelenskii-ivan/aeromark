/**
 * Стратегия:
 *  - навигация (HTML) — network-first: после деплоя ребёнок сразу получает
 *    новую версию, а офлайн отдаётся последняя удачная страница;
 *  - статика с хешем в имени (/_next/static/…) — cache-first, она неизменяема;
 *  - остальное — stale-while-revalidate.
 * Прошлая версия кешировала HTML первым делом и намертво замораживала
 * приложение до ручного повышения номера кеша.
 */
const VERSION = "aeromark-v7";
const CORE = [
  "/",
  "/flight-map.webp",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      // Один недоступный файл не должен рушить всю установку.
      .then((cache) =>
        Promise.allSettled(CORE.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Имена JS-чанков Next меняются с каждой сборкой, поэтому вписать их в CORE
 * нельзя. Вместо этого страница после загрузки присылает список ресурсов,
 * которые ей реально понадобились, и мы кладём их в кеш. Без этого офлайн
 * работал только со второго визита: при первой загрузке worker ещё не
 * управлял страницей и её запросы проходили мимо него.
 */
self.addEventListener("message", (event) => {
  const urls = event.data?.type === "warm" ? event.data.urls : null;
  if (!Array.isArray(urls)) return;
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        Promise.allSettled(
          urls
            .filter((url) => url.startsWith(self.location.origin))
            .map((url) => cache.match(url).then((hit) => (hit ? null : cache.add(url)))),
        ),
      ),
  );
});

const putInCache = async (request, response) => {
  if (response && response.ok && response.type === "basic") {
    const cache = await caches.open(VERSION);
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Ответы API — состояние семьи на сервере, а не статика. Без этой строки
  // worker отдавал закешированный /api/me, и только что созданный профиль
  // ребёнка не появлялся в списке: приложение показывало устаревший ответ,
  // хотя сервер отвечал правильно.
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => putInCache(request, response))
        .catch(async () => (await caches.match(request)) ?? caches.match("/")),
    );
    return;
  }

  const immutable =
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:woff2?|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname);

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => putInCache(request, response))
        .catch(() => cached);
      if (!cached) return network;
      // Отдаём кеш сразу; неизменяемую статику даже не перепроверяем.
      if (!immutable) event.waitUntil(network);
      return cached;
    }),
  );
});
