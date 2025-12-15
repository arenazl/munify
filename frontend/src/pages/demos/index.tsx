import { Link } from 'react-router-dom';
import { Sparkles, Box, Minimize2, LayoutGrid, Zap, ArrowLeft } from 'lucide-react';

const demos = [
  {
    id: 'glassmorphism',
    nombre: 'Glassmorphism Dark',
    descripcion: 'Elegante con blur, gradientes y bordes brillantes',
    icon: Sparkles,
    color: 'from-violet-500 to-purple-600',
    bgPreview: 'bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900',
  },
  {
    id: 'neubrutalism',
    nombre: 'Neubrutalism',
    descripcion: 'Bold, bordes gruesos, colores vibrantes',
    icon: Box,
    color: 'from-yellow-400 to-pink-500',
    bgPreview: 'bg-orange-100',
  },
  {
    id: 'minimal',
    nombre: 'Minimal White',
    descripcion: 'Clean, elegante, mucho espacio',
    icon: Minimize2,
    color: 'from-stone-400 to-stone-600',
    bgPreview: 'bg-stone-50',
  },
  {
    id: 'bento',
    nombre: 'Bento Grid',
    descripcion: 'Estilo Apple, grid asimétrico',
    icon: LayoutGrid,
    color: 'from-blue-500 to-cyan-500',
    bgPreview: 'bg-[#f5f5f7]',
  },
  {
    id: 'cyberpunk',
    nombre: 'Neon Cyberpunk',
    descripcion: 'Futurista con glows y efectos neón',
    icon: Zap,
    color: 'from-cyan-400 via-fuchsia-500 to-yellow-400',
    bgPreview: 'bg-black',
  },
];

export default function DemosIndex() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/bienvenido" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <h1 className="text-white font-semibold">Demos de Diseño</h1>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h1 className="text-5xl font-bold text-white mb-4">
          Elige tu{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-pink-400 to-cyan-400">
            estilo
          </span>
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          5 diseños modernos para tu app de delivery. Cada uno con su personalidad única.
          Hacé click para ver el demo interactivo.
        </p>
      </div>

      {/* Grid de demos */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {demos.map((demo) => {
            const Icon = demo.icon;
            return (
              <Link
                key={demo.id}
                to={`/demos/${demo.id}`}
                className="group relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
              >
                {/* Preview background */}
                <div className={`h-40 ${demo.bgPreview} relative overflow-hidden`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${demo.color} opacity-80 group-hover:scale-110 transition-transform duration-500`} />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
                </div>

                {/* Content */}
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${demo.color}`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-white font-semibold text-lg">{demo.nombre}</h3>
                  </div>
                  <p className="text-gray-400 text-sm">{demo.descripcion}</p>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-violet-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Footer tip */}
      <div className="max-w-6xl mx-auto px-6 pb-16 text-center">
        <p className="text-gray-500 text-sm">
          Todos los diseños son 100% responsivos y tienen carrito funcional
        </p>
      </div>
    </div>
  );
}
