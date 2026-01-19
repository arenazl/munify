import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
  BarChart2, TrendingUp, Users, Clock, Trophy, Target,
  PieChart, GitCompare, Calendar, Filter, ChevronDown,
  Play, X, Layers, MapPin, Folder
} from 'lucide-react';

// ==================== TIPOS ====================

export interface TemplateVariable {
  id: string;
  nombre: string;
  tipo: 'entidad' | 'campo' | 'agregacion' | 'estado' | 'periodo';
  opciones?: string[];  // Opciones predefinidas si aplica
  valor?: string;       // Valor seleccionado
  placeholder: string;
}

export interface QueryTemplate {
  id: string;
  nombre: string;
  descripcion: string;
  icono: React.ReactNode;
  color: string;
  categoria: 'ranking' | 'comparativo' | 'tendencia' | 'distribucion' | 'detalle';
  variables: TemplateVariable[];
  queryBase: string;  // Query con placeholders {variable_id}
  formatoSugerido: string;
}

interface QueryTemplatesProps {
  onExecute: (query: string, formato?: string) => void;
  loading?: boolean;
}

// ==================== TEMPLATES PREDEFINIDOS ====================

const TEMPLATES: QueryTemplate[] = [
  {
    id: 'ranking_empleados',
    nombre: 'Ranking de Empleados',
    descripcion: 'Ver el rendimiento de empleados ordenado por una métrica',
    icono: <Trophy className="h-5 w-5" />,
    color: '#f59e0b',
    categoria: 'ranking',
    variables: [
      {
        id: 'metrica',
        nombre: 'Métrica',
        tipo: 'campo',
        opciones: ['reclamos resueltos', 'tiempo promedio de resolución', 'calificación promedio', 'puntos de gamificación', 'violaciones de SLA'],
        placeholder: 'Seleccioná qué medir'
      },
      {
        id: 'orden',
        nombre: 'Orden',
        tipo: 'agregacion',
        opciones: ['de mayor a menor', 'de menor a mayor'],
        placeholder: 'Orden del ranking'
      },
      {
        id: 'limite',
        nombre: 'Cantidad',
        tipo: 'campo',
        opciones: ['top 5', 'top 10', 'top 20', 'todos'],
        placeholder: 'Cuántos mostrar'
      }
    ],
    queryBase: 'Dame un ranking de empleados por {metrica}, ordenado {orden}, mostrando {limite}',
    formatoSugerido: 'ranking'
  },
  {
    id: 'comparativo_categorias',
    nombre: 'Comparativo por Categoría',
    descripcion: 'Comparar métricas entre diferentes categorías de reclamos',
    icono: <GitCompare className="h-5 w-5" />,
    color: '#8b5cf6',
    categoria: 'comparativo',
    variables: [
      {
        id: 'metrica',
        nombre: 'Métrica',
        tipo: 'campo',
        opciones: ['cantidad de reclamos', 'tiempo promedio de resolución', 'porcentaje resueltos', 'cantidad pendientes'],
        placeholder: 'Qué comparar'
      },
      {
        id: 'periodo',
        nombre: 'Período',
        tipo: 'periodo',
        opciones: ['este mes', 'esta semana', 'últimos 30 días', 'este año', 'todo el historial'],
        placeholder: 'Período de tiempo'
      }
    ],
    queryBase: 'Compará las categorías por {metrica} en {periodo}',
    formatoSugerido: 'cards'
  },
  {
    id: 'distribucion_zonas',
    nombre: 'Distribución por Zona',
    descripcion: 'Ver cómo se distribuyen los reclamos geográficamente',
    icono: <MapPin className="h-5 w-5" />,
    color: '#10b981',
    categoria: 'distribucion',
    variables: [
      {
        id: 'estado',
        nombre: 'Estado',
        tipo: 'estado',
        opciones: ['todos', 'pendientes', 'en proceso', 'resueltos'],
        placeholder: 'Filtrar por estado'
      },
      {
        id: 'metrica',
        nombre: 'Mostrar',
        tipo: 'campo',
        opciones: ['cantidad', 'porcentaje del total', 'tiempo promedio'],
        placeholder: 'Qué mostrar'
      }
    ],
    queryBase: 'Mostrá la distribución de reclamos {estado} por zona, con {metrica}',
    formatoSugerido: 'cards'
  },
  {
    id: 'tendencia_temporal',
    nombre: 'Tendencia Temporal',
    descripcion: 'Ver la evolución de reclamos en el tiempo',
    icono: <TrendingUp className="h-5 w-5" />,
    color: '#3b82f6',
    categoria: 'tendencia',
    variables: [
      {
        id: 'metrica',
        nombre: 'Métrica',
        tipo: 'campo',
        opciones: ['reclamos creados', 'reclamos resueltos', 'tiempo promedio de resolución'],
        placeholder: 'Qué analizar'
      },
      {
        id: 'agrupacion',
        nombre: 'Agrupar por',
        tipo: 'periodo',
        opciones: ['día', 'semana', 'mes'],
        placeholder: 'Granularidad'
      },
      {
        id: 'periodo',
        nombre: 'Período',
        tipo: 'periodo',
        opciones: ['últimos 7 días', 'últimos 30 días', 'últimos 3 meses', 'último año'],
        placeholder: 'Rango de tiempo'
      }
    ],
    queryBase: 'Mostrá la tendencia de {metrica} agrupado por {agrupacion} en {periodo}',
    formatoSugerido: 'timeline'
  },
  {
    id: 'cruce_empleado_categoria',
    nombre: 'Cruce Empleado × Categoría',
    descripcion: 'Analizar qué empleado rinde mejor en cada categoría',
    icono: <Layers className="h-5 w-5" />,
    color: '#ec4899',
    categoria: 'comparativo',
    variables: [
      {
        id: 'metrica',
        nombre: 'Métrica',
        tipo: 'campo',
        opciones: ['cantidad resueltos', 'tiempo promedio', 'calificación promedio'],
        placeholder: 'Qué medir'
      },
      {
        id: 'filtro_cat',
        nombre: 'Categorías',
        tipo: 'campo',
        opciones: ['todas', 'solo las principales (top 5)', 'con más de 10 reclamos'],
        placeholder: 'Filtrar categorías'
      }
    ],
    queryBase: 'Dame un análisis cruzado de categorías vs empleados mostrando {metrica}, filtrando {filtro_cat}',
    formatoSugerido: 'table'
  },
  {
    id: 'sla_analisis',
    nombre: 'Análisis de SLA',
    descripcion: 'Ver cumplimiento de tiempos de resolución',
    icono: <Clock className="h-5 w-5" />,
    color: '#ef4444',
    categoria: 'detalle',
    variables: [
      {
        id: 'dimension',
        nombre: 'Agrupar por',
        tipo: 'entidad',
        opciones: ['empleado', 'categoría', 'zona', 'prioridad'],
        placeholder: 'Cómo agrupar'
      },
      {
        id: 'mostrar',
        nombre: 'Mostrar',
        tipo: 'campo',
        opciones: ['violaciones de SLA', 'porcentaje de cumplimiento', 'tiempo promedio vs SLA objetivo'],
        placeholder: 'Qué analizar'
      }
    ],
    queryBase: 'Analizá el cumplimiento de SLA por {dimension}, mostrando {mostrar}',
    formatoSugerido: 'ranking'
  }
];

const CATEGORIAS = [
  { id: 'ranking', nombre: 'Rankings', icono: <Trophy className="h-4 w-4" /> },
  { id: 'comparativo', nombre: 'Comparativos', icono: <GitCompare className="h-4 w-4" /> },
  { id: 'tendencia', nombre: 'Tendencias', icono: <TrendingUp className="h-4 w-4" /> },
  { id: 'distribucion', nombre: 'Distribución', icono: <PieChart className="h-4 w-4" /> },
  { id: 'detalle', nombre: 'Análisis', icono: <BarChart2 className="h-4 w-4" /> },
];

// ==================== COMPONENTE ====================

export default function QueryTemplates({ onExecute, loading }: QueryTemplatesProps) {
  const { theme } = useTheme();

  // Estado
  const [selectedTemplate, setSelectedTemplate] = useState<QueryTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [filterCategoria, setFilterCategoria] = useState<string | null>(null);

  // Seleccionar template
  const selectTemplate = (template: QueryTemplate) => {
    setSelectedTemplate(template);
    setVariableValues({});
  };

  // Actualizar variable
  const updateVariable = (varId: string, value: string) => {
    setVariableValues(prev => ({ ...prev, [varId]: value }));
  };

  // Generar y ejecutar query
  const executeTemplate = () => {
    if (!selectedTemplate) return;

    let query = selectedTemplate.queryBase;
    selectedTemplate.variables.forEach(v => {
      const value = variableValues[v.id] || v.opciones?.[0] || '';
      query = query.replace(`{${v.id}}`, value);
    });

    onExecute(query, selectedTemplate.formatoSugerido);
  };

  // Verificar si todas las variables están completas
  const isComplete = selectedTemplate?.variables.every(v =>
    variableValues[v.id] || v.opciones?.[0]
  );

  // Templates filtrados
  const filteredTemplates = filterCategoria
    ? TEMPLATES.filter(t => t.categoria === filterCategoria)
    : TEMPLATES;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}` }}
    >
      {/* Header */}
      <div className="p-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
        <h3 className="font-semibold flex items-center gap-2" style={{ color: theme.text }}>
          <Layers className="h-5 w-5" style={{ color: theme.primary }} />
          Consultas Rápidas
        </h3>
        <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
          Seleccioná un template y completá las variables
        </p>
      </div>

      {/* Filtros de categoría */}
      <div className="flex flex-wrap gap-1.5 p-3" style={{ borderBottom: `1px solid ${theme.border}` }}>
        <button
          onClick={() => setFilterCategoria(null)}
          className={`px-3 py-1 rounded-full text-xs transition-all ${!filterCategoria ? 'font-semibold' : ''}`}
          style={{
            backgroundColor: !filterCategoria ? theme.primary : theme.backgroundSecondary,
            color: !filterCategoria ? '#fff' : theme.textSecondary,
          }}
        >
          Todos
        </button>
        {CATEGORIAS.map(cat => (
          <button
            key={cat.id}
            onClick={() => setFilterCategoria(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all ${filterCategoria === cat.id ? 'font-semibold' : ''}`}
            style={{
              backgroundColor: filterCategoria === cat.id ? theme.primary : theme.backgroundSecondary,
              color: filterCategoria === cat.id ? '#fff' : theme.textSecondary,
            }}
          >
            {cat.icono}
            {cat.nombre}
          </button>
        ))}
      </div>

      {/* Grid de templates */}
      {!selectedTemplate ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
          {filteredTemplates.map(template => (
            <button
              key={template.id}
              onClick={() => selectTemplate(template)}
              className="text-left p-4 rounded-xl transition-all hover:scale-[1.02] hover:shadow-lg"
              style={{
                backgroundColor: theme.backgroundSecondary,
                border: `2px solid transparent`,
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = template.color}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'transparent'}
            >
              <div className="flex items-start gap-3">
                <div
                  className="p-2.5 rounded-lg"
                  style={{ backgroundColor: `${template.color}20`, color: template.color }}
                >
                  {template.icono}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm" style={{ color: theme.text }}>
                    {template.nombre}
                  </div>
                  <div className="text-xs mt-0.5 line-clamp-2" style={{ color: theme.textSecondary }}>
                    {template.descripcion}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {template.variables.map(v => (
                      <span
                        key={v.id}
                        className="px-1.5 py-0.5 rounded text-[10px]"
                        style={{ backgroundColor: `${template.color}15`, color: template.color }}
                      >
                        {v.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Configurador de template */
        <div className="p-4">
          {/* Template seleccionado */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="p-2.5 rounded-lg"
                style={{ backgroundColor: `${selectedTemplate.color}20`, color: selectedTemplate.color }}
              >
                {selectedTemplate.icono}
              </div>
              <div>
                <div className="font-semibold" style={{ color: theme.text }}>
                  {selectedTemplate.nombre}
                </div>
                <div className="text-xs" style={{ color: theme.textSecondary }}>
                  {selectedTemplate.descripcion}
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedTemplate(null)}
              className="p-2 rounded-lg transition-colors hover:bg-black/5"
              style={{ color: theme.textSecondary }}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Variables */}
          <div className="space-y-3 mb-4">
            {selectedTemplate.variables.map(variable => (
              <div key={variable.id}>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: theme.text }}>
                  {variable.nombre}
                </label>
                <div className="relative">
                  <select
                    value={variableValues[variable.id] || ''}
                    onChange={(e) => updateVariable(variable.id, e.target.value)}
                    className="w-full px-3 py-2.5 pr-8 rounded-lg text-sm appearance-none cursor-pointer transition-all focus:ring-2"
                    style={{
                      backgroundColor: theme.backgroundSecondary,
                      color: theme.text,
                      border: `1px solid ${variableValues[variable.id] ? selectedTemplate.color : theme.border}`,
                      outline: 'none',
                    }}
                  >
                    <option value="" disabled>{variable.placeholder}</option>
                    {variable.opciones?.map(op => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                  <ChevronDown
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                    style={{ color: theme.textSecondary }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Preview de la query */}
          <div
            className="p-3 rounded-lg mb-4 text-sm"
            style={{
              backgroundColor: `${selectedTemplate.color}10`,
              border: `1px solid ${selectedTemplate.color}30`,
              color: theme.text
            }}
          >
            <span className="font-medium" style={{ color: selectedTemplate.color }}>Consulta:</span>{' '}
            {(() => {
              let preview = selectedTemplate.queryBase;
              selectedTemplate.variables.forEach(v => {
                const value = variableValues[v.id];
                if (value) {
                  preview = preview.replace(`{${v.id}}`, value);
                } else {
                  preview = preview.replace(
                    `{${v.id}}`,
                    `[${v.nombre}]`
                  );
                }
              });
              return preview;
            })()}
          </div>

          {/* Botón ejecutar */}
          <button
            onClick={executeTemplate}
            disabled={loading || !isComplete}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            style={{
              background: `linear-gradient(135deg, ${selectedTemplate.color} 0%, ${selectedTemplate.color}cc 100%)`,
              color: '#ffffff',
              boxShadow: `0 4px 14px ${selectedTemplate.color}40`,
            }}
          >
            <Play className="h-5 w-5" />
            {loading ? 'Ejecutando...' : 'Ejecutar Consulta'}
          </button>
        </div>
      )}
    </div>
  );
}
