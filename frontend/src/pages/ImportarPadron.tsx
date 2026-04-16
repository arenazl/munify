import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Landmark, Link2, Sparkles, CheckCircle2, AlertCircle, Loader2,
  ArrowRight, ArrowLeft, Info, RefreshCcw, Copy, HelpCircle,
  ExternalLink, FileJson, Wand2, Database
} from 'lucide-react';
import { tasasApi, API_BASE_URL } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { StickyPageHeader } from '../components/ui/StickyPageHeader';

type TasaDetectada = {
  codigo_local: string;
  nombre_local: string;
  descripcion_local?: string;
  frecuencia?: string;
  partidas_count: number;
  deudas_count: number;
  match_sugerido: string | null;
  match_sugerido_nombre: string | null;
  confianza: number;
  alternativas: { tipo_tasa_codigo: string; tipo_tasa_nombre: string; score: number }[];
  sample_partida?: unknown;
};

type TipoCatalogo = {
  codigo: string;
  nombre: string;
  icono: string;
  color: string;
};

type Preview = {
  municipio_origen?: string;
  sistema_origen?: string;
  exported_at?: string;
  tasas_detectadas: TasaDetectada[];
  catalogo_munify: TipoCatalogo[];
  totales: {
    tipos_tasa: number;
    partidas: number;
    deudas: number;
    matcheados_auto: number;
    sin_match: number;
  };
};

type Resultado = {
  ok: boolean;
  partidas_creadas: number;
  partidas_actualizadas: number;
  deudas_creadas: number;
  tasas_saltadas: number;
  errores: string[];
};

/** Tooltip chiquito que aparece al hover/click en un icono Info. */
function Hint({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-sky-600 hover:text-sky-700 active:scale-95 transition-all"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      {open && (
        <span className="absolute z-30 left-1/2 -translate-x-1/2 top-6 w-72 p-3
                         bg-slate-900 text-white text-xs rounded-lg shadow-xl
                         animate-in fade-in slide-in-from-top-1 duration-150">
          {children}
        </span>
      )}
    </span>
  );
}

function ConfianzaBadge({ score }: { score: number }) {
  if (score >= 70) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                       bg-emerald-100 text-emerald-700 text-xs font-semibold">
        <CheckCircle2 className="w-3 h-3" /> Alta ({score})
      </span>
    );
  }
  if (score >= 30) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                       bg-amber-100 text-amber-700 text-xs font-semibold">
        <Sparkles className="w-3 h-3" /> Media ({score})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                     bg-rose-100 text-rose-700 text-xs font-semibold">
      <AlertCircle className="w-3 h-3" /> Baja ({score})
    </span>
  );
}

export default function ImportarPadron() {
  const navigate = useNavigate();
  const { municipioActual } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Paso 1: URL
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paso 2: Preview + mappings editables
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mappings, setMappings] = useState<Record<string, string | null>>({});

  // Paso 3: Resultado
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // URL de ejemplo (mock endpoint). Usa el codigo del muni activo.
  const urlEjemplo = useMemo(() => {
    const codigo = municipioActual?.codigo || 'chacabuco';
    return `${API_BASE_URL}/api/mock/padron-ejemplo/${codigo}`;
  }, [municipioActual]);

  const usarEjemplo = () => {
    setUrl(urlEjemplo);
    setError(null);
  };

  const copiarEjemplo = () => {
    navigator.clipboard.writeText(urlEjemplo);
  };

  const cargarPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tasasApi.importarPadronPreview(url.trim());
      const data = res.data as Preview;
      setPreview(data);
      const initial: Record<string, string | null> = {};
      data.tasas_detectadas.forEach(t => {
        initial[t.codigo_local] = t.match_sugerido;
      });
      setMappings(initial);
      setStep(2);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || 'No pudimos procesar esa URL. Revisá que sea accesible y devuelva un JSON válido.');
    } finally {
      setLoading(false);
    }
  };

  const confirmar = async () => {
    setLoading(true);
    setError(null);
    try {
      const mappingsList = Object.entries(mappings).map(([codigo_local, tipo_tasa_codigo]) => ({
        codigo_local,
        tipo_tasa_codigo,
      }));
      const res = await tasasApi.importarPadronConfirmar(url.trim(), mappingsList);
      setResultado(res.data);
      setStep(3);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err.response?.data?.detail || 'Falló la importación.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1);
    setUrl('');
    setPreview(null);
    setMappings({});
    setResultado(null);
    setError(null);
  };

  const mappingsAplicados = useMemo(
    () => Object.values(mappings).filter(v => !!v).length,
    [mappings]
  );
  const mappingsSaltados = useMemo(
    () => Object.values(mappings).filter(v => !v).length,
    [mappings]
  );

  return (
    <div className="space-y-6 pb-20">
      <StickyPageHeader
        icon={<Landmark className="h-5 w-5" />}
        title="Importar catálogo de tasas"
        backLink="/gestion/ajustes"
      />

      {/* Stepper */}
      <div className="flex items-center justify-center gap-2 max-w-2xl mx-auto">
        {[
          { n: 1, label: 'URL del padrón' },
          { n: 2, label: 'Revisar mapeo' },
          { n: 3, label: 'Resultado' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className={`flex-1 flex flex-col items-center gap-1`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold
                            transition-all duration-200
                            ${step >= s.n
                              ? 'bg-sky-600 text-white shadow-lg'
                              : 'bg-slate-200 text-slate-500'}`}>
                {step > s.n ? <CheckCircle2 className="w-5 h-5" /> : s.n}
              </div>
              <span className={`text-xs font-medium ${step >= s.n ? 'text-sky-700' : 'text-slate-400'}`}>
                {s.label}
              </span>
            </div>
            {i < 2 && (
              <div className={`h-0.5 flex-1 -mt-5 mx-1 transition-all ${step > s.n ? 'bg-sky-600' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      <div className="max-w-4xl mx-auto space-y-5">

        {/* ========================================================= */}
        {/* PASO 1 — URL                                               */}
        {/* ========================================================= */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Card: que es esto */}
            <div className="bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-sky-600 text-white
                                flex items-center justify-center">
                  <Wand2 className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-2">
                  <h3 className="font-semibold text-slate-900">¿Qué hace esta pantalla?</h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Munify consume el padrón tributario del municipio desde una URL pública
                    (o autenticada) que exponga el sistema tributario (GEMA, RAFAM, Municipium,
                    desarrollo propio, etc). Traemos las <strong>tasas</strong>, las <strong>partidas</strong> del
                    padrón y las <strong>deudas</strong> emitidas, y las dejamos listas para que los
                    vecinos las vean y paguen.
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Como cada muni usa nombres propios ("TSUM", "Derecho de Inspección", etc),
                    Munify intenta <strong>mapear automáticamente</strong> cada tasa local a su
                    equivalente en nuestro catálogo canónico (ABL, Seguridad e Higiene, Patente,
                    etc). En el paso 2 vas a poder revisar y corregir cada match.
                  </p>
                </div>
              </div>
            </div>

            {/* Card: ingreso de URL */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-sky-600" />
                <h3 className="font-semibold text-slate-900">URL del padrón</h3>
                <Hint>
                  <div className="space-y-1">
                    <p className="font-semibold">¿Qué tengo que pegar acá?</p>
                    <p>Una URL que devuelva JSON con esta estructura mínima:</p>
                    <code className="block bg-slate-800 px-2 py-1 rounded text-[10px] mt-1">
                      {`{ "tasas": [{ "codigo_local": "...", "nombre_local": "...", "partidas": [...] }] }`}
                    </code>
                    <p className="mt-2">Si tu muni aún no tiene API, usá el ejemplo de abajo para probar el flujo completo.</p>
                  </div>
                </Hint>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                  URL completa (incluye <code className="bg-slate-100 px-1 rounded">http://</code> o <code className="bg-slate-100 px-1 rounded">https://</code>)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://api.municipio.gob.ar/padron/tasas.json"
                    className="flex-1 px-4 py-3 border border-slate-300 rounded-lg
                               focus:ring-2 focus:ring-sky-500 focus:border-sky-500
                               transition-all duration-200 font-mono text-sm"
                  />
                </div>
              </div>

              {/* Ejemplo */}
              <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <FileJson className="w-4 h-4 text-sky-600" />
                  ¿Tu muni todavía no tiene API? Probá con el padrón de ejemplo
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Generamos un padrón dummy con 5 tipos de tasa (Servicios Urbanos, Inspección
                  Comercial, Automotores, Cementerio, Ocupación VP) y 73 partidas reales para
                  que veas el flujo end-to-end.
                </p>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded px-3 py-2">
                  <code className="flex-1 text-xs font-mono text-slate-700 truncate">{urlEjemplo}</code>
                  <button
                    onClick={copiarEjemplo}
                    className="flex-shrink-0 p-1.5 hover:bg-slate-100 rounded transition-all active:scale-95"
                    title="Copiar"
                  >
                    <Copy className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
                <button
                  onClick={usarEjemplo}
                  className="text-xs font-semibold text-sky-700 hover:text-sky-800 hover:underline
                             flex items-center gap-1 transition-colors"
                >
                  <ArrowRight className="w-3 h-3" /> Usar esta URL en el input de arriba
                </button>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700
                                flex items-start gap-2 animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={cargarPreview}
                  disabled={!url.trim() || loading}
                  className="px-5 py-2.5 bg-sky-600 text-white rounded-lg font-semibold
                             hover:bg-sky-700 active:scale-95 transition-all duration-200
                             disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center gap-2 shadow-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Analizar y mapear
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Card: esquema esperado */}
            <details className="bg-white border border-slate-200 rounded-xl">
              <summary className="cursor-pointer px-5 py-3 font-medium text-slate-700 flex items-center gap-2
                                   hover:bg-slate-50 rounded-xl transition-colors">
                <Info className="w-4 h-4 text-slate-500" />
                Ver formato JSON esperado (para devs del muni)
              </summary>
              <pre className="px-5 pb-4 text-xs font-mono text-slate-600 overflow-auto">
{`{
  "municipio": "chacabuco",
  "sistema_origen": "Sistema Tributario v2.4",
  "exported_at": "2026-04-16",
  "version_schema": "1.0",
  "tasas": [
    {
      "codigo_local": "TSUM-01",
      "nombre_local": "Tasa por Servicios Urbanos Municipales",
      "descripcion_local": "ABL: alumbrado, barrido, limpieza",
      "frecuencia": "bimestral",
      "partidas": [
        {
          "identificador": "ABL-123456/1",
          "titular_dni": "25123456",
          "titular_nombre": "Juan Pérez",
          "objeto": {
            "direccion": "Av. San Martín 1234",
            "superficie_m2": 120,
            "zona": "B"
          },
          "deudas": [
            {
              "periodo": "2026-04",
              "importe": 15000.00,
              "fecha_emision": "2026-04-01",
              "fecha_vencimiento": "2026-04-20",
              "estado": "pendiente"
            }
          ]
        }
      ]
    }
  ]
}`}
              </pre>
            </details>
          </div>
        )}

        {/* ========================================================= */}
        {/* PASO 2 — Preview + Mappings                                */}
        {/* ========================================================= */}
        {step === 2 && preview && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Resumen agregado */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-xs text-slate-500">Tipos de tasa</div>
                <div className="text-2xl font-bold text-slate-900">{preview.totales.tipos_tasa}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-xs text-slate-500">Partidas</div>
                <div className="text-2xl font-bold text-slate-900">{preview.totales.partidas}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-xs text-slate-500">Deudas</div>
                <div className="text-2xl font-bold text-slate-900">{preview.totales.deudas}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="text-xs text-emerald-700">Auto-matcheadas</div>
                <div className="text-2xl font-bold text-emerald-800">
                  {preview.totales.matcheados_auto}<span className="text-sm font-normal">/{preview.totales.tipos_tasa}</span>
                </div>
              </div>
            </div>

            {/* Origen detectado */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700
                            flex items-center gap-2 flex-wrap">
              <Database className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span><strong>Origen:</strong> {preview.sistema_origen || '—'}</span>
              <span className="text-slate-300">•</span>
              <span><strong>Muni:</strong> {preview.municipio_origen || '—'}</span>
              <span className="text-slate-300">•</span>
              <span><strong>Exportado:</strong> {preview.exported_at || '—'}</span>
            </div>

            {/* Hint: cómo revisar */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900 space-y-1">
                <p><strong>Revisá cada fila</strong> y ajustá el mapeo si hace falta.</p>
                <p className="text-xs leading-relaxed">
                  Los matches con <strong>confianza Alta</strong> (verde) suelen ser correctos.
                  Los de <strong>confianza Media</strong> (ámbar) conviene revisarlos.
                  Los de <strong>confianza Baja</strong> (rojo) requieren que elijas manualmente a qué tipo corresponden — o podés saltarlos si no aplican.
                </p>
              </div>
            </div>

            {/* Tabla de mappings */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {preview.tasas_detectadas.map(tasa => (
                  <div key={tasa.codigo_local} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      {/* Lado izquierdo: lo que vino del padrón */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-700">
                            {tasa.codigo_local}
                          </code>
                          <ConfianzaBadge score={tasa.confianza} />
                        </div>
                        <h4 className="font-semibold text-slate-900">{tasa.nombre_local}</h4>
                        {tasa.descripcion_local && (
                          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                            {tasa.descripcion_local}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-slate-600 pt-1">
                          <span><strong>{tasa.partidas_count}</strong> partidas</span>
                          <span className="text-slate-300">•</span>
                          <span><strong>{tasa.deudas_count}</strong> deudas</span>
                          {tasa.frecuencia && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span>Frecuencia: {tasa.frecuencia}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Flecha */}
                      <ArrowRight className="w-5 h-5 text-slate-400 flex-shrink-0 mt-6 hidden md:block" />

                      {/* Lado derecho: selector de mapping */}
                      <div className="w-full md:w-80 flex-shrink-0 space-y-1">
                        <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                          Mapear a catálogo Munify
                          <Hint>
                            Elegí el tipo de tasa canónico al que corresponde este ítem del padrón.
                            Si no corresponde a ningún tipo estándar, seleccioná "Saltar — no importar"
                            y esta tasa no se importará.
                          </Hint>
                        </label>
                        <select
                          value={mappings[tasa.codigo_local] || ''}
                          onChange={e => setMappings({
                            ...mappings,
                            [tasa.codigo_local]: e.target.value || null,
                          })}
                          className={`w-full px-3 py-2 border rounded-lg text-sm
                                     focus:ring-2 focus:ring-sky-500 focus:border-sky-500
                                     transition-all
                                     ${mappings[tasa.codigo_local]
                                       ? 'border-emerald-300 bg-emerald-50/30'
                                       : 'border-rose-300 bg-rose-50/30'}`}
                        >
                          <option value="">— Saltar, no importar —</option>
                          {preview.catalogo_munify.map(t => (
                            <option key={t.codigo} value={t.codigo}>
                              {t.nombre}
                            </option>
                          ))}
                        </select>
                        {tasa.alternativas.length > 1 && (
                          <div className="text-[10px] text-slate-400">
                            Otras sugerencias: {tasa.alternativas.slice(1).map(a => a.tipo_tasa_nombre).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700
                              flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Barra de acciones sticky abajo */}
            <div className="sticky bottom-4 bg-white border border-slate-200 rounded-xl shadow-lg p-4
                            flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-slate-600 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <strong className="text-emerald-700">{mappingsAplicados}</strong> se importarán
                </span>
                {mappingsSaltados > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="text-slate-300">•</span>
                    <strong className="text-slate-500">{mappingsSaltados}</strong> saltadas
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setStep(1); setPreview(null); }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium
                             hover:bg-slate-50 active:scale-95 transition-all
                             flex items-center gap-1.5 text-sm"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver
                </button>
                <button
                  onClick={confirmar}
                  disabled={loading || mappingsAplicados === 0}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-semibold
                             hover:bg-emerald-700 active:scale-95 transition-all
                             disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center gap-2 shadow-sm text-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Importar {mappingsAplicados} {mappingsAplicados === 1 ? 'tasa' : 'tasas'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* PASO 3 — Resultado                                         */}
        {/* ========================================================= */}
        {step === 3 && resultado && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-300
                            rounded-xl p-8 text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">¡Padrón importado!</h3>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Los datos ya están disponibles para los vecinos del municipio en su sección "Mis Tasas".
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-emerald-600">{resultado.partidas_creadas}</div>
                <div className="text-xs text-slate-500 mt-1">Partidas nuevas</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-sky-600">{resultado.partidas_actualizadas}</div>
                <div className="text-xs text-slate-500 mt-1">Partidas actualizadas</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-indigo-600">{resultado.deudas_creadas}</div>
                <div className="text-xs text-slate-500 mt-1">Deudas nuevas</div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-slate-400">{resultado.tasas_saltadas}</div>
                <div className="text-xs text-slate-500 mt-1">Tasas saltadas</div>
              </div>
            </div>

            {resultado.errores.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> Con advertencias
                </h4>
                <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                  {resultado.errores.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={reset}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium
                           hover:bg-slate-50 active:scale-95 transition-all
                           flex items-center gap-1.5 text-sm"
              >
                <RefreshCcw className="w-4 h-4" /> Importar otro padrón
              </button>
              <button
                onClick={() => navigate('/gestion/ajustes')}
                className="px-5 py-2 bg-sky-600 text-white rounded-lg font-semibold
                           hover:bg-sky-700 active:scale-95 transition-all
                           flex items-center gap-2 shadow-sm text-sm"
              >
                <ExternalLink className="w-4 h-4" /> Volver a ajustes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
