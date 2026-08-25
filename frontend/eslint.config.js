import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Pantallas que YA estaban construidas sobre el ABM viejo cuando se cerró la
 * puerta. Son las únicas autorizadas a seguir importándolo, y sólo para
 * mantenimiento: la lista puede ACHICARSE a medida que se migren, nunca crecer.
 *
 * Si estás por agregar un archivo acá, casi seguro estás por hacer lo que esta
 * regla existe para evitar. Ver la nota de abajo.
 */
const PANTALLAS_LEGACY_ABMPAGE = [
  'src/pages/admin/Suscripciones.tsx',
  'src/pages/Categorias.tsx',
  'src/pages/Empleados.tsx',
  'src/pages/GestionAusencias.tsx',
  'src/pages/GestionCuadrillas.tsx',
  'src/pages/GestionHorarios.tsx',
  'src/pages/GestionPagos.tsx',
  'src/pages/GestionTasas.tsx',
  'src/pages/Inventario.tsx',
  'src/pages/MisReclamos.tsx',
  'src/pages/MisTramites.tsx',
  'src/pages/MisTurnos.tsx',
  'src/pages/OrdenesPago.tsx',
  'src/pages/OrdenesTrabajo.tsx',
  'src/pages/Reclamos.tsx',
  'src/pages/ReportesContaduria.tsx',
  'src/pages/ReportesSueldos.tsx',
  'src/pages/ReportesTesoreria.tsx',
  'src/pages/SueldosEmpleados.tsx',
  'src/pages/TarjetasCredito.tsx',
  'src/pages/TesoreriaCajas.tsx',
  'src/pages/TesoreriaConciliacion.tsx',
  'src/pages/TesoreriaContactos.tsx',
  'src/pages/TesoreriaCuracionBartolo.tsx',
  'src/pages/TesoreriaMapa.tsx',
  'src/pages/TesoreriaProyecciones.tsx',
  'src/pages/TesoreriaProyectos.tsx',
  'src/pages/Usuarios.tsx',
]

/**
 * Por qué esto es una regla de lint y no un párrafo en la documentación:
 * el párrafo ya existía —CLAUDE.md, regla 6.bis— y las pantallas nuevas
 * siguieron cayendo igual en el ABM viejo. Una convención escrita se puede
 * saltear sin enterarse; un gate que falla, no. `npm run lint` corta antes del
 * push, y el mensaje explica qué usar en su lugar.
 */
const MENSAJE_ABMPAGE = [
  'ABMPage es el ABM VIEJO y está deprecado: no recibe pantallas nuevas.',
  'Una pantalla nueva se arma con el kit components/abmv2 — SemanticAbmPage',
  'como composición completa, o sus piezas sueltas (PageHeader, ListToolbar,',
  'FilterBar, DataTable, SideModal, CardGrid).',
  'El kit además se proyecta solo a mobile (DataTable + RolesSemanticos);',
  'ABMPage no, y por eso las pantallas que lo usan se ven mal en el teléfono.',
  'Ver CLAUDE.md regla 6.bis y components/abmv2/README.md.',
].join(' ')

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Puerta cerrada al ABM viejo. Las pantallas ya construidas sobre él
      // quedan exceptuadas abajo; cualquier archivo nuevo que lo importe
      // rompe el lint.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui/ABMPage', '**/components/ui/ABMPage'],
              message: MENSAJE_ABMPAGE,
            },
          ],
        },
      ],
      // Guardián de la tinta sobre acento (regla del dueño, 2026-08-25): la
      // pareja "background del tema + color blanco hardcodeado" en un style
      // inline es EXACTAMENTE como nacen los botones oscuros con texto oscuro
      // cuando el tema cambia. La barrida del 2026-08-25 dejó esto en cero;
      // este gate evita que rebrote. La tinta sobre el acento sale SIEMPRE de
      // la fuente única por luminancia: var(--pl-on-accent) (o .pl-acento).
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXAttribute[name.name='style'] ObjectExpression:has(Property[key.name=/^background(Color)?$/] > MemberExpression[object.name='theme'][property.name='primary']) > Property[key.name='color'] > Literal[value=/^(#fff|#ffffff|white)$/i]",
          message:
            'Tinta hardcodeada sobre fondo del tema: usá color: "var(--pl-on-accent)" (fuente única por luminancia) o la clase .pl-acento de pl-tokens.css. Con acento claro, el blanco fijo se vuelve ilegible.',
        },
      ],
    },
  },
  {
    // Mantenimiento de lo viejo: siguen pudiendo importarlo, nada se rompe.
    files: PANTALLAS_LEGACY_ABMPAGE,
    rules: { 'no-restricted-imports': 'off' },
  },
])
