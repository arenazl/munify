import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, ChevronRight, CheckCircle, BarChart3, Users, MapPin, Bell,
  Clock, Shield, Smartphone, MessageCircle, Award, TrendingUp, Zap,
  FileText, Calendar, Star, ArrowRight, Play, Mail, Phone
} from 'lucide-react';

export default function Marketing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const features = [
    {
      icon: MapPin,
      title: 'Geolocalización Precisa',
      description: 'Los vecinos marcan la ubicación exacta del problema en el mapa. No más direcciones confusas.',
      color: '#3b82f6'
    },
    {
      icon: Bell,
      title: 'Notificaciones Automáticas',
      description: 'WhatsApp, email y push. El vecino siempre informado del estado de su reclamo.',
      color: '#22c55e'
    },
    {
      icon: BarChart3,
      title: 'Dashboard en Tiempo Real',
      description: 'Métricas, KPIs y gráficos para tomar decisiones basadas en datos.',
      color: '#8b5cf6'
    },
    {
      icon: Users,
      title: 'Gestión de Equipos',
      description: 'Asigna reclamos a empleados, visualiza carga de trabajo y disponibilidad.',
      color: '#f59e0b'
    },
    {
      icon: Clock,
      title: 'Control de SLA',
      description: 'Define tiempos de respuesta por categoría y recibe alertas de incumplimiento.',
      color: '#ef4444'
    },
    {
      icon: Award,
      title: 'Gamificación',
      description: 'Puntos, badges y rankings para motivar a vecinos y empleados.',
      color: '#ec4899'
    }
  ];

  const stats = [
    { value: '40%', label: 'Reducción tiempo respuesta' },
    { value: '85%', label: 'Satisfacción vecinal' },
    { value: '3x', label: 'Más reclamos resueltos' },
    { value: '0', label: 'Reclamos perdidos' }
  ];

  const testimonials = [
    {
      quote: 'Pasamos de gestionar reclamos en papel a resolver el 90% en menos de 72 horas.',
      author: 'Dir. de Servicios Públicos',
      municipality: 'Municipio de Merlo'
    },
    {
      quote: 'Los vecinos están encantados. Ahora pueden seguir su reclamo como un pedido de delivery.',
      author: 'Secretario de Gobierno',
      municipality: 'Municipio de Morón'
    }
  ];

  const pricing = [
    {
      name: 'Starter',
      price: 'Consultar',
      description: 'Ideal para municipios pequeños',
      features: [
        'Hasta 5.000 habitantes',
        'Dashboard básico',
        'Notificaciones por email',
        'Soporte por email',
        '5 usuarios admin'
      ],
      highlighted: false
    },
    {
      name: 'Profesional',
      price: 'Consultar',
      description: 'Para municipios medianos',
      features: [
        'Hasta 50.000 habitantes',
        'Dashboard completo + Analytics',
        'WhatsApp + Email + Push',
        'Soporte prioritario',
        'Usuarios ilimitados',
        'Gamificación',
        'SLA y Auto-escalado'
      ],
      highlighted: true
    },
    {
      name: 'Enterprise',
      price: 'A medida',
      description: 'Para grandes municipios',
      features: [
        'Sin límite de habitantes',
        'Todas las funcionalidades',
        'Integración con sistemas existentes',
        'Capacitación presencial',
        'Gerente de cuenta dedicado',
        'Personalización total'
      ],
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-white text-lg">ReclamosMuni</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-slate-300 hover:text-white transition-colors text-sm">Funcionalidades</a>
            <a href="#stats" className="text-slate-300 hover:text-white transition-colors text-sm">Resultados</a>
            <a href="#pricing" className="text-slate-300 hover:text-white transition-colors text-sm">Planes</a>
            <a href="#contact" className="text-slate-300 hover:text-white transition-colors text-sm">Contacto</a>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Demo gratis
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full mb-6">
              <Zap className="h-4 w-4 text-blue-400" />
              <span className="text-blue-400 text-sm font-medium">+50 municipios ya lo usan</span>
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
              Transformá la gestión de{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                reclamos municipales
              </span>
            </h1>

            <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
              Sistema integral para recibir, asignar, resolver y medir reclamos vecinales.
              Transparencia total, vecinos satisfechos.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/')}
                className="group px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold text-lg shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2"
              >
                Ver demo en vivo
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="px-8 py-4 bg-white/5 border border-white/10 text-white rounded-xl font-semibold text-lg hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                <Play className="h-5 w-5" />
                Ver video (2 min)
              </button>
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent z-10 pointer-events-none" />
            <div className="bg-slate-800/50 backdrop-blur border border-white/10 rounded-2xl p-2 shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070"
                alt="Dashboard Preview"
                className="rounded-xl w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className="py-20 px-4 bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Todo lo que necesita tu municipio
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Funcionalidades pensadas para municipios argentinos. Sin complicaciones, listo para usar.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="bg-slate-800/30 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all group"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${feature.color}20` }}
                  >
                    <Icon className="h-6 w-6" style={{ color: feature.color }} />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-slate-400 text-sm">{feature.description}</p>
                </div>
              );
            })}
          </div>

          {/* Additional Features List */}
          <div className="mt-16 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-2xl p-8">
            <h3 className="text-xl font-semibold text-white mb-6 text-center">Y mucho más...</h3>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                'Mapa interactivo con clusters',
                'Tablero Kanban para empleados',
                'Chat con IA integrado',
                'Exportación Excel/CSV',
                'Multi-municipio (SaaS)',
                'Portal público sin login',
                'Historial completo de cambios',
                'Categorías personalizables',
                'Zonas geográficas'
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-slate-300">
                  <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              ¿Cómo funciona?
            </h2>
            <p className="text-slate-400">Desde el reclamo hasta la resolución, todo trazable</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '1', title: 'Vecino reporta', desc: 'Desde web, app o WhatsApp con foto y ubicación', icon: Smartphone },
              { step: '2', title: 'Se asigna', desc: 'Automático o manual al empleado indicado', icon: Users },
              { step: '3', title: 'Se resuelve', desc: 'Con fotos del antes y después', icon: CheckCircle },
              { step: '4', title: 'Vecino califica', desc: 'Feedback para mejora continua', icon: Star }
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={index} className="relative">
                  {index < 3 && (
                    <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-blue-500 to-transparent" />
                  )}
                  <div className="text-center">
                    <div className="w-16 h-16 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 relative">
                      <Icon className="h-7 w-7 text-blue-400" />
                      <span className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
                        {item.step}
                      </span>
                    </div>
                    <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                    <p className="text-slate-400 text-sm">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Lo que dicen nuestros clientes
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-slate-800/30 border border-white/5 rounded-2xl p-8"
              >
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-white text-lg mb-6 italic">"{testimonial.quote}"</p>
                <div>
                  <p className="text-white font-medium">{testimonial.author}</p>
                  <p className="text-slate-400 text-sm">{testimonial.municipality}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 bg-slate-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Planes adaptados a cada municipio
            </h2>
            <p className="text-slate-400">Sin sorpresas. Precio fijo mensual.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricing.map((plan, index) => (
              <div
                key={index}
                className={`rounded-2xl p-8 ${
                  plan.highlighted
                    ? 'bg-gradient-to-b from-blue-500/20 to-indigo-500/20 border-2 border-blue-500/50 relative'
                    : 'bg-slate-800/30 border border-white/5'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-500 text-white text-sm font-medium rounded-full">
                    Más popular
                  </div>
                )}
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-slate-400 text-sm mb-4">{plan.description}</p>
                <div className="text-3xl font-bold text-white mb-6">{plan.price}</div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-center gap-2 text-slate-300 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  className={`w-full py-3 rounded-xl font-medium transition-all ${
                    plan.highlighted
                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                      : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                  }`}
                >
                  Solicitar demo
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿Listo para transformar tu municipio?
          </h2>
          <p className="text-slate-400 mb-8">
            Agenda una demo personalizada. Sin compromiso, sin tarjeta de crédito.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@municipio.gob.ar"
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
            />
            <button className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors whitespace-nowrap">
              Agendar demo
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-8 text-slate-400">
            <a href="mailto:ventas@reclamosmuni.com" className="flex items-center gap-2 hover:text-white transition-colors">
              <Mail className="h-4 w-4" />
              ventas@reclamosmuni.com
            </a>
            <a href="tel:+5411xxxx" className="flex items-center gap-2 hover:text-white transition-colors">
              <Phone className="h-4 w-4" />
              +54 11 XXXX-XXXX
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <Building2 className="h-4 w-4 text-white" />
            </div>
            <span className="text-white font-semibold">ReclamosMuni</span>
          </div>
          <p className="text-slate-500 text-sm">
            © 2024 ReclamosMuni. Hecho en Argentina.
          </p>
        </div>
      </footer>
    </div>
  );
}
