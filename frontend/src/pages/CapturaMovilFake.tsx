import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShieldCheck, ScanLine, Camera, Loader2, AlertTriangle, CheckCircle2,
  IdCard, User as UserIcon,
} from 'lucide-react';
import { capturaMovilApi } from '../lib/api';

type Paso = 'cargando' | 'splash' | 'dni_dorso' | 'dni_frente' | 'selfie' | 'confirmar' | 'enviando' | 'ok' | 'cerrada' | 'error';

interface Handoff {
  estado: string;
  vecino_label: string | null;
  expires_at: string;
}

/**
 * Pantalla móvil DEMO (VENTANILLA_SKIP_DIDIT=true). Imita el flujo de
 * captura de Didit: foto del DNI dorso → frente → selfie → confirmar.
 * Cualquier toque sirve — no se usa cámara real. Al confirmar se llama a
 * /handoff/{token}/fake-completar y el backend genera datos filiatorios
 * random + emite el WS al operador. La PC se completa sola.
 *
 * Pensada para iterar y testear el flujo completo sin gastar verifs de
 * Didit. Banner amarillo "MODO DEMO" siempre visible.
 */
export default function CapturaMovilFake() {
  const { token } = useParams<{ token: string }>();
  const [paso, setPaso] = useState<Paso>('cargando');
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPaso('error');
      setError('Link inválido');
      return;
    }
    capturaMovilApi
      .handoffPublico(token)
      .then((r) => {
        const e = r.data.estado;
        if (e === 'completada' || e === 'rechazada' || e === 'cancelada' || e === 'expirada') {
          setHandoff(r.data);
          setPaso('cerrada');
          return;
        }
        setHandoff(r.data);
        setPaso('splash');
        // Marca como en_curso (best-effort)
        capturaMovilApi.handoffAbrir(token).catch(() => {});
      })
      .catch((e: unknown) => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setPaso('error');
        setError(msg || 'No se pudo abrir la sesión');
      });
  }, [token]);

  const confirmar = async () => {
    if (!token) return;
    setPaso('enviando');
    try {
      await capturaMovilApi.handoffFakeCompletar(token);
      setPaso('ok');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPaso('error');
      setError(msg || 'No se pudo completar');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Banner DEMO siempre visible */}
      <div className="flex-shrink-0 px-4 py-2 bg-amber-100 border-b border-amber-300 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0" />
        <p className="text-[11px] font-semibold text-amber-900">
          MODO DEMO · datos generados al azar al confirmar
        </p>
      </div>

      {/* Header */}
      <header className="flex-shrink-0 px-5 py-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 leading-tight">Validación de identidad</p>
            <p className="text-[11px] text-slate-500 leading-tight">Munify · Captura móvil</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-6">
        <div className="w-full max-w-md">
          {paso === 'cargando' && (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-600">Abriendo sesión…</p>
            </div>
          )}

          {paso === 'splash' && handoff && (
            <Card>
              <Icono color="blue"><Camera className="w-8 h-8 text-blue-500" /></Icono>
              <h1 className="text-lg font-bold text-slate-900 mb-1">Vas a verificar al vecino</h1>
              {handoff.vecino_label && (
                <p className="text-sm font-semibold text-slate-700 mb-3">{handoff.vecino_label}</p>
              )}
              <p className="text-sm text-slate-600 mb-5">
                Vamos a sacar foto al DNI (frente y dorso) y una selfie del vecino. Tocá
                "Comenzar" para arrancar.
              </p>
              <Boton onClick={() => setPaso('dni_dorso')}>Comenzar</Boton>
            </Card>
          )}

          {paso === 'dni_dorso' && (
            <PasoCaptura
              titulo="Foto del DNI — dorso"
              subtitulo="Apuntá al código de barras del dorso"
              icono={<ScanLine className="w-8 h-8 text-violet-500" />}
              colorIcono="violet"
              onSiguiente={() => setPaso('dni_frente')}
              labelBoton="Sacar foto"
            />
          )}

          {paso === 'dni_frente' && (
            <PasoCaptura
              titulo="Foto del DNI — frente"
              subtitulo="Que se vea la cara del vecino"
              icono={<IdCard className="w-8 h-8 text-violet-500" />}
              colorIcono="violet"
              onSiguiente={() => setPaso('selfie')}
              labelBoton="Sacar foto"
            />
          )}

          {paso === 'selfie' && (
            <PasoCaptura
              titulo="Selfie del vecino"
              subtitulo="Que mire de frente, sin lentes"
              icono={<UserIcon className="w-8 h-8 text-pink-500" />}
              colorIcono="pink"
              onSiguiente={() => setPaso('confirmar')}
              labelBoton="Sacar selfie"
            />
          )}

          {paso === 'confirmar' && (
            <Card>
              <Icono color="green"><ShieldCheck className="w-8 h-8 text-green-500" /></Icono>
              <h1 className="text-lg font-bold text-slate-900 mb-1">Listo para enviar</h1>
              <p className="text-sm text-slate-600 mb-5">
                Capturas tomadas. Al confirmar, RENAPER valida la identidad y la PC del
                operador recibe los datos.
              </p>
              <div className="space-y-2 mb-4">
                <PreviewItem label="DNI dorso" />
                <PreviewItem label="DNI frente" />
                <PreviewItem label="Selfie" />
              </div>
              <Boton onClick={confirmar}>Confirmar envío</Boton>
            </Card>
          )}

          {paso === 'enviando' && (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-600">Validando con RENAPER…</p>
            </div>
          )}

          {paso === 'ok' && (
            <Card>
              <Icono color="green"><CheckCircle2 className="w-9 h-9 text-green-500" /></Icono>
              <h1 className="text-lg font-bold text-green-600 mb-1">Identidad verificada</h1>
              <p className="text-sm text-slate-600">
                La PC del operador ya recibió los datos. Podés cerrar esta pantalla y
                volver a la PC para continuar.
              </p>
            </Card>
          )}

          {paso === 'cerrada' && (
            <Card>
              <Icono color="green"><CheckCircle2 className="w-8 h-8 text-green-500" /></Icono>
              <h1 className="text-lg font-bold text-slate-900 mb-1">Sesión cerrada</h1>
              <p className="text-sm text-slate-600">
                Esta verificación ya terminó. Volvé a la PC para continuar el trámite.
              </p>
            </Card>
          )}

          {paso === 'error' && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 text-center">
              <Icono color="red"><AlertTriangle className="w-8 h-8 text-red-500" /></Icono>
              <h1 className="text-lg font-bold text-slate-900 mb-1">No se pudo abrir</h1>
              <p className="text-sm text-slate-600">{error || 'Error desconocido'}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ============================================================
// Sub-componentes (sin abstracciones de más, solo lo que se reusa 3+ veces)
// ============================================================

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
      {children}
    </div>
  );
}

const COLORES_ICONO = {
  blue: 'bg-blue-50',
  green: 'bg-green-50',
  red: 'bg-red-50',
  violet: 'bg-violet-50',
  pink: 'bg-pink-50',
} as const;

function Icono({ color, children }: { color: keyof typeof COLORES_ICONO; children: React.ReactNode }) {
  return (
    <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${COLORES_ICONO[color]}`}>
      {children}
    </div>
  );
}

function Boton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3.5 rounded-xl bg-blue-500 text-white font-semibold text-sm transition-all hover:bg-blue-600 active:scale-95"
    >
      {children}
    </button>
  );
}

function PasoCaptura({ titulo, subtitulo, icono, colorIcono, onSiguiente, labelBoton }: {
  titulo: string;
  subtitulo: string;
  icono: React.ReactNode;
  colorIcono: keyof typeof COLORES_ICONO;
  onSiguiente: () => void;
  labelBoton: string;
}) {
  const [capturando, setCapturando] = useState(false);
  const [capturada, setCapturada] = useState(false);

  const sacar = () => {
    setCapturando(true);
    // Animación simulada de captura — 700ms y listo
    setTimeout(() => {
      setCapturando(false);
      setCapturada(true);
      // 500ms para que el usuario vea el "✓" y avanzo
      setTimeout(onSiguiente, 500);
    }, 700);
  };

  return (
    <Card>
      <Icono color={colorIcono}>{icono}</Icono>
      <h1 className="text-lg font-bold text-slate-900 mb-1">{titulo}</h1>
      <p className="text-sm text-slate-600 mb-5">{subtitulo}</p>

      {/* Mock de viewport de cámara */}
      <div
        className="aspect-[4/3] rounded-2xl mb-4 flex items-center justify-center"
        style={{
          background: capturada
            ? 'linear-gradient(135deg, #16a34a40, #16a34a10)'
            : 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: capturada ? '2px solid #16a34a' : '2px solid #334155',
        }}
      >
        {capturando ? (
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        ) : capturada ? (
          <CheckCircle2 className="w-12 h-12 text-green-400" />
        ) : (
          <Camera className="w-12 h-12 text-slate-400" />
        )}
      </div>

      <Boton onClick={capturando || capturada ? () => {} : sacar}>
        {capturando ? 'Capturando…' : capturada ? '✓ Listo' : labelBoton}
      </Boton>
    </Card>
  );
}

function PreviewItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
      <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
      <span className="text-sm text-slate-700">{label}</span>
      <span className="ml-auto text-[10px] uppercase tracking-wider font-semibold text-green-600">
        Capturado
      </span>
    </div>
  );
}
