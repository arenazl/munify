"""Smoke test integral contra prod.

Ejecuta los circuitos core (reclamos, tramites, tasas, pagos) y reporta
hallazgos. No hace cleanup — los objetos creados quedan en prod.
"""
import httpx
import json
import sys
from datetime import datetime

BASE = "https://reclamos-mun-api-aedc8e147cbe.herokuapp.com/api"
VECINO = ("vecino@chacabuco.demo.com", "demo123")
ADMIN = ("admin@chacabuco.demo.com", "demo123")

results = []


def log(tag, status, detail=""):
    icon = {"OK": "[OK]", "FAIL": "[FAIL]", "WARN": "[WARN]", "INFO": "[INFO]"}[status]
    line = f"{icon} {tag}"
    if detail:
        line += f" :: {detail}"
    print(line)
    results.append((tag, status, detail))


def login(client, email, pwd):
    r = client.post(
        f"{BASE}/auth/login",
        data={"username": email, "password": pwd},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if r.status_code != 200:
        return None, f"login {r.status_code}: {r.text[:200]}"
    return r.json(), None


def h(token):
    return {"Authorization": f"Bearer {token}"}


def run():
    with httpx.Client(timeout=30) as c:
        # ==============================
        # 0. AUTH
        # ==============================
        print("\n=== AUTH ===")
        vec_data, err = login(c, *VECINO)
        if err:
            log("auth.vecino", "FAIL", err)
            return
        vec = vec_data["access_token"]
        vec_user = vec_data["user"]
        log("auth.vecino", "OK", f"muni={vec_user.get('municipio_id')} id={vec_user.get('id')}")

        adm_data, err = login(c, *ADMIN)
        if err:
            log("auth.admin", "FAIL", err)
            return
        adm = adm_data["access_token"]
        adm_user = adm_data["user"]
        log("auth.admin", "OK", f"muni={adm_user.get('municipio_id')} rol={adm_user.get('rol')}")

        # ==============================
        # 1. RECLAMOS — circuito vecino
        # ==============================
        print("\n=== RECLAMOS ===")
        r = c.get(f"{BASE}/categorias-reclamo", headers=h(vec))
        if r.status_code == 200:
            cats = r.json()
            log("reclamos.categorias", "OK", f"count={len(cats)}")
            cat_id = cats[0]["id"] if cats else None
        else:
            log("reclamos.categorias", "FAIL", f"{r.status_code}: {r.text[:150]}")
            cat_id = None

        r = c.get(f"{BASE}/reclamos/mis-reclamos", headers=h(vec))
        if r.status_code == 200:
            log("reclamos.mis-reclamos", "OK", f"count={len(r.json())}")
        else:
            log("reclamos.mis-reclamos", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # Crear reclamo de prueba
        reclamo_id = None
        if cat_id:
            payload = {
                "titulo": f"SMOKE TEST {datetime.now().isoformat()[:19]}",
                "descripcion": "Reclamo de smoke test automatico - ignorar",
                "direccion": "Av. Moreno 1234",
                "latitud": -34.6441,
                "longitud": -60.4737,
                "categoria_id": cat_id,
            }
            r = c.post(f"{BASE}/reclamos", json=payload, headers=h(vec))
            if r.status_code in (200, 201):
                reclamo_id = r.json()["id"]
                estado = r.json()["estado"]
                if estado == "recibido":
                    log("reclamos.crear", "OK", f"id={reclamo_id} estado={estado}")
                else:
                    log("reclamos.crear", "WARN", f"id={reclamo_id} estado={estado} — esperado 'recibido'")
            else:
                log("reclamos.crear", "FAIL", f"{r.status_code}: {r.text[:200]}")

        # Admin ve el reclamo
        if reclamo_id:
            r = c.get(f"{BASE}/reclamos/{reclamo_id}", headers=h(adm))
            if r.status_code == 200:
                log("reclamos.admin-get", "OK", f"estado={r.json()['estado']}")
            else:
                log("reclamos.admin-get", "FAIL", f"{r.status_code}")

            # Transicion recibido → en_curso
            r = c.patch(
                f"{BASE}/reclamos/{reclamo_id}?nuevo_estado=en_curso&comentario=smoke",
                headers=h(adm),
            )
            if r.status_code == 200:
                log("reclamos.transicion.recibido-en_curso", "OK")
            else:
                log("reclamos.transicion.recibido-en_curso", "FAIL", f"{r.status_code}: {r.text[:150]}")

            # Transicion invalida: en_curso → recibido
            r = c.patch(
                f"{BASE}/reclamos/{reclamo_id}?nuevo_estado=recibido",
                headers=h(adm),
            )
            if r.status_code == 400:
                log("reclamos.transicion.invalida-rechazada", "OK", "400 esperado")
            else:
                log("reclamos.transicion.invalida-rechazada", "WARN", f"Esperaba 400 pero fue {r.status_code}")

            # Transicion en_curso → finalizado
            r = c.patch(
                f"{BASE}/reclamos/{reclamo_id}?nuevo_estado=finalizado&comentario=smoke-fin",
                headers=h(adm),
            )
            if r.status_code == 200:
                log("reclamos.transicion.en_curso-finalizado", "OK")
            else:
                log("reclamos.transicion.en_curso-finalizado", "FAIL", f"{r.status_code}")

            # Feedback negativo del vecino
            r = c.post(
                f"{BASE}/reclamos/{reclamo_id}/confirmar-vecino",
                json={"confirmado": False, "comentario": "smoke - rechazo"},
                headers=h(vec),
            )
            if r.status_code == 200:
                log("reclamos.feedback.rechazo-vecino", "OK")
            else:
                log("reclamos.feedback.rechazo-vecino", "FAIL", f"{r.status_code}: {r.text[:150]}")

            # Reabrir (la transicion que arreglamos hoy)
            r = c.patch(
                f"{BASE}/reclamos/{reclamo_id}?nuevo_estado=en_curso&comentario=smoke-reabrir",
                headers=h(adm),
            )
            if r.status_code == 200:
                log("reclamos.reabrir-post-feedback", "OK", "FINALIZADO→EN_CURSO")
            else:
                log("reclamos.reabrir-post-feedback", "FAIL", f"{r.status_code}: {r.text[:150]}")

            # Historial
            r = c.get(f"{BASE}/reclamos/{reclamo_id}/historial", headers=h(adm))
            if r.status_code == 200:
                log("reclamos.historial", "OK", f"entries={len(r.json())}")
            else:
                log("reclamos.historial", "FAIL", f"{r.status_code}: {r.text[:150]}")

            # Rechazar y cerrar (cleanup)
            r = c.post(
                f"{BASE}/reclamos/{reclamo_id}/rechazar",
                json={"motivo": "otro", "descripcion": "smoke test cleanup"},
                headers=h(adm),
            )
            if r.status_code == 200:
                log("reclamos.rechazar-cleanup", "OK")
            else:
                log("reclamos.rechazar-cleanup", "WARN", f"{r.status_code}")

        # ==============================
        # 2. TRAMITES — circuito vecino
        # ==============================
        print("\n=== TRAMITES ===")
        r = c.get(f"{BASE}/tramites/solicitudes/mis-solicitudes", headers=h(vec))
        if r.status_code == 200:
            log("tramites.mis-solicitudes", "OK", f"count={len(r.json())}")
        else:
            log("tramites.mis-solicitudes", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # Listar tramites disponibles del muni
        r = c.get(f"{BASE}/tramites", headers=h(vec))
        if r.status_code == 200:
            tramites = r.json()
            log("tramites.catalogo", "OK", f"count={len(tramites)}")
            tramite_id = tramites[0]["id"] if tramites else None
        else:
            log("tramites.catalogo", "FAIL", f"{r.status_code}: {r.text[:150]}")
            tramite_id = None

        # Gestion admin — requiere municipio_id
        muni_id = adm_user.get("municipio_id")
        r = c.get(f"{BASE}/tramites/gestion/solicitudes?municipio_id={muni_id}", headers=h(adm))
        if r.status_code == 200:
            log("tramites.admin-listado", "OK", f"count={len(r.json())}")
        else:
            log("tramites.admin-listado", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # Stats
        r = c.get(f"{BASE}/tramites/stats/conteo-estados", headers=h(adm))
        if r.status_code == 200:
            log("tramites.stats.conteo-estados", "OK")
        else:
            log("tramites.stats.conteo-estados", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # ==============================
        # 3. TASAS — circuito vecino
        # ==============================
        print("\n=== TASAS ===")
        r = c.get(f"{BASE}/tasas/tipos", headers=h(vec))
        if r.status_code == 200:
            tipos = r.json()
            log("tasas.tipos", "OK", f"count={len(tipos)}")
        else:
            log("tasas.tipos", "FAIL", f"{r.status_code}: {r.text[:150]}")

        r = c.get(f"{BASE}/tasas/mi-resumen", headers=h(vec))
        if r.status_code == 200:
            log("tasas.mi-resumen", "OK", str(r.json()))
        else:
            log("tasas.mi-resumen", "FAIL", f"{r.status_code}")

        r = c.get(f"{BASE}/tasas/mis-partidas", headers=h(vec))
        if r.status_code == 200:
            partidas = r.json()
            log("tasas.mis-partidas", "OK", f"count={len(partidas)}")
            partida_id = partidas[0]["id"] if partidas else None
        else:
            log("tasas.mis-partidas", "FAIL", f"{r.status_code}: {r.text[:150]}")
            partida_id = None

        # Vecino de Chacabuco no tiene partidas asociadas. Probar con partidas del admin.
        r = c.get(f"{BASE}/tasas/partidas", headers=h(adm))
        if r.status_code == 200:
            adm_partidas = r.json()
            log("tasas.admin.partidas", "OK", f"count={len(adm_partidas)}")
            adm_partida_id = adm_partidas[0]["id"] if adm_partidas else None
        else:
            log("tasas.admin.partidas", "FAIL", f"{r.status_code}: {r.text[:150]}")
            adm_partida_id = None

        # Ver deudas de una partida (admin)
        if adm_partida_id:
            r = c.get(f"{BASE}/tasas/partidas/{adm_partida_id}/deudas", headers=h(adm))
            if r.status_code == 200:
                deudas = r.json()
                log("tasas.admin.partida-deudas", "OK", f"count={len(deudas)}")
                deuda_pendiente = next(
                    (d for d in deudas if d.get("estado") in ("pendiente", "vencida")),
                    None,
                )
            else:
                log("tasas.admin.partida-deudas", "FAIL", f"{r.status_code}: {r.text[:150]}")
                deuda_pendiente = None
        else:
            deuda_pendiente = None

        # ==============================
        # 4. PAGOS — circuito core
        # ==============================
        print("\n=== PAGOS ===")
        r = c.get(f"{BASE}/proveedores-pago", headers=h(adm))
        if r.status_code == 200:
            log("pagos.proveedores", "OK", f"count={len(r.json())}")
        else:
            log("pagos.proveedores", "FAIL", f"{r.status_code}: {r.text[:150]}")

        r = c.get(f"{BASE}/pagos/contaduria/resumen", headers=h(adm))
        if r.status_code == 200:
            log("pagos.contaduria.resumen", "OK")
        else:
            log("pagos.contaduria.resumen", "FAIL", f"{r.status_code}: {r.text[:150]}")

        r = c.get(f"{BASE}/pagos/contaduria/listar", headers=h(adm))
        if r.status_code == 200:
            log("pagos.contaduria.listar", "OK")
        else:
            log("pagos.contaduria.listar", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # Crear sesion de pago para una deuda pendiente
        if deuda_pendiente:
            # El vecino del admin (usar uno de los vecinos de Chacabuco dueño de esa partida)
            # Como es admin quien tiene acceso, intento con admin
            payload = {"deuda_id": deuda_pendiente["id"]}
            r = c.post(f"{BASE}/pagos/crear-sesion", json=payload, headers=h(adm))
            if r.status_code == 200:
                sess = r.json()
                log("pagos.crear-sesion", "OK", f"session_id={sess['session_id'][:8]}... expires={sess['expires_at']}")

                # Ver sesion publica
                r2 = c.get(f"{BASE}/pagos/sesiones/{sess['session_id']}")
                if r2.status_code == 200:
                    log("pagos.sesion-publica", "OK", f"provider={r2.json().get('provider')}")
                else:
                    log("pagos.sesion-publica", "FAIL", f"{r2.status_code}: {r2.text[:150]}")

                # Cancelar sesion (no confirmar — no queremos marcar deuda como pagada en prod)
                r3 = c.post(f"{BASE}/pagos/sesiones/{sess['session_id']}/cancelar")
                if r3.status_code == 200:
                    log("pagos.cancelar-sesion", "OK", f"estado={r3.json().get('estado')}")
                else:
                    log("pagos.cancelar-sesion", "FAIL", f"{r3.status_code}")
            else:
                log("pagos.crear-sesion", "FAIL", f"{r.status_code}: {r.text[:200]}")
        else:
            log("pagos.crear-sesion", "INFO", "sin deuda pendiente para probar")

        # ==============================
        # 5. DASHBOARD
        # ==============================
        print("\n=== DASHBOARD ===")
        r = c.get(f"{BASE}/dashboard/conteo-estados", headers=h(adm))
        if r.status_code == 200:
            log("dashboard.conteo-estados", "OK")
        else:
            log("dashboard.conteo-estados", "FAIL", f"{r.status_code}: {r.text[:150]}")

        r = c.get(f"{BASE}/dashboard/conteo-categorias", headers=h(adm))
        if r.status_code == 200:
            log("dashboard.conteo-categorias", "OK")
        else:
            log("dashboard.conteo-categorias", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # ==============================
        # RESUMEN
        # ==============================
        print("\n" + "=" * 60)
        oks = sum(1 for _, s, _ in results if s == "OK")
        fails = sum(1 for _, s, _ in results if s == "FAIL")
        warns = sum(1 for _, s, _ in results if s == "WARN")
        infos = sum(1 for _, s, _ in results if s == "INFO")
        print(f"TOTAL: OK={oks} FAIL={fails} WARN={warns} INFO={infos}")
        if fails:
            print("\nFALLOS:")
            for t, s, d in results:
                if s == "FAIL":
                    print(f"  - {t}: {d}")
        print("=" * 60)
        sys.exit(1 if fails else 0)


if __name__ == "__main__":
    run()
