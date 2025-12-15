import { useState } from 'react';
import { Search, Star, Clock, MapPin, ShoppingCart, Plus, Minus, ArrowLeft, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const productos = [
  { id: 1, nombre: 'Empanada Caprese', descripcion: 'Tomate, muzzarella, albahaca', precio: 850, imagen: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400&h=400&fit=crop', categoria: 'criollas', destacado: true },
  { id: 2, nombre: 'Empanada de Carne', descripcion: 'Carne cortada a cuchillo, huevo, aceituna', precio: 900, imagen: 'https://images.unsplash.com/photo-1619221882220-947b3d3c8861?w=400&h=400&fit=crop', categoria: 'criollas' },
  { id: 3, nombre: 'Empanada de Humita', descripcion: 'Choclo cremoso', precio: 800, imagen: 'https://images.unsplash.com/photo-1604467715878-83e57e8bc129?w=400&h=400&fit=crop', categoria: 'criollas' },
  { id: 4, nombre: 'Empanada de Pollo', descripcion: 'Pollo desmenuzado, salsa blanca', precio: 900, imagen: 'https://images.unsplash.com/photo-1619221881488-64595c77e919?w=400&h=400&fit=crop', categoria: 'criollas' },
  { id: 5, nombre: 'Docena Surtida', descripcion: '12 empanadas a elección', precio: 9500, imagen: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=400&h=400&fit=crop', categoria: 'docenas', destacado: true },
  { id: 6, nombre: 'Docena de Carne', descripcion: '12 empanadas de carne', precio: 9800, imagen: 'https://images.unsplash.com/photo-1619221882220-947b3d3c8861?w=400&h=400&fit=crop', categoria: 'docenas' },
];

const categorias = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'docenas', nombre: 'Docenas' },
  { id: 'criollas', nombre: 'Criollas' },
];

export default function DemoBento() {
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
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#f5f5f7]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/demos" className="text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-gray-800 font-semibold text-lg">Empanadas del Oeste</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-64 pl-10 pr-4 py-2 bg-white/60 rounded-xl text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
            </div>
            <button className="relative p-2 text-gray-600 hover:text-gray-800 transition-colors">
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Info */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-6">
          <span className="flex items-center gap-1.5">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> 4.7
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-4 h-4" /> 20-35 min
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4" /> Av. San Martín 1234
          </span>
        </div>

        {/* Categories */}
        <div className="flex gap-2 mb-8">
          {categorias.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategoriaActiva(cat.id)}
              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                categoriaActiva === cat.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Bento Grid */}
      <div className="max-w-6xl mx-auto px-6 pb-32">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 auto-rows-[200px]">
          {productosFiltrados.map((producto) => {
            const isLarge = producto.destacado;
            const gridClass = isLarge ? 'col-span-2 row-span-2' : 'col-span-1 row-span-1';

            return (
              <div
                key={producto.id}
                className={`${gridClass} group relative overflow-hidden rounded-3xl bg-white shadow-sm hover:shadow-xl transition-all duration-500`}
              >
                <img
                  src={producto.imagen}
                  alt={producto.nombre}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {producto.destacado && (
                  <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-white/90 backdrop-blur-sm text-gray-800 px-3 py-1.5 rounded-full text-xs font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Destacado
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3 className={`font-semibold text-white mb-1 ${isLarge ? 'text-2xl' : 'text-base'}`}>
                    {producto.nombre}
                  </h3>
                  {isLarge && (
                    <p className="text-white/70 text-sm mb-2">{producto.descripcion}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold text-white ${isLarge ? 'text-xl' : 'text-base'}`}>
                      ${producto.precio.toLocaleString()}
                    </span>
                    {carrito[producto.id] ? (
                      <div className="flex items-center gap-2 bg-white rounded-full px-1 py-1">
                        <button onClick={() => quitarDelCarrito(producto.id)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                          <Minus className="w-3.5 h-3.5 text-gray-600" />
                        </button>
                        <span className="font-semibold text-gray-800 min-w-[20px] text-center text-sm">{carrito[producto.id]}</span>
                        <button onClick={() => agregarAlCarrito(producto.id)} className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => agregarAlCarrito(producto.id)}
                        className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-all hover:scale-110"
                      >
                        <Plus className="w-5 h-5 text-gray-800" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Cart */}
      {totalItems > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <button className="flex items-center gap-4 bg-gray-900 hover:bg-gray-800 text-white px-6 py-4 rounded-2xl shadow-2xl transition-all hover:scale-105">
            <ShoppingCart className="w-5 h-5" />
            <span className="font-medium">Ver carrito</span>
            <span className="bg-white/10 px-3 py-1 rounded-full text-sm">
              {totalItems} items · ${Object.entries(carrito).reduce((total, [id, qty]) => {
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
