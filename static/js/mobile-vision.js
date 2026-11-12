
document.addEventListener("DOMContentLoaded", () => {

    // =====================================
    // ELEMENTOS HTML
    // =====================================

    const video = document.getElementById("videoCamara");

    const btnIniciar = document.getElementById("btnIniciarCamara");
    const btnDetener = document.getElementById("btnDetenerCamara");

    const mensajeCamara = document.getElementById("mensajeCamara");

    const estadoSistema = document.getElementById("estadoSistema");
    const indicadorSistema = document.getElementById("indicadorSistema");

    const estadoMano = document.getElementById("estadoMano");
    const indicadorMano = document.getElementById("indicadorMano");

    const estadoServidor = document.getElementById("estadoServidor");
    const estadoReconocimiento = document.getElementById("estadoReconocimiento");

    const estadoIA = document.getElementById("estadoIA");
    const estadoFirebase = document.getElementById("estadoFirebase");

    const mensajeVoz = document.getElementById("mensajeVoz");
    const btnRepetirVoz = document.getElementById("btnRepetirVoz");

    const nombreGesto = document.getElementById("nombreGesto");
    const confianzaElemento = document.getElementById("confianza");
    const barraConfianza = document.getElementById("barraConfianza");
    const iconoGesto = document.getElementById("iconoGesto");

    const mensajeSolicitud = document.getElementById("mensajeSolicitud");
    const estadoSolicitud = document.getElementById("estadoSolicitud");

    // =====================================
    // CONFIGURACIÓN
    // =====================================

    const URL_MODELO = "/static/models/gesture_model.json";

    const URL_WASM =
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

    const URL_MEDIAPIPE =
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

    const URL_MODELO_MANO =
        "/static/models/hand_landmarker.task";

    const CONFIANZA_MINIMA = 0.75;
    const FOTOGRAMAS_ESTABLES = 8;
    const TAMANO_HISTORIAL = 10;

    const MENSAJES = {
        AGUA: "Necesito agua.",
        COMIDA: "Necesito comida.",
        AYUDA: "Necesito ayuda.",
        DOLOR: "Tengo dolor.",
        LLAMAR: "Quiero llamar a mi familiar."
    };

    const ICONOS = {
        AGUA: "💧",
        COMIDA: "🍎",
        AYUDA: "🆘",
        DOLOR: "❤️",
        LLAMAR: "📞",
        CONFIRMAR: "✅",
        CANCELAR: "❌"
    };

    // =====================================
    // VARIABLES
    // =====================================

    let flujoCamara = null;
    let camaraActiva = false;

    let handLandmarker = null;
    let modelo = null;

    let historial = [];
    let gestoAnterior = null;

    let ultimoFotograma = 0;
    let animacion = null;

    let canvas = document.createElement("canvas");
    let contexto = canvas.getContext("2d", {
        willReadFrequently: false
    });

    let iaPreparada = false;

    // =====================================
    // ESTADOS
    // =====================================

    function cambiarEstadoSistema(texto, color) {
        estadoSistema.textContent = texto;
        indicadorSistema.style.background = color;
    }

    function cambiarEstadoMano(texto, color) {
        estadoMano.textContent = texto;
        indicadorMano.style.background = color;
    }

    // =====================================
    // VOZ
    // =====================================

    function hablar(texto) {

        if (!("speechSynthesis" in window)) {
            console.warn("Síntesis de voz no disponible.");
            return;
        }

        window.speechSynthesis.cancel();

        const voz = new SpeechSynthesisUtterance(texto);

        voz.lang = "es-MX";
        voz.rate = 0.9;
        voz.pitch = 1;

        window.speechSynthesis.speak(voz);
    }

    // =====================================
    // SERVIDOR
    // =====================================

    async function comprobarServidor() {

        try {

            const respuesta = await fetch(
                "/health?_=" + Date.now(),
                { cache: "no-store" }
            );

            if (!respuesta.ok) {
                throw new Error("Servidor no disponible");
            }

            const datos = await respuesta.json();

            if (datos.estado !== "activo") {
                throw new Error("Estado incorrecto");
            }

            estadoServidor.textContent = "Conectado";
            estadoServidor.style.color = "#16834a";

        } catch (error) {

            estadoServidor.textContent = "Sin conexión";
            estadoServidor.style.color = "#c93c3c";

            console.error("Servidor:", error);
        }
    }

    // =====================================
    // CARGAR MODELO RANDOM FOREST
    // =====================================

    async function cargarModelo() {

        estadoIA.textContent = "Cargando modelo...";

        const respuesta = await fetch(
            URL_MODELO + "?_=" + Date.now(),
            { cache: "no-store" }
        );

        if (!respuesta.ok) {
            throw new Error("No se pudo cargar gesture_model.json");
        }

        modelo = await respuesta.json();

        if (
            modelo.tipo !== "RandomForestClassifier" ||
            modelo.numero_caracteristicas !== 63 ||
            modelo.numero_arboles !== 300 ||
            modelo.arboles.length !== 300
        ) {
            throw new Error("La estructura del modelo no es válida.");
        }

        console.log("MODELO CARGADO");
        console.log("Clases:", modelo.clases);
        console.log("Árboles:", modelo.arboles.length);
        console.log("Características:", modelo.numero_caracteristicas);

        estadoIA.textContent = "Modelo cargado correctamente";
    }

    // =====================================
    // CARGAR MEDIAPIPE
    // =====================================

    async function cargarMediaPipe() {

        estadoIA.textContent = "Preparando MediaPipe...";

        const vision = await import(
            URL_MEDIAPIPE + "/vision_bundle.mjs"
        );

        const fileset = await vision.FilesetResolver.forVisionTasks(
            URL_WASM
        );

        const opciones = {
            baseOptions: {
                modelAssetPath: URL_MODELO_MANO,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.7,
            minHandPresenceConfidence: 0.7,
            minTrackingConfidence: 0.7
        };

        try {

            handLandmarker =
                await vision.HandLandmarker.createFromOptions(
                    fileset,
                    opciones
                );

            console.log("MEDIAPIPE GPU ACTIVADO");

        } catch (error) {

            console.warn(
                "GPU no disponible. Intentando CPU:",
                error
            );

            opciones.baseOptions.delegate = "CPU";

            handLandmarker =
                await vision.HandLandmarker.createFromOptions(
                    fileset,
                    opciones
                );

            console.log("MEDIAPIPE CPU ACTIVADO");
        }

        console.log("MEDIAPIPE LISTO");
    }

    // =====================================
    // INICIALIZAR INTELIGENCIA ARTIFICIAL
    // =====================================

    async function inicializarIA() {

        try {

            await cargarModelo();
            await cargarMediaPipe();

            iaPreparada = true;

            estadoIA.textContent = "IA preparada";
            estadoFirebase.textContent = "Pendiente de integración";

            console.log("MANOVISIÓN: IA PREPARADA");

        } catch (error) {

            iaPreparada = false;

            estadoIA.textContent = "Error al cargar IA";

            cambiarEstadoSistema(
                "Error de inteligencia artificial",
                "#c93c3c"
            );

            console.error("ERROR IA:", error);

            estadoReconocimiento.textContent =
                "No se pudo preparar el reconocimiento. Revisa la consola.";
        }
    }

    // =====================================
    // NORMALIZAR LOS 21 PUNTOS
    // =====================================

    function normalizarMano(landmarks) {

        const puntos = landmarks.map(p => [
            p.x,
            p.y,
            p.z
        ]);

        const origen = puntos[0];

        for (let i = 0; i < puntos.length; i++) {

            puntos[i][0] -= origen[0];
            puntos[i][1] -= origen[1];
            puntos[i][2] -= origen[2];
        }

        let escala = 0;

        for (const punto of puntos) {

            const distancia = Math.sqrt(
                punto[0] ** 2 +
                punto[1] ** 2 +
                punto[2] ** 2
            );

            escala = Math.max(escala, distancia);
        }

        if (escala > 0) {

            for (const punto of puntos) {

                punto[0] /= escala;
                punto[1] /= escala;
                punto[2] /= escala;
            }
        }

        return puntos.flat();
    }

    // =====================================
    // PREDICCIÓN DE UN ÁRBOL
    // =====================================

    function predecirArbol(arbol, entrada) {

        const nodos = arbol.nodos;

        let indice = 0;
        let limite = 0;

        while (true) {

            if (limite++ > nodos.length) {
                throw new Error("Árbol inválido.");
            }

            const nodo = nodos[indice];

            if (nodo.izquierda === -1) {
                return nodo.probabilidades;
            }

            const caracteristica = nodo.caracteristica;
            const umbral = nodo.umbral;

            if (entrada[caracteristica] <= umbral) {
                indice = nodo.izquierda;
            } else {
                indice = nodo.derecha;
            }
        }
    }

    // =====================================
    // PREDICCIÓN RANDOM FOREST
    // =====================================

    function predecirModelo(entrada) {

        const probabilidades = new Array(
            modelo.clases.length
        ).fill(0);

        for (const arbol of modelo.arboles) {

            const resultado = predecirArbol(
                arbol,
                entrada
            );

            for (let i = 0; i < resultado.length; i++) {
                probabilidades[i] += resultado[i];
            }
        }

        for (let i = 0; i < probabilidades.length; i++) {

            probabilidades[i] /= modelo.arboles.length;
        }

        return probabilidades;
    }

    // =====================================
    // MOSTRAR PREDICCIÓN
    // =====================================

    function mostrarPrediccion(gesto, confianza) {

        nombreGesto.textContent = gesto;
        iconoGesto.textContent = ICONOS[gesto] || "✋";

        const porcentaje = Math.round(confianza * 100);

        confianzaElemento.textContent = porcentaje + "%";

        barraConfianza.style.width = porcentaje + "%";
    }

    // =====================================
    // ESTABILIZAR GESTO
    // =====================================

    function obtenerGestoEstable() {

        if (historial.length < TAMANO_HISTORIAL) {
            return null;
        }

        const conteo = {};

        for (const gesto of historial) {

            conteo[gesto] = (conteo[gesto] || 0) + 1;
        }

        let candidato = null;
        let mayor = 0;

        for (const [gesto, cantidad] of Object.entries(conteo)) {

            if (cantidad > mayor) {
                candidato = gesto;
                mayor = cantidad;
            }
        }

        if (mayor >= FOTOGRAMAS_ESTABLES) {
            return candidato;
        }

        return null;
    }

    // =====================================
    // PROCESAR GESTO ESTABLE
    // =====================================

    function procesarGestoEstable(gesto, confianza) {

        estadoReconocimiento.textContent =
            "Gesto estable reconocido: " + gesto;

        if (gesto === gestoAnterior) {
            return;
        }

        gestoAnterior = gesto;

        console.log(
            "GESTO RECONOCIDO:",
            gesto,
            "CONFIANZA:",
            confianza
        );

        if (MENSAJES[gesto]) {

            mensajeVoz.textContent = MENSAJES[gesto];

            hablar(MENSAJES[gesto]);

            mensajeSolicitud.textContent = MENSAJES[gesto];

            estadoSolicitud.textContent =
                "Gesto reconocido. Próxima etapa: confirmación y envío.";

        } else if (gesto === "CONFIRMAR") {

            estadoSolicitud.textContent =
                "Gesto CONFIRMAR reconocido.";

            hablar("Gesto de confirmar reconocido.");

        } else if (gesto === "CANCELAR") {

            estadoSolicitud.textContent =
                "Gesto CANCELAR reconocido.";

            hablar("Gesto de cancelar reconocido.");
        }
    }

    // =====================================
    // PREPARAR IMAGEN REFLEJADA
    // =====================================

    function prepararFotograma() {

        const ancho = video.videoWidth;
        const alto = video.videoHeight;

        if (!ancho || !alto) {
            return false;
        }

        canvas.width = ancho;
        canvas.height = alto;

        contexto.save();

        contexto.translate(ancho, 0);
        contexto.scale(-1, 1);

        contexto.drawImage(
            video,
            0,
            0,
            ancho,
            alto
        );

        contexto.restore();

        return true;
    }

    // =====================================
    // BUCLE DE RECONOCIMIENTO
    // =====================================

    function procesarCamara() {

        if (!camaraActiva || !iaPreparada) {
            return;
        }

        const ahora = performance.now();

        // Limitar procesamiento a unos 15 FPS.
        if (ahora - ultimoFotograma < 66) {

            animacion = requestAnimationFrame(
                procesarCamara
            );

            return;
        }

        ultimoFotograma = ahora;

        try {

            if (!prepararFotograma()) {

                animacion = requestAnimationFrame(
                    procesarCamara
                );

                return;
            }

            const resultado = handLandmarker.detectForVideo(
                canvas,
                ahora
            );

            if (
                resultado.landmarks &&
                resultado.landmarks.length > 0
            ) {

                const landmarks = resultado.landmarks[0];

                cambiarEstadoMano(
                    "Mano detectada",
                    "#16834a"
                );

                const entrada = normalizarMano(landmarks);

                const probabilidades = predecirModelo(entrada);

                const posicion = probabilidades.indexOf(
                    Math.max(...probabilidades)
                );

                const prediccion = modelo.clases[posicion];

                const confianza = probabilidades[posicion];

// =====================================
// DIAGNOSTICO DE PROBABILIDADES
// =====================================

if (
    !window.ultimoDiagnostico ||
    ahora - window.ultimoDiagnostico >= 1000
) {
    window.ultimoDiagnostico = ahora;

    console.log("========== MANOVISION DIAGNOSTICO ==========");

    console.log("GESTO PREDICHO:", prediccion);

    console.log(
        "CONFIANZA:",
        (confianza * 100).toFixed(2) + "%"
    );

    const resultados = modelo.clases.map(
        (clase, indice) => ({
            gesto: clase,
            porcentaje: (
                probabilidades[indice] * 100
            ).toFixed(2) + "%"
        })
    );

    console.table(resultados);

    console.log(
        "PRIMEROS 5 LANDMARKS:",
        landmarks.slice(0, 5)
    );
}

mostrarPrediccion(
    prediccion,
    confianza
);

                if (confianza >= CONFIANZA_MINIMA) {

                    historial.push(prediccion);

                    if (historial.length > TAMANO_HISTORIAL) {
                        historial.shift();
                    }

                } else {

                    historial = [];
                    gestoAnterior = null;

                    estadoReconocimiento.textContent =
                        "Confianza insuficiente. Mantén el gesto.";
                }

                const estable = obtenerGestoEstable();

                if (estable) {

                    procesarGestoEstable(
                        estable,
                        confianza
                    );

                }

            } else {

                historial = [];
                gestoAnterior = null;

                mostrarPrediccion("Ninguno", 0);

                cambiarEstadoMano(
                    "No se detecta una mano",
                    "#e5a52b"
                );

                estadoReconocimiento.textContent =
                    "Coloca tu mano frente a la cámara.";

            }

        } catch (error) {

            console.error(
                "ERROR EN RECONOCIMIENTO:",
                error
            );

            estadoReconocimiento.textContent =
                "Error procesando el gesto.";
        }

        animacion = requestAnimationFrame(
            procesarCamara
        );
    }

    // =====================================
    // INICIAR CÁMARA
    // =====================================

    async function iniciarCamara() {

        if (!navigator.mediaDevices?.getUserMedia) {

            alert(
                "Necesitas abrir MANOVISIÓN mediante HTTPS."
            );

            return;
        }

        if (!iaPreparada) {

            alert(
                "La inteligencia artificial todavía no está preparada."
            );

            return;
        }

        try {

            cambiarEstadoSistema(
                "Solicitando cámara...",
                "#e5a52b"
            );

            btnIniciar.disabled = true;

            flujoCamara =
                await navigator.mediaDevices.getUserMedia({

                    video: {
                        facingMode: "user",
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        frameRate: { ideal: 30, max: 30 }
                    },

                    audio: false
                });

            video.srcObject = flujoCamara;

            await video.play();

            camaraActiva = true;

            historial = [];
            gestoAnterior = null;
            ultimoFotograma = 0;

            video.style.display = "block";
            mensajeCamara.style.display = "none";

            btnIniciar.disabled = true;
            btnDetener.disabled = false;

            cambiarEstadoSistema(
                "Cámara e IA activas",
                "#16834a"
            );

            cambiarEstadoMano(
                "Buscando tu mano...",
                "#e5a52b"
            );

            estadoReconocimiento.textContent =
                "Coloca tu mano frente a la cámara.";

            animacion = requestAnimationFrame(
                procesarCamara
            );

            console.log("CÁMARA E IA INICIADAS");

        } catch (error) {

            console.error("ERROR DE CÁMARA:", error);

            cambiarEstadoSistema(
                "Error de cámara",
                "#c93c3c"
            );

            cambiarEstadoMano(
                "No se pudo iniciar la cámara.",
                "#c93c3c"
            );

            btnIniciar.disabled = false;
        }
    }

    // =====================================
    // DETENER CÁMARA
    // =====================================

    function detenerCamara() {

        camaraActiva = false;

        if (animacion !== null) {

            cancelAnimationFrame(animacion);
            animacion = null;
        }

        if (flujoCamara) {

            flujoCamara.getTracks().forEach(
                pista => pista.stop()
            );

            flujoCamara = null;
        }

        video.pause();
        video.srcObject = null;

        video.style.display = "none";
        mensajeCamara.style.display = "flex";

        historial = [];
        gestoAnterior = null;

        btnIniciar.disabled = false;
        btnDetener.disabled = true;

        cambiarEstadoSistema(
            "Cámara detenida",
            "#e5a52b"
        );

        cambiarEstadoMano(
            "Esperando cámara",
            "#e5a52b"
        );

        estadoReconocimiento.textContent =
            "Inicia la cámara para continuar.";

        console.log("CÁMARA DETENIDA");
    }

    // =====================================
    // EVENTOS
    // =====================================

    btnIniciar.addEventListener(
        "click",
        iniciarCamara
    );

    btnDetener.addEventListener(
        "click",
        detenerCamara
    );

    btnRepetirVoz.addEventListener(
        "click",
        () => hablar(mensajeVoz.textContent)
    );

    // =====================================
    // INICIO
    // =====================================

    estadoIA.textContent = "Cargando inteligencia artificial...";
    estadoFirebase.textContent = "Pendiente de integración";

    btnDetener.disabled = true;

    comprobarServidor();
    inicializarIA();

    // =====================================
    // LIMPIEZA
    // =====================================

    window.addEventListener("pagehide", () => {

        detenerCamara();

        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }

        if (handLandmarker) {
            handLandmarker.close();
        }
    });

});
