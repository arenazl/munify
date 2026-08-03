import type { ReactNode } from 'react'
import { Palette, Check } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

/**
 * AppearanceSettings — panel canónico de "Apariencia" (Tema v2, opt-in).
 *
 * PORTADO desde `d:\Code\APP_GUIDE\components\ui\AppearanceSettings.tsx`. Si se
 * lo mejora acá y el cambio es estable (no lógica de Munify), hay que llevarlo
 * de vuelta a la librería en versión agnóstica.
 *
 * Secciones configurables 100% por props, sin nada específico de un dominio:
 * (1) presets de fondo como cards con mini-preview clickeable, (2) acentos
 * transversales como círculos, (3) OPCIONAL, fondo de la barra lateral (mismas
 * cards que los presets). El componente NO decide la paleta ni persiste nada —
 * recibe las opciones y los valores activos y emite callbacks. La app cablea
 * esto a su ThemeContext.
 *
 * Uso:
 *   <AppearanceSettings
 *     bgPresets={THEME_META} accents={ACCENT_META}
 *     activeBg={themeKey} activeAccent={accentKey}
 *     onBgChange={setThemeKey} onAccentChange={setAccentKey}
 *   />
 */
export interface BgPresetMeta {
  key: string
  label: string
  /** Color de fondo principal (para el swatch del preview). */
  swatch: string
  /** Color de la "sidebar/card" del mini-mock. */
  chip: string
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

/** Grilla de cards con mini-preview. La comparten los presets de fondo y las
 *  opciones de barra lateral: es la misma pieza, con distinta lista. */
function PresetCards({
  items,
  activeKey,
  onChange,
  accentColor,
}: {
  items: BgPresetMeta[]
  activeKey: string
  onChange: (key: string) => void
  accentColor: string
}) {
  const { theme } = useTheme()
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {items.map((t) => {
        const active = activeKey === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className="rounded-xl p-2.5 text-left transition-all"
            style={{
              border: active ? `2px solid ${accentColor}` : `1px solid ${theme.border}`,
              background: theme.card,
              boxShadow: active ? `0 0 0 3px ${accentColor}22` : 'none',
            }}
          >
            <div className="rounded-lg overflow-hidden mb-2.5" style={{ border: `1px solid ${theme.border}`, background: t.swatch, height: 74, display: 'flex' }}>
              <div style={{ width: '30%', background: t.chip }} />
              <div className="flex-1 p-1.5 flex flex-col gap-1">
                <div style={{ height: 6, borderRadius: 3, background: accentColor, width: '60%' }} />
                <div style={{ height: 5, borderRadius: 3, background: t.chip, width: '85%' }} />
                <div style={{ height: 5, borderRadius: 3, background: t.chip, width: '70%' }} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: theme.text }}>{t.label}</span>
              {active ? <Check className="w-4 h-4" style={{ color: accentColor }} /> : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function AppearanceSettings({
  bgPresets,
  accents,
  activeBg,
  activeAccent,
  onBgChange,
  onAccentChange,
  bgTitle = 'Tema de fondo',
  bgDescription = 'Elegí la base del panel. El color de acento se aplica sobre cualquier tema.',
  accentTitle = 'Color de acento',
  accentDescription = 'Transversal a todos los temas. Pinta botones, activos y detalles.',
  sidebarOptions,
  activeSidebar,
  onSidebarChange,
  sidebarTitle = 'Fondo de la barra lateral',
  sidebarDescription = 'Se arma en armonía con el color de acento activo.',
  footnote,
}: AppearanceSettingsProps) {
  const { theme } = useTheme()
  const accentColor = accents.find((a) => a.key === activeAccent)?.color ?? theme.primary
  const mostrarSidebar = !!(sidebarOptions?.length && onSidebarChange)

  const tituloSeccion = (texto: string, descripcion: string) => (
    <>
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${theme.primary}18`, color: theme.primary }}>
          <Palette className="w-4 h-4" />
        </span>
        <b className="text-[15px]" style={{ color: theme.text }}>{texto}</b>
      </div>
      <p className="text-[12.5px] mb-4" style={{ color: theme.textSecondary }}>{descripcion}</p>
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Presets de fondo */}
      <section className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        {tituloSeccion(bgTitle, bgDescription)}
        <PresetCards items={bgPresets} activeKey={activeBg} onChange={onBgChange} accentColor={accentColor} />
      </section>

      {/* Acentos transversales */}
      <section className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
        {tituloSeccion(accentTitle, accentDescription)}
        <div className="flex gap-3.5 flex-wrap">
          {accents.map((a) => {
            const active = activeAccent === a.key
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => onAccentChange(a.key)}
                title={a.label}
                aria-label={a.label}
                className="rounded-full flex items-center justify-center transition-all"
                style={{
                  width: 44,
                  height: 44,
                  background: a.color,
                  boxShadow: active ? `0 0 0 3px ${theme.card}, 0 0 0 5px ${a.color}` : 'none',
                  transform: active ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {active ? <Check className="w-5 h-5" style={{ color: a.ink ?? '#ffffff' }} /> : null}
              </button>
            )
          })}
        </div>
      </section>

      {/* Fondo de la barra lateral (opcional) */}
      {mostrarSidebar ? (
        <section className="rounded-xl p-4" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          {tituloSeccion(sidebarTitle, sidebarDescription)}
          <PresetCards
            items={sidebarOptions!}
            activeKey={activeSidebar ?? ''}
            onChange={onSidebarChange!}
            accentColor={accentColor}
          />
        </section>
      ) : null}

      {footnote ? (
        <p className="text-[12.5px] -mt-2" style={{ color: theme.textSecondary }}>{footnote}</p>
      ) : null}
    </div>
  )
}
