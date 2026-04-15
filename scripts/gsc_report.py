"""
Reporte de Google Search Console para munify.com.ar

Uso:
    python scripts/gsc_report.py
    python scripts/gsc_report.py --days 90
    python scripts/gsc_report.py --queries       (solo consultas)
    python scripts/gsc_report.py --pages         (solo páginas)
    python scripts/gsc_report.py --sitemaps      (solo sitemaps)
"""
import argparse
import io
import json
import sys
from datetime import date, timedelta
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

CREDS_PATH = Path(__file__).parent / "gsc-credentials.json"
SITE_URL = "sc-domain:munify.com.ar"
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]


def get_service():
    if not CREDS_PATH.exists():
        sys.exit(f"ERROR: no existe {CREDS_PATH}")
    creds = service_account.Credentials.from_service_account_file(
        str(CREDS_PATH), scopes=SCOPES
    )
    return build("searchconsole", "v1", credentials=creds, cache_discovery=False)


def fmt_row(row, dims):
    keys = row.get("keys", [])
    return {
        **{dims[i]: keys[i] for i in range(len(dims))},
        "clicks": row.get("clicks", 0),
        "impressions": row.get("impressions", 0),
        "ctr": round(row.get("ctr", 0) * 100, 2),
        "position": round(row.get("position", 0), 1),
    }


def report_overview(svc, days):
    end = date.today()
    start = end - timedelta(days=days)
    print(f"\n{'='*70}")
    print(f"RESUMEN GENERAL — últimos {days} días ({start} a {end})")
    print(f"{'='*70}")
    try:
        res = svc.searchanalytics().query(
            siteUrl=SITE_URL,
            body={
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "dimensions": [],
                "rowLimit": 1,
            },
        ).execute()
        rows = res.get("rows", [])
        if not rows:
            print("  (sin datos — probablemente sitio muy nuevo o sin impresiones)")
            return
        r = rows[0]
        print(f"  Clics totales:    {r.get('clicks', 0)}")
        print(f"  Impresiones:      {r.get('impressions', 0)}")
        print(f"  CTR:              {round(r.get('ctr', 0)*100, 2)}%")
        print(f"  Posición media:   {round(r.get('position', 0), 1)}")
    except HttpError as e:
        print(f"  ERROR: {e}")


def report_queries(svc, days, limit=25):
    end = date.today()
    start = end - timedelta(days=days)
    print(f"\n{'='*70}")
    print(f"TOP CONSULTAS — últimos {days} días")
    print(f"{'='*70}")
    try:
        res = svc.searchanalytics().query(
            siteUrl=SITE_URL,
            body={
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "dimensions": ["query"],
                "rowLimit": limit,
            },
        ).execute()
        rows = res.get("rows", [])
        if not rows:
            print("  (sin consultas registradas)")
            return
        print(f"  {'Query':<45} {'Imp':>6} {'Clk':>5} {'CTR%':>6} {'Pos':>5}")
        print(f"  {'-'*45} {'-'*6} {'-'*5} {'-'*6} {'-'*5}")
        for row in rows:
            d = fmt_row(row, ["query"])
            q = d["query"][:43]
            print(f"  {q:<45} {d['impressions']:>6} {d['clicks']:>5} "
                  f"{d['ctr']:>6} {d['position']:>5}")
    except HttpError as e:
        print(f"  ERROR: {e}")


def report_pages(svc, days, limit=25):
    end = date.today()
    start = end - timedelta(days=days)
    print(f"\n{'='*70}")
    print(f"TOP PÁGINAS — últimos {days} días")
    print(f"{'='*70}")
    try:
        res = svc.searchanalytics().query(
            siteUrl=SITE_URL,
            body={
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "dimensions": ["page"],
                "rowLimit": limit,
            },
        ).execute()
        rows = res.get("rows", [])
        if not rows:
            print("  (sin páginas con impresiones)")
            return
        for row in rows:
            d = fmt_row(row, ["page"])
            print(f"  {d['page']}")
            print(f"    imp={d['impressions']} clk={d['clicks']} "
                  f"ctr={d['ctr']}% pos={d['position']}")
    except HttpError as e:
        print(f"  ERROR: {e}")


def report_sitemaps(svc):
    print(f"\n{'='*70}")
    print("SITEMAPS")
    print(f"{'='*70}")
    try:
        res = svc.sitemaps().list(siteUrl=SITE_URL).execute()
        sitemaps = res.get("sitemap", [])
        if not sitemaps:
            print("  (NO hay sitemaps enviados — ir a GSC > Sitemaps y enviar)")
            return
        for s in sitemaps:
            print(f"  {s.get('path')}")
            print(f"    última descarga: {s.get('lastDownloaded', 'nunca')}")
            print(f"    última submission: {s.get('lastSubmitted', 'nunca')}")
            print(f"    tipo: {s.get('type')}")
            print(f"    pendiente: {s.get('isPending')}")
            print(f"    warnings: {s.get('warnings', 0)}  errors: {s.get('errors', 0)}")
            contents = s.get("contents", [])
            for c in contents:
                print(f"    contenido: {c.get('type')} — "
                      f"enviadas={c.get('submitted', 0)} indexadas={c.get('indexed', 0)}")
    except HttpError as e:
        print(f"  ERROR: {e}")


def _fetch_period(svc, start, end, dimensions):
    res = svc.searchanalytics().query(
        siteUrl=SITE_URL,
        body={
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": dimensions,
            "rowLimit": 500,
        },
    ).execute()
    return res.get("rows", [])


def _arrow(delta, inverse=False):
    if delta == 0:
        return "="
    up = delta > 0
    if inverse:
        up = not up
    return "↑" if up else "↓"


def _fmt_delta(old, new, pct=False, decimals=1):
    if old == 0 and new == 0:
        return "(sin cambios)"
    if old == 0:
        return f"(nueva → {new:.{decimals}f})"
    delta = new - old
    if pct:
        pct_change = (delta / old) * 100
        return f"{old:.{decimals}f} → {new:.{decimals}f}  ({'+' if delta >= 0 else ''}{pct_change:.1f}%)"
    return f"{old:.{decimals}f} → {new:.{decimals}f}  ({'+' if delta >= 0 else ''}{delta:.{decimals}f})"


def report_compare(svc, window):
    """Compara últimos <window> días vs los <window> días previos."""
    end = date.today()
    mid = end - timedelta(days=window)
    start = mid - timedelta(days=window)

    print(f"\n{'='*70}")
    print(f"COMPARATIVA — últimos {window} días vs {window} días previos")
    print(f"  actual:  {mid} → {end}")
    print(f"  previo:  {start} → {mid}")
    print(f"{'='*70}")

    # Totales
    now_rows = _fetch_period(svc, mid, end, [])
    prev_rows = _fetch_period(svc, start, mid, [])
    now_tot = now_rows[0] if now_rows else {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}
    prev_tot = prev_rows[0] if prev_rows else {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}

    print(f"\n  Impresiones: {_fmt_delta(prev_tot.get('impressions', 0), now_tot.get('impressions', 0), pct=True, decimals=0)}")
    print(f"  Clics:       {_fmt_delta(prev_tot.get('clicks', 0), now_tot.get('clicks', 0), pct=True, decimals=0)}")
    ctr_now = now_tot.get("ctr", 0) * 100
    ctr_prev = prev_tot.get("ctr", 0) * 100
    print(f"  CTR:         {ctr_prev:.1f}% → {ctr_now:.1f}%  ({'+' if ctr_now >= ctr_prev else ''}{ctr_now - ctr_prev:.1f}pp)")
    pos_now = now_tot.get("position", 0)
    pos_prev = prev_tot.get("position", 0)
    arrow = "↑ mejoró" if pos_now < pos_prev else ("↓ empeoró" if pos_now > pos_prev else "=")
    print(f"  Pos. media:  {pos_prev:.1f} → {pos_now:.1f}  {arrow}")

    # Keywords
    now_q = {r["keys"][0]: r for r in _fetch_period(svc, mid, end, ["query"])}
    prev_q = {r["keys"][0]: r for r in _fetch_period(svc, start, mid, ["query"])}

    subidas, bajadas, nuevas, perdidas = [], [], [], []
    for q, r in now_q.items():
        if q not in prev_q:
            nuevas.append((q, r["position"], r["impressions"]))
        else:
            dp = prev_q[q]["position"] - r["position"]  # positivo = mejoró (menor posición)
            if dp >= 1:
                subidas.append((q, prev_q[q]["position"], r["position"], dp))
            elif dp <= -1:
                bajadas.append((q, prev_q[q]["position"], r["position"], dp))
    for q, r in prev_q.items():
        if q not in now_q:
            perdidas.append((q, r["position"]))

    if subidas:
        print(f"\n  🔼 KEYWORDS QUE SUBIERON")
        for q, p_old, p_new, d in sorted(subidas, key=lambda x: -x[3])[:10]:
            print(f"     {q[:45]:<45}  pos {p_old:.1f} → {p_new:.1f}  (+{d:.1f})")
    if bajadas:
        print(f"\n  🔽 KEYWORDS QUE BAJARON")
        for q, p_old, p_new, d in sorted(bajadas, key=lambda x: x[3])[:10]:
            print(f"     {q[:45]:<45}  pos {p_old:.1f} → {p_new:.1f}  ({d:.1f})")
    if nuevas:
        print(f"\n  ✨ KEYWORDS NUEVAS (no aparecían antes)")
        for q, p, imp in sorted(nuevas, key=lambda x: -x[2])[:10]:
            print(f"     {q[:45]:<45}  pos {p:.1f}  imp={imp}")
    if perdidas:
        print(f"\n  ❌ KEYWORDS PERDIDAS")
        for q, p in sorted(perdidas, key=lambda x: x[1])[:10]:
            print(f"     {q[:45]:<45}  estaba en pos {p:.1f}")

    # Páginas
    now_p = {r["keys"][0]: r for r in _fetch_period(svc, mid, end, ["page"])}
    prev_p = {r["keys"][0]: r for r in _fetch_period(svc, start, mid, ["page"])}
    nuevas_p = [p for p in now_p if p not in prev_p]
    if nuevas_p:
        print(f"\n  📄 PÁGINAS NUEVAS CON IMPRESIONES")
        for p in nuevas_p:
            r = now_p[p]
            print(f"     {p}")
            print(f"       imp={r['impressions']}  pos={r['position']:.1f}")


def report_sites(svc):
    print(f"\n{'='*70}")
    print("PROPIEDADES VISIBLES POR ESTE SERVICE ACCOUNT")
    print(f"{'='*70}")
    try:
        res = svc.sites().list().execute()
        sites = res.get("siteEntry", [])
        if not sites:
            print("  (ninguna — falta agregar el service account como usuario en GSC)")
            return
        for s in sites:
            print(f"  {s.get('siteUrl')}  [{s.get('permissionLevel')}]")
    except HttpError as e:
        print(f"  ERROR: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--queries", action="store_true")
    ap.add_argument("--pages", action="store_true")
    ap.add_argument("--sitemaps", action="store_true")
    ap.add_argument("--sites", action="store_true")
    ap.add_argument("--compare", type=int, nargs="?", const=7, default=None,
                    metavar="DAYS", help="comparar últimos N días vs N días previos (default 7)")
    args = ap.parse_args()

    svc = get_service()

    if args.compare is not None:
        report_compare(svc, args.compare)
        return

    any_flag = args.queries or args.pages or args.sitemaps or args.sites
    if not any_flag:
        report_sites(svc)
        report_overview(svc, args.days)
        report_queries(svc, args.days)
        report_pages(svc, args.days)
        report_sitemaps(svc)
    else:
        if args.sites:
            report_sites(svc)
        if args.queries:
            report_overview(svc, args.days)
            report_queries(svc, args.days)
        if args.pages:
            report_pages(svc, args.days)
        if args.sitemaps:
            report_sitemaps(svc)


if __name__ == "__main__":
    main()
