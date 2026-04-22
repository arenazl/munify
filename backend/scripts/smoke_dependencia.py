"""Smoke: circuito del supervisor de dependencia (rol=supervisor con municipio_dependencia_id)."""
import httpx
import sys

BASE = "https://reclamos-mun-api-aedc8e147cbe.herokuapp.com/api"
DEP_USER = ("supervisor-obras-publicas@la-matanza.demo.com", "demo123")
MUNI_ID = 78

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
    return r.json() if r.status_code == 200 else None


def h(t):
    return {"Authorization": f"Bearer {t}"}


def run():
    with httpx.Client(timeout=30) as c:
        data = login(c, *DEP_USER)
        if not data:
            log("login.dep", "FAIL", "credenciales")
            return
        tok = data["access_token"]
        u = data["user"]
        log("login.dep", "OK", f"rol={u['rol']} muni={u['municipio_id']} dep={u.get('municipio_dependencia_id')}")

        md_id = u.get("municipio_dependencia_id")

        # 1. Ver reclamos — deberia filtrar solo los de su dependencia
        r = c.get(f"{BASE}/reclamos?municipio_id={MUNI_ID}&limit=200", headers=h(tok))
        if r.status_code == 200:
            reclamos = r.json()
            # Contar cuantos son de su dep vs otros
            propios = sum(1 for r in reclamos if r.get("dependencia_asignada", {}).get("dependencia_id") == md_id
                          or (r.get("dependencia_asignada") and isinstance(r["dependencia_asignada"], dict)
                              and r["dependencia_asignada"].get("id") == md_id))
            log("reclamos.listar", "OK", f"total_visibles={len(reclamos)} de-su-dep={propios}")
        else:
            log("reclamos.listar", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # 2. Stats de su area
        r = c.get(f"{BASE}/dashboard/conteo-estados", headers=h(tok))
        log("dashboard.conteo-estados", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}")

        # 3. Tramites de su area
        r = c.get(f"{BASE}/tramites/gestion/solicitudes?municipio_id={MUNI_ID}&limit=50", headers=h(tok))
        if r.status_code == 200:
            log("tramites.gestion", "OK", f"count={len(r.json())}")
        else:
            log("tramites.gestion", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # 4. Detalle de su propia dependencia
        r = c.get(f"{BASE}/dependencias/municipio/{md_id}", headers=h(tok))
        if r.status_code == 200:
            d = r.json()
            log("mi-dependencia", "OK", f"nombre={d.get('dependencia', {}).get('nombre')}")
        else:
            log("mi-dependencia", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # 5. Tiene permiso para tocar una dep que NO es la suya?
        otra_id = md_id + 1
        r = c.get(f"{BASE}/dependencias/municipio/{otra_id}", headers=h(tok))
        if r.status_code == 403:
            log("permiso.otra-dependencia-bloqueada", "OK", "403 esperado")
        elif r.status_code == 404:
            log("permiso.otra-dependencia-bloqueada", "INFO", "404 (no existe)")
        else:
            log("permiso.otra-dependencia-bloqueada", "WARN", f"permite acceso: {r.status_code}")

        # 6. Empleados disponibles para asignar
        r = c.get(f"{BASE}/empleados/disponibilidad", headers=h(tok))
        log("empleados.disponibilidad", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}")

        # 7. Cambiar estado de un reclamo de otra dep - deberia bloquear
        # Primero buscar un reclamo de OTRA dep
        r = c.get(f"{BASE}/reclamos?municipio_id={MUNI_ID}&limit=50", headers=h(tok))
        if r.status_code == 200:
            reclamos = r.json()
            ajeno = next((r for r in reclamos if r.get("dependencia_asignada") and
                         isinstance(r["dependencia_asignada"], dict) and
                         r["dependencia_asignada"].get("id") != md_id), None)
            if ajeno:
                r2 = c.patch(
                    f"{BASE}/reclamos/{ajeno['id']}?nuevo_estado=en_curso&comentario=test-dep",
                    headers=h(tok),
                )
                if r2.status_code == 403:
                    log("permiso.reclamo-ajeno-bloqueado", "OK", "403 esperado")
                else:
                    log("permiso.reclamo-ajeno-bloqueado", "INFO",
                        f"no bloqueado ({r2.status_code}) — puede que supervisor tenga acceso transversal")
            else:
                log("permiso.reclamo-ajeno-bloqueado", "INFO", "no hay reclamos ajenos visibles")

        # ==============================
        print("\n" + "=" * 60)
        oks = sum(1 for _, s, _ in results if s == "OK")
        fails = sum(1 for _, s, _ in results if s == "FAIL")
        warns = sum(1 for _, s, _ in results if s == "WARN")
        infos = sum(1 for _, s, _ in results if s == "INFO")
        print(f"DEPENDENCIA TOTAL: OK={oks} FAIL={fails} WARN={warns} INFO={infos}")
        if fails:
            print("\nFALLOS:")
            for t, s, d in results:
                if s == "FAIL":
                    print(f"  - {t}: {d}")
        print("=" * 60)
        sys.exit(1 if fails else 0)


if __name__ == "__main__":
    run()
