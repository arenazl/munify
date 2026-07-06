#!/usr/bin/env bash
# Verificador DETERMINÍSTICO de aislamiento de ambientes. Pasa/falla por EXIT CODE.
# No depende del criterio del agente: corre SIEMPRE los mismos checks. Es un gate, no una regla.
#
# Uso:
#   15-VERIFY-AISLAMIENTO.sh <repo> <branch> <front_url> <own_backend_host> <forbidden_host> [health_path]
#
# Ej (munify qa):
#   15-VERIFY-AISLAMIENTO.sh arenazl/munify qa https://munify-qa.netlify.app \
#       munify-api-qa-vmpxsxe7ra-uk.a.run.app munify-api-1060106389361 /api/municipios/public
#
# exit 0  -> ambiente aislado (se puede promover)
# exit 1  -> aislamiento ROTO (NO promover); lista las fallas.

set -uo pipefail   # NO -e a propósito: corremos TODOS los checks y juntamos las fallas

REPO="${1:?falta <repo> (ej arenazl/munify)}"
BRANCH="${2:?falta <branch>}"
FRONT_URL="${3:?falta <front_url>}"
OWN_HOST="${4:?falta <own_backend_host>}"
FORBIDDEN="${5:?falta <forbidden_host> (el backend que este ambiente NO debe tocar)}"
HEALTH_PATH="${6:-/}"
NETLIFY_SITE="${7:-}"   # opcional: site_id para verificar el BACKEND_ORIGIN (modelo proxy same-origin)

FAILS=0
ok()   { echo "  [OK]    $1"; }
bad()  { echo "  [FALLA] $1"; FAILS=$((FAILS + 1)); }

echo ">> Aislamiento de ${REPO}@${BRANCH}  (front=${FRONT_URL}, propio=${OWN_HOST}, prohibido=${FORBIDDEN})"

# --- CHECK A — PUREZA DE REPO: ningún archivo de proxy hardcodea el backend prohibido ---
# (esto es exactamente lo que causó el leak: _redirects con la URL de prod hardcodeada)
checked_any=0
for f in frontend/public/_redirects netlify.toml frontend/netlify.toml public/_redirects; do
  body="$(gh api "repos/${REPO}/contents/${f}?ref=${BRANCH}" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || true)"
  [ -z "$body" ] && continue
  checked_any=1
  if echo "$body" | grep -q "$FORBIDDEN"; then
    bad "A/pureza: '${f}' hardcodea el backend PROHIBIDO (${FORBIDDEN})"
  else
    ok "A/pureza: '${f}' sin host prohibido"
  fi
done
[ "$checked_any" = 0 ] && ok "A/pureza: no hay archivos de proxy hardcodeables en el repo"

# --- CHECK C — BINDING: el bundle VIVO del front referencia SU backend, NO el prohibido ---
js="$(curl -s "${FRONT_URL}/" | grep -oE '/assets/index-[^"]+\.js' | head -1 || true)"
if [ -n "$js" ]; then
  bundle="$(curl -s "${FRONT_URL}${js}")"
  if echo "$bundle" | grep -q "$FORBIDDEN"; then
    bad "C/binding: el bundle vivo referencia el backend PROHIBIDO (${FORBIDDEN})"
  elif echo "$bundle" | grep -q "$OWN_HOST"; then
    ok "C/binding: el bundle referencia SU backend absoluto (${OWN_HOST}) y no el prohibido"
  else
    # Modelo PROXY (same-origin /api, sin host absoluto en el bundle) — es lo CORRECTO con gen-redirects.
    # El aislamiento lo da el BACKEND_ORIGIN del site (Infra-set) + la pureza del repo (check A).
    if [ -n "$NETLIFY_SITE" ]; then
      bo="$(netlify api getEnvVars --data "{\"account_id\":\"${NETLIFY_ACCOUNT_ID:-arenazl}\",\"site_id\":\"${NETLIFY_SITE}\"}" 2>/dev/null | python -c "
import json,sys
for v in json.load(sys.stdin):
    if v.get('key')=='BACKEND_ORIGIN' and v.get('values'): print(v['values'][0]['value'])
" 2>/dev/null | head -1)"
      if [ -z "$bo" ]; then
        bad "C/binding(proxy): el site ${NETLIFY_SITE} no tiene BACKEND_ORIGIN seteado"
      elif echo "$bo" | grep -q "$FORBIDDEN"; then
        bad "C/binding(proxy): BACKEND_ORIGIN del site apunta al PROHIBIDO (${bo})"
      elif echo "$bo" | grep -q "$OWN_HOST"; then
        ok "C/binding(proxy): same-origin /api → BACKEND_ORIGIN=${bo} (su backend, no el prohibido)"
      else
        bad "C/binding(proxy): BACKEND_ORIGIN (${bo}) no es ni su backend ni el prohibido — revisar"
      fi
    else
      bad "C/binding: bundle usa proxy same-origin, pero falta el site (param 7) para verificar BACKEND_ORIGIN"
    fi
  fi
else
  bad "C/binding: no pude obtener el bundle de ${FRONT_URL}"
fi

# --- CHECK B — LIVENESS: el backend propio del ambiente responde ---
code="$(curl -s -o /dev/null -w '%{http_code}' "https://${OWN_HOST}${HEALTH_PATH}" 2>/dev/null || echo 000)"
if [ "$code" = "200" ] || [ "$code" = "401" ] || [ "$code" = "403" ]; then
  ok "B/liveness: ${OWN_HOST}${HEALTH_PATH} responde (${code})"
else
  bad "B/liveness: ${OWN_HOST}${HEALTH_PATH} no responde OK (${code})"
fi

echo ""
if [ "$FAILS" -eq 0 ]; then
  echo ">> AISLAMIENTO OK — ${REPO}@${BRANCH} aislado. (exit 0)"
  exit 0
else
  echo ">> AISLAMIENTO ROTO — ${FAILS} falla(s). NO PROMOVER. (exit 1)"
  exit 1
fi
