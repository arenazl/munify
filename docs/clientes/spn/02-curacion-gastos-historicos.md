# Curación de gastos históricos 2024/2025 — San Pedro Norte

**Estado al 2026-07-02** · Contexto: Bartolo preguntó "¿dónde están mis gastos
2024/2025?" — están TODOS en el sistema, pero una parte quedó sin tipificar
fino desde la importación de sus Excels.

## Qué hay (verificado contra la BD prod)

- **7.130 gastos históricos** (1.274 de 2024 + 5.856 de 2025), todos enlazados
  a su contacto/proveedor. **Ninguno tiene caja ni movimiento** — los históricos
  NO afectan saldos de cajas (verificado por query; solo los de 2026 tocan caja).
- La importación marcó con `[BARTOLO-DUDOSO] orig_concept=X` en `observaciones`
  a los que la IA de la fase 2 no pudo clasificar mejor que un genérico
  ("Compras varias", "Otros gastos", etc.). Eran **1.110**.

## Qué se hizo (2 pasadas automáticas, 2026-07-02)

Script: `backend/scripts/_curar_dudosos_spn.py` (dry-run por default,
`--aplicar` para ejecutar; deja backup JSON con concepto/observaciones previos
en `backend/scripts/_backup_curacion_spn_*.json`, no versionado).

Solo toca `concepto` + `observaciones` (el tag pasa a `[BARTOLO-AUTO {motivo}]`
— trazable). Jamás montos, fechas, cajas ni movimientos.

**332 de 1.110 curados** con reglas de evidencia:
1. **Herencia** del concepto dominante del mismo contacto en sus gastos ya
   clasificados (v1: >=3 gastos y >=70%; v2 relajada: >=2 y >=60%).
2. Contacto **concejal** → `Legislativo` (dieta/gastos del Concejo): 88.
3. Empleado tipo **Prensa** → `Prensa`: 44 (Cabezón Varela, Mizzau, etc.).
4. Empleado **recurrente** (>=6 pagos) → `Pago de sueldos y jornales`.
5. **Profesional** → `Pago de honorarios profesionales`; **beneficiario**
   recurrente → `Aporte a subsidios y ayudas sociales`.
6. **Rubro/keyword**: medios/gráfica → Publicidad; ferretería/corralón →
   Materiales de obra; combustible; carpa/sonido → Eventos; desmalezamiento/
   máquina → Obra pública; electricidad → Reparación de edificios.

Los conceptos destino se validan contra el **catálogo activo** de SPN
(matching sin tildes → nombre canónico).

## Qué falta (para retomar en cualquier momento)

- **778 dudosos restantes**: la descripción es solo un nombre de persona con
  1-2 pagos sueltos y sin historial clasificado — cualquier regla ya sería
  inventar. Caminos:
  1. **Pantalla de curación** (`/gestion/tesoreria/curacion-bartolo`): revisión
     manual, ideal en una llamada con Bartolo.
  2. **Pistas de Bartolo** ("Esperanza es el almacén", "Vanesa Suárez es
     corralón"): se agregan como reglas KW al script y se barre otro lote en
     minutos. Los grupos grandes pendientes: Esperanza (44), Basani (31),
     Elpidio Sosa (26), Rosa Estanciero (24), Vero Gómez (20), Martín Orozco
     (17), Marcelo Luna (13), Vanesa Suárez (16), Impacto Color ya curado.
- **Inconsistencias de tipo de contacto** (aparte de esto): ver
  [reporte-inconsistencias-contactos.md](reporte-inconsistencias-contactos.md)
  — 7 posibles proveedores marcados como empleados y 9 al revés, para validar
  con el cliente.
- Comunicación pendiente al cliente por el fix de caja:
  [01-nota-fix-caja-coparticipacion.md](01-nota-fix-caja-coparticipacion.md).

## Cómo retomar

```
cd backend
python scripts/_curar_dudosos_spn.py            # dry-run: muestra el plan
python scripts/_curar_dudosos_spn.py --aplicar  # backup + update
```
Para sumar reglas nuevas: editar la lista `KW` o las reglas por tipo de
contacto en ese script. Verificación rápida del estado:
`python scripts/_dimension_curacion_spn.py`.
