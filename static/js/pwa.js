if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/service-worker.js")
            .then((registro) => {
                console.log("MANOVISIÓN PWA registrada:", registro.scope);
            })
            .catch((error) => {
                console.error("Error al registrar PWA:", error);
            });
    });
}
