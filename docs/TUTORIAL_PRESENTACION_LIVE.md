# Tutorial: "Modo Live" — presentación de datos tipo slides (replicable)

> Cómo está hecho el botón **Live** de Munify (`DashboardLive.tsx`) y cómo otro
> agente lo replica en **otra app con otros datos**. Es un modal fullscreen que
> rota slides de datos solo, con números que se animan y gráficos — pensado para
> mostrar en una pantalla/TV o en una demo. Stack: **React + recharts + lucide +
> portal + requestAnimationFrame**. Cero librería de slides; todo a mano.

---

## 1. El concepto (qué es y por qué impacta)

Una "presentación viva" de los datos del sistema, modo **kiosko**:
- **Pantalla completa, fondo oscuro**, un dato protagonista por slide.
- **Auto-avanza** cada N segundos con una **barra de progreso**; se puede pausar y navegar con flechas/teclado.
- Los **números cuentan de 0 hasta su valor** con easing (efecto "contador").
- **Gráficos animados** (barras, área, dona, radial) y mapa de calor.
- **Reloj en vivo** y branding arriba.

Lo que lo hace "impresionante" no es ninguna tecnología cara: es **fullscreen + un solo mensaje por slide + movimiento (count-up + entrada de charts) + auto-play**. Eso da sensación de "tablero de control en vivo".

---

## 2. Anatomía (5 piezas)

### A. Contenedor: modal fullscreen por portal
```tsx
import { createPortal } from 'react-dom';
// ...
if (!open) return null;
return createPortal(
  <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: '#0b0f1a' }}>
    {/* header + slide actual + footer/controles */}
  </div>,
  document.body
);
```
- `createPortal` a `document.body` para escapar de cualquier `overflow`/stacking del layout.
- `fixed inset-0 z-[9999]` = ocupa todo. Fondo oscuro fijo (no usa el theme claro).

### B. Slides como **array de objetos** (lo más importante)
No hardcodees el orden en el JSX. Definí un array; agregar/quitar un slide es una línea:
```tsx
const slides = [
  { key: 'kpis',    title: 'Resumen general',   icon: <Activity/>, render: () => <KPIsSlide .../> },
  { key: 'mapa',    title: 'Mapa de calor',     icon: <MapPin/>,   render: () => <MapaSlide .../> },
  { key: 'tend',    title: 'Tendencia',         icon: <TrendingUp/>, render: () => <DualSlide .../> },
  // ...
];
// render del actual:
{slides[currentSlide].render()}
```
Cada slide es **autocontenido** y recibe sus datos por prop. El contenedor solo sabe "cuál slide" (`currentSlide`), no qué hay adentro.

### C. Auto-avance + barra de progreso (un solo `setInterval`)
```tsx
const SLIDE_DURATION_MS = 10000;          // 10s por slide
const [currentSlide, setCurrentSlide] = useState(0);
const [progress, setProgress] = useState(0);   // 0..100 para la barra
const [paused, setPaused] = useState(false);

useEffect(() => {
  if (!open || paused) return;
  setProgress(0);
  const tickMs = 50;
  const total = SLIDE_DURATION_MS / tickMs;
  let cur = 0;
  const id = setInterval(() => {
    cur++;
    setProgress((cur / total) * 100);
    if (cur >= total) {                                    // se cumplió el tiempo
      setCurrentSlide(s => (s + 1) % slides.length);       // siguiente (circular)
      cur = 0;
    }
  }, tickMs);
  return () => clearInterval(id);
}, [open, paused, currentSlide, slides.length]);
```
- Un tick cada 50ms mueve la barra; al llegar al total, salta de slide. `% slides.length` = loop infinito.
- Depende de `currentSlide` para **reiniciar el timer** cuando navegás a mano.

### D. Hook `useCountUp` (los números que se animan)
```tsx
function useCountUp(target: number, durationMs = 1500): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);   // ease-out cubic
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}
// uso: const n = useCountUp(stats.total);  ->  <span className="text-7xl font-bold">{n}</span>
```
`requestAnimationFrame` + easing = animación fluida sin librería. Es el detalle que más "vende".

### E. Layouts reutilizables para componer slides
Para no diseñar cada slide de cero, hay 2-3 "marcos":
- `DualSlide` = dos paneles lado a lado (`left`, `right`), cada uno `{title, icon, content}`.
- `QuadSlide` = grilla de N paneles chicos (la "visión 360").
- Slides simples = un chart o un set de KPIs a pantalla completa.
Así un slide nuevo es: elegir layout + meterle un `<BarChart>`/`<KPI>` adentro.

---

## 3. Datos: fetch fresco al abrir
No dependas del estado de la página que lo abre (puede estar recortado/viejo). Al abrir, traé todo de la API en paralelo:
```tsx
useEffect(() => {
  if (!open) return;
  Promise.all([
    api.getStats().then(r => setStats(r.data)).catch(() => {}),
    api.getPorCategoria().then(r => setPorCategoria(r.data || [])).catch(() => {}),
    api.getTendencia(30).then(r => setTendencias(r.data || [])).catch(() => {}),
    // ...los que tu app tenga
  ]);
}, [open]);
```
- `Promise.all` = todo junto, no en cascada. Cada `.catch(()=>{})` aísla fallos (un endpoint caído no rompe la presentación).

---

## 4. Gráficos (recharts) — patrón
```tsx
import { ResponsiveContainer, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, RadialBarChart, RadialBar, XAxis, YAxis, Tooltip } from 'recharts';

<ResponsiveContainer width="100%" height="100%">
  <BarChart data={data}>
    <XAxis dataKey="categoria" /><YAxis /><Tooltip />
    <Bar dataKey="cantidad" radius={[6,6,0,0]} />
  </BarChart>
</ResponsiveContainer>
```
- `ResponsiveContainer` para que ocupe el panel sin medir a mano.
- Para donas/radiales: `PieChart`+`Pie`+`Cell` (un color por slice), `RadialBarChart`+`RadialBar`.

---

## 5. Controles (lo que espera el usuario)
- **Teclado:** `←`/`→` cambian slide, `espacio` pausa, `Esc` cierra (un `useEffect` con `keydown`).
- **Botones:** prev/next, pause/play (`<Pause/>`/`<Play/>`), cerrar (`<X/>`).
- **Indicadores:** la barra de progreso arriba + puntitos por slide (cuál está activo).
- **Reloj en vivo:** `useEffect` con `setInterval(()=>setNow(new Date()),1000)`.

---

## 6. Receta para que OTRO agente lo replique (en otra app, otros datos)

1. **Componente** `PresentacionLive({ open, onClose })` que renderiza por `createPortal` a `document.body`, fullscreen, fondo oscuro.
2. **Hook** `useCountUp` (copialo tal cual).
3. **Array `slides`**: 4-6 entradas `{ key, title, icon, render }`. Cada `render` devuelve un slide autocontenido con TUS datos.
4. **Auto-avance**: el `useEffect` del punto C (no toques la lógica, solo `SLIDE_DURATION_MS`).
5. **Datos**: `Promise.all` de tus endpoints al abrir (punto 3).
6. **Charts**: recharts con `ResponsiveContainer`. Si no tenés números para graficar, un slide puede ser solo KPIs animados con `useCountUp`.
7. **Controles**: teclado + botones + barra de progreso.

**Reglas de diseño para que quede "impresionante" (no opcional):**
- Un **dato protagonista** por slide, tipografía **enorme** (`text-7xl`+) para el número clave.
- **Movimiento siempre**: count-up en los números, entrada animada de los charts, barra de progreso corriendo.
- **Fondo oscuro** y un acento de color por categoría/serie (consistente).
- **Auto-play** desde que abre (modo kiosko); pausa disponible pero no obligatoria.
- Nada de scroll: cada slide entra **completo en la pantalla**.

**Lo que NO necesitás:** ninguna librería de presentaciones/slides, ni GSAP, ni video. Es React + recharts + `requestAnimationFrame`. Todo el "efecto" sale de count-up + auto-rotate + fullscreen.

---

### Referencia (implementación real)
`frontend/src/components/DashboardLive.tsx` (Munify): 6 slides (KPIs, mapa de calor, tendencia+categorías, zonas+estados, visión 360 con 6 paneles, rendimiento), `SLIDE_DURATION_MS=10000`, `useCountUp`, layouts `DualSlide`/`QuadSlide`, datos de `dashboardApi`/`analyticsApi`.
