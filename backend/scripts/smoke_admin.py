"""Smoke test ABMs admin: categorias, dependencias, asignacion, empleados, proveedores."""
import httpx
import sys
from datetime import datetime

BASE = "https://reclamos-mun-api-aedc8e147cbe.herokuapp.com/api"
ADMIN = ("admin@la-matanza.demo.com", "demo123")
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
    return r.json()["access_token"] if r.status_code == 200 else None


def h(t):
    return {"Authorization": f"Bearer {t}"}


def run():
    with httpx.Client(timeout=30) as c:
        adm = login(c, *ADMIN)
        if not adm:
            log("login.admin", "FAIL", "")
            return
        log("login.admin", "OK")

        # ============ CATEGORIAS RECLAMO ============
        print("\n--- CATEGORIAS RECLAMO ---")
        r = c.get(f"{BASE}/categorias-reclamo?municipio_id={MUNI_ID}", headers=h(adm))
        if r.status_code == 200:
            cats = r.json()
            log("categorias-reclamo.list", "OK", f"count={len(cats)}")
            cat_id = cats[0]["id"] if cats else None
            if cat_id:
                # Detalle
                r = c.get(f"{BASE}/categorias-reclamo/{cat_id}?municipio_id={MUNI_ID}", headers=h(adm))
                log("categorias-reclamo.detalle", "OK" if r.status_code == 200 else "FAIL",
                    f"{r.status_code}")
        else:
            log("categorias-reclamo.list", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # Catalogo de categorias sugeridas
        r = c.get(f"{BASE}/categorias-reclamo-sugeridas", headers=h(adm))
        log("categorias-reclamo-sugeridas", "OK" if r.status_code == 200 else "FAIL",
            f"{r.status_code} count={len(r.json()) if r.status_code == 200 else '?'}")

        # ============ CATEGORIAS TRAMITE ============
        print("\n--- CATEGORIAS TRAMITE ---")
        r = c.get(f"{BASE}/categorias-tramite?municipio_id={MUNI_ID}", headers=h(adm))
        if r.status_code == 200:
            log("categorias-tramite.list", "OK", f"count={len(r.json())}")
        else:
            log("categorias-tramite.list", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # ============ DEPENDENCIAS ============
        print("\n--- DEPENDENCIAS ---")
        r = c.get(f"{BASE}/dependencias/catalogo", headers=h(adm))
        log("dep.catalogo-global", "OK" if r.status_code == 200 else "FAIL",
            f"count={len(r.json()) if r.status_code == 200 else '?'}")

        r = c.get(f"{BASE}/dependencias/municipio?municipio_id={MUNI_ID}", headers=h(adm))
        if r.status_code == 200:
            deps = r.json()
            log("dep.municipio", "OK", f"count={len(deps)}")
            md_id = deps[0]["id"] if deps else None
            if md_id:
                # Detalle
                r = c.get(f"{BASE}/dependencias/municipio/{md_id}", headers=h(adm))
                log("dep.municipio.detalle", "OK" if r.status_code == 200 else "FAIL", f"{r.status_code}")

                # Categorias asignadas
                r = c.get(f"{BASE}/dependencias/municipio/{md_id}/categorias", headers=h(adm))
                log("dep.municipio.categorias", "OK" if r.status_code == 200 else "FAIL",
                    f"count={len(r.json()) if r.status_code == 200 else '?'}")

                # Tramites asignados
                r = c.get(f"{BASE}/dependencias/municipio/{md_id}/tramites", headers=h(adm))
                log("dep.municipio.tramites", "OK" if r.status_code == 200 else "FAIL",
                    f"{r.status_code}")
        else:
            log("dep.municipio", "FAIL", f"{r.status_code}: {r.text[:150]}")
            md_id = None

        # ============ EMPLEADOS ============
        print("\n--- EMPLEADOS ---")
        r = c.get(f"{BASE}/empleados", headers=h(adm))
        log("empleados.list", "OK" if r.status_code == 200 else "FAIL",
            f"count={len(r.json()) if r.status_code == 200 else '?'}")

        r = c.get(f"{BASE}/empleados/disponibilidad", headers=h(adm))
        log("empleados.disponibilidad", "OK" if r.status_code == 200 else "FAIL",
            f"{r.status_code}")

        # ============ PROVEEDORES PAGO ============
        print("\n--- PROVEEDORES PAGO ---")
        r = c.get(f"{BASE}/proveedores-pago", headers=h(adm))
        if r.status_code == 200:
            provs = r.json()
            log("proveedores.list", "OK", f"count={len(provs)}")
            # Detalle de cada uno
            activos = [p for p in provs if p.get("activo")]
            log("proveedores.activos", "OK", f"count={len(activos)}")
        else:
            log("proveedores.list", "FAIL", f"{r.status_code}")

        # ============ ZONAS ============
        print("\n--- ZONAS / BARRIOS ---")
        # Asumimos que hay endpoint /zonas
        r = c.get(f"{BASE}/portal-publico/zonas?municipio_id={MUNI_ID}")
        if r.status_code == 200:
            log("zonas.public", "OK", f"count={len(r.json())}")
        else:
            r2 = c.get(f"{BASE}/zonas?municipio_id={MUNI_ID}", headers=h(adm))
            log("zonas", "OK" if r2.status_code == 200 else "WARN",
                f"{r2.status_code}")

        # ============ TASAS ADMIN ============
        print("\n--- TASAS ADMIN ---")
        r = c.get(f"{BASE}/tasas/tipos", headers=h(adm))
        log("tasas.tipos", "OK" if r.status_code == 200 else "FAIL",
            f"count={len(r.json()) if r.status_code == 200 else '?'}")

        r = c.get(f"{BASE}/tasas/partidas?municipio_id={MUNI_ID}&limit=10", headers=h(adm))
        if r.status_code == 200:
            log("tasas.partidas-admin", "OK", f"count={len(r.json())}")
        else:
            log("tasas.partidas-admin", "FAIL", f"{r.status_code}: {r.text[:150]}")

        # ============ CONFIGURACION DASHBOARD ============
        print("\n--- CONFIGURACION ---")
        r = c.get(f"{BASE}/configuracion?municipio_id={MUNI_ID}", headers=h(adm))
        log("configuracion", "OK" if r.status_code == 200 else "WARN",
            f"{r.status_code}")

        # ============ AUDITORIA ============
        print("\n--- AUDITORIA ---")
        r = c.get(f"{BASE}/admin/audit-logs?limit=5", headers=h(adm))
        log("audit-logs", "OK" if r.status_code == 200 else "INFO",
            f"{r.status_code}: {r.text[:80] if r.status_code != 200 else 'ok'}")

        # ============ PORTAL PUBLICO ============
        print("\n--- PORTAL PUBLICO ---")
        r = c.get(f"{BASE}/publico/categorias?municipio_id={MUNI_ID}")
        log("portal-publico.categorias", "OK" if r.status_code == 200 else "FAIL",
            f"{r.status_code} count={len(r.json()) if r.status_code == 200 else '?'}")

        r = c.get(f"{BASE}/municipios/public")
        log("municipios.public", "OK" if r.status_code == 200 else "FAIL",
            f"count={len(r.json()) if r.status_code == 200 else '?'}")

        # ============ DASHBOARD ============
        print("\n--- DASHBOARD ---")
        r = c.get(f"{BASE}/dashboard/conteo-estados", headers=h(adm))
        log("dashboard.conteo-estados", "OK" if r.status_code == 200 else "FAIL", f"{r.status_code}")

        r = c.get(f"{BASE}/dashboard/conteo-categorias", headers=h(adm))
        log("dashboard.conteo-categorias", "OK" if r.status_code == 200 else "FAIL", f"{r.status_code}")

        # ============ USUARIOS ============
        print("\n--- USUARIOS ---")
        r = c.get(f"{BASE}/users", headers=h(adm))
        log("users.list", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}")

        # ============ CUADRILLAS / AUSENCIAS ============
        print("\n--- CUADRILLAS / AUSENCIAS / PLANIFICACION ---")
        r = c.get(f"{BASE}/cuadrillas?municipio_id={MUNI_ID}", headers=h(adm))
        log("cuadrillas", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}")

        r = c.get(f"{BASE}/empleados-gestion/ausencias?municipio_id={MUNI_ID}", headers=h(adm))
        log("ausencias", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}")

        r = c.get(f"{BASE}/planificacion/semanal?municipio_id={MUNI_ID}", headers=h(adm))
        log("planificacion.semanal", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}: {r.text[:100] if r.status_code != 200 else ''}")

        # ============ SLA ============
        print("\n--- SLA ---")
        r = c.get(f"{BASE}/sla/config?municipio_id={MUNI_ID}", headers=h(adm))
        log("sla.config", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}")
        r = c.get(f"{BASE}/sla/resumen?municipio_id={MUNI_ID}", headers=h(adm))
        log("sla.resumen", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}")

        # ============ REPORTES / EXPORTAR ============
        print("\n--- REPORTES / EXPORTAR ---")
        r = c.get(f"{BASE}/reportes/ejecutivo?municipio_id={MUNI_ID}", headers=h(adm))
        log("reportes.ejecutivo", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}: {r.text[:100] if r.status_code != 200 else ''}")

        # ============ GAMIFICACION ============
        print("\n--- GAMIFICACION ---")
        r = c.get(f"{BASE}/gamificacion/leaderboard", headers=h(adm))
        log("gamificacion.leaderboard", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}")
        r = c.get(f"{BASE}/gamificacion/mi-perfil", headers=h(adm))
        log("gamificacion.mi-perfil", "OK" if r.status_code == 200 else "WARN", f"{r.status_code}")

        # ==============================
        print("\n" + "=" * 60)
        oks = sum(1 for _, s, _ in results if s == "OK")
        fails = sum(1 for _, s, _ in results if s == "FAIL")
        warns = sum(1 for _, s, _ in results if s == "WARN")
        infos = sum(1 for _, s, _ in results if s == "INFO")
        print(f"ADMIN ABMs TOTAL: OK={oks} FAIL={fails} WARN={warns} INFO={infos}")
        if fails:
            print("\nFALLOS:")
            for t, s, d in results:
                if s == "FAIL":
                    print(f"  - {t}: {d}")
        if warns:
            print("\nWARNS:")
            for t, s, d in results:
                if s == "WARN":
                    print(f"  - {t}: {d}")
        print("=" * 60)
        sys.exit(1 if fails else 0)


if __name__ == "__main__":
    run()
