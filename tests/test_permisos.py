"""
Tests de permisos por rol.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.categoria import Categoria
from models.cuadrilla import Cuadrilla
from models.user import User
from models.enums import RolUsuario
from core.security import get_password_hash


async def create_categoria(db: AsyncSession) -> Categoria:
    categoria = Categoria(
        nombre="Test Categoria Permisos",
        descripcion="Para tests",
        icono="test",
        color="#000000"
    )
    db.add(categoria)
    await db.commit()
    await db.refresh(categoria)
    return categoria


async def create_cuadrilla(db: AsyncSession) -> Cuadrilla:
    cuadrilla = Cuadrilla(nombre="Cuadrilla Test Permisos", activo=True)
    db.add(cuadrilla)
    await db.commit()
    await db.refresh(cuadrilla)
    return cuadrilla


async def create_user(db: AsyncSession, email: str, rol: RolUsuario, cuadrilla_id: int = None) -> User:
    user = User(
        email=email,
        password_hash=get_password_hash("password123"),
        nombre="Test",
        apellido="User",
        rol=rol,
        cuadrilla_id=cuadrilla_id
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_token(client: AsyncClient, email: str) -> str:
    response = await client.post("/api/auth/login", data={
        "username": email,
        "password": "password123"
    })
    return response.json()["access_token"]


class TestVecinoPermisos:
    """Tests de permisos para rol VECINO."""

    async def test_vecino_no_puede_asignar(self, client: AsyncClient, db_session: AsyncSession):
        """Vecino no puede asignar reclamos."""
        categoria = await create_categoria(db_session)
        cuadrilla = await create_cuadrilla(db_session)

        await client.post("/api/auth/register", json={
            "email": "vecino_asignar@test.com",
            "password": "password123",
            "nombre": "Vecino",
            "apellido": "Test"
        })
        token = await get_token(client, "vecino_asignar@test.com")

        create_response = await client.post(
            "/api/reclamos/",
            json={
                "titulo": "Test",
                "descripcion": "Descripcion",
                "direccion": "Direccion",
                "categoria_id": categoria.id
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        reclamo_id = create_response.json()["id"]

        response = await client.post(
            f"/api/reclamos/{reclamo_id}/asignar",
            json={"cuadrilla_id": cuadrilla.id},
            headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == 403


class TestSupervisorPermisos:
    """Tests de permisos para rol SUPERVISOR."""

    async def test_supervisor_puede_asignar(self, client: AsyncClient, db_session: AsyncSession):
        """Supervisor puede asignar reclamos."""
        categoria = await create_categoria(db_session)
        cuadrilla = await create_cuadrilla(db_session)
        await create_user(db_session, "supervisor@test.com", RolUsuario.SUPERVISOR)

        await client.post("/api/auth/register", json={
            "email": "vecino_sup@test.com",
            "password": "password123",
            "nombre": "Vecino",
            "apellido": "Test"
        })
        token_vecino = await get_token(client, "vecino_sup@test.com")

        create_response = await client.post(
            "/api/reclamos/",
            json={
                "titulo": "Para asignar",
                "descripcion": "Descripcion",
                "direccion": "Direccion",
                "categoria_id": categoria.id
            },
            headers={"Authorization": f"Bearer {token_vecino}"}
        )
        reclamo_id = create_response.json()["id"]

        token_sup = await get_token(client, "supervisor@test.com")
        response = await client.post(
            f"/api/reclamos/{reclamo_id}/asignar",
            json={"cuadrilla_id": cuadrilla.id},
            headers={"Authorization": f"Bearer {token_sup}"}
        )

        assert response.status_code == 200
        assert response.json()["estado"] == "asignado"


class TestAdminPermisos:
    """Tests de permisos para rol ADMIN."""

    async def test_admin_puede_crear_categorias(self, client: AsyncClient, db_session: AsyncSession):
        """Admin puede crear categorias."""
        await create_user(db_session, "admin@test.com", RolUsuario.ADMIN)

        token_admin = await get_token(client, "admin@test.com")

        response = await client.post(
            "/api/categorias/",
            json={
                "nombre": "Nueva Categoria Admin",
                "descripcion": "Creada por admin"
            },
            headers={"Authorization": f"Bearer {token_admin}"}
        )
        assert response.status_code == 200
