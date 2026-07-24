"use strict";

/*
 * キャッシュ名のバージョンを変更すると、
 * 古いファイルが削除されます。
 */
const CACHE_NAME =
  "clover-dining-meal-ticket-ocr-v4";

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
 * 基本ファイルをキャッシュ
 */
self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) => {
          return cache.addAll(
            APP_FILES
          );
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
              .filter(
                (cacheName) => {
                  return (
                    cacheName !==
                    CACHE_NAME
                  );
                }
              )
              .map(
                (cacheName) => {
                  return caches.delete(
                    cacheName
                  );
                }
              )
          );
        })
        .then(() => {
          return self.clients.claim();
        })
    );
  }
);

/*
 * GET通信を処理
 */
self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    if (
      request.method !== "GET"
    ) {
      return;
    }

    const requestUrl =
      new URL(request.url);

    /*
     * GitHub Pages内のファイルは
     * ネットワークを優先する
     */
    if (
      requestUrl.origin ===
      self.location.origin
    ) {
      event.respondWith(
        fetch(request)
          .then(
            (
              networkResponse
            ) => {
              if (
                networkResponse &&
                networkResponse.status ===
                  200
              ) {
                const responseCopy =
                  networkResponse.clone();

                caches
                  .open(CACHE_NAME)
                  .then(
                    (cache) => {
                      cache.put(
                        request,
                        responseCopy
                      );
                    }
                  );
              }

              return networkResponse;
            }
          )
          .catch(
            async () => {
              const cachedResponse =
                await caches.match(
                  request
                );

              if (
                cachedResponse
              ) {
                return cachedResponse;
              }

              /*
               * ページ移動時の予備画面
               */
              if (
                request.mode ===
                "navigate"
              ) {
                return caches.match(
                  "./index.html"
                );
              }

              throw new Error(
                "Resource unavailable"
              );
            }
          )
      );

      return;
    }

    /*
     * Tesseract.jsなど外部ファイルは
     * キャッシュ優先
     */
    event.respondWith(
      caches
        .match(request)
        .then(
          (
            cachedResponse
          ) => {
            if (
              cachedResponse
            ) {
              return cachedResponse;
            }

            return fetch(request)
              .then(
                (
                  networkResponse
                ) => {
                  if (
                    networkResponse &&
                    networkResponse.status ===
                      200
                  ) {
                    const responseCopy =
                      networkResponse.clone();

                    caches
                      .open(
                        CACHE_NAME
                      )
                      .then(
                        (
                          cache
                        ) => {
                          cache.put(
                            request,
                            responseCopy
                          );
                        }
                      );
                  }

                  return networkResponse;
                }
              );
          }
        )
    );
  }
);
