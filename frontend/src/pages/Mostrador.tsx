import { useEffect, useMemo, useState } from 'react';
import { User as UserIcon, FileText, CheckCircle2, AlertTriangle, Copy, ExternalLink, Clock, Receipt, MessageSquare, Banknote, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { operadorApi, tramitesApi } from '../lib/api';
import { ModernSelect } from '../components/ui/ModernSelect';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';
import type { Tramite } from '../types';

interface MostradorMetricas {
  tramites_hoy: number;
  pagados_hoy: number;
  monto_hoy: string;
  operador_nombre: string;
}

interface InicioResult {
  solicitud_id: number;
  numero_tramite: string;
  user_id: number;
  requiere_pago: boolean;
  checkout_url: string | null;
  codigo_cut_qr: string | null;
  session_id: string | null;
  monto: number | null;
}

/**
 * Mostrador — consola de operador de ventanilla.
 *
 * Flujo simplificado:
 *   1. Operador ingresa DNI + datos del vecino + trámite deseado.
 *   2. Tilda "Confirmo validación presencial" (DJ).
 *   3. Click "Iniciar trámite" → backend crea User (si no existe) con
 *      kyc_modo=assisted, Solicitud canal=ventanilla_asistida, y si el
 *      trámite tiene costo, genera PagoSesion con checkout_url.
 *   4. UI muestra el link de pago + CUT en pantalla grande para que el
 *      vecino (o un familiar) lo escanee / siga desde el celular.
 */
export default function Mostrador() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [metricas, setMetricas] = useState<MostradorMetricas | null>(null);
  const [tramites, setTramites] = useState<Tramite[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [dni, setDni] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [tramiteId, setTramiteId] = useState<number | null>(null);
  const [djFirmada, setDjFirmada] = useState(false);

  // Resultado
  const [result, setResult] = useState<InicioResult | null>(null);
  const [efectivoOpen, setEfectivoOpen] = useState(false);

  const municipioId = user?.municipio_id ?? null;

  // Cargar trámites del muni
  useEffect(() => {
    const load = async () => {
      try {
        const r = await tramitesApi.getAll();
        setTramites((r.data as Tramite[]).filter((t) => t.activo));
      } catch {
        setTramites([]);
      }
    };
    load();
  }, []);

  // Métricas del día
  useEffect(() => {
    const load = async () => {
      try {
        const r = await operadorApi.home();
        setMetricas(r.data);
      } catch {
        setMetricas(null);
      }
    };
    load();
  }, []);

  const tramiteSel = useMemo(
    () => tramites.find((t) => t.id === tramiteId) || null,
    [tramites, tramiteId],
  );

  const resetForm = () => {
    setDni('');
    setNombre('');
    setApellido('');
    setEmail('');
    setTelefono('');
    setTramiteId(null);
    setDjFirmada(false);
    setResult(null);
  };

  const handleIniciar = async () => {
    if (!municipioId) {
      toast.error('No tenés municipio asignado');
      return;
    }
    if (!dni.trim() || !nombre.trim() || !apellido.trim() || !tramiteId) {
      toast.error('Completá DNI, nombre, apellido y trámite');
      return;
    }
    if (!djFirmada) {
      toast.error('Tenés que firmar la DJ de validación presencial');
      return;
    }
    setLoading(true);
    try {
      const r = await operadorApi.iniciarTramite({
        municipio_id: municipioId,
        tramite_id: tramiteId,
        dni: dni.trim(),
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        dj_firmada: true,
      });
      setResult(r.data);
      toast.success(`Trámite ${r.data.numero_tramite} creado`);
      // Actualizar métricas
      try {
        const m = await operadorApi.home();
        setMetricas(m.data);
      } catch {
        /* noop */
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo iniciar el trámite');
    } finally {
      setLoading(false);
    }
  };

  const copyCheckout = () => {
    if (result?.checkout_url) {
      navigator.clipboard.writeText(result.checkout_url);
      toast.success('Link copiado');
    }
  };

  return (
    <div className="space-y-4">
      <StickyPageHeader
        icon={<UserIcon className="h-5 w-5" />}
        title="Mostrador — Ventanilla"
        subtitle="Iniciar trámite presencial para vecino sin app"
      />

      {/* Métricas del día */}
      {metricas && (
        <div className="grid grid-cols-3 gap-3">
          <MetricaCard color="#3b82f6" icon={<FileText className="w-4 h-4" />} label="Trámites hoy" value={metricas.tramites_hoy} />
          <MetricaCard color="#22c55e" icon={<CheckCircle2 className="w-4 h-4" />} label="Pagados" value={metricas.pagados_hoy} />
          <MetricaCard color="#8b5cf6" icon={<Receipt className="w-4 h-4" />} label="Recaudado" value={metricas.monto_hoy} formatMoney />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Formulario */}
        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
            Datos del vecino
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <Input label="DNI *" value={dni} onChange={(v) => setDni(v.replace(/\D/g, '').slice(0, 9))} theme={theme} placeholder="30123456" />
            <Input label="Teléfono" value={telefono} onChange={setTelefono} theme={theme} placeholder="+54 9 11 1234-5678" />
            <Input label="Nombre *" value={nombre} onChange={setNombre} theme={theme} placeholder="María" />
            <Input label="Apellido *" value={apellido} onChange={setApellido} theme={theme} placeholder="González" />
          </div>
          <Input label="Email (opcional)" value={email} onChange={setEmail} theme={theme} placeholder="vecino@ejemplo.com" />

          <h3 className="text-sm font-bold uppercase tracking-wider pt-3" style={{ color: theme.textSecondary, borderTop: `1px solid ${theme.border}` }}>
            Trámite
          </h3>
          <ModernSelect
            value={tramiteId === null ? '' : String(tramiteId)}
            onChange={(v) => setTramiteId(v ? Number(v) : null)}
            options={tramites.map((t) => ({
              value: String(t.id),
              label: t.costo ? `${t.nombre} — $${t.costo.toLocaleString('es-AR')}` : `${t.nombre} — Gratis`,
            }))}
            placeholder="Seleccioná un trámite"
            searchable
          />

          {tramiteSel && (
            <div className="rounded-lg p-2 text-xs" style={{ backgroundColor: theme.backgroundSecondary, color: theme.textSecondary }}>
              <p className="font-semibold" style={{ color: theme.text }}>{tramiteSel.nombre}</p>
              <p className="text-[11px] mt-0.5">{tramiteSel.descripcion || 'Sin descripción'}</p>
              {tramiteSel.requiere_cenat && (
                <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#f59e0b' }}>
                  <AlertTriangle className="w-3 h-3" /> Este trámite requiere comprobante CENAT (se sube aparte)
                </p>
              )}
            </div>
          )}

          {/* DJ */}
          <label
            className="flex items-start gap-2 cursor-pointer p-2 rounded-lg"
            style={{ backgroundColor: djFirmada ? '#22c55e10' : theme.backgroundSecondary, border: `1px solid ${djFirmada ? '#22c55e60' : theme.border}` }}
          >
            <input
              type="checkbox"
              checked={djFirmada}
              onChange={(e) => setDjFirmada(e.target.checked)}
              className="mt-0.5 flex-shrink-0"
            />
            <div className="text-xs" style={{ color: theme.text }}>
              <strong>Declaración Jurada:</strong> Confirmo haber validado la identidad del
              vecino presencialmente verificando su DNI físico.
            </div>
          </label>

          <div className="flex items-center gap-2 pt-2" style={{ borderTop: `1px solid ${theme.border}` }}>
            <button
              onClick={resetForm}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ color: theme.textSecondary }}
            >
              Limpiar
            </button>
            <button
              onClick={handleIniciar}
              disabled={loading || !djFirmada || !dni || !nombre || !apellido || !tramiteId}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
              style={{ backgroundColor: theme.primary }}
            >
              {loading ? <Clock className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {loading ? 'Creando…' : 'Iniciar trámite'}
            </button>
          </div>
        </div>

        {/* Resultado */}
        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.textSecondary }}>
            Resultado
          </h3>

          {!result && (
            <div className="flex items-center justify-center h-48 text-xs" style={{ color: theme.textSecondary }}>
              Completá el formulario y pulsá "Iniciar trámite"
            </div>
          )}

          {result && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" style={{ color: '#22c55e' }} />
                <span className="text-sm font-bold">Trámite creado</span>
              </div>
              <div className="rounded-lg p-3 font-mono text-center" style={{ backgroundColor: theme.backgroundSecondary }}>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: theme.textSecondary }}>
                  N° de trámite
                </p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: theme.primary }}>
                  {result.numero_tramite}
                </p>
              </div>

              {result.requiere_pago && result.checkout_url && (
                <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: `${theme.primary}10`, border: `1px dashed ${theme.primary}60` }}>
                  <p className="text-xs font-semibold" style={{ color: theme.primary }}>
                    Link de pago — ${(result.monto ?? 0).toLocaleString('es-AR')}
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={result.checkout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 truncate text-xs font-mono px-2 py-1.5 rounded"
                      style={{ backgroundColor: theme.card, color: theme.text }}
                    >
                      {result.checkout_url}
                    </a>
                    <button
                      onClick={copyCheckout}
                      className="px-2 py-1.5 rounded text-xs"
                      style={{ backgroundColor: theme.card, color: theme.primary, border: `1px solid ${theme.primary}40` }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={result.checkout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1.5 rounded text-xs"
                      style={{ backgroundColor: theme.primary, color: 'white' }}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                  {telefono && (
                    <button
                      onClick={async () => {
                        try {
                          await operadorApi.reenviarWhatsapp(result.solicitud_id);
                          toast.success('Link enviado por WhatsApp');
                        } catch (e: unknown) {
                          const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                          toast.error(msg || 'No se pudo enviar por WhatsApp');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded"
                      style={{ backgroundColor: '#25d36620', color: '#25d366', border: '1px solid #25d36660' }}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Enviar por WhatsApp a {telefono}
                    </button>
                  )}
                  <p className="text-[11px]" style={{ color: theme.textSecondary }}>
                    {telefono
                      ? 'Si el vecino no tiene WhatsApp, puede escanear el link desde el monitor.'
                      : 'Sin teléfono — mostrá el link en el monitor para que el vecino lo escanee.'}
                  </p>
                </div>
              )}

              {result.requiere_pago && (
                <button
                  onClick={() => setEfectivoOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-[1.01] active:scale-95"
                  style={{ backgroundColor: '#f59e0b20', color: '#d97706', border: '1px solid #f59e0b60' }}
                >
                  <Banknote className="w-4 h-4" />
                  El vecino paga en efectivo (caja del muni)
                </button>
              )}

              <button
                onClick={resetForm}
                className="w-full px-3 py-2 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
              >
                Cargar otro trámite
              </button>
            </div>
          )}
        </div>
      </div>

      {result && result.requiere_pago && (
        <EfectivoModal
          open={efectivoOpen}
          onClose={() => setEfectivoOpen(false)}
          solicitudId={result.solicitud_id}
          montoSugerido={result.monto ?? 0}
          onConfirmed={() => {
            setEfectivoOpen(false);
            toast.success('Pago en efectivo registrado');
            operadorApi.home().then((m) => setMetricas(m.data)).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

function EfectivoModal({
  open,
  onClose,
  solicitudId,
  montoSugerido,
  onConfirmed,
}: {
  open: boolean;
  onClose: () => void;
  solicitudId: number;
  montoSugerido: number;
  onConfirmed: () => void;
}) {
  const { theme } = useTheme();
  const [monto, setMonto] = useState(String(montoSugerido || ''));
  const [numComp, setNumComp] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMonto(String(montoSugerido || ''));
      setNumComp('');
      setFoto(null);
    }
  }, [open, montoSugerido]);

  if (!open) return null;

  const handleSubmit = async () => {
    const m = parseFloat(monto);
    if (!Number.isFinite(m) || m <= 0) {
      toast.error('Monto inválido');
      return;
    }
    if (!numComp.trim()) {
      toast.error('N° de comprobante obligatorio');
      return;
    }
    setSubmitting(true);
    try {
      await operadorApi.registrarPagoEfectivo(solicitudId, m, numComp.trim(), foto);
      onConfirmed();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || 'No se pudo registrar el pago');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-xl p-5 w-full max-w-md space-y-3" style={{ backgroundColor: theme.card }}>
        <div className="flex items-center gap-2">
          <Banknote className="w-5 h-5" style={{ color: '#d97706' }} />
          <h3 className="text-base font-bold">Registrar pago en efectivo</h3>
        </div>
        <p className="text-xs" style={{ color: theme.textSecondary }}>
          Pegá el N° de comprobante de la caja del muni y subí la foto del ticket.
        </p>

        <div>
          <label className="block text-[11px] font-semibold mb-1">Monto cobrado</label>
          <input
            type="number"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-1">N° comprobante caja *</label>
          <input
            type="text"
            value={numComp}
            onChange={(e) => setNumComp(e.target.value)}
            placeholder="Ej: 00001234"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
            style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold mb-1">Foto del ticket</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFoto(e.target.files?.[0] || null)}
            className="w-full text-xs"
          />
          {foto && (
            <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#22c55e' }}>
              <Upload className="w-3 h-3" /> {foto.name}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={submitting} className="px-3 py-2 rounded-lg text-sm" style={{ color: theme.textSecondary }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: '#d97706' }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {submitting ? 'Registrando…' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, theme, placeholder }: { label: string; value: string; onChange: (v: string) => void; theme: ReturnType<typeof useTheme>['theme']; placeholder?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold mb-1" style={{ color: theme.textSecondary }}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 rounded-lg text-sm outline-none"
        style={{ backgroundColor: theme.backgroundSecondary, color: theme.text, border: `1px solid ${theme.border}` }}
      />
    </div>
  );
}

function MetricaCard({ color, icon, label, value, formatMoney }: { color: string; icon: React.ReactNode; label: string; value: number | string; formatMoney?: boolean }) {
  const { theme } = useTheme();
  const display = formatMoney
    ? `$${Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
    : String(value);
  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: theme.textSecondary }}>{label}</span>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20`, color }}>{icon}</span>
      </div>
      <p className="text-xl font-bold tabular-nums mt-1" style={{ color: theme.text }}>{display}</p>
    </div>
  );
}
