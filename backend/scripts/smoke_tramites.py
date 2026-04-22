"""Smoke test del modulo Tramites end-to-end."""
import httpx
import sys
from datetime import datetime

BASE = "https://reclamos-mun-api-aedc8e147cbe.herokuapp.com/api"
VECINO = ("vecino@la-matanza.demo.com", "demo123")
ADMIN = ("admin@la-matanza.demo.com", "demo123")
MUNI_ID = 78  # La Matanza

results = []


def log(tag, status, detail=""):
    icon = {"OK": "[OK]", "FAIL": "[FAIL]", "WARN": "[WARN]", "INFO": "[INFO]"}[status]
    line = f"{icon} {tag}"
    if detail:
        line += f" :: {detail}"
    print(line)
    results.append((tag, status, detail))


def login(c, email, pwd):
    r = c.post(
        f"{BASE}/auth/login",
        data={"username": email, "password": pwd},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return r.json()["access_token"] if r.status_code == 200 else None


def h(t):
    return {"Authorization": f"Bearer {t}"}


def run():
    with httpx.Client(timeout=30) as c:
        vec = login(c, *VECINO)
        adm = login(c, *ADMIN)
        if not (vec and adm):
            log("login", "FAIL", "credenciales")
            return
        log("login", "OK", "vecino+admin")

        # 1. Catalogo de tramites del muni
        r = c.get(f"{BASE}/tramites?municipio_id={MUNI_ID}", headers=h(vec))
        if r.status_code != 200:
            log("catalogo", "FAIL", f"{r.status_code}: {r.text[:150]}")
            return
        tramites = r.json()
        log("catalogo", "OK", f"count={len(tramites)}")

        # Buscar un tramite gratuito y uno con costo
        gratuito = next((t for t in tramites if not t.get("costo") or float(t["costo"]) == 0), None)
        con_costo = next((t for t in tramites if t.get("costo") and float(t["costo"]) > 0), None)
        log("catalogo.gratuito", "OK" if gratuito else "WARN", str(gratuito["nombre"]) if gratuito else "no hay")
        log("catalogo.con-costo", "OK" if con_costo else "WARN", str(con_costo["nombre"]) if con_costo else "no hay")

        if not gratuito:
            log("test.skip", "INFO", "no hay tramite gratuito para probar flujo basico")
            return

        # 2. Crear solicitud (vecino, tramite gratuito)
        payload = {
            "tramite_id": gratuito["id"],
            "asunto": f"SMOKE TEST {datetime.now().isoformat()[:19]}",
            "descripcion": "Solicitud de smoke test - ignorar",
        }
        r = c.post(
            f"{BASE}/tramites/solicitudes?municipio_id={MUNI_ID}",
            json=payload,
            headers=h(vec),
        )
        if r.status_code not in (200, 201):
            log("crear-solicitud", "FAIL", f"{r.status_code}: {r.text[:300]}")
            return
        sol = r.json()
        sol_id = sol["id"]
        log("crear-solicitud", "OK", f"id={sol_id} numero={sol['numero_tramite']} estado={sol['estado']}")

        # 3. Vecino ve su solicitud
        r = c.get(f"{BASE}/tramites/solicitudes/mis-solicitudes", headers=h(vec))
        mias = r.json() if r.status_code == 200 else []
        encontrado = any(s["id"] == sol_id for s in mias)
        log("mis-solicitudes-incluye-nueva", "OK" if encontrado else "FAIL", f"count={len(mias)} found={encontrado}")

        # 4. Consulta publica por numero (sin auth)
        r = c.get(f"{BASE}/tramites/solicitudes/consultar/{sol['numero_tramite']}")
        if r.status_code == 200:
            log("consulta-publica-por-numero", "OK")
        else:
            log("consulta-publica-por-numero", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # 5. Admin ve la solicitud
        r = c.get(f"{BASE}/tramites/solicitudes/detalle/{sol_id}", headers=h(adm))
        if r.status_code == 200:
            d = r.json()
            log("admin-ve-detalle", "OK", f"estado={d['estado']} dep={d.get('municipio_dependencia_id')}")
        else:
            log("admin-ve-detalle", "FAIL", f"{r.status_code}")

        # 6. Auto-asignar
        r = c.post(f"{BASE}/tramites/solicitudes/{sol_id}/auto-asignar", headers=h(adm))
        if r.status_code == 200:
            log("auto-asignar", "OK", str(r.json()))
        else:
            log("auto-asignar", "WARN", f"{r.status_code}: {r.text[:200]}")

        # 7. Listado admin de la gestion
        r = c.get(f"{BASE}/tramites/gestion/solicitudes?municipio_id={MUNI_ID}", headers=h(adm))
        if r.status_code == 200:
            log("admin-listado-gestion", "OK", f"count={len(r.json())}")
        else:
            log("admin-listado-gestion", "FAIL", f"{r.status_code}: {r.text[:200]}")

        # 8. Checklist de documentos (puede estar vacio si el tramite no tiene docs requeridos)
        r = c.get(f"{BASE}/tramites/solicitudes/{sol_id}/checklist-documentos", headers=h(adm))
        if r.status_code == 200:
            ch = r.json()
            requeridos = ch.get("requeridos", []) if isinstance(ch, dict) else ch
            log("checklist-documentos", "OK", f"requeridos={len(requeridos) if isinstance(requeridos, list) else 'dict'}")
        else:
            log("checklist-documentos", "WARN", f"{r.status_code}: {r.text[:150]}")

        # 9. Transicion a EN_CURSO (puede fallar si faltan docs verificados)
        r = c.put(
            f"{BASE}/tramites/solicitudes/detalle/{sol_id}",
            json={"estado": "en_curso", "observaciones": "smoke - poner en curso"},
            headers=h(adm),
        )
        if r.status_code == 200:
            log("transicion.recibido-en_curso", "OK")
        elif r.status_code == 400:
            log("transicion.recibido-en_curso", "INFO", f"bloqueado por validacion: {r.text[:200]}")
        else:
            log("transicion.recibido-en_curso", "FAIL", f"{r.status_code}: {r.text[:200]}")

        # 10. Historial
        r = c.get(f"{BASE}/tramites/solicitudes/{sol_id}/historial", headers=h(adm))
        if r.status_code == 200:
            log("historial", "OK", f"entries={len(r.json())}")
        else:
            log("historial", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # 11. Stats por estado
        r = c.get(f"{BASE}/tramites/stats/conteo-estados?municipio_id={MUNI_ID}", headers=h(adm))
        if r.status_code == 200:
            log("stats.conteo-estados", "OK", str(r.json())[:80])
        else:
            log("stats.conteo-estados", "FAIL", f"{r.status_code}")

        # 12. Stats por categoria
        r = c.get(f"{BASE}/tramites/stats/conteo-categorias?municipio_id={MUNI_ID}", headers=h(adm))
        if r.status_code == 200:
            log("stats.conteo-categorias", "OK")
        else:
            log("stats.conteo-categorias", "FAIL", f"{r.status_code}")

        # 13. RECHAZAR (cleanup) — para no dejar la solicitud abierta
        r = c.put(
            f"{BASE}/tramites/solicitudes/detalle/{sol_id}",
            json={"estado": "rechazado", "observaciones": "smoke - cleanup automatico"},
            headers=h(adm),
        )
        if r.status_code == 200:
            log("cleanup.rechazar", "OK", f"estado={r.json()['estado']}")
        else:
            log("cleanup.rechazar", "FAIL", f"{r.status_code}: {r.text[:200]}")

        # 14. PAGO DE TRAMITE: si hay tramite con costo, probar el bloqueo de finalizacion sin pago
        if con_costo:
            payload = {
                "tramite_id": con_costo["id"],
                "asunto": f"SMOKE PAGO {datetime.now().isoformat()[:19]}",
                "descripcion": "smoke pago - ignorar",
            }
            r = c.post(
                f"{BASE}/tramites/solicitudes?municipio_id={MUNI_ID}",
                json=payload,
                headers=h(vec),
            )
            if r.status_code in (200, 201):
                pago_sol_id = r.json()["id"]
                log("crear-solicitud-con-costo", "OK", f"id={pago_sol_id} costo={con_costo['costo']}")

                # Auto-asignar para que tenga dependencia
                c.post(f"{BASE}/tramites/solicitudes/{pago_sol_id}/auto-asignar", headers=h(adm))

                # Pasar a en_curso
                c.put(
                    f"{BASE}/tramites/solicitudes/detalle/{pago_sol_id}",
                    json={"estado": "en_curso"},
                    headers=h(adm),
                )

                # Intentar FINALIZAR sin pago — debe bloquear con 400
                r = c.put(
                    f"{BASE}/tramites/solicitudes/detalle/{pago_sol_id}",
                    json={"estado": "finalizado"},
                    headers=h(adm),
                )
                if r.status_code == 400 and "pag" in r.text.lower():
                    log("finalizar-sin-pago-bloqueado", "OK", "400 esperado: requiere pago")
                else:
                    log("finalizar-sin-pago-bloqueado", "WARN", f"{r.status_code}: {r.text[:200]}")

                # Estado de pago
                r = c.get(f"{BASE}/pagos/estado-solicitud/{pago_sol_id}", headers=h(adm))
                if r.status_code == 200:
                    ep = r.json()
                    log("pago.estado-solicitud", "OK", f"requiere={ep['requiere_pago']} pagado={ep['pagado']} costo={ep['costo']}")
                else:
                    log("pago.estado-solicitud", "FAIL", f"{r.status_code}")

                # Crear sesion de pago para el tramite
                r = c.post(
                    f"{BASE}/pagos/sesion-tramite",
                    json={"solicitud_id": pago_sol_id},
                    headers=h(vec),
                )
                if r.status_code == 200:
                    sess = r.json()
                    log("pago.crear-sesion-tramite", "OK", f"session={sess['session_id'][:12]}...")
                    # Cancelar (no pagamos en prod)
                    r2 = c.post(f"{BASE}/pagos/sesiones/{sess['session_id']}/cancelar")
                    log("pago.cancelar-tramite", "OK" if r2.status_code == 200 else "FAIL", f"{r2.status_code}")
                else:
                    log("pago.crear-sesion-tramite", "FAIL", f"{r.status_code}: {r.text[:200]}")

                # Cleanup: rechazar la solicitud con costo
                c.put(
                    f"{BASE}/tramites/solicitudes/detalle/{pago_sol_id}",
                    json={"estado": "rechazado", "observaciones": "smoke pago - cleanup"},
                    headers=h(adm),
                )
                log("cleanup.solicitud-pago", "INFO", "rechazada")
            else:
                log("crear-solicitud-con-costo", "FAIL", f"{r.status_code}: {r.text[:200]}")

        # ==============================
        print("\n" + "=" * 60)
        oks = sum(1 for _, s, _ in results if s == "OK")
        fails = sum(1 for _, s, _ in results if s == "FAIL")
        warns = sum(1 for _, s, _ in results if s == "WARN")
        infos = sum(1 for _, s, _ in results if s == "INFO")
        print(f"TRAMITES TOTAL: OK={oks} FAIL={fails} WARN={warns} INFO={infos}")
        if fails:
            print("\nFALLOS:")
            for t, s, d in results:
                if s == "FAIL":
                    print(f"  - {t}: {d}")
        print("=" * 60)
        sys.exit(1 if fails else 0)


if __name__ == "__main__":
    run()
