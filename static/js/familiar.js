
document.addEventListener("DOMContentLoaded", () => {

    const espera = document.getElementById("espera");
    const solicitud = document.getElementById("solicitud");
    const mensajeSolicitud = document.getElementById("mensajeSolicitud");
    const fechaSolicitud = document.getElementById("fechaSolicitud");
    const estadoConexion = document.getElementById("estadoConexion");
    const indicador = document.querySelector(".indicador");

    const btnResponder = document.getElementById("btnResponder");
    const btnEscuchar = document.getElementById("btnEscuchar");
    const btnEnviar = document.getElementById("btnEnviar");

    const textarea = document.getElementById("respuestaPersonalizada");
    const botonesRapidos = document.querySelectorAll(".respuesta");

    let solicitudActiva = null;
    let consultando = false;
    let repetirConsulta = false;
    let enviando = false;

    function activarRespuestas(activar) {
        const habilitar = activar && !enviando;

        btnResponder.disabled = !habilitar;
        btnEscuchar.disabled = !habilitar;
        btnEnviar.disabled = !habilitar;

        botonesRapidos.forEach(boton => {
            boton.disabled = !habilitar;
        });
    }

    function cambiarConexion(conectado, mensaje) {
        estadoConexion.textContent = mensaje;

        indicador.style.background = conectado
            ? "#16834a"
            : "#d9534f";
    }

    function hablar(texto) {
        if (!("speechSynthesis" in window)) return;

        window.speechSynthesis.cancel();

        const voz = new SpeechSynthesisUtterance(texto);
        voz.lang = "es-MX";
        voz.rate = 0.9;
        voz.pitch = 1;

        window.speechSynthesis.speak(voz);
    }

    function mostrarSolicitud(datos) {

        if (solicitudActiva?.id === datos.id) {
            return;
        }

        solicitudActiva = datos;

        mensajeSolicitud.textContent =
            datos.mensaje || datos.gesto || "Nueva solicitud";

        if (datos.fecha) {
            const fecha = new Date(datos.fecha);
            fechaSolicitud.textContent =
                "Recibida: " + fecha.toLocaleString("es-MX");
        } else {
            fechaSolicitud.textContent = "Solicitud recibida.";
        }

        espera.style.display = "none";
        solicitud.style.display = "block";

        textarea.value = "";

        activarRespuestas(true);

        hablar("Nueva solicitud de MANOVISIÓN. " +
            mensajeSolicitud.textContent);

        console.log("Solicitud mostrada:", datos.id);
    }

    function mostrarEspera() {
        solicitudActiva = null;

        solicitud.style.display = "none";
        espera.style.display = "block";

        activarRespuestas(false);
    }

    async function consultarSolicitudes() {

        if (consultando) {
            repetirConsulta = true;
            return;
        }

        consultando = true;

        try {

            do {
                repetirConsulta = false;

                const respuesta = await fetch(
                    "/api/familiar/solicitudes?_=" + Date.now(),
                    {
                        method: "GET",
                        cache: "no-store"
                    }
                );

                if (!respuesta.ok) {
                    throw new Error("Error consultando solicitudes.");
                }

                const datos = await respuesta.json();

                if (!datos.ok || !Array.isArray(datos.solicitudes)) {
                    throw new Error("Respuesta incorrecta del servidor.");
                }

                cambiarConexion(true, "Conectado con MANOVISIÓN.");

                const pendientes = datos.solicitudes
                    .filter(item => item.estado === "pendiente")
                    .sort((a, b) =>
                        new Date(b.fecha) - new Date(a.fecha)
                    );

                console.log(
                    "Solicitudes pendientes:",
                    pendientes.length
                );

                if (pendientes.length > 0) {
                    mostrarSolicitud(pendientes[0]);
                } else {
                    mostrarEspera();
                }

            } while (repetirConsulta);

        } catch (error) {

            console.error("Error consultando solicitudes:", error);

            cambiarConexion(
                false,
                "Sin conexión. Intentando reconectar..."
            );

        } finally {
            consultando = false;
        }
    }

    btnEscuchar.addEventListener("click", () => {
        if (!solicitudActiva) return;
        hablar(solicitudActiva.mensaje);
    });

    btnResponder.addEventListener("click", () => {
        if (!solicitudActiva) return;

        textarea.focus();

        textarea.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    });

    botonesRapidos.forEach(boton => {
        boton.addEventListener("click", () => {
            if (!solicitudActiva || enviando) return;

            textarea.value = boton.dataset.respuesta;
            textarea.focus();
        });
    });

    btnEnviar.addEventListener("click", async () => {

        if (!solicitudActiva || enviando) return;

        const mensaje = textarea.value.trim();

        if (!mensaje) {
            alert("Escribe una respuesta primero.");
            return;
        }

        const idSolicitud = solicitudActiva.id;

        enviando = true;
        btnEnviar.disabled = true;
        btnEnviar.textContent = "Enviando...";

        activarRespuestas(false);

        try {

            const respuesta = await fetch(
                "/api/familiar/responder",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        id: idSolicitud,
                        respuesta: mensaje
                    })
                }
            );

            const resultado = await respuesta.json();

            if (!respuesta.ok || !resultado.ok) {
                throw new Error(
                    resultado.error || "No se pudo enviar la respuesta."
                );
            }

            console.log("Respuesta guardada:", idSolicitud);

            hablar("Respuesta enviada correctamente.");

            alert("Respuesta guardada en Firebase.");

            solicitudActiva = null;
            textarea.value = "";

            mostrarEspera();

            await consultarSolicitudes();

        } catch (error) {

            console.error("Error al responder:", error);

            alert("Error al enviar la respuesta: " + error.message);

        } finally {

            enviando = false;
            btnEnviar.textContent = "Enviar respuesta";

            activarRespuestas(Boolean(solicitudActiva));

            // Actualizar después de terminar el envío.
            consultarSolicitudes();
        }
    });

    // Primera consulta al abrir la pantalla.
    consultarSolicitudes();

    // Revisar Firebase cada 2 segundos.
    setInterval(consultarSolicitudes, 2000);

});
