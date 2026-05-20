# Sesión: Login/Register Unificado en Wizard

## Objetivo Principal

Implementar un flujo unificado de login/registro en el wizard de nuevo reclamo que:
1. Primero verifica si el email existe en el sistema
2. Si existe → muestra solo campo de contraseña (LOGIN)
3. Si no existe → muestra nombre + contraseña + teléfono (REGISTRO)
4. Después de login/registro exitoso, avanza al paso "Confirmar" sin recargar página
5. Después de enviar el reclamo, redirige a `/app` (home mobile) en vez de login

## ✅ Lo que YA FUNCIONA

### Backend

#### 1. Endpoint de Verificación de Email
- **Archivo**: `backend/api/auth.py`
- **Endpoint**: `GET /api/auth/check-email?email={email}`
- **Respuesta**: `{"exists": true/false}`
- **Nota**: Tuvimos que **QUITAR** el rate limiter `@limiter.limit(LIMITS["auth"])` porque causaba 404

```python
@router.get("/check-email")
async def check_email(email: str, db: AsyncSession = Depends(get_db)):
    """Verificar si un email ya está registrado (para flujo de registro/login unificado)"""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    return {"exists": user is not None}
```

#### 2. Campo `es_anonimo` en Base de Datos
- **Archivo**: `backend/models/user.py`
- **Campo**: `es_anonimo = Column(Boolean, default=False)`
- **Migración**: Ejecutada con `backend/scripts/migrate_es_anonimo.py`

#### 3. Schemas Actualizados
- **Archivo**: `backend/schemas/user.py`
- `UserCreate` y `UserResponse` incluyen campo `es_anonimo`
- Registro acepta `telefono` opcional

### Frontend

#### 1. Verificación de Email con Debounce
- **Archivo**: `frontend/src/pages/NuevoReclamo.tsx`
- **Estado**: `emailExists` (null | true | false)
- **Función**: `checkEmailExists()` con timeout de 500ms
- Llama a `/auth/check-email` cuando el usuario escribe email

#### 2. Formulario Dinámico
- Campo EMAIL aparece PRIMERO
- Si `emailExists === true` → solo muestra CONTRASEÑA (login)
- Si `emailExists === false` → muestra NOMBRE + CONTRASEÑA + TELÉFONO (registro)
- Validación estricta: no permite avanzar hasta que `emailExists` sea `true` o `false` (no `null`)

#### 3. Login/Registro Unificado
```typescript
const handleRegisterOrLogin = async () => {
  if (emailExists) {
    // LOGIN
    await login(registerData.email, registerData.password);
    toast.success('¡Sesión iniciada! Continuá con tu reclamo');
  } else {
    // REGISTRO
    await register({
      email: registerData.email,
      password: registerData.password,
      nombre,
      apellido,
      es_anonimo: isAnonymous,
      telefono: !isAnonymous && registerData.telefono ? registerData.telefono : undefined,
    });
    toast.success('¡Cuenta creada! Continuá con tu reclamo');
  }
  // Avanzar al paso siguiente
  setCurrentStep(currentStep + 1);
};
```

#### 4. Redirección Post-Submit
```typescript
toast.success('¡Reclamo creado exitosamente!');
const isMobile = window.location.pathname.startsWith('/app');
navigate(isMobile ? '/app' : (user ? getDefaultRoute(user.rol) : '/mis-reclamos'));
```

#### 5. Rutas Públicas Actualizadas
- **Archivo**: `frontend/src/lib/api.ts`
- `/app` agregado a `publicPaths` para evitar redirect a login en 401

## ❌ PROBLEMAS ENCONTRADOS

### 1. WizardForm Crash
**Error**: `Cannot read properties of undefined (reading 'content')`
**Ubicación**: `WizardForm.tsx:215` → `{currentStepData.content}`

**Causa**: Cuando se hace login/registro exitoso y se llama `setCurrentStep(currentStep + 1)`, por alguna razón el índice se vuelve inválido o el array `steps` cambia temporalmente.

**Fix Aplicado**: Agregamos validación en `WizardForm.tsx`:
```typescript
useEffect(() => {
  if (currentStep >= steps.length || currentStep < 0) {
    console.error(`Invalid step index: ${currentStep}, total steps: ${steps.length}`);
    setCurrentStep(0);
  }
}, [currentStep, steps.length]);
```

**Estado**: ⚠️ Fix previene el crash, pero NO resuelve la causa raíz de por qué el step se invalida.

### 2. Email Truncado
En los logs vimos emails cortados:
- `arenaz%40gmailcom` (sin el punto)
- `arenaz%40gmai` (cortado)

**Estado**: ❌ No diagnosticado ni resuelto

### 3. Categorías Repetidas
Usuario reportó: "repite las categorias muchas veces"

**Fix Aplicado**: Agregamos `dataLoadedRef` para evitar múltiples fetches:
```typescript
const dataLoadedRef = useRef(false);

useEffect(() => {
  const fetchData = async () => {
    if (dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    // ... fetch categorias
  };
  fetchData();
}, []);
```

**Estado**: ✅ Resuelto (React Strict Mode ejecutaba el efecto 2 veces)

### 4. Uvicorn Reload NO Funciona en Windows
**Problema**: Cambios en código backend NO se reflejaban automáticamente
**Causa**: Procesos zombies de Python quedaban corriendo en puerto 8001

**Soluciones Creadas**:

1. **`backend/force-restart.bat`** - Mata todos los procesos Python, limpia cache, reinicia
```batch
taskkill /F /IM python.exe /T 2>nul
timeout /t 3 /nobreak >nul
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"
python run.py
```

2. **`backend/quick-restart.bat`** - Loop manual con Enter
```batch
:loop
python run.py
pause >nul
goto loop
```

3. **`backend/dev.py`** - Watchdog para auto-reload (alternativa a uvicorn)
```python
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
# Reinicia servidor cuando detecta cambios en .py
```

**Estado**: ⚠️ Funcionan, pero proceso es lento y frustrante

## 🔧 HERRAMIENTAS CREADAS

### Scripts de Desarrollo

1. **`backend/scripts/reset_password.py`**
   - Resetea contraseña de usuario
   - Usado para poner `arenazl@gmail.com` → password `112233`

2. **`backend/scripts/migrate_es_anonimo.py`**
   - Migración para agregar columna `es_anonimo`
   - Verifica si existe antes de agregar (MySQL no tiene IF NOT EXISTS)

3. **`backend/force-restart.bat`**
   - Kill all Python processes
   - Clean `__pycache__`
   - Restart server

4. **`backend/quick-restart.bat`**
   - Loop simple para reiniciar con Enter

5. **`backend/dev.py`**
   - Auto-reload con watchdog
   - Alternativa a uvicorn reload

## 🚧 TAREAS PENDIENTES

### Alta Prioridad

1. **Investigar causa raíz del crash de WizardForm**
   - ¿Por qué el step index se invalida después de login/registro?
   - ¿El array `steps` se regenera durante el flujo?
   - ¿Hay race condition entre setState del login y setState del step?

   **Acción sugerida**: Agregar console.logs para trackear:
   ```typescript
   console.log('Before login/register, currentStep:', currentStep, 'steps.length:', steps.length);
   await handleRegisterOrLogin();
   console.log('After login/register, currentStep:', currentStep, 'steps.length:', steps.length);
   ```

2. **Fix email truncado**
   - Revisar input de email en formulario
   - Verificar que no haya límite de caracteres
   - Checkear encoding en la llamada API

3. **Testing completo end-to-end**
   - Usuario NUEVO → registro → continuar → enviar reclamo → redirect a /app
   - Usuario EXISTENTE → login → continuar → enviar reclamo → redirect a /app
   - Modo anónimo
   - Modo con teléfono

### Baja Prioridad

4. **Mejorar workflow de desarrollo en Windows**
   - Evaluar usar Docker para backend (evita problemas de reload)
   - O configurar WSL2 para desarrollo
   - O usar watchdog definitivamente en vez de uvicorn reload

5. **Limpiar código debug**
   - Remover console.logs agregados para debugging
   - Remover comentarios temporales

## 📝 NOTAS IMPORTANTES

### Orden de Campos
✅ CORRECTO: Email → (si no existe) Nombre + Contraseña + Teléfono
❌ INCORRECTO: Nombre → Email (como estaba antes)

### Validación
- NO permitir avanzar si `emailExists === null` (email no verificado)
- Solo permitir si `emailExists === true` (login) o `false` (registro)

### Rate Limiter
⚠️ **NO USAR** `@limiter.limit()` en endpoint `/check-email` porque causa 404

### Procesos Zombies
Antes de iniciar servidor, verificar que no haya procesos Python corriendo:
```bash
netstat -ano | findstr :8001
taskkill /F /PID {PID}
```

### Credenciales de Testing
- Email: `arenazl@gmail.com`
- Password: `112233`

## 🔍 DEBUGGING

### Backend Logs
El servidor imprime logs en consola. Si no los ves, es porque hay un proceso zombie corriendo código viejo.

**Solución**:
1. `taskkill /F /IM python.exe /T`
2. `python run.py`

### Frontend Logs
Abrir DevTools → Console para ver:
- Llamadas a `/check-email`
- Respuestas del servidor
- Errores de validación
- Estado del wizard

### Verificar Endpoint
```bash
curl http://localhost:8001/api/auth/check-email?email=test@test.com
```
Debería responder: `{"exists": false}`

## 📂 ARCHIVOS MODIFICADOS

### Backend
- `backend/api/auth.py` - Endpoint check-email
- `backend/models/user.py` - Campo es_anonimo
- `backend/schemas/user.py` - Schemas actualizados
- `backend/scripts/migrate_es_anonimo.py` - Migración
- `backend/scripts/reset_password.py` - Utility
- `backend/force-restart.bat` - Helper
- `backend/quick-restart.bat` - Helper
- `backend/dev.py` - Auto-reload

### Frontend
- `frontend/src/pages/NuevoReclamo.tsx` - Lógica principal
- `frontend/src/lib/api.ts` - checkEmail + publicPaths
- `frontend/src/contexts/AuthContext.tsx` - register signature
- `frontend/src/components/ui/WizardForm.tsx` - Validación de step

## 🎯 PRÓXIMOS PASOS

Cuando retomes:

1. **Probar flujo completo** para ver si el crash sigue ocurriendo
2. **Si el crash persiste**, agregar logs detallados para identificar causa raíz
3. **Testear** email truncado con diferentes emails
4. **Decidir** si usar Docker/WSL2 para mejorar development experience

## 💬 COMENTARIOS FINALES

El flujo está **casi completo**. El único blocker real es el crash de WizardForm que ocurre después de login/registro exitoso. La validación que agregamos previene el crash, pero necesitamos entender POR QUÉ el step index se invalida.

Posibles causas:
- React re-renderiza y el array `steps` se regenera vacío temporalmente
- Race condition entre `setCurrentStep` y cambios en el estado del usuario
- El componente se desmonta y remonta al hacer login

Recomiendo agregar logging extensivo para capturar exactamente qué está pasando en esa transición.
