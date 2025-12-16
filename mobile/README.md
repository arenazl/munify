# Reclamos Municipal - App Móvil

Aplicación móvil nativa para vecinos desarrollada con React Native y Expo.

## Características

- **Autenticación**: Login y registro de usuarios
- **Mis Reclamos**: Ver listado de reclamos propios con filtros por estado
- **Nuevo Reclamo**: Crear reclamos con:
  - Selección de categoría
  - Ubicación con mapa interactivo
  - Captura de fotos (cámara o galería)
  - Clasificación automática con IA
- **Notificaciones Push**: Alertas en tiempo real sobre cambios en reclamos
- **Perfil**: Configuración de usuario y preferencias
- **Tema oscuro/claro**: Soporte completo para ambos modos

## Requisitos

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app en tu dispositivo (para desarrollo)

## Instalación

```bash
cd mobile
npm install
```

## Desarrollo

```bash
# Iniciar servidor de desarrollo
npm start

# O directamente en una plataforma
npm run android
npm run ios
```

## Configuración

### API URL

Editar `src/services/api.ts` y cambiar la IP local:

```typescript
const API_URL = __DEV__
  ? 'http://TU_IP_LOCAL:8002/api'  // ← Cambiar aquí
  : 'https://tu-api-produccion.com/api';
```

### Push Notifications

1. Crear proyecto en [Expo](https://expo.dev)
2. Actualizar `projectId` en:
   - `app.json` → `expo.extra.eas.projectId`
   - `src/services/notifications.ts`

## Build de Producción

```bash
# Android
npm run build:android

# iOS
npm run build:ios
```

## Estructura del Proyecto

```
mobile/
├── App.tsx                 # Entry point
├── app.json               # Configuración Expo
├── src/
│   ├── components/        # Componentes reutilizables
│   │   ├── Badge.tsx
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── Input.tsx
│   ├── contexts/          # Contextos React
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── navigation/        # Configuración de navegación
│   │   └── index.tsx
│   ├── screens/           # Pantallas
│   │   ├── HomeScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   ├── MisReclamosScreen.tsx
│   │   ├── NotificacionesScreen.tsx
│   │   ├── NuevoReclamoScreen.tsx
│   │   ├── PerfilScreen.tsx
│   │   ├── ReclamoDetalleScreen.tsx
│   │   └── RegisterScreen.tsx
│   ├── services/          # APIs y servicios
│   │   ├── api.ts
│   │   └── notifications.ts
│   ├── theme/             # Estilos y colores
│   │   └── index.ts
│   └── types/             # TypeScript types
│       └── index.ts
└── assets/                # Imágenes y recursos
```

## Pantallas

| Pantalla | Descripción |
|----------|-------------|
| Login | Inicio de sesión |
| Register | Registro de nuevo usuario |
| Home | Dashboard con stats y acciones rápidas |
| MisReclamos | Lista de reclamos del usuario |
| NuevoReclamo | Wizard para crear reclamo |
| ReclamoDetalle | Detalle y historial de un reclamo |
| Notificaciones | Lista de alertas |
| Perfil | Datos de usuario y configuración |

## Tecnologías

- **React Native** + **Expo** (SDK 51)
- **TypeScript**
- **React Navigation** (stack + tabs)
- **Expo Location** (geolocalización)
- **Expo Camera** / **Image Picker** (fotos)
- **Expo Notifications** (push notifications)
- **React Native Maps** (mapa interactivo)
- **Axios** (HTTP client)
- **AsyncStorage** (persistencia local)
