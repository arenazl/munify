"""Seed de 15 tipos x ~20 conceptos para SPN (catalogo per-muni de Tesoreria).

Reemplaza el JSON estatico data/conceptos_gasto.json con un catalogo
editable per-muni que el intendente puede tunear desde Configuracion.

Idempotente: skip si el tipo ya existe (no duplica conceptos).
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from models import Municipio, TesoreriaTipoConcepto, TesoreriaConcepto
from core.config import settings

SPN_CODIGO = 'san-pedro-norte'


# 15 tipos × 20 conceptos. Color hex + icono Lucide para cada tipo.
DATA: list[tuple[dict, list[str]]] = [
    (
        {"nombre": "Sueldos y haberes", "color": "#3b82f6", "icono": "Briefcase",
         "descripcion": "Pagos al personal de planta"},
        ["Sueldo mensual", "Sueldo basico", "Sueldo personal de planta", "Sueldo personal contratado",
         "Sueldo personal jornalizado", "Horas extras", "Horas extras 50%", "Horas extras 100%",
         "Aguinaldo (SAC)", "Medio aguinaldo", "Bono fin de año", "Adicional por antiguedad",
         "Adicional por presentismo", "Adicional por zona desfavorable", "Adicional jerarquico",
         "Adicional por funcion", "Liquidacion final", "Vacaciones no gozadas",
         "Indemnizacion por despido", "Indemnizacion sustitutiva preaviso"],
    ),
    (
        {"nombre": "Concejales y políticos", "color": "#8b5cf6", "icono": "Vote",
         "descripcion": "Dietas y gastos del cuerpo legislativo"},
        ["Dieta concejal", "Dieta concejal aguinaldo", "Dieta presidente concejo", "Dieta secretario concejo",
         "Gastos de representacion intendente", "Gastos de representacion concejales",
         "Movilidad concejales", "Viaticos sesiones", "Viaticos congresos / capacitaciones",
         "Asesoria legislativa", "Bloque oficialista", "Bloque oposicion",
         "Publicidad institucional concejo", "Premios y reconocimientos",
         "Reunion vecinal", "Audiencia publica", "Eventos protocolares",
         "Convenios intermunicipales", "Hermanamientos", "Otros gastos politicos"],
    ),
    (
        {"nombre": "Honorarios profesionales", "color": "#f59e0b", "icono": "GraduationCap",
         "descripcion": "Profesionales externos sin relacion de dependencia"},
        ["Honorarios abogado", "Honorarios contador", "Honorarios escribano", "Honorarios medico",
         "Honorarios veterinario", "Honorarios ingeniero", "Honorarios arquitecto",
         "Honorarios maestro mayor de obras", "Honorarios agrimensor", "Honorarios agronomo",
         "Honorarios sistemas / IT", "Honorarios consultor", "Honorarios prensa",
         "Honorarios diseño grafico", "Honorarios psicologo", "Honorarios traductor",
         "Honorarios auditor externo", "Honorarios perito", "Honorarios mediador",
         "Honorarios otros profesionales"],
    ),
    (
        {"nombre": "Obras y servicios", "color": "#06b6d4", "icono": "HardHat",
         "descripcion": "Contratistas y mano de obra para obras"},
        ["Mano de obra albañileria", "Mano de obra plomeria", "Mano de obra electricidad",
         "Mano de obra herreria", "Mano de obra pintura", "Mano de obra carpinteria",
         "Mano de obra techista", "Mano de obra gas", "Mano de obra zinguero",
         "Contratista obra civil", "Contratista vialidad", "Contratista alumbrado",
         "Contratista riego", "Contratista cloacas", "Contratista desagües",
         "Contratista cordon cuneta", "Contratista pavimentacion", "Contratista demolicion",
         "Servicio de jardineria", "Servicio de limpieza"],
    ),
    (
        {"nombre": "Materiales e insumos", "color": "#10b981", "icono": "Package",
         "descripcion": "Compra de materiales, insumos, agroquimicos"},
        ["Cemento Portland", "Cal hidratada", "Arena", "Piedra", "Ladrillos cemento",
         "Ladrillos huecos", "Hierro construccion", "Madera", "Pintura latex", "Pintura sintetica",
         "Caños PVC", "Caños galvanizados", "Cable electrico", "Insumos ferreteria",
         "Herramientas manuales", "Insumos limpieza", "Agroquimicos", "Semillas",
         "Fertilizante", "Repuestos varios"],
    ),
    (
        {"nombre": "Equipamiento e inversiones", "color": "#0ea5e9", "icono": "Truck",
         "descripcion": "Compra de bienes durables: vehiculos, maquinaria, PCs"},
        ["Camion atmosferico", "Camion volcador", "Camion compactador", "Hidroelevador",
         "Tractor", "Retroexcavadora", "Motoniveladora", "Camioneta utilitaria",
         "Auto institucional", "Moto", "Bicicleta electrica", "Computadora desktop",
         "Notebook", "Impresora", "Mobiliario oficina", "Aire acondicionado",
         "Generador electrico", "Bomba de agua", "Equipamiento bomberos", "Equipamiento sala primeros auxilios"],
    ),
    (
        {"nombre": "Combustibles y movilidad", "color": "#ef4444", "icono": "Fuel",
         "descripcion": "Combustibles, mantenimiento vehiculos, viaticos"},
        ["Nafta super", "Nafta premium", "Gasoil", "GNC", "Aceite motor", "Filtros",
         "Lubricantes", "Mantenimiento vehicular", "Service general", "Cambio de neumaticos",
         "Alineacion y balanceo", "Mecanica general", "Lavadero", "Patente vehicular",
         "Seguro automotor", "Verificacion tecnica", "Viaticos personal",
         "Pasajes interurbanos", "Peajes", "Estacionamiento"],
    ),
    (
        {"nombre": "Servicios e impuestos", "color": "#71717a", "icono": "Receipt",
         "descripcion": "Servicios publicos e impuestos del muni"},
        ["Luz / energia electrica", "Agua corriente", "Gas natural", "Internet fibra",
         "Telefonia fija", "Telefonia movil", "Servicio limpieza urbana", "Recoleccion residuos",
         "Tasa municipal otra muni", "Impuesto inmobiliario", "Impuesto automotor",
         "Ingresos brutos", "Sellos provinciales", "Tasas nacionales", "AFIP / IVA",
         "ARBA / Rentas", "Cuota AySA", "Cuota ABL", "Tributos varios", "Multas administrativas"],
    ),
    (
        {"nombre": "Salud", "color": "#ec4899", "icono": "Heart",
         "descripcion": "Insumos medicos, medicamentos, traslados"},
        ["Medicamentos", "Insumos descartables", "Vacunas", "Reactivos lab",
         "Material curacion", "Oxigeno medicinal", "Traslado ambulancia",
         "Traslado a hospital", "Estudios complementarios", "Laboratorio",
         "Radiografias", "Ecografias", "Camilla / mobiliario sanitario",
         "Equipamiento odontologico", "Insumos veterinaria municipal",
         "Castracion mascotas", "Campaña sanitaria", "Pago a especialistas",
         "Convenio hospital regional", "Otros gastos sanitarios"],
    ),
    (
        {"nombre": "Educación", "color": "#22c55e", "icono": "BookOpen",
         "descripcion": "Apoyo a escuelas, becas, cooperadoras"},
        ["Beca estudiantil primaria", "Beca estudiantil secundaria", "Beca terciaria / universitaria",
         "Aporte cooperadora escuela", "Kit escolar", "Utiles escolares",
         "Libros / material didactico", "Mochilas", "Guardapolvos", "Zapatillas escolares",
         "Transporte escolar", "Refrigerio escolar", "Merienda reforzada",
         "Pago internado", "Apoyo escolar / tutorias", "Mantenimiento edificio escolar",
         "Pintura / refaccion escuela", "Equipamiento informatico escolar",
         "Capacitacion docente", "Premios estudiantes destacados"],
    ),
    (
        {"nombre": "Cultura, deporte y turismo", "color": "#a855f7", "icono": "Trophy",
         "descripcion": "Eventos culturales, deportivos y turisticos"},
        ["Fiesta patronal", "Fiesta del Pueblo", "Carnaval", "Acto patrio 25 de mayo",
         "Acto patrio 9 de julio", "Acto patrio 17 de agosto", "Festival folklorico",
         "Festival rock", "Peña tradicionalista", "Premios competencia deportiva",
         "Alquiler escenario", "Alquiler sonido", "Alquiler luminaria evento",
         "Sanitarios moviles", "Catering evento", "Premios concurso literario",
         "Taller cultural", "Curso de pintura / arte", "Promocion turistica",
         "Cartelera turistica"],
    ),
    (
        {"nombre": "Aportes y subsidios", "color": "#f97316", "icono": "HandHeart",
         "descripcion": "Ayudas economicas a entidades y vecinos"},
        ["Subsidio club deportivo", "Subsidio cooperadora", "Subsidio centro de jubilados",
         "Subsidio bomberos voluntarios", "Subsidio asociacion civil",
         "Aporte caja de jubilaciones", "Aporte sindical", "Ayuda social familia",
         "Ayuda alimentaria", "Modulo alimentario", "Pago de servicios a vecino",
         "Materiales construccion vivienda social", "Bolson de mercaderia",
         "Ayuda funeral", "Ayuda pasaje", "Ayuda medicamentos vecino",
         "Subsidio a centro de salud", "Subsidio a parroquia", "Aporte a iglesia evangelica",
         "Otros subsidios"],
    ),
    (
        {"nombre": "Publicidad y comunicación", "color": "#0891b2", "icono": "Megaphone",
         "descripcion": "Difusion oficial, prensa, papeleria"},
        ["Publicidad radio FM local", "Publicidad radio regional",
         "Publicidad red social Facebook", "Publicidad red social Instagram",
         "Publicidad TV regional", "Diseño grafico afiches",
         "Impresion folleteria", "Impresion volantes", "Imprenta papeleria oficial",
         "Imprenta talonarios", "Cartelero / cartelera publica", "Banner / lona",
         "Pintura mural informativo", "Pago a prensista", "Edicion video institucional",
         "Fotografia institucional", "Pago dominio web", "Hosting web",
         "Mantenimiento web", "Otros gastos prensa"],
    ),
    (
        {"nombre": "Préstamos", "color": "#dc2626", "icono": "Banknote",
         "descripcion": "Prestamos otorgados a vecinos o empleados"},
        ["Prestamo agrario", "Prestamo emprendedor", "Prestamo construccion",
         "Prestamo mejora vivienda", "Prestamo refaccion local comercial",
         "Prestamo herramientas", "Prestamo vehicular", "Prestamo salud",
         "Prestamo educacion", "Prestamo emergencia familiar",
         "Adelanto sueldo empleado", "Prestamo empleado mediano plazo",
         "Prestamo empleado largo plazo", "Prestamo electrodomestico empleado",
         "Reintegro prestamo (devolucion)", "Cancelacion anticipada",
         "Interes generado", "Ajuste indexacion", "Saldo a favor",
         "Otros prestamos"],
    ),
    (
        {"nombre": "Otros", "color": "#a3a3a3", "icono": "MoreHorizontal",
         "descripcion": "Imprevistos y no clasificados"},
        ["Caja chica", "Ajuste contable", "Diferencia de cambio",
         "Pago a determinar", "Reembolso", "Devolucion saldo",
         "Honorarios judiciales", "Multa recibida", "Gasto bancario",
         "Comision bancaria", "Costo de transferencia", "Sellado bancario",
         "Mantenimiento cuenta", "Chequera nueva", "Token bancario",
         "Servicio mercadopago", "Servicio gateway pago", "Otros bancarios",
         "Imprevisto", "Gasto sin clasificar"],
    ),
]


async def seed():
    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as db:
        r = await db.execute(select(Municipio).where(Municipio.codigo == SPN_CODIGO))
        muni = r.scalar_one_or_none()
        if not muni:
            print(f"[!] No existe municipio '{SPN_CODIGO}'")
            return
        muni_id = muni.id
        print(f"[*] Municipio SPN id={muni_id}\n")

        creados_tipos = 0
        creados_conceptos = 0
        salteados_tipos = 0

        for orden_tipo, (tipo_data, conceptos_list) in enumerate(DATA):
            # Buscar tipo existente
            q = await db.execute(
                select(TesoreriaTipoConcepto).where(
                    TesoreriaTipoConcepto.municipio_id == muni_id,
                    TesoreriaTipoConcepto.nombre == tipo_data["nombre"],
                )
            )
            tipo = q.scalar_one_or_none()
            if tipo:
                salteados_tipos += 1
                print(f"  [SKIP tipo] {tipo_data['nombre']} ya existe (id={tipo.id})")
                continue

            tipo = TesoreriaTipoConcepto(
                municipio_id=muni_id,
                nombre=tipo_data["nombre"],
                descripcion=tipo_data.get("descripcion"),
                color=tipo_data.get("color"),
                icono=tipo_data.get("icono"),
                orden=orden_tipo,
                activo=True,
            )
            db.add(tipo)
            await db.flush()
            creados_tipos += 1
            print(f"  [OK tipo] {tipo.nombre:35s} ({tipo.color}) id={tipo.id}")

            for orden_c, nombre_concepto in enumerate(conceptos_list):
                c = TesoreriaConcepto(
                    municipio_id=muni_id,
                    tipo_concepto_id=tipo.id,
                    nombre=nombre_concepto,
                    orden=orden_c,
                    activo=True,
                )
                db.add(c)
                creados_conceptos += 1
            print(f"    +{len(conceptos_list)} conceptos")

        await db.commit()

    await engine.dispose()
    print(f"\n[*] Resultado: {creados_tipos} tipos creados ({salteados_tipos} ya existian), {creados_conceptos} conceptos creados")


if __name__ == '__main__':
    asyncio.run(seed())
