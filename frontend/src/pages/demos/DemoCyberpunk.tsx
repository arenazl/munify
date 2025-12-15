import { useState } from 'react';
import { Search, Star, Clock, MapPin, ShoppingCart, Plus, Minus, ArrowLeft, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

const productos = [
  { id: 1, nombre: 'Empanada Caprese', descripcion: 'Tomate, muzzarella, albahaca', precio: 850, imagen: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=200&h=200&fit=crop', categoria: 'criollas' },
  { id: 2, nombre: 'Empanada de Carne', descripcion: 'Carne cortada a cuchillo, huevo, aceituna', precio: 900, imagen: 'https://images.unsplash.com/photo-1619221882220-947b3d3c8861?w=200&h=200&fit=crop', categoria: 'criollas' },
  { id: 3, nombre: 'Empanada de Humita', descripcion: 'Choclo cremoso', precio: 800, imagen: 'https://images.unsplash.com/photo-1604467715878-83e57e8bc129?w=200&h=200&fit=crop', categoria: 'criollas' },
  { id: 4, nombre: 'Empanada de Pollo', descripcion: 'Pollo desmenuzado, salsa blanca', precio: 900, imagen: 'https://images.unsplash.com/photo-1619221881488-64595c77e919?w=200&h=200&fit=crop', categoria: 'criollas' },
  { id: 5, nombre: 'Docena Surtida', descripcion: '12 empanadas a elección', precio: 9500, imagen: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=200&h=200&fit=crop', categoria: 'docenas' },
  { id: 6, nombre: 'Docena de Carne', descripcion: '12 empanadas de carne', precio: 9800, imagen: 'https://images.unsplash.com/photo-1619221882220-947b3d3c8861?w=200&h=200&fit=crop', categoria: 'docenas' },
];

const categorias = [
  { id: 'todos', nombre: 'TODOS', color: 'from-cyan-400 to-cyan-600' },
  { id: 'docenas', nombre: 'DOCENAS', color: 'from-fuchsia-400 to-fuchsia-600' },
  { id: 'criollas', nombre: 'CRIOLLAS', color: 'from-yellow-400 to-orange-500' },
];

export default function DemoCyberpunk() {
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('todos');
  const [carrito, setCarrito] = useState<Record<number, number>>({});

  const productosFiltrados = productos.filter(p => {
    const matchBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    const matchCategoria = categoriaActiva === 'todos' || p.categoria === categoriaActiva;
    return matchBusqueda && matchCategoria;
  });

  const agregarAlCarrito = (id: number) => {
    setCarrito(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const quitarDelCarrito = (id: number) => {
    setCarrito(prev => {
      const nuevo = { ...prev };
      if (nuevo[id] > 1) nuevo[id]--;
      else delete nuevo[id];
      return nuevo;
    });
  };

  const totalItems = Object.values(carrito).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-fuchsia-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-500/10 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Grid overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-5">
        <div className="w-full h-full" style={{
          backgroundImage: 'linear-gradient(cyan 1px, transparent 1px), linear-gradient(90deg, cyan 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* Header */}
      <header className="relative sticky top-0 z-50 backdrop-blur-xl bg-black/50 border-b border-cyan-500/30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/demos" className="p-2 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(6,182,212,0.5)] transition-all">
              <ArrowLeft className="w-5 h-5 text-cyan-400" />
            </Link>
            <span className="font-mono font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-yellow-400">
              EMPANADAS_DEL_OESTE
            </span>
          </div>
          <button className="relative p-3 border border-fuchsia-500/50 rounded-lg hover:bg-fuchsia-500/20 hover:shadow-[0_0_20px_rgba(217,70,239,0.5)] transition-all group">
            <ShoppingCart className="w-5 h-5 text-fuchsia-400" />
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold shadow-[0_0_15px_rgba(217,70,239,0.8)]">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="relative h-80 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&h=400&fit=crop"
          alt="Hero"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="absolute inset-0 mix-blend-overlay opacity-50" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,255,0.1) 2px, rgba(0,255,255,0.1) 4px)'
        }} />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-6 h-6 text-yellow-400 animate-pulse" />
            <span className="text-yellow-400 font-mono text-sm tracking-widest">NOW OPEN</span>
          </div>
          <h1 className="text-5xl font-black tracking-tight mb-2">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-yellow-400 drop-shadow-[0_0_30px_rgba(6,182,212,0.5)]">
              EMPANADAS DEL OESTE
            </span>
          </h1>
          <p className="text-gray-400 font-mono text-sm tracking-wider mb-4">// Las empanadas más ricas de la zona</p>
          <div className="flex flex-wrap gap-4 text-sm font-mono">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <Star className="w-4 h-4 fill-cyan-400" /> 4.7
            </span>
            <span className="flex items-center gap-1.5 text-fuchsia-400">
              <Clock className="w-4 h-4" /> 20-35 min
            </span>
            <span className="flex items-center gap-1.5 text-yellow-400">
              <MapPin className="w-4 h-4" /> Av. San Martín 1234
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="relative sticky top-14 z-40 backdrop-blur-xl bg-black/80 border-b border-fuchsia-500/30 px-4 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-400" />
            <input
              type="text"
              placeholder="BUSCAR..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-black/50 border border-cyan-500/50 rounded-lg text-cyan-100 placeholder-cyan-700 font-mono focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all"
            />
          </div>
          <div className="flex gap-2">
            {categorias.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoriaActiva(cat.id)}
                className={`relative px-4 py-2 font-mono font-bold text-sm tracking-wider transition-all overflow-hidden ${
                  categoriaActiva === cat.id
                    ? 'text-black'
                    : 'text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500'
                }`}
                style={{
                  clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'
                }}
              >
                {categoriaActiva === cat.id && (
                  <div className={`absolute inset-0 bg-gradient-to-r ${cat.color}`} />
                )}
                <span className="relative">{cat.nombre}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="relative max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {productosFiltrados.map((producto, index) => {
            const glowColor = index % 3 === 0 ? 'cyan' : index % 3 === 1 ? 'fuchsia' : 'yellow';
            const borderColor = glowColor === 'cyan' ? 'border-cyan-500/50 hover:border-cyan-400' :
                               glowColor === 'fuchsia' ? 'border-fuchsia-500/50 hover:border-fuchsia-400' :
                               'border-yellow-500/50 hover:border-yellow-400';
            const shadowColor = glowColor === 'cyan' ? 'hover:shadow-[0_0_30px_rgba(6,182,212,0.3)]' :
                               glowColor === 'fuchsia' ? 'hover:shadow-[0_0_30px_rgba(217,70,239,0.3)]' :
                               'hover:shadow-[0_0_30px_rgba(234,179,8,0.3)]';
            const textColor = glowColor === 'cyan' ? 'text-cyan-400' :
                             glowColor === 'fuchsia' ? 'text-fuchsia-400' :
                             'text-yellow-400';

            return (
              <div
                key={producto.id}
                className={`group relative bg-black/50 backdrop-blur-sm border ${borderColor} p-4 transition-all duration-300 ${shadowColor}`}
                style={{
                  clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))'
                }}
              >
                {/* Corner accents */}
                <div className={`absolute top-0 right-0 w-5 h-5 border-t border-r ${borderColor}`} style={{ transform: 'translate(0, 0) rotate(45deg)', transformOrigin: 'top right' }} />

                <div className="flex gap-4">
                  <div className="flex-1">
                    <h3 className={`text-lg font-mono font-bold ${textColor} mb-1 tracking-wide`}>{producto.nombre.toUpperCase()}</h3>
                    <p className="text-gray-500 text-sm font-mono mb-4">// {producto.descripcion}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-2xl font-mono font-black ${textColor}`}>${producto.precio.toLocaleString()}</span>
                      {carrito[producto.id] ? (
                        <div className={`flex items-center gap-2 border ${borderColor} px-2 py-1`}>
                          <button onClick={() => quitarDelCarrito(producto.id)} className="p-1 hover:bg-white/10 transition-colors">
                            <Minus className={`w-4 h-4 ${textColor}`} />
                          </button>
                          <span className={`font-mono font-bold min-w-[24px] text-center ${textColor}`}>{carrito[producto.id]}</span>
                          <button onClick={() => agregarAlCarrito(producto.id)} className="p-1 hover:bg-white/10 transition-colors">
                            <Plus className={`w-4 h-4 ${textColor}`} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => agregarAlCarrito(producto.id)}
                          className={`flex items-center gap-2 border ${borderColor} px-4 py-2 font-mono font-bold text-sm hover:bg-white/10 transition-all`}
                        >
                          <Plus className={`w-4 h-4 ${textColor}`} />
                          <span className={textColor}>ADD</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <img
                      src={producto.imagen}
                      alt={producto.nombre}
                      className="w-24 h-24 object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      style={{
                        clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'
                      }}
                    />
                    <div className={`absolute inset-0 border ${borderColor} pointer-events-none`} style={{
                      clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)'
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Cart */}
      {totalItems > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <button className="relative flex items-center gap-4 bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-yellow-500 text-black px-6 py-4 font-mono font-black tracking-wider transition-all hover:scale-105 shadow-[0_0_40px_rgba(217,70,239,0.5)]"
            style={{
              clipPath: 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)'
            }}
          >
            <ShoppingCart className="w-5 h-5" />
            <span>VIEW_CART ({totalItems})</span>
            <span className="bg-black/20 px-3 py-1">
              ${Object.entries(carrito).reduce((total, [id, qty]) => {
                const producto = productos.find(p => p.id === Number(id));
                return total + (producto?.precio || 0) * qty;
              }, 0).toLocaleString()}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
