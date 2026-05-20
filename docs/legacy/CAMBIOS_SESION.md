# Cambios Realizados en Esta Sesión

## Resumen
Configuración de desarrollo para acceso desde red local y simplificación de la página Landing.

---

## 1. Configuración CORS para Red Local

**Archivo:** `backend/core/config.py`

Se modificó `cors_origins_list` para permitir conexiones desde IPs de red local (192.168.x.x):

```python
# En desarrollo, agregar IPs de red local automáticamente
if self.ENVIRONMENT == "development":
    import socket
    try:
        # Obtener IP local de la máquina
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        if local_ip and local_ip.startswith("192.168."):
            for port in [5173, 5174, 5175, 3000]:
                dev_origins.append(f"http://{local_ip}:{port}")
    except Exception:
        pass

    # Agregar rangos comunes de red local (192.168.1.x)
    for i in range(1, 255):
        for port in [5173, 5174, 5175]:
            dev_origins.append(f"http://192.168.1.{i}:{port}")
```

**Motivo:** Permitir acceso al backend desde dispositivos en la misma red local (ej: celular, otra PC).

---

## 2. URL de API Dinámica

**Archivo:** `frontend/src/lib/api.ts`

Se implementó detección automática del host para desarrollo:

```typescript
const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;

  // Si hay URL configurada y NO es localhost, usarla (producción)
  if (envUrl && !envUrl.includes('localhost')) {
    return envUrl;
  }

  // En desarrollo, usar el mismo host que el frontend pero con puerto 8001
  if (import.meta.env.DEV) {
    const host = window.location.hostname;
    return `http://${host}:8001/api`;
  }

  return envUrl || 'http://localhost:8001/api';
};
```

**Motivo:** Si accedes desde `192.168.1.40:5173`, la API se conecta a `192.168.1.40:8001/api` automáticamente.

---

## 3. Vite Configurado para Red Local

**Archivo:** `frontend/vite.config.ts`

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // Escucha en todas las interfaces
    port: 5173,
  },
})
```

**Motivo:** Permite acceder al frontend desde cualquier IP de la red local.

---

## 4. Simplificación de Landing.tsx

**Archivo:** `frontend/src/pages/Landing.tsx`

### Cambios:
- **Eliminada la geolocalización**: Ya no intenta detectar la ubicación del usuario
- **Eliminados estados innecesarios**: `detectingLocation`, `locationStatus`
- **Simplificada la UI**: Muestra directamente la lista de municipios sin intentar sugerir uno cercano
- **Eliminada la lógica `isSuggested`**: Ya no hay municipio "sugerido" destacado

### Antes:
- Intentaba usar `navigator.geolocation` para detectar ubicación
- Mostraba mensaje "Ubicación no disponible" cuando fallaba
- Destacaba el municipio más cercano

### Ahora:
- Muestra directamente el mensaje "Elige de la lista"
- Lista todos los municipios disponibles
- El usuario selecciona manualmente su municipio

**Motivo:** La geolocalización solo funciona en HTTPS (excepto localhost). En HTTP desde red local (192.168.x.x) siempre falla, causando una mala experiencia de usuario.

---

## 5. Modo Debug en Landing

La página Landing incluye un **modo debug** para desarrollo:

1. Usuario selecciona un municipio
2. Se muestra panel con usuarios de prueba:
   - Admin (`admin@municipio.gob` / `123456`)
   - Supervisor (`supervisor@municipio.gob` / `123456`)
   - Cuadrilla (`cuadrilla@municipio.gob` / `123456`)
   - Vecino (`vecino@test.com` / `123456`)
3. Click en cualquier usuario hace login automático

---

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `backend/core/config.py` | CORS para red local |
| `frontend/src/lib/api.ts` | URL de API dinámica |
| `frontend/vite.config.ts` | Host 0.0.0.0 |
| `frontend/src/pages/Landing.tsx` | Eliminada geolocalización |

---

## Cómo Acceder desde Red Local

1. Iniciar backend:
   ```bash
   cd backend
   python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001
   ```

2. Iniciar frontend:
   ```bash
   cd frontend
   npm run dev -- --host
   ```

3. Acceder desde cualquier dispositivo en la red:
   - Frontend: `http://192.168.1.X:5173`
   - API: `http://192.168.1.X:8001/api`

   (Reemplazar X con la IP de la máquina que corre los servidores)

---

## Notas Técnicas

- **Geolocalización y HTTPS**: El API de geolocalización del navegador requiere HTTPS para funcionar (excepto en localhost). En desarrollo local con HTTP, siempre falla.
- **CORS dinámico**: El backend genera automáticamente todos los orígenes permitidos para el rango 192.168.1.0/24.
- **Multi-tenant**: El sistema soporta múltiples municipios. El `municipio_id` se guarda en localStorage al seleccionar.
