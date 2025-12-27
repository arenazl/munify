# Transformar Tramites.tsx igual que Reclamos.tsx

## Objetivo
La página de Trámites (`frontend/src/pages/Tramites.tsx`) debe verse y funcionar exactamente igual que la página de Reclamos (`frontend/src/pages/Reclamos.tsx`).

## Estado Actual
- La página tiene ABMPage + WizardModal
- Las cards NO tienen el mismo estilo visual que Reclamos
- El wizard tiene IA pero puede no estar funcionando correctamente
- Falta el listado visible detrás del wizard (el wizard debe ser un modal, no pantalla completa)

## Lo que se pide

### 1. Estructura General (copiar de Reclamos.tsx)
```
<>
  <ABMPage>
    {/* Cards del listado - siempre visibles */}
    {tramites.map(tramite => (
      <div className="card-style-igual-que-reclamos">...</div>
    ))}
  </ABMPage>

  {/* Sheet para ver detalle */}
  <Sheet open={...} onClose={...}>
    {/* Detalle del trámite seleccionado */}
  </Sheet>

  {/* WizardModal que se abre ENCIMA del listado */}
  <WizardModal
    open={wizardOpen}
    onClose={closeWizard}
    aiPanel={wizardAIPanel}  {/* Panel de IA a la derecha */}
    ...
  />
</>
```

### 2. Cards del Listado
Las cards deben verse EXACTAMENTE como las de Reclamos (líneas 3044-3180 de Reclamos.tsx):

```tsx
{filteredTramites.map((tramite) => {
  const servicioInfo = getServicioInfo(tramite); // nombre, icono, color del servicio
  const estado = estadoColors[tramite.estado];

  return (
    <div
      key={tramite.id}
      onClick={() => openViewSheet(tramite)}
      className="group relative rounded-2xl cursor-pointer overflow-hidden abm-card-hover transition-all duration-500"
      style={{
        backgroundColor: theme.card,
        border: `1px solid ${theme.border}`,
      }}
    >
      {/* Header con gradiente del color del servicio */}
      <div
        className="flex items-center justify-between -mx-5 -mt-5 mb-4 px-4 py-3 rounded-t-xl"
        style={{
          background: `linear-gradient(135deg, ${servicioInfo.color} 0%, ${servicioInfo.color}80 100%)`,
          borderBottom: `1px solid ${servicioInfo.color}`
        }}
      >
        {/* Icono + Título */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <span className="text-white">{getServicioIcon(servicioInfo.icono)}</span>
          </div>
          <span className="font-semibold text-sm line-clamp-1 text-white">
            {tramite.asunto}
          </span>
        </div>
        {/* Badge estado */}
        <span className="px-3 py-1 text-xs font-semibold rounded-full" style={{ backgroundColor: theme.card, color: estado.text }}>
          {estadoLabels[tramite.estado]}
        </span>
      </div>

      {/* Badge del servicio */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: `${servicioInfo.color}15`, border: `1px solid ${servicioInfo.color}40` }}>
          <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: servicioInfo.color }}>
            <span className="text-white text-xs">{getServicioIcon(servicioInfo.icono)}</span>
          </div>
          <span className="text-xs font-semibold" style={{ color: servicioInfo.color }}>{servicioInfo.nombre}</span>
        </div>
        <span className="text-xs" style={{ color: theme.textSecondary }}>#{tramite.numero_tramite}</span>
      </div>

      {/* Descripción */}
      {tramite.descripcion && (
        <p className="text-sm line-clamp-2" style={{ color: theme.textSecondary }}>{tramite.descripcion}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-4 text-xs" style={{ borderTop: `1px solid ${theme.border}` }}>
        <span className="flex items-center">
          <Clock className="h-3 w-3 mr-1" />
          {new Date(tramite.created_at).toLocaleDateString()}
        </span>
        <Eye className="h-4 w-4" style={{ color: theme.primary }} />
      </div>
    </div>
  );
})}
```

### 3. Wizard con Panel de IA (Step 1: Selección de Servicio)

El paso 1 del wizard debe tener:

**A) Buscador arriba**
```tsx
<div className="relative">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
  <input
    type="text"
    placeholder="Buscar trámite..."
    value={searchTerm}
    onChange={(e) => setSearchTerm(e.target.value)}
    className="w-full pl-10 pr-4 py-3 rounded-xl"
  />
  {/* Dropdown de resultados si hay búsqueda */}
</div>
```

**B) 10 Rubros en grid 5x2**
```tsx
<div className="grid grid-cols-5 gap-2">
  {rubros.map((rubro) => (
    <button
      key={rubro.nombre}
      onClick={() => setSelectedRubro(rubro.nombre)}
      className="p-2 rounded-xl border-2"
      style={{
        backgroundColor: selectedRubro === rubro.nombre ? `${rubro.color}20` : theme.backgroundSecondary,
        borderColor: selectedRubro === rubro.nombre ? rubro.color : theme.border
      }}
    >
      <div className="w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center" style={{ backgroundColor: rubro.color }}>
        {getServicioIcon(rubro.icono)}
      </div>
      <span className="text-[10px] font-medium block text-center">{rubro.nombre}</span>
    </button>
  ))}
</div>
```

**C) Trámites del rubro en scroll horizontal**
```tsx
{selectedRubro && (
  <div className="flex gap-2 overflow-x-auto pb-2">
    {serviciosDelRubro.map((s) => (
      <button
        key={s.id}
        onClick={() => selectServicio(s.id)}
        className="flex-shrink-0 p-2 rounded-lg border-2 w-[90px]"
      >
        <div className="w-7 h-7 rounded-full mx-auto mb-1" style={{ backgroundColor: s.color }}>
          {getServicioIcon(s.icono)}
        </div>
        <span className="text-[9px] font-medium block line-clamp-2">{s.nombre}</span>
        <div className="text-[8px]">{s.tiempo_estimado_dias}d · {s.costo ? `$${s.costo}` : 'Gratis'}</div>
      </button>
    ))}
  </div>
)}
```

### 4. Cómo extraer Rubros de los Servicios

Los servicios tienen en su descripción el formato `[NOMBRE_RUBRO] descripción real`.

```tsx
// Agrupar servicios por rubro
interface Rubro {
  nombre: string;
  icono: string;
  color: string;
  servicios: ServicioTramite[];
}

const rubrosMap: Record<string, Rubro> = {};
servicios.forEach(s => {
  const match = s.descripcion?.match(/^\[([^\]]+)\]/);
  const rubroNombre = match ? match[1] : 'Otros';
  if (!rubrosMap[rubroNombre]) {
    rubrosMap[rubroNombre] = {
      nombre: rubroNombre,
      icono: s.icono || 'FileText',
      color: s.color || '#6b7280',
      servicios: []
    };
  }
  rubrosMap[rubroNombre].servicios.push(s);
});
const rubros: Rubro[] = Object.values(rubrosMap);
```

### 5. Panel de IA en el Wizard

El WizardModal ya acepta `aiPanel` como prop. Debe mostrar:
- Información contextual del servicio seleccionado
- Requisitos y documentos
- Input para preguntar a la IA
- Respuestas de la IA

```tsx
const wizardAIPanel = (
  <div className="h-full flex flex-col">
    <div className="flex items-center gap-2 mb-4">
      <Sparkles className="h-4 w-4" style={{ color: theme.primary }} />
      <span className="font-medium text-sm">Asistente IA</span>
    </div>

    <div className="flex-1 space-y-3 overflow-y-auto">
      {/* Info del servicio seleccionado */}
      {selectedServicio && (
        <>
          <div className="p-3 rounded-lg" style={{ backgroundColor: `${selectedServicio.color}15` }}>
            <span className="font-medium">{selectedServicio.nombre}</span>
          </div>
          {selectedServicio.requisitos && (
            <div className="p-3 rounded-lg text-sm">
              <p className="font-medium">Requisitos:</p>
              <p className="text-xs">{selectedServicio.requisitos}</p>
            </div>
          )}
        </>
      )}

      {/* Respuesta de IA */}
      {aiResponse && (
        <div className="p-3 rounded-lg" style={{ backgroundColor: `${theme.primary}10` }}>
          <p>{aiResponse}</p>
        </div>
      )}
    </div>

    {/* Input para preguntar */}
    <div className="mt-4 p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: theme.card }}>
      <input
        type="text"
        value={aiQuestion}
        onChange={(e) => setAiQuestion(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && askAI()}
        placeholder="Hacé una pregunta..."
        className="flex-1 bg-transparent text-sm focus:outline-none"
      />
      <button onClick={askAI} disabled={!aiQuestion.trim() || aiLoading}>
        {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
      </button>
    </div>
  </div>
);
```

### 6. Función askAI

```tsx
const askAI = async () => {
  if (!aiQuestion.trim()) return;
  setAiLoading(true);
  try {
    const servicio = selectedServicio;
    const prompt = servicio
      ? `El usuario está iniciando el trámite "${servicio.nombre}". Requisitos: ${servicio.requisitos || 'No especificados'}. Documentos: ${servicio.documentos_requeridos || 'No especificados'}. Pregunta: ${aiQuestion}`
      : `Pregunta sobre trámites municipales: ${aiQuestion}`;

    const response = await chatApi.sendMessage(prompt, []);
    setAiResponse(response.response || response.message);
    setAiQuestion('');
  } catch {
    setAiResponse('Lo siento, no pude procesar tu consulta.');
  } finally {
    setAiLoading(false);
  }
};
```

### 7. Los 10 Rubros (según seed_tramites_completos.py)

1. HABILITACIONES Y COMERCIO - icono: Store, color: #3B82F6
2. OBRAS PARTICULARES - icono: HardHat, color: #F59E0B
3. CATASTRO - icono: Map, color: #EC4899
4. TRÁNSITO - icono: Car, color: #8B5CF6
5. TASAS Y RECAUDACIÓN - icono: CreditCard, color: #10B981
6. SERVICIOS PÚBLICOS - icono: Lightbulb, color: #F97316
7. MEDIO AMBIENTE - icono: TreeDeciduous, color: #22C55E
8. SALUD - icono: Heart, color: #EF4444
9. ACCIÓN SOCIAL - icono: Users, color: #6366F1
10. INSTITUCIONAL / ADMINISTRATIVO - icono: FileText, color: #64748B

### 8. API de Trámites

```tsx
// En api.ts - tramitesApi
getAll: (params?) => api.get('/tramites', { params })  // Lista trámites del usuario
getServicios: (params?) => api.get('/tramites/servicios', { params })  // Catálogo de servicios
create: (data) => api.post('/tramites', data)  // Crear trámite
getOne: (id) => api.get(`/tramites/${id}`)  // Detalle
```

### 9. Tipos

```tsx
interface ServicioTramite {
  id: number;
  nombre: string;
  descripcion: string;  // Formato: "[RUBRO] descripción real"
  icono: string;
  color: string;
  requisitos: string;
  documentos_requeridos: string;
  tiempo_estimado_dias: number;
  costo: number;
  activo: boolean;
}

interface Tramite {
  id: number;
  numero_tramite: string;
  servicio_id: number;
  asunto: string;
  descripcion?: string;
  estado: 'nuevo' | 'en_proceso' | 'pendiente_documentacion' | 'aprobado' | 'rechazado' | 'finalizado';
  created_at: string;
  // ... más campos
}
```

### 10. Archivo de Referencia

**COPIAR TODO DE:** `frontend/src/pages/Reclamos.tsx`

Este archivo tiene:
- La estructura correcta de ABMPage + Sheet + WizardModal
- Las cards con el estilo visual correcto (líneas 3044-3180)
- El panel de IA funcionando (wizardAIPanel)
- La lógica de categorías que se puede adaptar a rubros/servicios

### 11. Resumen de Cambios Necesarios

1. **Cards**: Copiar estilo visual de Reclamos (header con gradiente, badges, footer)
2. **Sheet**: Agregar Sheet para ver detalle de trámite (como en Reclamos)
3. **WizardModal**: Ya está, verificar que el aiPanel funcione
4. **Rubros**: Grid 5x2 con los 10 rubros
5. **Servicios**: Scroll horizontal al seleccionar un rubro
6. **Buscador**: Arriba del grid de rubros
7. **IA**: Panel lateral con info contextual y chat

### 12. Errores Conocidos que Tuve

- `tramitesApi.getMisTramites()` no existe -> usar `tramitesApi.getAll()`
- `ABMCard` no tiene props `icon`, `title`, `subtitle` -> construir cards manualmente como en Reclamos
- `ABMPage` no tiene prop `subtitle` -> no usarla
- `ABMPage` usa `searchValue` no `search`
