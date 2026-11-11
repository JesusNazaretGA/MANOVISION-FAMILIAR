import os
import json
import hmac
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, db
from flask import (
    Flask, render_template, request, redirect,
    url_for, session, jsonify, send_from_directory
)
from functools import wraps


app = Flask(__name__)

# Configuración privada de Render
app.secret_key = os.environ.get("SECRET_KEY")

if not app.secret_key:
    raise RuntimeError("Falta configurar SECRET_KEY en Render.")

PASSWORD_FAMILIAR = os.environ.get("FAMILY_PASSWORD")

if not PASSWORD_FAMILIAR:
    raise RuntimeError("Falta configurar FAMILY_PASSWORD en Render.")

DATABASE_URL = "https://manovision-default-rtdb.firebaseio.com/"

# Credenciales Firebase guardadas como variable privada en Render
firebase_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")

if not firebase_json:
    raise RuntimeError("Falta configurar FIREBASE_SERVICE_ACCOUNT en Render.")

try:
    credenciales = json.loads(firebase_json)
    credencial = credentials.Certificate(credenciales)

    try:
        firebase_admin.get_app()
    except ValueError:
        firebase_admin.initialize_app(
            credencial,
            {"databaseURL": DATABASE_URL}
        )

except Exception as error:
    raise RuntimeError(
        f"No se pudo inicializar Firebase: {error}"
    )


def familiar_autenticado(funcion):
    @wraps(funcion)
    def envoltura(*args, **kwargs):
        if not session.get("familiar_autenticado"):
            if request.path.startswith("/api/"):
                return jsonify({
                    "ok": False,
                    "error": "Sesión no autorizada."
                }), 401

            return redirect(url_for("login"))

        return funcion(*args, **kwargs)

    return envoltura


@app.route("/")
def inicio():
    if session.get("familiar_autenticado"):
        return redirect(url_for("familiar"))

    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("familiar_autenticado"):
        return redirect(url_for("familiar"))

    error = None

    if request.method == "POST":
        password = request.form.get("password", "")

        if hmac.compare_digest(password, PASSWORD_FAMILIAR):
            session["familiar_autenticado"] = True
            session.permanent = False
            return redirect(url_for("familiar"))

        error = "Contraseña incorrecta. Intenta nuevamente."

    return render_template("login.html", error=error)


@app.route("/logout", methods=["POST"])
@familiar_autenticado
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/familiar")
@familiar_autenticado
def familiar():
    return render_template("familiar.html")


@app.route("/service-worker.js")
@familiar_autenticado
def service_worker():
    return send_from_directory(
        app.root_path,
        "service-worker.js",
        mimetype="application/javascript"
    )


@app.route("/api/familiar/solicitudes")
@familiar_autenticado
def api_solicitudes():
    try:
        datos = db.reference("solicitudes").get()

        if not datos:
            solicitudes = []
        else:
            solicitudes = []

            for identificador, solicitud in datos.items():
                if not isinstance(solicitud, dict):
                    continue

                solicitud["id"] = identificador
                solicitudes.append(solicitud)

            solicitudes.sort(
                key=lambda elemento: elemento.get("fecha", ""),
                reverse=True
            )

        return jsonify({
            "ok": True,
            "solicitudes": solicitudes
        })

    except Exception as error:
        app.logger.exception("Error consultando Firebase")
        return jsonify({
            "ok": False,
            "error": "No se pudieron consultar las solicitudes."
        }), 500


@app.route("/api/familiar/responder", methods=["POST"])
@familiar_autenticado
def api_responder():
    try:
        datos = request.get_json(silent=True) or {}

        solicitud_id = datos.get("id", "").strip()
        respuesta = datos.get("respuesta", "").strip()

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
            "fecha": datetime.now(timezone.utc).isoformat()
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
        app.logger.exception("Error guardando respuesta")
        return jsonify({
            "ok": False,
            "error": "No se pudo guardar la respuesta."
        }), 500


@app.route("/health")
def health():
    return jsonify({"estado": "activo"})


# Cookies de sesión protegidas para HTTPS
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_SAMESITE="Lax"
)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
