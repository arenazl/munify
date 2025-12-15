import { useState } from 'react';
import { Search, Star, Clock, MapPin, ShoppingCart, Plus, Minus, ArrowLeft } from 'lucide-react';
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
  { id: 'todos', nombre: 'TODOS', color: 'bg-yellow-300' },
  { id: 'docenas', nombre: 'DOCENAS', color: 'bg-cyan-300' },
  { id: 'criollas', nombre: 'CRIOLLAS', color: 'bg-pink-300' },
];

export default function DemoNeubrutalism() {
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
    <div className="min-h-screen bg-orange-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-yellow-300 border-b-4 border-black">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/demos" className="p-2 bg-white border-2 border-black rounded-lg hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="font-black text-xl uppercase tracking-tight">Empanadas del Oeste</span>
          </div>
          <button className="relative p-3 bg-white border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all">
            <ShoppingCart className="w-6 h-6" />
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-pink-400 border-2 border-black text-black text-xs w-6 h-6 rounded-full flex items-center justify-center font-black">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden border-b-4 border-black">
        <img
          src="https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&h=400&fit=crop"
          alt="Hero"
          className="w-full h-72 object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="inline-block bg-yellow-300 border-4 border-black px-4 py-2 mb-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <h1 className="text-3xl font-black uppercase">Empanadas del Oeste</h1>
          </div>
          <p className="text-white font-bold text-lg mb-4 drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">Las empanadas más ricas de la zona</p>
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1 bg-white border-2 border-black px-3 py-1 font-bold">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" /> 4.7
            </span>
            <span className="flex items-center gap-1 bg-white border-2 border-black px-3 py-1 font-bold">
              <Clock className="w-4 h-4" /> 20-35 min
            </span>
            <span className="flex items-center gap-1 bg-white border-2 border-black px-3 py-1 font-bold">
              <MapPin className="w-4 h-4" /> Av. San Martín 1234
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="sticky top-16 z-40 bg-cyan-200 border-b-4 border-black px-4 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" />
            <input
              type="text"
              placeholder="BUSCAR..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border-4 border-black font-bold placeholder-gray-500 focus:outline-none focus:ring-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
            />
          </div>
          <div className="flex gap-2">
            {categorias.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoriaActiva(cat.id)}
                className={`px-4 py-2 border-4 border-black font-black uppercase text-sm transition-all ${
                  categoriaActiva === cat.id
                    ? `${cat.color} shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`
                    : 'bg-white hover:translate-x-0.5 hover:translate-y-0.5'
                }`}
              >
                {cat.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {productosFiltrados.map((producto, index) => (
            <div
              key={producto.id}
              className={`relative border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all ${
                index % 3 === 0 ? 'bg-pink-200' : index % 3 === 1 ? 'bg-yellow-200' : 'bg-cyan-200'
              }`}
            >
              <div className="flex gap-4">
                <div className="flex-1">
                  <h3 className="text-xl font-black uppercase mb-1">{producto.nombre}</h3>
                  <p className="text-gray-700 font-medium mb-4">{producto.descripcion}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black">${producto.precio.toLocaleString()}</span>
                    {carrito[producto.id] ? (
                      <div className="flex items-center gap-1 bg-black text-white border-4 border-black">
                        <button onClick={() => quitarDelCarrito(producto.id)} className="p-2 hover:bg-gray-800 transition-colors">
                          <Minus className="w-5 h-5" />
                        </button>
                        <span className="font-black min-w-[30px] text-center text-lg">{carrito[producto.id]}</span>
                        <button onClick={() => agregarAlCarrito(producto.id)} className="p-2 hover:bg-gray-800 transition-colors">
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => agregarAlCarrito(producto.id)}
                        className="flex items-center gap-2 bg-black text-white px-4 py-2 font-black uppercase border-4 border-black hover:bg-gray-800 transition-all"
                      >
                        <Plus className="w-5 h-5" /> AGREGAR
                      </button>
                    )}
                  </div>
                </div>
                <img
                  src={producto.imagen}
                  alt={producto.nombre}
                  className="w-28 h-28 object-cover border-4 border-black"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Cart */}
      {totalItems > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <button className="flex items-center gap-4 bg-yellow-300 text-black px-6 py-4 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all">
            <ShoppingCart className="w-6 h-6" />
            <span className="font-black uppercase">Ver carrito ({totalItems})</span>
            <span className="bg-black text-white px-3 py-1 font-black">
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
