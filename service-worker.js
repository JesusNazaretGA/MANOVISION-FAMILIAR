const CACHE_NAME = "manovision-familiar-v1";

const ARCHIVOS = [
    "/familiar",
    "/static/manifest.json",
    "/static/js/familiar.js",
    "/static/images/icono-manovision.svg"
];

self.addEventListener("install", (evento) => {
    evento.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ARCHIVOS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (evento) => {
    evento.waitUntil(
        caches.keys().then((nombres) =>
            Promise.all(
                nombres
                    .filter((nombre) => nombre !== CACHE_NAME)
                    .map((nombre) => caches.delete(nombre))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (evento) => {
    const solicitud = evento.request;
    const url = new URL(solicitud.url);

    if (
        solicitud.method !== "GET" ||
        url.origin !== self.location.origin ||
        url.pathname.startsWith("/api/")
    ) {
        return;
    }

    if (solicitud.mode === "navigate") {
        evento.respondWith(
            fetch(solicitud)
                .then((respuesta) => {
                    const copia = respuesta.clone();
                    caches.open(CACHE_NAME).then((cache) =>
                        cache.put(solicitud, copia)
                    );
                    return respuesta;
                })
                .catch(async () => {
                    return await caches.match(solicitud) ||
                           await caches.match("/familiar");
                })
        );
        return;
    }

    evento.respondWith(
        caches.match(solicitud).then((guardado) => {
            return guardado || fetch(solicitud);
        })
    );
});
