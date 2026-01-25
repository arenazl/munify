"""
Catálogo de dependencias por defecto para municipios.

Estas dependencias son templates globales que los municipios pueden habilitar.
Son independientes del municipio (sin municipio_id).
"""

from typing import List, Dict, Any

# Catálogo de dependencias típicas de un municipio argentino
DEPENDENCIAS_DEFAULT: List[Dict[str, Any]] = [
    {
        "nombre": "Dirección de Atención al Vecino",
        "codigo": "ATENCION_VECINO",
        "descripcion": "Área encargada de recibir, registrar y derivar los reclamos realizados por los vecinos, actuando como punto central de contacto entre la ciudadanía y las distintas áreas municipales.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 16:00",
        "tipo_gestion": "RECLAMO",
        "orden": 1,
    },
    {
        "nombre": "Secretaría de Obras Públicas",
        "codigo": "OBRAS_PUBLICAS",
        "descripcion": "Responsable del mantenimiento y mejora de la infraestructura urbana, atendiendo reclamos relacionados con calles, veredas, obras municipales y el estado general del espacio público.",
        "horario_atencion": "Lunes a Viernes de 7:00 a 15:00",
        "tipo_gestion": "AMBOS",
        "orden": 2,
    },
    {
        "nombre": "Secretaría de Servicios Públicos y Ambiente",
        "codigo": "SERVICIOS_PUBLICOS",
        "descripcion": "Área encargada de la prestación y control de los servicios urbanos esenciales, incluyendo limpieza, recolección de residuos, mantenimiento de espacios verdes y salubridad ambiental.",
        "horario_atencion": "Lunes a Viernes de 7:00 a 14:00",
        "tipo_gestion": "RECLAMO",
        "orden": 3,
    },
    {
        "nombre": "Dirección de Tránsito y Seguridad Vial",
        "codigo": "TRANSITO_VIAL",
        "descripcion": "Dependencia responsable de la organización y control del tránsito, atendiendo reclamos vinculados a semáforos, señalización vial y situaciones que afecten la seguridad en la circulación.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 14:00",
        "tipo_gestion": "RECLAMO",
        "orden": 4,
    },
    {
        "nombre": "Secretaría de Seguridad",
        "codigo": "SEGURIDAD",
        "descripcion": "Área dedicada a la prevención y coordinación de acciones de seguridad urbana, atendiendo reclamos que no constituyen emergencias y que requieren intervención municipal preventiva.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 18:00",
        "tipo_gestion": "RECLAMO",
        "orden": 5,
    },
    {
        "nombre": "Dirección de Zoonosis y Salud Animal",
        "codigo": "ZOONOSIS",
        "descripcion": "Dependencia encargada del control sanitario animal y la atención de reclamos relacionados con animales sueltos, heridos o situaciones que afecten la convivencia y la salud pública.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 14:00",
        "tipo_gestion": "RECLAMO",
        "orden": 6,
    },
    {
        "nombre": "Dirección de Catastro",
        "codigo": "CATASTRO",
        "descripcion": "Área encargada del registro y administración de los inmuebles del partido, gestionando trámites de subdivisión, unificación, mensuras y regularización dominial.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 14:00",
        "tipo_gestion": "TRAMITE",
        "orden": 7,
    },
    {
        "nombre": "Dirección de Rentas",
        "codigo": "RENTAS",
        "descripcion": "Responsable de la administración tributaria municipal, gestionando el cobro de tasas, contribuciones y demás tributos municipales.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 14:00",
        "tipo_gestion": "TRAMITE",
        "orden": 8,
    },
    {
        "nombre": "Dirección de Habilitaciones Comerciales",
        "codigo": "HABILITACIONES",
        "descripcion": "Área encargada de otorgar y controlar las habilitaciones para el funcionamiento de comercios, industrias y actividades económicas en el distrito.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 14:00",
        "tipo_gestion": "TRAMITE",
        "orden": 9,
    },
    {
        "nombre": "Dirección de Obras Particulares",
        "codigo": "OBRAS_PARTICULARES",
        "descripcion": "Dependencia que gestiona los permisos de construcción, ampliación y refacción de inmuebles privados, controlando el cumplimiento de las normas de edificación.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 14:00",
        "tipo_gestion": "TRAMITE",
        "orden": 10,
    },
    {
        "nombre": "Dirección de Bromatología",
        "codigo": "BROMATOLOGIA",
        "descripcion": "Área responsable del control sanitario de alimentos y establecimientos gastronómicos, velando por la salud pública y la seguridad alimentaria.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 14:00",
        "tipo_gestion": "AMBOS",
        "orden": 11,
    },
    {
        "nombre": "Secretaría de Desarrollo Social",
        "codigo": "DESARROLLO_SOCIAL",
        "descripcion": "Área dedicada a la asistencia y promoción social, gestionando programas de ayuda a sectores vulnerables y trámites de asistencia social.",
        "horario_atencion": "Lunes a Viernes de 8:00 a 14:00",
        "tipo_gestion": "TRAMITE",
        "orden": 12,
    },
]


async def seed_dependencias_default(db) -> int:
    """
    Carga las dependencias por defecto en la base de datos.
    Solo crea las que no existen (por código).

    Returns:
        Cantidad de dependencias creadas
    """
    from sqlalchemy import select
    from models import Dependencia, TipoGestionDependencia

    creadas = 0

    for dep_data in DEPENDENCIAS_DEFAULT:
        # Verificar si ya existe
        result = await db.execute(
            select(Dependencia).where(Dependencia.codigo == dep_data["codigo"])
        )
        existing = result.scalar_one_or_none()

        if existing:
            continue

        # Convertir tipo_gestion a enum
        tipo_gestion = TipoGestionDependencia(dep_data["tipo_gestion"])

        dependencia = Dependencia(
            nombre=dep_data["nombre"],
            codigo=dep_data["codigo"],
            descripcion=dep_data["descripcion"],
            horario_atencion=dep_data.get("horario_atencion"),
            tipo_gestion=tipo_gestion,
            orden=dep_data.get("orden", 0),
            activo=True,
        )

        db.add(dependencia)
        creadas += 1

    await db.commit()
    return creadas


async def habilitar_dependencias_para_municipio(db, municipio_id: int, dependencia_ids: List[int] = None) -> int:
    """
    Habilita dependencias para un municipio específico.
    Si no se especifican IDs, habilita todas las activas.

    Returns:
        Cantidad de dependencias habilitadas
    """
    from sqlalchemy import select
    from models import Dependencia, MunicipioDependencia

    # Obtener dependencias a habilitar
    if dependencia_ids:
        query = select(Dependencia).where(
            Dependencia.id.in_(dependencia_ids),
            Dependencia.activo == True
        )
    else:
        query = select(Dependencia).where(Dependencia.activo == True)

    result = await db.execute(query)
    dependencias = result.scalars().all()

    habilitadas = 0

    for dep in dependencias:
        # Verificar si ya está habilitada
        existing = await db.execute(
            select(MunicipioDependencia).where(
                MunicipioDependencia.municipio_id == municipio_id,
                MunicipioDependencia.dependencia_id == dep.id
            )
        )
        if existing.scalar_one_or_none():
            continue

        muni_dep = MunicipioDependencia(
            municipio_id=municipio_id,
            dependencia_id=dep.id,
            activo=True,
            orden=dep.orden,
        )
        db.add(muni_dep)
        habilitadas += 1

    await db.commit()
    return habilitadas
