// /reels/videos — galería pública de los reels FINALES (con voz + música + b-roll).
// Lee public/reels-videos/manifest.json. Voy subiendo los mp4 a esa carpeta y
// agregando una entrada al manifest. Pensada para ver desde el celu/escritorio remoto.
import { useEffect, useState } from 'react';

interface ReelVideo { id: string; title: string; reel?: string; file: string; note?: string }

export default function ReelsVideos() {
  const [videos, setVideos] = useState<ReelVideo[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/reels-videos/manifest.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setVideos(d.videos || []))
      .catch(() => setErr('No se pudo cargar la lista de videos.'));
  }, []);

  return (
    <div className="min-h-screen bg-[#0E1830] text-white px-5 py-8">
      <header className="max-w-6xl mx-auto mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold italic tracking-tight">
          Reels <span className="text-[#C8A24E]">— versiones finales</span>
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Hook real → slides del producto → cierre, con voz y música. {videos.length} {videos.length === 1 ? 'video' : 'videos'}.
        </p>
      </header>

      {err && <p className="max-w-6xl mx-auto text-red-400 text-sm">{err}</p>}
      {!err && !videos.length && <p className="max-w-6xl mx-auto text-white/40 text-sm">Todavía no hay videos subidos.</p>}

      <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {videos.map((v) => (
          <div key={v.id} className="rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10">
            <video
              src={`/reels-videos/${v.file}`}
              controls
              playsInline
              preload="metadata"
              className="w-full aspect-[9/16] object-cover bg-black block"
            />
            <div className="px-3 py-2.5">
              <div className="text-[13px] font-bold truncate">{v.title}</div>
              {v.note && <div className="text-[11px] text-white/40 mt-0.5">{v.note}</div>}
              <a
                href={`/reels-videos/${v.file}`}
                download
                className="inline-block mt-2 text-[11px] font-semibold text-[#C8A24E] hover:underline"
              >
                Descargar mp4 ↓
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
