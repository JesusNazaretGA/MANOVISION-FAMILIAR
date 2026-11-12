const listaSolicitudes = document.getElementById("listaSolicitudes");
const mensajeHistorial = document.getElementById("mensajeHistorial");

const totalSolicitudes = document.getElementById("totalSolicitudes");
const pendientesSolicitudes = document.getElementById("pendientesSolicitudes");
const respondidasSolicitudes = document.getElementById("respondidasSolicitudes");

const filtroGesto = document.getElementById("filtroGesto");
const filtroEstado = document.getElementById("filtroEstado");
const filtroFecha = document.getElementById("filtroFecha");
const btnActualizar = document.getElementById("btnActualizar");

let solicitudes = [];

function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caracter]);
}

function formatearFecha(fecha) {
    if (!fecha) return "Fecha no disponible";

    const fechaObjeto = new Date(fecha);

    if (Number.isNaN(fechaObjeto.getTime())) {
        return "Fecha no disponible";
    }

    return fechaObjeto.toLocaleString("es-MX", {
        dateStyle: "long",
        timeStyle: "short"
    });
}

function actualizarEstadisticas() {
    totalSolicitudes.textContent = solicitudes.length;

    pendientesSolicitudes.textContent = solicitudes.filter(
        solicitud => solicitud.estado === "pendiente"
    ).length;

    respondidasSolicitudes.textContent = solicitudes.filter(
        solicitud => solicitud.estado === "respondida"
    ).length;
}

function obtenerNombreGesto(gesto) {
    const nombres = {
        AGUA: "Agua",
        COMIDA: "Comida",
        AYUDA: "Ayuda",
        DOLOR: "Dolor",
        LLAMAR: "Llamar a familiar"
    };

    return nombres[gesto] || gesto || "Solicitud";
}

function mostrarSolicitudes() {
    const gestoSeleccionado = filtroGesto.value;
    const estadoSeleccionado = filtroEstado.value;
    const fechaSeleccionada = filtroFecha.value;

    const filtradas = solicitudes.filter(solicitud => {
        const coincideGesto =
            !gestoSeleccionado || solicitud.gesto === gestoSeleccionado;

        const coincideEstado =
            !estadoSeleccionado || solicitud.estado === estadoSeleccionado;

        const fechaSolicitud = solicitud.fecha
            ? new Date(solicitud.fecha).toLocaleDateString("en-CA")
            : "";

        const coincideFecha =
            !fechaSeleccionada || fechaSolicitud === fechaSeleccionada;

        return coincideGesto && coincideEstado && coincideFecha;
    });

    listaSolicitudes.innerHTML = "";

    if (filtradas.length === 0) {
        mensajeHistorial.textContent =
            solicitudes.length === 0
                ? "Todavía no hay solicitudes registradas."
                : "No hay solicitudes que coincidan con los filtros.";

        return;
    }

    mensajeHistorial.textContent =
        `Se encontraron ${filtradas.length} solicitudes.`;

    filtradas.forEach(solicitud => {
        const respondida = solicitud.estado === "respondida";
        const respuesta = solicitud.respuesta;

        const textoRespuesta =
            respuesta && typeof respuesta === "object"
                ? respuesta.texto
                : "";

        const tarjeta = document.createElement("article");
        tarjeta.className = "tarjeta-solicitud";

        tarjeta.innerHTML = `
            <div class="solicitud-superior">
                <div>
                    <span class="etiqueta-gesto">
                        ${escaparHTML(obtenerNombreGesto(solicitud.gesto))}
                    </span>
                    <h3>${escaparHTML(solicitud.mensaje || "Sin mensaje")}</h3>
                </div>

                <span class="estado-solicitud ${respondida ? "estado-respondida" : "estado-pendiente"}">
                    ${respondida ? "Respondida" : "Pendiente"}
                </span>
            </div>

            <p class="fecha-solicitud">
                ${escaparHTML(formatearFecha(solicitud.fecha))}
            </p>

            ${
                respondida && textoRespuesta
                    ? `
                        <div class="respuesta-familiar">
                            <strong>Respuesta del familiar</strong>
                            <p>${escaparHTML(textoRespuesta)}</p>
                            <small>${escaparHTML(formatearFecha(respuesta.fecha))}</small>
                        </div>
                    `
                    : ""
            }
        `;

        listaSolicitudes.appendChild(tarjeta);
    });
}

async function cargarHistorial() {
    mensajeHistorial.textContent = "Cargando solicitudes...";
    btnActualizar.disabled = true;

    try {
        const respuesta = await fetch("/api/familiar/solicitudes", {
            cache: "no-store"
        });

        const datos = await respuesta.json();

        if (!respuesta.ok || !datos.ok) {
            throw new Error("No fue posible consultar las solicitudes.");
        }

        solicitudes = Array.isArray(datos.solicitudes)
            ? datos.solicitudes
            : [];

        actualizarEstadisticas();
        mostrarSolicitudes();

    } catch (error) {
        console.error("Error al cargar historial:", error);
        mensajeHistorial.textContent =
            "No se pudo cargar el historial. Intenta actualizar.";

    } finally {
        btnActualizar.disabled = false;
    }
}

filtroGesto.addEventListener("change", mostrarSolicitudes);
filtroEstado.addEventListener("change", mostrarSolicitudes);
filtroFecha.addEventListener("change", mostrarSolicitudes);

btnActualizar.addEventListener("click", cargarHistorial);

cargarHistorial();
