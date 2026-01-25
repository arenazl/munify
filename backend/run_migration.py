"""
Migración: Agregar columnas de ubicación a direcciones
"""
import pymysql

conn = pymysql.connect(
    host='mysql-aiven-arenazl.e.aivencloud.com',
    port=23108,
    user='avnadmin',
    password='AVNS_Fqe0qsChCHnqSnVsvoi',
    database='sugerenciasmun',
    ssl={'ssl': {}}
)

with conn.cursor() as cur:
    migrations = [
        ("direccion", "VARCHAR(300) NULL"),
        ("localidad", "VARCHAR(100) NULL"),
        ("codigo_postal", "VARCHAR(20) NULL"),
        ("latitud", "DOUBLE NULL"),
        ("longitud", "DOUBLE NULL"),
    ]

    for col_name, col_def in migrations:
        try:
            cur.execute(f"ALTER TABLE direcciones ADD COLUMN {col_name} {col_def}")
            print(f"+ {col_name}")
        except pymysql.err.OperationalError as e:
            if e.args[0] == 1060:  # Duplicate column
                print(f"= {col_name} (ya existe)")
            else:
                print(f"! {col_name}: {e}")

    conn.commit()
    cur.execute("DESCRIBE direcciones")
    print("\nColumnas:")
    for row in cur.fetchall():
        print(f"  {row[0]}")

conn.close()
print("\nListo!")
