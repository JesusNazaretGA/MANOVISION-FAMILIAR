
import os
import json
import hmac
import hashlib

from datetime import datetime, timezone
from functools import wraps

import firebase_admin
from firebase_admin import credentials, db, messaging

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    session,
    jsonify,
    send_from_directory
)


# ======================================
# CONFIGURACIÓN DE FLASK
# ======================================

app = Flask(__name__)

app.secret_key = os.environ.get("SECRET_KEY")

if not app.secret_key:
    raise RuntimeError(
        "Falta configurar SECRET_KEY en Render."
    )


# ======================================
# CONTRASEÑA FAMILIAR
# ======================================

PASSWORD_FAMILIAR = os.environ.get("FAMILY_PASSWORD")

if not PASSWORD_FAMILIAR:
    raise RuntimeError(
        "Falta configurar FAMILY_PASSWORD en Render."
    )


# ======================================
# FIREBASE
# ======================================

DATABASE_URL = (
    "https://manovision-default-rtdb.firebaseio.com/"
)

firebase_json = os.environ.get(
    "FIREBASE_SERVICE_ACCOUNT"
)

if not firebase_json:
    raise RuntimeError(
        "Falta configurar FIREBASE_SERVICE_ACCOUNT en Render."
    )

try:
    credenciales = json.loads(firebase_json)

    credencial = credentials.Certificate(
        credenciales
    )

    try:
        firebase_admin.get_app()

    except ValueError:
        firebase_admin.initialize_app(
            credencial,
            {
                "databaseURL": DATABASE_URL
            }
        )

except Exception as error:
    raise RuntimeError(
        f"No se pudo inicializar Firebase: {error}"
    )


# ======================================
# AUTENTICACIÓN FAMILIAR
# ======================================

def familiar_autenticado(funcion):

    @wraps(funcion)
    def envoltura(*args, **kwargs):

        if not session.get("familiar_autenticado"):

            if request.path.startswith("/api/"):

                return jsonify({
                    "ok": False,
                    "error": "Sesión no autorizada."
                }), 401

            return redirect(
                url_for("login")
            )

        return funcion(*args, **kwargs)

    return envoltura


# ======================================
# INICIO
# ======================================

@app.route("/")
def inicio():

    if session.get("familiar_autenticado"):
        return redirect(
            url_for("familiar")
        )

    return redirect(
        url_for("login")
    )


# ======================================
# LOGIN
# ======================================

@app.route("/login", methods=["GET", "POST"])
def login():

    if session.get("familiar_autenticado"):
        return redirect(
            url_for("familiar")
        )

    error = None

    if request.method == "POST":

        password = request.form.get(
            "password",
            ""
        )

        if hmac.compare_digest(
            password,
            PASSWORD_FAMILIAR
        ):

            session["familiar_autenticado"] = True
            session.permanent = False

            return redirect(
                url_for("familiar")
            )

        error = (
            "Contraseña incorrecta. Intenta nuevamente."
        )

    return render_template(
        "login.html",
        error=error
    )


# ======================================
# CERRAR SESIÓN
# ======================================

@app.route("/logout", methods=["POST"])
@familiar_autenticado
def logout():

    session.clear()

    return redirect(
        url_for("login")
    )

# ======================================
# PANTALLA MOVIL MANOVISION
# ======================================

@app.route("/movil")
def movil():

    return render_template(
        "movil.html"
    )



# ======================================
# PÁGINA FAMILIAR
# ======================================

@app.route("/familiar")
@familiar_autenticado
def familiar():

    return render_template(
        "familiar.html"
    )

# ======================================
# HISTORIAL DE COMUNICACIÓN
# ======================================

@app.route("/historial")
@familiar_autenticado
def historial():

    return render_template(
        "historial.html"
    )
# ======================================
# SERVICE WORKER
# ======================================

@app.route("/service-worker.js")
@familiar_autenticado
def service_worker():

    return send_from_directory(
        app.root_path,
        "service-worker.js",
        mimetype="application/javascript"
    )


# ======================================
# CONSULTAR SOLICITUDES
# ======================================

@app.route("/api/familiar/solicitudes")
@familiar_autenticado
def api_solicitudes():

    try:

        datos = db.reference(
            "solicitudes"
        ).get()

        solicitudes = []

        if datos:

            for identificador, solicitud in datos.items():

                if not isinstance(solicitud, dict):
                    continue

                solicitud["id"] = identificador

                solicitudes.append(solicitud)

            solicitudes.sort(
                key=lambda elemento: elemento.get(
                    "fecha",
                    ""
                ),
                reverse=True
            )

        return jsonify({
            "ok": True,
            "solicitudes": solicitudes
        })

    except Exception:

        app.logger.exception(
            "Error consultando Firebase"
        )

        return jsonify({
            "ok": False,
            "error": "No se pudieron consultar las solicitudes."
        }), 500


# ======================================
# RESPONDER SOLICITUD
# ======================================

@app.route(
    "/api/familiar/responder",
    methods=["POST"]
)
@familiar_autenticado
def api_responder():

    try:

        datos = request.get_json(
            silent=True
        ) or {}

        solicitud_id = datos.get(
            "id",
            ""
        ).strip()

        respuesta = datos.get(
            "respuesta",
            ""
        ).strip()

        if not solicitud_id or not respuesta:

            return jsonify({
                "ok": False,
                "error": "Falta el identificador o la respuesta."
            }), 400

        referencia = db.reference(
            f"solicitudes/{solicitud_id}"
        )

        solicitud = referencia.get()

        if not solicitud:

            return jsonify({
                "ok": False,
                "error": "La solicitud no existe."
            }), 404

        if solicitud.get("estado") != "pendiente":

            return jsonify({
                "ok": False,
                "error": "Esta solicitud ya fue respondida."
            }), 409

        datos_respuesta = {
            "texto": respuesta,
            "fecha": datetime.now(
                timezone.utc
            ).isoformat()
        }

        referencia.update({
            "estado": "respondida",
            "respuesta": datos_respuesta
        })

        return jsonify({
            "ok": True,
            "respuesta": datos_respuesta
        })

    except Exception:

        app.logger.exception(
            "Error guardando respuesta"
        )

        return jsonify({
            "ok": False,
            "error": "No se pudo guardar la respuesta."
        }), 500


# ======================================
# CENTRO DE COMUNICACION
# ======================================

@app.route("/api/familiar/centro-comunicacion")
@familiar_autenticado
def api_centro_comunicacion():

    try:
        datos = db.reference("centro_comunicacion").get()

        mensajes = []

        if datos:
            for identificador, mensaje in datos.items():

                if not isinstance(mensaje, dict):
                    continue

                mensaje["id"] = identificador
                mensajes.append(mensaje)

        mensajes.sort(
            key=lambda elemento: elemento.get("fecha", ""),
            reverse=True
        )

        return jsonify({
            "ok": True,
            "mensajes": mensajes
        })

    except Exception:
        app.logger.exception(
            "Error consultando Centro de Comunicación"
        )

        return jsonify({
            "ok": False,
            "error": "No se pudieron consultar los mensajes."
        }), 500


@app.route(
    "/api/familiar/centro-comunicacion/responder",
    methods=["POST"]
)
@familiar_autenticado
def api_responder_centro():

    try:
        datos = request.get_json(silent=True) or {}

        mensaje_id = datos.get("id")
        respuesta = datos.get("respuesta")

        if not isinstance(mensaje_id, str) or not mensaje_id.strip():
            return jsonify({
                "ok": False,
                "error": "Falta el identificador del mensaje."
            }), 400

        if not isinstance(respuesta, str) or not respuesta.strip():
            return jsonify({
                "ok": False,
                "error": "Escribe una respuesta."
            }), 400

        referencia = db.reference(
            f"centro_comunicacion/{mensaje_id.strip()}"
        )

        mensaje = referencia.get()

        if not mensaje:
            return jsonify({
                "ok": False,
                "error": "El mensaje no existe."
            }), 404

        if mensaje.get("estado") != "pendiente":
            return jsonify({
                "ok": False,
                "error": "Este mensaje ya fue respondido."
            }), 409

        datos_respuesta = {
            "texto": respuesta.strip(),
            "fecha": datetime.now(
                timezone.utc
            ).isoformat()
        }

        referencia.update({
            "estado": "respondida",
            "respuesta": datos_respuesta
        })

        return jsonify({
            "ok": True,
            "respuesta": datos_respuesta
        })

    except Exception:
        app.logger.exception(
            "Error respondiendo mensaje del Centro"
        )

        return jsonify({
            "ok": False,
            "error": "No se pudo guardar la respuesta."
        }), 500

# ======================================
# REGISTRAR DISPOSITIVOS FAMILIARES
# ======================================

@app.route(
    "/api/familiar/dispositivos/registrar",
    methods=["POST"]
)
@familiar_autenticado
def registrar_dispositivo():

    try:

        datos = request.get_json(
            silent=True
        ) or {}

        token = datos.get(
            "token",
            ""
        ).strip()

        plataforma = datos.get(
            "plataforma",
            "desconocida"
        ).strip()

        if not token:

            return jsonify({
                "ok": False,
                "error": "No se recibió el token del dispositivo."
            }), 400

        identificador = hashlib.sha256(
            token.encode("utf-8")
        ).hexdigest()

        referencia = db.reference(
            f"dispositivos_familiares/{identificador}"
        )

        referencia.set({
            "token": token,
            "plataforma": plataforma,
            "fecha_registro": datetime.now(
                timezone.utc
            ).isoformat(),
            "activo": True
        })

        return jsonify({
            "ok": True,
            "mensaje": "Dispositivo registrado correctamente."
        })

    except Exception:

        app.logger.exception(
            "Error registrando dispositivo"
        )

        return jsonify({
            "ok": False,
            "error": "No se pudo registrar el dispositivo."
        }), 500


# ======================================
# ENVIAR NOTIFICACIONES PUSH
# ======================================

@app.route(
    "/api/interno/notificar",
    methods=["POST"]
)
def enviar_notificaciones():

    try:

        secreto_configurado = os.environ.get(
            "MANOVISION_NOTIFY_SECRET",
            ""
        )

        secreto_recibido = request.headers.get(
            "X-MANOVISION-SECRET",
            ""
        )

        if not secreto_configurado:

            return jsonify({
                "ok": False,
                "error": "Servicio de notificaciones no configurado."
            }), 503

        if not hmac.compare_digest(
            secreto_recibido,
            secreto_configurado
        ):

            return jsonify({
                "ok": False,
                "error": "No autorizado."
            }), 401

        datos = request.get_json(
            silent=True
        ) or {}

        titulo = str(
            datos.get(
                "titulo",
                "MANOVISIÓN"
            )
        )[:100]

        mensaje = str(
            datos.get(
                "mensaje",
                "Hay una nueva solicitud de MANOVISIÓN."
            )
        )[:200]

        dispositivos = db.reference(
            "dispositivos_familiares"
        ).get()

        if not dispositivos:

            return jsonify({
                "ok": True,
                "enviadas": 0,
                "mensaje": "Todavía no hay dispositivos registrados."
            })

        registros = []

        for identificador, dispositivo in dispositivos.items():

            if not isinstance(dispositivo, dict):
                continue

            token = dispositivo.get("token")

            if token and dispositivo.get("activo", True):

                registros.append((
                    identificador,
                    token
                ))

        if not registros:

            return jsonify({
                "ok": True,
                "enviadas": 0,
                "mensaje": "No hay dispositivos activos."
            })

        tokens = [
            registro[1]
            for registro in registros
        ]

        mensaje_firebase = messaging.MulticastMessage(
            data={
                "titulo": titulo,
                "mensaje": mensaje
            },
            tokens=tokens
        )

        resultado = messaging.send_each_for_multicast(
            mensaje_firebase
        )

        eliminados = 0

        for indice, respuesta in enumerate(
            resultado.responses
        ):

            if respuesta.success:
                continue

            error = respuesta.exception

            codigo = getattr(
                error,
                "code",
                ""
            )

            if codigo in (
                "messaging/registration-token-not-registered",
                "messaging/invalid-registration-token"
            ):

                identificador = registros[indice][0]

                db.reference(
                    f"dispositivos_familiares/{identificador}"
                ).delete()

                eliminados += 1

        return jsonify({
            "ok": True,
            "enviadas": resultado.success_count,
            "fallidas": resultado.failure_count,
            "dispositivos_eliminados": eliminados
        })

    except Exception:

        app.logger.exception(
            "Error enviando notificaciones"
        )

        return jsonify({
            "ok": False,
            "error": "No se pudieron enviar las notificaciones."
        }), 500


# ======================================
# ESTADO DEL SERVIDOR
# ======================================

@app.route("/health")
def health():

    return jsonify({
        "estado": "activo"
    })


# ======================================
# CONFIGURACIÓN DE COOKIES
# ======================================
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=os.environ.get(
        "SESSION_COOKIE_SECURE", "false"
    ).lower() == "true",
    SESSION_COOKIE_SAMESITE="Lax"
)

# ======================================
# EJECUCIÓN LOCAL
# ======================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False
    )
