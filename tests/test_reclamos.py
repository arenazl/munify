"""
Tests de CRUD de reclamos.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.categoria import Categoria
from models.user import User
from models.enums import RolUsuario, EstadoReclamo
from core.security import get_password_hash


async def create_categoria(db: AsyncSession, nombre: str = "Alumbrado") -> Categoria:
    """Crear categoria de prueba."""
    categoria = Categoria(
        nombre=nombre,
        descripcion=f"Categoria {nombre}",
        icono="lightbulb",
        color="#FFD700"
    )
    db.add(categoria)
    await db.commit()
    await db.refresh(categoria)
    return categoria


async def create_user_with_role(db: AsyncSession, email: str, rol: RolUsuario) -> User:
    """Crear usuario con rol especifico."""
    user = User(
        email=email,
        password_hash=get_password_hash("password123"),
        nombre="Test",
        apellido="User",
        rol=rol
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_token(client: AsyncClient, email: str) -> str:
    """Obtener token de un usuario."""
    response = await client.post("/api/auth/login", data={
        "username": email,
        "password": "password123"
    })
    return response.json()["access_token"]


class TestCreateReclamo:
    """Tests para crear reclamos."""

    async def test_create_reclamo_success(self, client: AsyncClient, db_session: AsyncSession):
        """Crear reclamo exitosamente."""
        categoria = await create_categoria(db_session)
        
        await client.post("/api/auth/register", json={
            "email": "vecino_reclamo@test.com",
            "password": "password123",
            "nombre": "Vecino",
            "apellido": "Test"
        })
        token = await get_token(client, "vecino_reclamo@test.com")
        
        response = await client.post(
            "/api/reclamos/",
            json={
                "titulo": "Luz quemada en esquina",
                "descripcion": "La luminaria de la esquina no funciona hace 3 dias",
                "direccion": "Av. San Martin 100",
                "latitud": -34.5875,
                "longitud": -58.4156,
                "categoria_id": categoria.id
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["titulo"] == "Luz quemada en esquina"
        assert data["estado"] == "nuevo"
        assert data["categoria"]["id"] == categoria.id

    async def test_create_reclamo_no_auth(self, client: AsyncClient, db_session: AsyncSession):
        """No se puede crear reclamo sin autenticacion."""
        categoria = await create_categoria(db_session, "Bacheo")
        
        response = await client.post("/api/reclamos/", json={
            "titulo": "Test",
            "descripcion": "Test descripcion",
            "direccion": "Test direccion",
            "categoria_id": categoria.id
        })
        
        assert response.status_code == 401


class TestGetReclamos:
    """Tests para listar reclamos."""

    async def test_get_mis_reclamos(self, client: AsyncClient, db_session: AsyncSession):
        """Vecino solo ve sus propios reclamos."""
        categoria = await create_categoria(db_session, "Limpieza")
        
        await client.post("/api/auth/register", json={
            "email": "vecino1@test.com",
            "password": "password123",
            "nombre": "Vecino1",
            "apellido": "Test"
        })
        await client.post("/api/auth/register", json={
            "email": "vecino2@test.com",
            "password": "password123",
            "nombre": "Vecino2",
            "apellido": "Test"
        })
        
        token1 = await get_token(client, "vecino1@test.com")
        token2 = await get_token(client, "vecino2@test.com")
        
        await client.post(
            "/api/reclamos/",
            json={
                "titulo": "Reclamo de vecino 1",
                "descripcion": "Descripcion",
                "direccion": "Direccion 1",
                "categoria_id": categoria.id
            },
            headers={"Authorization": f"Bearer {token1}"}
        )
        
        await client.post(
            "/api/reclamos/",
            json={
                "titulo": "Reclamo de vecino 2",
                "descripcion": "Descripcion",
                "direccion": "Direccion 2",
                "categoria_id": categoria.id
            },
            headers={"Authorization": f"Bearer {token2}"}
        )
        
        response1 = await client.get(
            "/api/reclamos/mis-reclamos",
            headers={"Authorization": f"Bearer {token1}"}
        )
        assert response1.status_code == 200
        reclamos1 = response1.json()
        assert len(reclamos1) == 1
        assert reclamos1[0]["titulo"] == "Reclamo de vecino 1"

    async def test_get_reclamo_not_found(self, client: AsyncClient):
        """404 si el reclamo no existe."""
        await client.post("/api/auth/register", json={
            "email": "vecino_404@test.com",
            "password": "password123",
            "nombre": "Vecino",
            "apellido": "Test"
        })
        token = await get_token(client, "vecino_404@test.com")
        
        response = await client.get(
            "/api/reclamos/99999",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 404


class TestUpdateReclamo:
    """Tests para actualizar reclamos."""

    async def test_update_reclamo_success(self, client: AsyncClient, db_session: AsyncSession):
        """Actualizar reclamo propio en estado NUEVO."""
        categoria = await create_categoria(db_session, "Arbolado")
        
        await client.post("/api/auth/register", json={
            "email": "vecino_update@test.com",
            "password": "password123",
            "nombre": "Vecino",
            "apellido": "Test"
        })
        token = await get_token(client, "vecino_update@test.com")
        
        create_response = await client.post(
            "/api/reclamos/",
            json={
                "titulo": "Titulo original",
                "descripcion": "Descripcion original",
                "direccion": "Direccion",
                "categoria_id": categoria.id
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        reclamo_id = create_response.json()["id"]
        
        response = await client.put(
            f"/api/reclamos/{reclamo_id}",
            json={
                "titulo": "Titulo actualizado",
                "descripcion": "Descripcion actualizada"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        assert response.json()["titulo"] == "Titulo actualizado"
