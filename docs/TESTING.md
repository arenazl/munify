# Testing manual · Munify

Cómo testear cambios antes de pushear y qué chequear por módulo. **No hay test suite automatizada hoy** — el testing es manual contra prod o local. Para no romper prod, hay regla dura: nunca pushear front sin correr `npm run build` local antes (ver [`DEPLOY.md`](DEPLOY.md) §14 de CLAUDE.md).

## Arrancar local

### Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate   # o venv\Scripts\activate en Windows
pip install -r requirements.txt
cp .env.example .env   # completar con credenciales reales (DB Aiven, JWT secret, Gemini, etc.)
uvicorn main:app --reload --port 8002
```

> Si quedaron procesos zombies de uvicorn, correr `cleanup.bat` antes (mata procesos en puertos 8001/8002 + node de vite).

### Frontend
```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_PORT=8002 si arrancaste backend en 8002
npm run dev -- --host
```

### Usuarios demo
Formato: `{rol}@{codigo}.demo.com` con password `demo123`. Ejemplos: `vecino@merlo.demo.com`, `supervisor@merlo.demo.com`, `admin@merlo.demo.com`, `cuadrilla@merlo.demo.com`.

## Smoke test después de cambios

Antes de pushear, mínimo:

1. **Login** con cada rol (vecino, empleado, supervisor, admin) — ¿entra al dashboard correcto?
2. **ABM tocado** — ¿se abre el Sheet?, ¿guarda?, ¿edita?, ¿elimina con confirmación?
3. **Reclamo end-to-end** (si tocaste reclamos): crear → asignar → en_proceso → resuelto. Estados visibles, notificaciones disparadas.
4. **Multi-tenant** — loguearse con dos municipios distintos, confirmar que no se cruzan los datos.
5. **Dark mode** — la pantalla que tocaste, ¿se ve bien en oscuro? (los controles nativos suelen romperse acá; ver §4 de CLAUDE.md).

## Por módulo

### Reclamos
- Crear desde wizard (5 pasos). Probar la sugerencia de categoría por IA con descripciones variadas ("bache", "luz quemada", "basura tirada").
- Modal "similares" si la categoría tiene reclamos cercanos.
- Botón "Sumarme" (vecino, no creador): que sume al usuario, dispare notificación al creador.
- Como supervisor: asignar manual y por sugerencia (scoring). Mover entre estados en el Kanban (drag & drop).
- Como empleado: tomar trabajo, marcar resuelto con descripción y foto.
- Calificación post-resolución: 1-5 estrellas.

### Trámites
- Wizard de nuevo trámite con validación biométrica RENAPER (si la categoría lo requiere).
- Categorías per-municipio: confirmar que el admin de un muni no ve las categorías de otro.
- Adjuntar documentación (DNI, formulario, etc.).
- Estados: `iniciado → revisión → aprobado | rechazado`.

### Tesorería
- Wizard de "Nuevo gasto" con todos los tipos de financiación (contado, cuotas, recurrente, préstamo).
- Imputación múltiple a proyectos (50%/50%) — chequear que la suma sea 100%.
- Marcar pago de una cuota — verificar que cambia el estado del gasto.
- Importar Excel histórico (módulo de importación de tesorería).
- Resumen mensual / anual en el dashboard.

### Mostrador
- Operador genera cupón de pago → arma link `wa.me` con mensaje pre-cargado → vecino paga.
- Verificar que el número saliente es el del muni configurado en WhatsApp Config (no el de Munify).

### Cobros / Tasas
- Vecino ve sus tasas pendientes y paga con cualquier proveedor configurado.

### Configuración
- Cambiar logo y color primario → verificar que se refleja en sidebar y emails.
- Activar/desactivar módulos para un municipio → confirmar que el sidebar oculta los items correctos.

## Reglas de oro para no romper nada

- **Cero hex inline** — usar `useTheme()`. Si el control no es coherente en dark mode, ese es el síntoma.
- **Cero controles nativos** (`<select>`, `<input type="date">`, `window.confirm`) — ver tabla §4 de CLAUDE.md.
- **`searchMaxWidth` está vetado** en ABMPage — si lo encontrás, removelo.
- **Multi-tenant**: cualquier endpoint que toques, confirmar que filtra por `current_user.municipio_id`. Olvido = leak.
- **Migraciones**: si cambiaste schema, ejecutalas sin preguntar (ver §"MIGRACIONES" de CLAUDE.md).

## Verificación post-deploy

Después de pushear:

```bash
# 1. Hash del bundle en prod vs local
curl -s https://app.munify.com.ar/ | grep -oE 'index-\w+\.js'
# Comparar contra dist/index.html local. Si difieren, el build de Netlify falló.

# 2. Backend Heroku vivo
curl https://munify-backend.herokuapp.com/health   # o equivalente

# 3. Logs si algo huele mal
heroku logs --tail -a munify-backend
```

## Lo que NO es vivo acá

El [`legacy/MANUAL_TESTING_SGM.md`](legacy/MANUAL_TESTING_SGM.md) (1280 líneas) tiene la versión vieja con URLs `reclamos-mun.netlify.app` y datos de enero. Sigue ahí por trazabilidad pero no es la referencia actual. Lo mismo con [`legacy/TESTING_CHECKLIST.md`](legacy/TESTING_CHECKLIST.md) (específico al feature "Sumarse", ya implementado).
