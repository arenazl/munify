"""Genera la sección de inventario de componentes UI dentro de BUILD_GUIDE.md.

Escanea frontend/src/components/ui/*.tsx, extrae:
  - Nombre del componente exportado
  - Comentario JSDoc previo (descripción humana)
  - Interface de props con campos principales

Y reemplaza el contenido entre los marcadores:
  <!-- UI_INVENTORY_START -->
  <!-- UI_INVENTORY_END -->
en BUILD_GUIDE.md.

Uso:
  python scripts/generate_ui_inventory.py

Idempotente: correlo cada vez que agregues/saques componentes en components/ui/.
"""
from __future__ import annotations

import re
from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parent.parent
UI_DIR = ROOT / "frontend" / "src" / "components" / "ui"
GUIDE = ROOT / "BUILD_GUIDE.md"
START = "<!-- UI_INVENTORY_START -->"
END = "<!-- UI_INVENTORY_END -->"


DOC_RE = re.compile(r"/\*\*(.*?)\*/", re.DOTALL)
INTERFACE_RE = re.compile(
    r"(?:export\s+)?interface\s+(\w*Props)\s*\{([^}]*)\}",
    re.DOTALL,
)
EXPORT_FN_RE = re.compile(
    r"export\s+(?:default\s+)?function\s+(\w+)\s*[<(]",
)
EXPORT_CONST_RE = re.compile(r"export\s+const\s+(\w+)\s*[:=]")


def clean_doc(raw: str) -> str:
    """Saca los `*` de cada línea de un bloque JSDoc y normaliza."""
    lines = []
    for line in raw.splitlines():
        line = line.strip().lstrip("*").strip()
        if line:
            lines.append(line)
    return " ".join(lines).strip()


def first_doc_block(text: str) -> str | None:
    m = DOC_RE.search(text)
    if not m:
        return None
    doc = clean_doc(m.group(1))
    if not doc or doc.startswith("@"):
        return None
    return doc


def extract_props(text: str) -> tuple[str, list[str]] | None:
    """Devuelve (NombreProps, [props_lines]) del primer interface XxxProps."""
    m = INTERFACE_RE.search(text)
    if not m:
        return None
    name = m.group(1)
    body = m.group(2)
    props: list[str] = []
    for raw_line in body.splitlines():
        line = raw_line.strip().rstrip(";").rstrip(",")
        if not line or line.startswith("//"):
            continue
        # Saca comentarios inline
        line = re.sub(r"\s*//.*$", "", line).strip()
        if line:
            props.append(line)
    return name, props


def main_component_name(text: str, fallback: str) -> str:
    m = EXPORT_FN_RE.search(text)
    if m:
        return m.group(1)
    m = EXPORT_CONST_RE.search(text)
    if m:
        return m.group(1)
    return fallback


def shorten_doc(doc: str, max_chars: int = 280) -> str:
    if len(doc) <= max_chars:
        return doc
    cut = doc[:max_chars].rsplit(" ", 1)[0]
    return cut + "..."


def render_props(props: list[str], max_lines: int = 8) -> str:
    if not props:
        return "_(sin props públicas)_"
    shown = props[:max_lines]
    extra = len(props) - len(shown)
    block = "\n".join(f"  - `{p}`" for p in shown)
    if extra > 0:
        block += f"\n  - _... +{extra} prop(s) más_"
    return block


def scan_component(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    name = main_component_name(text, path.stem)
    doc = first_doc_block(text) or ""
    props_extracted = extract_props(text)
    props_name = props_extracted[0] if props_extracted else None
    props_list = props_extracted[1] if props_extracted else []
    return {
        "file": path.name,
        "name": name,
        "doc": shorten_doc(doc) if doc else "",
        "props_name": props_name,
        "props": props_list,
    }


def render_markdown(components: list[dict]) -> str:
    out: list[str] = []
    out.append(f"_Auto-generado por `scripts/generate_ui_inventory.py`. "
               f"NO editar a mano — correr el script y commitear el resultado._")
    out.append("")
    out.append(f"Total: **{len(components)} componentes** en "
               f"`frontend/src/components/ui/`.\n")

    # Tabla resumen
    out.append("| Componente | Para qué sirve | Archivo |")
    out.append("|---|---|---|")
    for c in components:
        short = c["doc"][:120] if c["doc"] else "_(sin doc)_"
        out.append(f"| `{c['name']}` | {short} | `{c['file']}` |")
    out.append("")

    # Detalle por componente
    out.append("### Detalle por componente\n")
    for c in components:
        out.append(f"#### `{c['name']}`")
        out.append(f"- **Archivo:** `frontend/src/components/ui/{c['file']}`")
        if c["doc"]:
            out.append(f"- **Descripción:** {c['doc']}")
        if c["props_name"]:
            out.append(f"- **Props (`{c['props_name']}`):**")
            out.append(render_props(c["props"]))
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def replace_section(guide_text: str, new_body: str) -> str:
    if START not in guide_text or END not in guide_text:
        raise SystemExit(
            f"BUILD_GUIDE.md no contiene los marcadores {START} / {END}. "
            "Agregalos donde quieras que se inserte el inventario."
        )
    pattern = re.compile(
        re.escape(START) + r".*?" + re.escape(END),
        re.DOTALL,
    )
    replacement = f"{START}\n{new_body}\n{END}"
    return pattern.sub(replacement, guide_text)


def main() -> None:
    if not UI_DIR.exists():
        raise SystemExit(f"No existe {UI_DIR}")
    if not GUIDE.exists():
        raise SystemExit(f"No existe {GUIDE} — creá BUILD_GUIDE.md primero.")

    files = sorted(UI_DIR.glob("*.tsx"))
    components = [scan_component(p) for p in files]
    body = render_markdown(components)

    guide_text = GUIDE.read_text(encoding="utf-8")
    new_text = replace_section(guide_text, body)
    GUIDE.write_text(new_text, encoding="utf-8")
    print(f"OK: {len(components)} componentes escritos en BUILD_GUIDE.md")


if __name__ == "__main__":
    main()
