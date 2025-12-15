import { useState } from 'react';
import { Search, Star, Clock, MapPin, Phone, ShoppingCart, Plus, Minus, ArrowLeft } from 'lucide-react';
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
  { id: 'todos', nombre: 'Todos', emoji: '✨' },
  { id: 'docenas', nombre: 'Docenas', emoji: '📦' },
  { id: 'criollas', nombre: 'Empanadas Criollas', emoji: '🥟' },
];

export default function DemoGlassmorphism() {
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-black/30 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/demos" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-white" />
            </Link>
            <span className="text-white font-semibold">Empanadas del Oeste</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 hover:bg-white/10 rounded-lg transition-colors">
              <ShoppingCart className="w-5 h-5 text-white" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="relative h-80 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&h=400&fit=crop"
          alt="Hero"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h1 className="text-4xl font-bold text-white mb-2">Empanadas del Oeste</h1>
          <p className="text-gray-300 mb-4">Las empanadas más ricas de la zona</p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-300">
            <span className="flex items-center gap-1">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> 4.7
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" /> 20-35 min
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" /> Av. San Martín 1234
            </span>
            <span className="flex items-center gap-1">
              <Phone className="w-4 h-4" /> 0220 483-4567
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="sticky top-14 z-40 backdrop-blur-xl bg-gray-900/80 border-b border-white/10 px-4 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar en el menú..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categorias.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoriaActiva(cat.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  categoriaActiva === cat.id
                    ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                }`}
              >
                {cat.emoji} {cat.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {productosFiltrados.map(producto => (
            <div
              key={producto.id}
              className="group relative backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 hover:border-violet-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-violet-500/10"
            >
              <div className="flex gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{producto.nombre}</h3>
                  <p className="text-gray-400 text-sm mb-4">{producto.descripcion}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-violet-400">${producto.precio.toLocaleString()}</span>
                    {carrito[producto.id] ? (
                      <div className="flex items-center gap-2 bg-violet-500 rounded-full px-2 py-1">
                        <button onClick={() => quitarDelCarrito(producto.id)} className="p-1 hover:bg-violet-600 rounded-full transition-colors">
                          <Minus className="w-4 h-4 text-white" />
                        </button>
                        <span className="text-white font-bold min-w-[20px] text-center">{carrito[producto.id]}</span>
                        <button onClick={() => agregarAlCarrito(producto.id)} className="p-1 hover:bg-violet-600 rounded-full transition-colors">
                          <Plus className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => agregarAlCarrito(producto.id)}
                        className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-full font-medium transition-all hover:shadow-lg hover:shadow-violet-500/30"
                      >
                        <Plus className="w-4 h-4" /> Agregar
                      </button>
                    )}
                  </div>
                </div>
                <img
                  src={producto.imagen}
                  alt={producto.nombre}
                  className="w-24 h-24 object-cover rounded-xl group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Cart */}
      {totalItems > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <button className="flex items-center gap-4 bg-violet-500 hover:bg-violet-600 text-white px-6 py-4 rounded-2xl shadow-2xl shadow-violet-500/30 transition-all hover:scale-105">
            <ShoppingCart className="w-5 h-5" />
            <span className="font-bold">Ver carrito ({totalItems})</span>
            <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
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
