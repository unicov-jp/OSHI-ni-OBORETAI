/* 推しに溺れたい: 以前のアプリ(推し活手帳)が登録した Service Worker を片付ける。
   新しいアプリは Service Worker を使わないので、古いものが残っている端末では
   保存済みのデータ(キャッシュ)を消して登録を外し、開いている画面を読み直す。 */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (clients) {
        clients.forEach(function (client) { client.navigate(client.url); });
      })
  );
});
