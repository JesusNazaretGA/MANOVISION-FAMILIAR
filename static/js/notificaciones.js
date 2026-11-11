
const firebaseConfig = {
    apiKey: "AIzaSyBntO-yLCAmCD-aLF-42E70xmdZeT7wGVE",
    authDomain: "manovision.firebaseapp.com",
    databaseURL: "https://manovision-default-rtdb.firebaseio.com",
    projectId: "manovision",
    storageBucket: "manovision.firebasestorage.app",
    messagingSenderId: "426642944337",
    appId: "1:426642944337:web:42ea0b736795dbb83fe370"
};

const CLAVE_VAPID = "BO4BUjeUvewF2EFgbfDi8sLGN9nC6OdWEf9Qy_9cJdPxwyTKYtsRPExZg-INQKEQOoF5_gAO74lYzGOBd3EDC4Q";

async function activarNotificaciones() {
    const boton = document.getElementById("btnActivarNotificaciones");
    const estado = document.getElementById("estadoNotificaciones");

    try {
        if (!("Notification" in window)) {
            throw new Error("Este navegador no admite notificaciones.");
        }

        if (!("serviceWorker" in navigator)) {
            throw new Error("Este navegador no admite Service Worker.");
        }

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        const permiso = await Notification.requestPermission();

        if (permiso !== "granted") {
            throw new Error("No se concedió permiso para las notificaciones.");
        }

        const registro = await navigator.serviceWorker.register(
            "/service-worker.js"
        );

        const mensajeria = firebase.messaging();

        const token = await mensajeria.getToken({
            vapidKey: CLAVE_VAPID,
            serviceWorkerRegistration: registro
        });

        if (!token) {
            throw new Error("Firebase no pudo generar el token del dispositivo.");
        }

        const respuesta = await fetch(
            "/api/familiar/dispositivos/registrar",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    token: token,
                    plataforma: "Android"
                })
            }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok || !resultado.ok) {
            throw new Error(resultado.error || "No se pudo registrar el dispositivo.");
        }

        estado.textContent = "Notificaciones activadas en este dispositivo.";
        boton.textContent = "Notificaciones activadas";
        boton.disabled = true;

    } catch (error) {
        console.error("Error activando notificaciones:", error);
        estado.textContent = error.message;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const boton = document.getElementById("btnActivarNotificaciones");

    if (boton) {
        boton.addEventListener("click", activarNotificaciones);
    }
});
