"use strict";

/*
 * =========================================================
 * CLOVER DINING 食券OCR
 * Service Worker
 * =========================================================
 */

const CACHE_NAME =
  "clover-dining-meal-ticket-ocr-v5";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

/*
 * =========================================================
 * インストール
 * =========================================================
 */

self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => {
          return cache.addAll(
            APP_SHELL
          );
        })
        .then(() => {
          return self.skipWaiting();
        })
    );
  }
);

/*
 * =========================================================
 * 有効化
 * =========================================================
 */

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames
              .filter((cacheName) => {
                return (
                  cacheName !==
                  CACHE_NAME
                );
              })
              .map((cacheName) => {
                return caches.delete(
                  cacheName
                );
              })
          );
        })
        .then(() => {
          return self.clients.claim();
        })
    );
  }
);

/*
 * =========================================================
 * 通信処理
 * =========================================================
 */

self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    /*
     * GET通信以外は処理しない
     */
    if (
      request.method !== "GET"
    ) {
      return;
    }

    const requestUrl =
      new URL(request.url);

    /*
     * Tesseract.jsなど外部CDNは、
     * ネットワーク優先で取得する
     */
    if (
      requestUrl.origin !==
      self.location.origin
    ) {
      event.respondWith(
        networkFirst(
          request
        )
      );

      return;
    }

    /*
     * ページ遷移はネットワーク優先
     */
    if (
      request.mode ===
        "navigate"
    ) {
      event.respondWith(
        networkFirst(
          request,
          "./index.html"
        )
      );

      return;
    }

    /*
     * 同一サイト内の静的ファイルは
     * キャッシュ優先
     */
    event.respondWith(
      cacheFirst(
        request
      )
    );
  }
);

/*
 * =========================================================
 * キャッシュ優先
 * =========================================================
 */

async function cacheFirst(
  request
) {
  const cachedResponse =
    await caches.match(
      request
    );

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse =
      await fetch(request);

    if (
      networkResponse &&
      networkResponse.ok
    ) {
      const cache =
        await caches.open(
          CACHE_NAME
        );

      cache.put(
        request,
        networkResponse.clone()
      );
    }

    return networkResponse;
  } catch (error) {
    console.error(
      "Cache first error:",
      error
    );

    throw error;
  }
}

/*
 * =========================================================
 * ネットワーク優先
 * =========================================================
 */

async function networkFirst(
  request,
  fallbackPath = ""
) {
  try {
    const networkResponse =
      await fetch(request);

    if (
      networkResponse &&
      networkResponse.ok
    ) {
      const cache =
        await caches.open(
          CACHE_NAME
        );

      cache.put(
        request,
        networkResponse.clone()
      );
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse =
      await caches.match(
        request
      );

    if (cachedResponse) {
      return cachedResponse;
    }

    if (fallbackPath) {
      const fallbackResponse =
        await caches.match(
          fallbackPath
        );

      if (fallbackResponse) {
        return fallbackResponse;
      }
    }

    console.error(
      "Network first error:",
      error
    );

    return new Response(
      "オフラインのため、ページを表示できません。",
      {
        status: 503,
        statusText:
          "Service Unavailable",
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      }
    );
  }
}
