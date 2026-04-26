import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldCheck, ScanLine, Camera, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { capturaMovilApi } from '../lib/api';

type Estado = 'cargando' | 'lista' | 'redirigiendo' | 'cerrada' | 'expirada' | 'error';

interface Handoff {
  estado: 'esperando' | 'en_curso' | 'completada' | 'rechazada' | 'cancelada' | 'expirada';
  vecino_label: string | null;
  didit_url: string | null;
  expires_at: string;
}

/**
 * Página móvil del handoff PC ↔ celular.
 * El operador escanea un QR con su celular, llega acá, ve un splash con
 * el contexto del trámite, aprieta "Comenzar verificación" y se redirige
 * a Didit para selfie + DNI + RENAPER. La PC del operador recibe el
 * resultado por WebSocket cuando Didit termina.
 */
export default function CapturaMovil() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setEstado('error');
      setError('Link inválido');
      return;
    }
    let cancelado = false;
    capturaMovilApi
      .handoffPublico(token)
      .then((r) => {
        if (cancelado) return;
        setHandoff(r.data);
        const e = r.data.estado;
        if (e === 'completada' || e === 'rechazada' || e === 'cancelada') {
          setEstado('cerrada');
        } else if (e === 'expirada') {
          setEstado('expirada');
        } else if (!r.data.didit_url) {
          setEstado('error');
          setError('La sesión no tiene URL de verificación');
        } else {
          setEstado('lista');
        }
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setEstado('error');
        setError(msg || 'No se pudo abrir la sesión');
      });
    return () => {
      cancelado = true;
    };
  }, [token]);

  const comenzar = async () => {
    if (!token || !handoff?.didit_url) return;
    setEstado('redirigiendo');
    try {
      // Marca la sesión como en_curso (best-effort, no bloqueamos si falla)
      await capturaMovilApi.handoffAbrir(token).catch(() => {});
    } finally {
      window.location.href = handoff.didit_url;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header sobrio */}
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

      {/* Contenido */}
      <main className="flex-1 flex items-center justify-center px-5 py-8">
        <div className="w-full max-w-md">
          {estado === 'cargando' && (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-600">Abriendo sesión…</p>
            </div>
          )}

          {estado === 'lista' && handoff && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                <Camera className="w-8 h-8 text-blue-500" />
              </div>
              <h1 className="text-lg font-bold text-slate-900 mb-1">Vas a verificar al vecino</h1>
              {handoff.vecino_label && (
                <p className="text-sm font-semibold text-slate-700 mb-3">{handoff.vecino_label}</p>
              )}
              <p className="text-sm text-slate-600 mb-6">
                En el siguiente paso vas a sacar foto al DNI (frente y dorso) y una selfie del
                vecino. RENAPER valida la identidad automáticamente.
              </p>

              <div className="flex items-center justify-center gap-3 text-[11px] text-slate-500 mb-6">
                <span className="inline-flex items-center gap-1">
                  <ScanLine className="w-3.5 h-3.5" /> DNI
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5" /> Selfie
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> RENAPER
                </span>
              </div>

              <button
                onClick={comenzar}
                className="w-full py-3.5 rounded-xl bg-blue-500 text-white font-semibold text-sm transition-all hover:bg-blue-600 active:scale-95"
              >
                Comenzar verificación
              </button>
              <p className="text-[11px] text-slate-400 mt-3">
                La PC del operador recibe el resultado automáticamente.
              </p>
            </div>
          )}

          {estado === 'redirigiendo' && (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-600">Abriendo Didit…</p>
            </div>
          )}

          {estado === 'cerrada' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-lg font-bold text-slate-900 mb-1">Sesión cerrada</h1>
              <p className="text-sm text-slate-600">
                Esta verificación ya terminó. Volvé a la PC para continuar el trámite.
              </p>
            </div>
          )}

          {estado === 'expirada' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </div>
              <h1 className="text-lg font-bold text-slate-900 mb-1">Sesión expirada</h1>
              <p className="text-sm text-slate-600">
                El link tenía una validez corta. Pedile al operador que genere uno nuevo.
              </p>
            </div>
          )}

          {estado === 'error' && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h1 className="text-lg font-bold text-slate-900 mb-1">No se pudo abrir</h1>
              <p className="text-sm text-slate-600">{error || 'Error desconocido'}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
