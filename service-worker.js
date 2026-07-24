"use strict";

const CACHE_NAME = "meal-ticket-ocr-v1";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json"
];

/*
 * 初回アクセス時にアプリファイルを保存
 */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(APP_FILES);
      })
  );
});

/*
 * 古いキャッシュを削除
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name !== CACHE_NAME;
            })
            .map((name) => {
              return caches.delete(name);
            })
        );
      })
  );
});

/*
 * 通信できない場合に保存済みファイルを使用
 */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        return (
          cachedResponse ||
          fetch(event.request)
        );
      })
  );
});
