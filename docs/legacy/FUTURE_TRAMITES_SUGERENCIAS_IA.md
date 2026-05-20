# Future: Sugerencias de trámites con IA (fallback)

**Estado:** Idea para después.
**Contexto:** Ya existe el autocomplete estático con catálogo de ~100 trámites comunes
(`tramites_sugeridos`, sembrado cross-municipios por `scripts/seed_tramites_sugeridos.py`).

## La idea

En el wizard de alta de trámite, cuando el admin escribe un nombre y **el catálogo
estático no devuelve ninguna coincidencia razonable**, mostrar un botón
**"Pedir sugerencia a la IA"** que llama a Gemini/Groq con un prompt tipo:

```
Sos un asistente municipal argentino. Dame una propuesta de trámite
con los siguientes datos en JSON:
- nombre exacto
- descripción corta (1-2 líneas)
- tiempo estimado en días (número)
- documentos requeridos típicos (array de 3-7 strings)

Para: "{texto_del_admin}"
```

La respuesta se parsea y se ofrece como una sugerencia virtual en el dropdown.
Si el admin la elige, precarga el form igual que con una sugerencia del catálogo.

## Cuándo tiene sentido

- Trámites raros/especializados que no están en el catálogo de 100.
- Municipios con necesidades específicas que el catálogo genérico no cubre.
- Como fallback automático cuando `GET /tramites-sugeridos?q=xxx` devuelve `[]`
  o menos de 2 resultados.

## Por qué se pospuso

- El catálogo estático de 96 ya cubre ~90% de los trámites municipales argentinos
  comunes (datos reales del seed viejo).
- Suma dependencia de API externa → costo, latencia, manejo de errores, rate limiting.
- Hay una alternativa más escalable (ver abajo).

## Alternativa más escalable: enriquecimiento automático del catálogo

Cada vez que un admin guarda un trámite nuevo cuyo nombre no matchea ninguna
sugerencia del catálogo, el sistema podría:

1. Insertar automáticamente una entrada en `tramites_sugeridos` con los datos
   que el admin cargó (nombre, descripción, tiempo, costo, documentos).
2. Marcarla como `pending_review=true` (columna nueva a agregar).
3. Un superadmin revisa periódicamente las pendientes y las aprueba
   (`pending_review=false`) o las descarta.

Así el catálogo crece con el uso real y queda curado manualmente, sin IA.

## Cómo implementarlo (si se retoma)

1. **Backend**
   - Nuevo endpoint `POST /api/tramites-sugeridos/ia` que recibe `{ texto: string }`
     y devuelve un `TramiteSugeridoResponse` generado por IA (sin guardarlo en DB).
   - Llamar a `services/chat_service.py` que ya tiene wrappers para Gemini/Groq.
   - Prompt tipado para forzar respuesta en JSON válido.
   - Rate limit aparte (decorator `@limiter.limit(LIMITS["ia"])`).

2. **Frontend**
   - En `TramitesConfig.tsx` paso 1 del wizard: si el debounce del autocomplete
     devolvió vacío y el admin tipeó >= 5 caracteres, mostrar botón
     *"¿No encontrás el trámite? Pedir sugerencia a la IA"*.
   - Click → llama al endpoint → agrega el resultado como un item especial en el
     dropdown con icono de sparkles y label *"Sugerido por IA"*.
   - Al seleccionarlo, prefill del form igual que con sugerencia del catálogo.

3. **UX**
   - Aclarar visualmente que es sugerencia de IA (no del catálogo oficial)
     con badge y color distinto.
   - Opcional: botón *"Guardar esta sugerencia en el catálogo"* para el superadmin,
     que dispara el flujo de enriquecimiento automático.
