import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

/**
 * AppearanceSettings — panel de "Apariencia" del canvas de Configuración.
 *
 * Copia la sección `esApariencia` de "Configuracion.dc.html" (Claude Design):
 * UNA tarjeta con tres bloques separados por hairlines —tema del panel, color
 * de acento y fondo de la barra lateral—, cada uno con su eyebrow, su bajada y
 * sus muestras. No son tres tarjetas con título e icono, que era la versión
 * anterior de este componente y no se parecía al diseño.
 *
 * Las muestras son mini-maquetas de la app, no cuadrados de color: se ve la
 * barra lateral, una línea en el acento y dos de texto. Así el usuario elige
 * mirando lo que va a pasar, no un swatch abstracto.
 *
 * PORTADO desde `d:\Code\APP_GUIDE\components\ui\AppearanceSettings.tsx`. Si se
 * lo mejora acá y el cambio es estable (no lógica de Munify), hay que llevarlo
 * de vuelta a la librería en versión agnóstica.
 *
 * Los colores de cada muestra son valores RUNTIME (los deriva el consumidor con
 * el mismo motor que pinta la app), por eso van inline: es la única forma de
 * que el preview SEA lo que se va a ver.
 */
export interface BgPresetMeta {
  key: string
  label: string
  /** Fondo del lienzo de la muestra. */
  swatch: string
  /** Barra lateral / superficie secundaria de la muestra. */
  chip: string
  /** Color de las líneas de "texto" de la muestra. Sin él se deriva del chip. */
  line?: string
}

export interface AccentMeta {
  key: string
  label: string
  color: string
  /** Color del tilde sobre el círculo. Default: blanco. Sirve para los acentos
   *  claros (un ámbar o un neutro blanco se comían el tilde blanco). */
  ink?: string
}

interface AppearanceSettingsProps {
  bgPresets: BgPresetMeta[]
  accents: AccentMeta[]
  activeBg: string
  activeAccent: string
  onBgChange: (key: string) => void
  onAccentChange: (key: string) => void
  bgTitle?: string
  bgDescription?: string
  accentTitle?: string
  accentDescription?: string
  /** Tercera sección (opcional): fondo de la barra lateral. Si no se pasan
   *  opciones, no se renderiza — el componente sigue siendo el de dos ejes. */
  sidebarOptions?: BgPresetMeta[]
  activeSidebar?: string
  onSidebarChange?: (key: string) => void
  sidebarTitle?: string
  sidebarDescription?: string
  /** Aclaración al pie del panel (ej. dónde se guarda la preferencia). */
  footnote?: ReactNode
}

/**
 * Muestra de un TEMA: lienzo con la barra lateral a la izquierda y tres
 * líneas, la primera en el acento. Es la miniatura de la app.
 */
function MuestraTema({
  item,
  activa,
  acento,
  onClick,
}: {
  item: BgPresetMeta
  activa: boolean
  acento: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`ap-muestra${activa ? ' ap-muestra--activa' : ''}`}
      onClick={onClick}
      title={item.label}
      aria-pressed={activa}
    >
      <span className="ap-lienzo" style={{ background: item.swatch }}>
        <span className="ap-lienzo-barra" style={{ background: item.chip }} />
        <span className="ap-lienzo-cuerpo">
          <span className="ap-linea ap-linea--acento" style={{ background: acento }} />
          <span className="ap-linea" style={{ background: item.line ?? item.chip }} />
          <span className="ap-linea ap-linea--corta" style={{ background: item.line ?? item.chip }} />
        </span>
      </span>
      <span className="ap-muestra-pie">
        <span className="ap-muestra-nombre">{item.label}</span>
        {activa && <Check className="ap-muestra-check" style={{ color: acento }} />}
      </span>
    </button>
  )
}

/**
 * Muestra de la BARRA LATERAL: el mismo lienzo pero sin la columna, porque acá
 * lo que se compara es cuánto se nota el acento en el fondo de la barra.
 */
function MuestraBarra({
  item,
  activa,
  acento,
  onClick,
}: {
  item: BgPresetMeta
  activa: boolean
  acento: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`ap-muestra${activa ? ' ap-muestra--activa' : ''}`}
      onClick={onClick}
      title={item.label}
      aria-pressed={activa}
    >
      <span className="ap-lienzo ap-lienzo--barra" style={{ background: item.chip }}>
        <span className="ap-linea ap-linea--acento" style={{ background: acento }} />
        <span className="ap-linea" style={{ background: item.line ?? item.swatch }} />
        <span className="ap-linea ap-linea--corta" style={{ background: item.line ?? item.swatch }} />
      </span>
      <span className="ap-muestra-pie">
        <span className="ap-muestra-nombre">{item.label}</span>
        {activa && <Check className="ap-muestra-check" style={{ color: acento }} />}
      </span>
    </button>
  )
}

export function AppearanceSettings({
  bgPresets,
  accents,
  activeBg,
  activeAccent,
  onBgChange,
  onAccentChange,
  bgTitle = 'Tema del panel',
  bgDescription = 'El acento se aplica sobre cualquier tema.',
  accentTitle = 'Color de acento',
  accentDescription = 'Pinta botones, estados activos y detalles en toda la app.',
  sidebarOptions,
  activeSidebar,
  onSidebarChange,
  sidebarTitle = 'Fondo de la barra lateral',
  sidebarDescription = 'Se arma en armonía con el acento activo.',
  footnote,
}: AppearanceSettingsProps) {
  const acentoActivo = accents.find((a) => a.key === activeAccent)
  const acento = acentoActivo?.color ?? 'var(--pl-green)'
  const mostrarSidebar = !!(sidebarOptions?.length && onSidebarChange)

  return (
    <div className="ap-panel">
      {/* --- Tema del panel --- */}
      <span className="av2-eyebrow">{bgTitle}</span>
      <p className="ap-nota">{bgDescription}</p>
      <div className="ap-grilla ap-grilla--temas">
        {bgPresets.map((t) => (
          <MuestraTema
            key={t.key}
            item={t}
            activa={activeBg === t.key}
            acento={acento}
            onClick={() => onBgChange(t.key)}
          />
        ))}
      </div>

      {/* --- Color de acento --- */}
      <span className="ap-hairline" />
      <span className="av2-eyebrow">{accentTitle}</span>
      <p className="ap-nota">{accentDescription}</p>
      <div className="ap-acentos">
        {accents.map((a) => {
          const activa = activeAccent === a.key
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => onAccentChange(a.key)}
              title={a.label}
              aria-label={a.label}
              aria-pressed={activa}
              className={`ap-acento${activa ? ' ap-acento--activo' : ''}`}
              // El color ofrecido ES el dato del acento: va inline por definición.
              style={{ background: a.color, color: a.color }}
            >
              {activa && <Check className="ap-acento-check" style={{ color: a.ink ?? '#ffffff' }} />}
            </button>
          )
        })}
        {acentoActivo && (
          <span className="ap-acento-nombre" style={{ color: acento }}>
            {acentoActivo.label}
          </span>
        )}
      </div>

      {/* --- Fondo de la barra lateral --- */}
      {mostrarSidebar && (
        <>
          <span className="ap-hairline" />
          <span className="av2-eyebrow">{sidebarTitle}</span>
          <p className="ap-nota">{sidebarDescription}</p>
          <div className="ap-grilla ap-grilla--barras">
            {sidebarOptions!.map((s) => (
              <MuestraBarra
                key={s.key}
                item={s}
                activa={activeSidebar === s.key}
                acento={acento}
                onClick={() => onSidebarChange!(s.key)}
              />
            ))}
          </div>
        </>
      )}

      {footnote && <p className="ap-pie">{footnote}</p>}
    </div>
  )
}
