/**
 * abmv2/SideModal.tsx — drawer derecho del estándar `SemanticAbmPage` (§5).
 *
 * Toda fila abre su registro acá: NUNCA en modal centrado ni en página aparte.
 * Fuente de verdad: design/handoff-v2/STANDARD-SemanticAbmPage.md §5 y
 * STANDARD-Variaciones-por-props.md ("Qué cambia en SideModal").
 *
 * Geometría: panel de 480 (simples / alta / edición), 520 (dinero) o 560
 * (con proceso) sobre backdrop `--pl-scrim` (viewport completo, overflow
 * hidden: el cuerpo scrollea, header/stepper/footer quedan fijos). Entra con
 * slide-in 240ms `--pl-ease`; cierra con Esc, la × o click en el backdrop.
 * "Cerrar" JAMÁS es un botón.
 *
 * mode='detail'  → header (#id · fecha · canal + título display 20 + metadatos
 *                  + importe display 26 `tnum` si es dinero) + StatusStepper
 *                  fijo + cuerpo con secciones por hairline + DepartmentTrail +
 *                  CandidateList + footer con nota obligatoria y primario que
 *                  NOMBRA el resultado ("Marcar como pagado").
 * mode='create'|'edit' → sin stepper/timeline; labels arriba con asterisco
 *                  ámbar, grid de 2 columnas para campos cortos
 *                  (`.av2-form-grid` + <SideModalField>), revelado progresivo
 *                  por categoría (secciones con `revealed: false` quedan
 *                  ocultas hasta que la página las revele), ayudas bajo el
 *                  campo, footer con contador de obligatorios (`footer.info`)
 *                  + Cancelar ghost + Guardar primario.
 *
 * Orden canónico del cuerpo (detail): descripción/adjuntos → contraparte →
 * DepartmentTrail → asignación (CandidateList) → documentos → prioridad →
 * historial. Las props planas `trail`/`candidates` se renderizan como
 * secciones propias DESPUÉS de `sections`; si la página necesita el
 * intercalado exacto, embebe los componentes exportados <DepartmentTrail /> /
 * <CandidateList /> dentro del `content` de sus secciones y omite las props.
 *
 * Polimórfico: cero colores fijos — clases `av2-sm-*` en styles/abmv2.css
 * sobre tokens `--pl-*`. Inline SOLO valores runtime (ancho de barras del
 * stepper/score, columnas del grid del stepper).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  Action,
  CandidateSpec,
  SectionSpec,
  SideModalProps,
  StepperStep,
  TrailStep,
} from './types';
import '../../styles/abmv2.css';

/* ============================================================
 * Tipos locales (extensiones de implementación, no del contrato)
 * ============================================================ */

/** SectionSpec + revelado progresivo (create/edit): `revealed: false` ⇒ la
 *  sección todavía no se muestra (p. ej. hasta elegir la categoría). Omitido
 *  o `true` ⇒ visible. En mode='detail' se ignora. */
export type SideModalSectionSpec = SectionSpec & { revealed?: boolean };

/** Props del componente: el contrato del estándar (types.ts) con las
 *  secciones ampliadas al revelado progresivo. Estructuralmente compatible:
 *  cualquier `SideModalProps` válido entra sin adaptadores. */
export interface SideModalComponentProps extends Omit<SideModalProps, 'sections'> {
  sections: SideModalSectionSpec[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const clampPct = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/* ============================================================
 * AccionBtn — botón/Link según Action.to (interno)
 * ============================================================ */

function AccionBtn({ accion, className }: { accion: Action; className: string }) {
  const Icono = accion.icon;
  const contenido = (
    <>
      {Icono && <Icono size={15} strokeWidth={1.8} />}
      {accion.label}
    </>
  );
  if (accion.to && !accion.disabled) {
    return (
      <Link className={className} to={accion.to} onClick={accion.onClick}>
        {contenido}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={accion.onClick}
      disabled={accion.disabled}
      title={accion.disabled ? accion.disabledReason : undefined}
    >
      {contenido}
    </button>
  );
}

/* ============================================================
 * StatusStepper — estados reales del registro (solo detail)
 * Grid de N columnas: barra 4px + label + timestamp.
 * Completos verde · actual ámbar con barra parcial + MOTIVO del
 * bloqueo · futuros --pl-track.
 * ============================================================ */

export function StatusStepper({ steps }: { steps: StepperStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div
      className="av2-sm-stepper"
      role="list"
      aria-label="Estados del registro"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((paso) => (
        <div key={paso.id} role="listitem" className={`av2-sm-paso av2-sm-paso--${paso.status}`}>
          <div className="av2-sm-paso-barra">
            {paso.status === 'current' && (
              <span
                className="av2-sm-paso-avance"
                style={{ width: `${Math.round(clamp01(paso.progress ?? 0.5) * 100)}%` }}
              />
            )}
          </div>
          <span className="av2-sm-paso-label" title={paso.label}>
            {paso.label}
          </span>
          {paso.timestamp && <span className="av2-sm-paso-fecha av2-tnum">{paso.timestamp}</span>}
          {paso.status === 'current' && paso.blockedReason && (
            <span className="av2-sm-paso-motivo">{paso.blockedReason}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
 * DepartmentTrail — timeline de áreas que tocaron el registro
 * (o circuito de autorización en dinero). El responsable ACTUAL
 * lleva punto verde con halo y la acción contextual ("Derivar").
 * ============================================================ */

export function DepartmentTrail({ steps }: { steps: TrailStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="av2-sm-trail">
      {steps.map((hito) => (
        <li
          key={hito.id}
          className={hito.current ? 'av2-sm-hito av2-sm-hito--actual' : 'av2-sm-hito'}
        >
          <span className="av2-sm-hito-punto" aria-hidden="true" />
          <div className="av2-sm-hito-linea1">
            <span className="av2-sm-hito-area">{hito.area}</span>
            {hito.current && <span className="av2-sm-hito-ahora">Responsable actual</span>}
            {hito.action && <AccionBtn accion={hito.action} className="av2-sm-hito-accion" />}
          </div>
          {(hito.who || hito.when) && (
            <div className="av2-sm-hito-meta">
              {hito.who}
              {hito.who && hito.when ? ' · ' : ''}
              {hito.when}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ============================================================
 * CandidateList — asignación con RADIOS REALES + match como
 * número + barra fina + una línea de razones. Solo el sugerido
 * lleva superficie verde.
 * ============================================================ */

export function CandidateList({ candidates }: { candidates: CandidateSpec[] }) {
  const grupo = useId();
  if (candidates.length === 0) return null;
  return (
    <div className="av2-sm-candidatos" role="radiogroup" aria-label="Candidatos para asignar">
      {candidates.map((cand) => (
        <label
          key={cand.id}
          className={cand.sugerido ? 'av2-sm-cand av2-sm-cand--sugerido' : 'av2-sm-cand'}
        >
          <input
            type="radio"
            name={grupo}
            className="av2-sm-cand-radio"
            checked={!!cand.seleccionado}
            onChange={() => cand.onSelect?.()}
          />
          <span className="av2-sm-cand-cuerpo">
            <span className="av2-sm-cand-linea1">
              <span className="av2-sm-cand-nombre">{cand.nombre}</span>
              {cand.sugerido && <span className="av2-sm-cand-tag">Sugerido</span>}
              <span className="av2-sm-cand-score av2-tnum">{clampPct(cand.match)}%</span>
            </span>
            <span className="av2-sm-cand-barra" aria-hidden="true">
              <span style={{ width: `${clampPct(cand.match)}%` }} />
            </span>
            {cand.razones && <span className="av2-sm-cand-razones">{cand.razones}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ============================================================
 * SideModalField — campo de formulario para create/edit:
 * label arriba + asterisco ámbar si es obligatorio + ayuda bajo
 * el campo. Va dentro de `.av2-form-grid` (2 columnas; `full`
 * para los campos largos que ocupan las dos).
 * ============================================================ */

export interface SideModalFieldProps {
  label: string;
  /** Obligatorio ⇒ asterisco ámbar junto al label. */
  required?: boolean;
  /** Ayuda corta bajo el control. */
  help?: string;
  /** Ocupa las 2 columnas del grid (textareas, direcciones…). */
  full?: boolean;
  htmlFor?: string;
  children: ReactNode;
}

export function SideModalField({
  label,
  required,
  help,
  full,
  htmlFor,
  children,
}: SideModalFieldProps) {
  return (
    <div className={full ? 'av2-field av2-field--full' : 'av2-field'}>
      <label className="av2-field-label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="av2-field-req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {help && <p className="av2-field-ayuda">{help}</p>}
    </div>
  );
}

/* ============================================================
 * SideModal — el drawer
 * ============================================================ */

export function SideModal(props: SideModalComponentProps) {
  const { mode, width = 480, open, onClose, header, stepper, sections, trail, candidates, footer } =
    props;

  const esDetalle = mode === 'detail';
  const tituloId = useId();
  const panelRef = useRef<HTMLElement>(null);

  // Nota del footer: controlada por la página (value/onChange) o interna.
  const [notaInterna, setNotaInterna] = useState('');
  const notaValor = footer.note?.value ?? notaInterna;

  // Al cerrar se descarta el borrador interno de la nota (patron
  // adjust-state-during-render: sin setState dentro de un effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setNotaInterna('');
  }

  // Esc cierra.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Con el drawer abierto el body no scrollea (el cuerpo del panel sí).
  useEffect(() => {
    if (!open) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [open]);

  // Foco al panel al abrir: Esc funciona sin click previo.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  // Revelado progresivo: solo aplica en create/edit.
  const seccionesVisibles = esDetalle ? sections : sections.filter((s) => s.revealed !== false);

  // Regla del estándar: nunca un botón deshabilitado sin decir qué falta.
  const notaFalta = esDetalle && !!footer.note?.required && notaValor.trim() === '';
  const primarioDeshabilitado = !!footer.primary.disabled || notaFalta;
  const motivoPrimario = footer.primary.disabled
    ? footer.primary.disabledReason
    : notaFalta
      ? 'Falta la nota que justifica el cambio'
      : undefined;

  const IconoDestructivo = footer.destructive?.icon ?? Trash2;
  const IconoPrimario = footer.primary.icon;

  const drawer = (
    <div
      className="av2-sm-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={`av2-sm-panel av2-sm-panel--w${width}`}
      >
        {/* ---- Header fijo: #id · meta · título · metadatos · importe ---- */}
        <header className="av2-sm-header">
          <div className="av2-sm-header-top">
            <div className="av2-sm-meta-top">
              {header.id && <span className="av2-sm-id av2-tnum">{header.id}</span>}
              {header.metaTop}
            </div>
            <button type="button" className="av2-sm-cerrar" aria-label="Cerrar" onClick={onClose}>
              <X size={15} strokeWidth={1.8} />
            </button>
          </div>
          <h2 className="av2-sm-titulo" id={tituloId}>
            {header.title}
          </h2>
          {header.metaBottom && <div className="av2-sm-meta-bottom">{header.metaBottom}</div>}
          {(header.amount || header.statusChip) && (
            <div className="av2-sm-importe-fila">
              {header.amount && <span className="av2-sm-importe">{header.amount}</span>}
              {header.amount && header.amountAside && (
                <span className="av2-sm-importe-aside">{header.amountAside}</span>
              )}
              {header.statusChip && (
                <span
                  className={`av2-chip-estado av2-chip-estado--${header.statusChip.tone} av2-sm-chip`}
                >
                  {header.statusChip.label}
                </span>
              )}
            </div>
          )}
        </header>

        {/* ---- StatusStepper fijo (solo detail con estados) ---- */}
        {esDetalle && stepper && stepper.length > 0 && <StatusStepper steps={stepper} />}

        {/* ---- Cuerpo scrolleable: secciones por hairline ---- */}
        <div className="av2-sm-cuerpo">
          {seccionesVisibles.map((sec) => (
            <section key={sec.id} className="av2-sm-seccion" aria-label={sec.label}>
              <h3 className="av2-eyebrow av2-sm-seccion-label">{sec.label}</h3>
              <div className="av2-sm-seccion-contenido">{sec.content}</div>
            </section>
          ))}
          {esDetalle && trail && trail.length > 0 && (
            <section className="av2-sm-seccion" aria-label="Recorrido por áreas">
              <h3 className="av2-eyebrow av2-sm-seccion-label">Recorrido por áreas</h3>
              <DepartmentTrail steps={trail} />
            </section>
          )}
          {esDetalle && candidates && candidates.length > 0 && (
            <section className="av2-sm-seccion" aria-label="Asignación">
              <h3 className="av2-eyebrow av2-sm-seccion-label">Asignación</h3>
              <CandidateList candidates={candidates} />
            </section>
          )}
        </div>

        {/* ---- Footer fijo ---- */}
        <footer className="av2-sm-footer">
          {esDetalle && footer.note && (
            <textarea
              className="av2-sm-nota"
              rows={2}
              placeholder={footer.note.placeholder}
              value={notaValor}
              aria-required={footer.note.required}
              aria-label={footer.note.placeholder}
              onChange={(e) => {
                const nota = footer.note;
                if (nota?.onChange) nota.onChange(e.target.value);
                else setNotaInterna(e.target.value);
              }}
            />
          )}
          {motivoPrimario && <p className="av2-sm-footer-motivo">{motivoPrimario}</p>}
          <div className="av2-sm-footer-fila">
            {footer.destructive && (
              <button
                type="button"
                className="av2-sm-destructivo"
                aria-label={footer.destructive.label}
                title={footer.destructive.label}
                onClick={footer.destructive.onClick}
                disabled={footer.destructive.disabled}
              >
                <IconoDestructivo size={16} strokeWidth={1.8} />
              </button>
            )}
            {!esDetalle && footer.info && (
              <span className="av2-sm-footer-info av2-tnum">{footer.info}</span>
            )}
            <div className="av2-sm-footer-acciones">
              {footer.secondary?.map((acc) => (
                <AccionBtn
                  key={acc.label}
                  accion={acc}
                  className={esDetalle ? 'av2-btn-secundario' : 'av2-sm-btn-ghost'}
                />
              ))}
              {footer.primary.to && !primarioDeshabilitado ? (
                <Link className="av2-btn-primario" to={footer.primary.to} onClick={footer.primary.onClick}>
                  {IconoPrimario && <IconoPrimario size={15} strokeWidth={1.8} />}
                  {footer.primary.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className="av2-btn-primario"
                  disabled={primarioDeshabilitado}
                  title={primarioDeshabilitado ? motivoPrimario : undefined}
                  onClick={footer.primary.onClick}
                >
                  {IconoPrimario && <IconoPrimario size={15} strokeWidth={1.8} />}
                  {footer.primary.label}
                </button>
              )}
            </div>
          </div>
        </footer>
      </aside>
    </div>
  );

  return createPortal(drawer, document.body);
}

export default SideModal;
