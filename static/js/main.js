
const gesto = document.getElementById("gesto");
const confianza = document.getElementById("confianza");
const solicitud = document.getElementById("solicitud");
const estadoSolicitud = document.getElementById("estadoSolicitud");
const resultado = document.getElementById("resultado");
const mensajeVoz = document.getElementById("mensajeVoz");

const btnConfirmar = document.getElementById("btnConfirmar");
const btnCancelar = document.getElementById("btnCancelar");


async function actualizarEstado() {

    try {

        const respuesta = await fetch("/api/estado");
        const datos = await respuesta.json();

        gesto.textContent = datos.gesto;
        confianza.textContent = datos.confianza + "%";

        if (datos.solicitud) {

            solicitud.textContent = datos.solicitud;
            mensajeVoz.textContent = datos.mensaje;

        } else {

            solicitud.textContent = "Ninguna solicitud";
            mensajeVoz.textContent =
                "Aquí aparecerá el mensaje que se pronunciará al confirmar.";
        }

        if (datos.estado === "pendiente") {

            estadoSolicitud.textContent =
                "¿Deseas confirmar esta petición?";

            btnConfirmar.disabled = false;
            btnCancelar.disabled = false;

        } else {

            btnConfirmar.disabled = true;
            btnCancelar.disabled = true;

            if (datos.estado === "confirmada") {
                estadoSolicitud.textContent =
                    "Solicitud confirmada. Mensaje reproducido.";
            } else if (datos.estado === "cancelada") {
                estadoSolicitud.textContent =
                    "Solicitud cancelada.";
            } else if (datos.estado === "error_camara") {
                estadoSolicitud.textContent =
                    "No se pudo abrir la cámara.";
            } else {
                estadoSolicitud.textContent =
                    "Esperando un gesto...";
            }
        }

    } catch (error) {

        resultado.textContent =
            "No se pudo conectar con MANOVISIÓN.";
    }
}


btnConfirmar.addEventListener("click", async () => {

    btnConfirmar.disabled = true;

    try {

        const respuesta = await fetch("/api/confirmar", {
            method: "POST"
        });

        const datos = await respuesta.json();

        resultado.textContent = datos.mensaje;

        await actualizarEstado();

    } catch (error) {

        resultado.textContent = "Error al confirmar.";
    }
});


btnCancelar.addEventListener("click", async () => {

    btnCancelar.disabled = true;

    try {

        const respuesta = await fetch("/api/cancelar", {
            method: "POST"
        });

        const datos = await respuesta.json();

        resultado.textContent = datos.mensaje;

        await actualizarEstado();

    } catch (error) {

        resultado.textContent = "Error al cancelar.";
    }
});


setInterval(actualizarEstado, 500);

actualizarEstado();
