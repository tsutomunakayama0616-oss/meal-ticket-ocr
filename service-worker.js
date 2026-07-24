"use strict";

/*
 * バージョンを変更することで、
 * 古いapp.jsなどのキャッシュを削除する
 */
const CACHE_NAME =
  "clover-dining-meal-ticket-ocr-v3";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

/*
 * アプリファイルをキャッシュ
 */
self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => {
          return cache.addAll(APP_FILES);
        })
        .then(() => {
          return self.skipWaiting();
        })
    );
  }
);

/*
 * 古いキャッシュを削除
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
                  cacheName !== CACHE_NAME
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
 * 通信を優先し、
 * 通信できない場合はキャッシュを使用
 */
self.addEventListener(
  "fetch",
  (event) => {
    const request = event.request;

    /*
     * GET以外は処理しない
     */
    if (request.method !== "GET") {
      return;
    }

    /*
     * GitHub Pages内のファイルは
     * ネットワーク優先で更新を取得
     */
    if (
      request.url.startsWith(
        self.location.origin
      )
    ) {
      event.respondWith(
        fetch(request)
          .then((networkResponse) => {
            /*
             * 正常な応答をキャッシュへ保存
             */
            if (
              networkResponse &&
              networkResponse.status === 200
            ) {
              const responseCopy =
                networkResponse.clone();

              caches
                .open(CACHE_NAME)
                .then((cache) => {
                  cache.put(
                    request,
                    responseCopy
                  );
                });
            }

            return networkResponse;
          })
          .catch(() => {
            return caches.match(request);
          })
      );

      return;
    }

    /*
     * 外部ファイルはキャッシュ優先
     */
    event.respondWith(
      caches
        .match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(request);
        })
    );
  }
);
