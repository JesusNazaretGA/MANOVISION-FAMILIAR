
importScripts(
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"
);

importScripts(
    "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
);

const firebaseConfig = {
    apiKey: "AIzaSyBntO-yLCAmCD-aLF-42E70xmdZeT7wGVE",
    authDomain: "manovision.firebaseapp.com",
    databaseURL: "https://manovision-default-rtdb.firebaseio.com",
    projectId: "manovision",
    storageBucket: "manovision.firebasestorage.app",
    messagingSenderId: "426642944337",
    appId: "1:426642944337:web:42ea0b736795dbb83fe370"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

const CACHE_NAME = "manovision-familiar-v2";

const ARCHIVOS = [
    "/familiar",
    "/static/manifest.json",
    "/static/js/familiar.js",
    "/static/js/notificaciones.js",
    "/static/images/icono-manovision.svg"
];

// INSTALACIÓN Y CACHÉ
self.addEventListener("install", (evento) => {
    evento.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ARCHIVOS))
            .then(() => self.skipWaiting())
    );
});

// ACTIVACIÓN
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

// RECEPCIÓN DE NOTIFICACIONES EN SEGUNDO PLANO
messaging.onBackgroundMessage((payload) => {

    const titulo =
        payload.data?.titulo || "MANOVISIÓN";

    const mensaje =
        payload.data?.mensaje ||
        "Hay una nueva solicitud de MANOVISIÓN.";

    return self.registration.showNotification(titulo, {
        body: mensaje,
        icon: "/static/images/icono-manovision.svg",
        badge: "/static/images/icono-manovision.svg",
        tag: "manovision-solicitud",
        renotify: true,
        data: {
            url: "/familiar"
        }
    });
});

// AL TOCAR LA NOTIFICACIÓN
self.addEventListener("notificationclick", (evento) => {

    evento.notification.close();

    const destino = new URL(
        evento.notification.data?.url || "/familiar",
        self.location.origin
    ).href;

    evento.waitUntil(
        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then((ventanas) => {

            for (const ventana of ventanas) {
                if (ventana.url.startsWith(self.location.origin)) {
                    return ventana.focus();
                }
            }

            return clients.openWindow(destino);
        })
    );
});

// FUNCIONAMIENTO SIN CONEXIÓN
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
