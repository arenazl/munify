# 10 - PWA: Instalar la App en tu Dispositivo

> **Fecha:** 01/01/2025

---

## QUE ES UNA PWA?

La app de Reclamos Municipales es una **Progressive Web App (PWA)**. Esto significa que:
- Se puede instalar en tu celular o computadora como una app nativa
- Funciona sin necesidad de descargar desde Play Store o App Store
- Recibe notificaciones push
- Se abre en pantalla completa (sin barra del navegador)

---

## INSTALAR EN ANDROID (Chrome)

### Opcion 1: Banner automatico
1. Abre la app en Chrome: **https://reclamos-mun.netlify.app**
2. Espera unos segundos
3. Aparecera un banner en la parte inferior: "Agregar a pantalla de inicio"
4. Toca **Instalar**
5. Listo! La app aparece en tu pantalla de inicio

### Opcion 2: Desde el menu
1. Abre la app en Chrome
2. Toca los **3 puntos** (menu) arriba a la derecha
3. Selecciona **"Instalar app"** o **"Agregar a pantalla de inicio"**
4. Confirma tocando **Instalar**
5. La app aparece en tu launcher

### Opcion 3: Compartir
1. Abre la app en Chrome
2. Toca el icono de **Compartir** (o menu > Compartir)
3. Selecciona **"Agregar a pantalla de inicio"**

---

## INSTALAR EN IPHONE (Safari)

**IMPORTANTE:** En iPhone SOLO funciona desde Safari (no Chrome ni otros navegadores)

1. Abre Safari
2. Ve a **https://reclamos-mun.netlify.app**
3. Toca el icono de **Compartir** (cuadrado con flecha hacia arriba)
4. Desliza hacia abajo y toca **"Agregar a inicio"**
5. Edita el nombre si quieres y toca **Agregar**
6. La app aparece en tu pantalla de inicio

---

## INSTALAR EN COMPUTADORA (Windows/Mac/Linux)

### Chrome
1. Abre la app en Chrome
2. En la barra de direcciones aparece un icono de **instalacion** (monitor con flecha)
3. Click en el icono
4. Click en **Instalar**
5. La app se abre en su propia ventana y aparece en tu menu de aplicaciones

### Edge
1. Abre la app en Edge
2. Click en los **3 puntos** (menu)
3. Selecciona **Aplicaciones > Instalar este sitio como una aplicacion**
4. Click en **Instalar**

### Firefox
Firefox no soporta instalacion de PWAs, pero puedes crear un acceso directo desde el menu.

---

## COMPARTIR LA APP

### Opcion 1: Link directo
Comparte este link:
```
https://reclamos-mun.netlify.app
```

### Opcion 2: QR Code
Genera un QR con el link usando cualquier generador de QR gratuito:
- https://www.qr-code-generator.com/
- https://www.the-qr-code-generator.com/

### Opcion 3: Mensaje predefinido
Copia y comparte este mensaje:

```
Descarga la app de Reclamos del Municipio de Merlo!

1. Abre este link en tu celular:
   https://reclamos-mun.netlify.app

2. Android: Toca "Instalar app" cuando aparezca
   iPhone: Toca Compartir > Agregar a inicio

3. Listo! Ya podes hacer reclamos y seguir su estado
```

---

## NOTIFICACIONES PUSH

Para recibir notificaciones cuando cambie el estado de tus reclamos:

### Primera vez
1. Abre la app (instalada o en navegador)
2. Inicia sesion con tu usuario
3. El navegador preguntara "Permitir notificaciones?"
4. Toca **Permitir**
5. Listo! Recibiras alertas de tus reclamos

### Si bloqueaste las notificaciones

**Android (Chrome):**
1. Abre Chrome
2. Ve a la app
3. Toca el candado en la barra de direcciones
4. Toca **Configuracion del sitio**
5. En **Notificaciones**, selecciona **Permitir**

**iPhone (Safari):**
1. Ve a **Ajustes > Safari > Sitios web**
2. Busca la app
3. Activa **Notificaciones**

**Computadora:**
1. Click en el candado en la barra de direcciones
2. En **Notificaciones**, selecciona **Permitir**

---

## SOLUCIONAR PROBLEMAS

### No aparece el banner de instalar
- Asegurate de estar usando Chrome (Android) o Safari (iPhone)
- La app debe cargarse por HTTPS
- Espera unos segundos navegando la app

### La app no se actualiza
- Cierra la app completamente
- Abrila de nuevo
- Si sigue sin actualizar, desinstala y vuelve a instalar

### No llegan las notificaciones
1. Verifica que permitiste notificaciones
2. Cierra sesion y vuelve a entrar
3. Cuando pregunte por notificaciones, toca Permitir

### La app se ve mal o no carga
- Limpia la cache del navegador
- O desinstala la app y volvela a instalar

---

## PARA ADMINISTRADORES: Promocionar la PWA

### En redes sociales
```
Nueva app del Municipio de Merlo!
Hace tus reclamos de forma facil y rapida.

Instala la app: https://reclamos-mun.netlify.app

- Sin descargar de Play Store
- Notificaciones de tus reclamos
- Seguimiento en tiempo real
```

### Carteleria fisica
Incluir:
- QR code con el link
- Instrucciones simples: "Escanea el QR y toca Instalar"
- Logo del municipio

### Capacitacion a empleados
Los empleados municipales pueden compartir el link directamente con vecinos que se acerquen a hacer reclamos presenciales.

---

## URLS IMPORTANTES

| Que | URL |
|-----|-----|
| App de Reclamos | https://reclamos-mun.netlify.app |
| Landing (selector de municipio) | https://reclamos-mun.netlify.app/bienvenido |
| Login directo | https://reclamos-mun.netlify.app/login |
| Registrarse | https://reclamos-mun.netlify.app/register |

---

**Ultima actualizacion:** 01/01/2025
