"""
Script simple para asignar dependencias a solicitudes.
"""
import asyncio
import aiomysql

DATABASE_URL = "mysql+aiomysql://avnadmin:AVNS_Fqe0qsChCHnqSnVsvoi@mysql-aiven-arenazl.e.aivencloud.com:23108/sugerenciasmun"
MUNICIPIO_ID = 7

async def main():
    # Parsear URL
    # mysql+aiomysql://user:pass@host:port/db
    parts = DATABASE_URL.replace("mysql+aiomysql://", "").split("@")
    user_pass = parts[0].split(":")
    host_port_db = parts[1].split("/")
    host_port = host_port_db[0].split(":")

    conn = await aiomysql.connect(
        host=host_port[0],
        port=int(host_port[1]),
        user=user_pass[0],
        password=user_pass[1],
        db=host_port_db[1],
        autocommit=True
    )

    async with conn.cursor() as cur:
        print("=" * 60)
        print("ASIGNANDO DEPENDENCIAS A SOLICITUDES")
        print("=" * 60)

        # Contar sin dependencia
        await cur.execute("""
            SELECT COUNT(*) FROM solicitudes
            WHERE municipio_id = %s AND municipio_dependencia_id IS NULL
        """, (MUNICIPIO_ID,))
        sin_dep = (await cur.fetchone())[0]
        print(f"\nSolicitudes sin dependencia: {sin_dep}")

        # Update por tramite_id
        await cur.execute("""
            UPDATE solicitudes s
            JOIN municipio_dependencia_tramites mdt ON mdt.tramite_id = s.tramite_id
            SET s.municipio_dependencia_id = mdt.municipio_dependencia_id
            WHERE s.municipio_id = %s
            AND s.municipio_dependencia_id IS NULL
        """, (MUNICIPIO_ID,))
        updated1 = cur.rowcount
        print(f"Actualizadas por tramite_id: {updated1}")

        # Update por servicio_id
        await cur.execute("""
            UPDATE solicitudes s
            JOIN municipio_dependencia_tramites mdt ON mdt.tramite_id = s.servicio_id
            SET s.municipio_dependencia_id = mdt.municipio_dependencia_id
            WHERE s.municipio_id = %s
            AND s.municipio_dependencia_id IS NULL
        """, (MUNICIPIO_ID,))
        updated2 = cur.rowcount
        print(f"Actualizadas por servicio_id: {updated2}")

        # Verificar
        await cur.execute("""
            SELECT COUNT(*) FROM solicitudes
            WHERE municipio_id = %s AND municipio_dependencia_id IS NULL
        """, (MUNICIPIO_ID,))
        sin_dep_despues = (await cur.fetchone())[0]

        print(f"\n" + "=" * 60)
        print("RESUMEN")
        print("=" * 60)
        print(f"  Total actualizadas: {updated1 + updated2}")
        print(f"  Sin dependencia antes: {sin_dep}")
        print(f"  Sin dependencia después: {sin_dep_despues}")

    conn.close()
    print("\n[DONE]")

if __name__ == "__main__":
    asyncio.run(main())
