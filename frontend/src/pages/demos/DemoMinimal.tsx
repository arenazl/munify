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
  { id: 'todos', nombre: 'Todos' },
  { id: 'docenas', nombre: 'Docenas' },
  { id: 'criollas', nombre: 'Criollas' },
];

export default function DemoMinimal() {
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
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/demos" className="text-stone-400 hover:text-stone-600 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="text-stone-800 font-serif text-xl">Empanadas del Oeste</span>
          </div>
          <button className="relative p-2 text-stone-600 hover:text-stone-800 transition-colors">
            <ShoppingCart className="w-5 h-5" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 bg-stone-800 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 py-16 text-center">
        <h1 className="text-5xl font-serif text-stone-800 mb-4">Empanadas del Oeste</h1>
        <p className="text-stone-500 text-lg mb-8">Las empanadas más ricas de la zona</p>
        <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-stone-500">
          <span className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> 4.7
          </span>
          <span className="w-px h-4 bg-stone-300" />
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4" /> 20-35 min
          </span>
          <span className="w-px h-4 bg-stone-300" />
          <span className="flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Av. San Martín 1234
          </span>
          <span className="w-px h-4 bg-stone-300" />
          <span className="flex items-center gap-2">
            <Phone className="w-4 h-4" /> 0220 483-4567
          </span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="max-w-5xl mx-auto px-6 mb-12">
        <div className="flex flex-col sm:flex-row gap-6 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-full text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-400 transition-colors"
            />
          </div>
          <div className="flex gap-1 bg-stone-100 p-1 rounded-full">
            {categorias.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoriaActiva(cat.id)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  categoriaActiva === cat.id
                    ? 'bg-white text-stone-800 shadow-sm'
                    : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                {cat.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-5xl mx-auto px-6 pb-32">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {productosFiltrados.map(producto => (
            <div
              key={producto.id}
              className="group"
            >
              <div className="aspect-square mb-4 overflow-hidden rounded-2xl bg-stone-100">
                <img
                  src={producto.imagen}
                  alt={producto.nombre}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-serif text-lg text-stone-800">{producto.nombre}</h3>
                    <p className="text-stone-500 text-sm">{producto.descripcion}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-stone-800 font-medium">${producto.precio.toLocaleString()}</span>
                  {carrito[producto.id] ? (
                    <div className="flex items-center gap-3 text-stone-800">
                      <button onClick={() => quitarDelCarrito(producto.id)} className="w-8 h-8 rounded-full border border-stone-300 flex items-center justify-center hover:bg-stone-100 transition-colors">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="font-medium min-w-[20px] text-center">{carrito[producto.id]}</span>
                      <button onClick={() => agregarAlCarrito(producto.id)} className="w-8 h-8 rounded-full bg-stone-800 text-white flex items-center justify-center hover:bg-stone-700 transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => agregarAlCarrito(producto.id)}
                      className="text-stone-600 hover:text-stone-800 font-medium text-sm transition-colors"
                    >
                      + Agregar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Cart */}
      {totalItems > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <button className="flex items-center gap-4 bg-stone-800 hover:bg-stone-700 text-white px-8 py-4 rounded-full shadow-2xl transition-all hover:scale-105">
            <ShoppingCart className="w-5 h-5" />
            <span className="font-medium">Ver carrito ({totalItems})</span>
            <span className="text-stone-400">|</span>
            <span className="font-medium">
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
