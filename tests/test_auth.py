"""
Tests de autenticación: registro, login y acceso.
"""
import pytest
from httpx import AsyncClient


class TestRegister:
    """Tests para el endpoint de registro."""

    async def test_register_success(self, client: AsyncClient):
        """Registro exitoso con datos válidos."""
        response = await client.post("/api/auth/register", json={
            "email": "vecino@test.com",
            "password": "password123",
            "nombre": "Juan",
            "apellido": "Pérez",
            "telefono": "1122334455",
            "dni": "12345678"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "vecino@test.com"
        assert data["nombre"] == "Juan"
        assert data["apellido"] == "Pérez"
        assert data["rol"] == "vecino"
        assert data["activo"] == True
        assert "id" in data
        assert "password" not in data
        assert "password_hash" not in data

    async def test_register_duplicate_email(self, client: AsyncClient):
        """No permite registrar email duplicado."""
        user_data = {
            "email": "duplicado@test.com",
            "password": "password123",
            "nombre": "Test",
            "apellido": "User"
        }
        
        # Primer registro - éxito
        response1 = await client.post("/api/auth/register", json=user_data)
        assert response1.status_code == 200
        
        # Segundo registro - falla
        response2 = await client.post("/api/auth/register", json=user_data)
        assert response2.status_code == 400
        assert "email ya está registrado" in response2.json()["detail"].lower()

    async def test_register_invalid_email(self, client: AsyncClient):
        """Rechaza email inválido."""
        response = await client.post("/api/auth/register", json={
            "email": "no-es-email",
            "password": "password123",
            "nombre": "Test",
            "apellido": "User"
        })
        
        assert response.status_code == 422  # Validation error

    async def test_register_missing_required_fields(self, client: AsyncClient):
        """Rechaza si faltan campos requeridos."""
        response = await client.post("/api/auth/register", json={
            "email": "test@test.com",
            "password": "password123"
            # Falta nombre y apellido
        })
        
        assert response.status_code == 422

    async def test_register_optional_fields(self, client: AsyncClient):
        """Registro exitoso sin campos opcionales."""
        response = await client.post("/api/auth/register", json={
            "email": "minimal@test.com",
            "password": "password123",
            "nombre": "Test",
            "apellido": "User"
            # Sin telefono, dni, direccion
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["telefono"] is None
        assert data["dni"] is None


class TestLogin:
    """Tests para el endpoint de login."""

    async def test_login_success(self, client: AsyncClient):
        """Login exitoso con credenciales válidas."""
        # Primero registrar usuario
        await client.post("/api/auth/register", json={
            "email": "login@test.com",
            "password": "password123",
            "nombre": "Test",
            "apellido": "User"
        })
        
        # Login
        response = await client.post("/api/auth/login", data={
            "username": "login@test.com",
            "password": "password123"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "login@test.com"

    async def test_login_wrong_password(self, client: AsyncClient):
        """Login falla con contraseña incorrecta."""
        # Registrar usuario
        await client.post("/api/auth/register", json={
            "email": "wrongpass@test.com",
            "password": "password123",
            "nombre": "Test",
            "apellido": "User"
        })
        
        # Login con contraseña incorrecta
        response = await client.post("/api/auth/login", data={
            "username": "wrongpass@test.com",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401
        assert "incorrecto" in response.json()["detail"].lower()

    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Login falla con usuario inexistente."""
        response = await client.post("/api/auth/login", data={
            "username": "noexiste@test.com",
            "password": "password123"
        })
        
        assert response.status_code == 401

    async def test_login_inactive_user(self, client: AsyncClient, db_session):
        """Login falla si usuario está inactivo."""
        from models.user import User
        from core.security import get_password_hash
        
        # Crear usuario inactivo directamente en BD
        user = User(
            email="inactivo@test.com",
            password_hash=get_password_hash("password123"),
            nombre="Inactivo",
            apellido="User",
            activo=False
        )
        db_session.add(user)
        await db_session.commit()
        
        # Intentar login
        response = await client.post("/api/auth/login", data={
            "username": "inactivo@test.com",
            "password": "password123"
        })
        
        assert response.status_code == 400
        assert "inactivo" in response.json()["detail"].lower()


class TestMe:
    """Tests para el endpoint /me (usuario actual)."""

    async def test_me_authenticated(self, client: AsyncClient):
        """Obtener usuario actual con token válido."""
        # Registrar y login
        await client.post("/api/auth/register", json={
            "email": "me@test.com",
            "password": "password123",
            "nombre": "Me",
            "apellido": "User"
        })
        
        login_response = await client.post("/api/auth/login", data={
            "username": "me@test.com",
            "password": "password123"
        })
        token = login_response.json()["access_token"]
        
        # Obtener /me
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "me@test.com"

    async def test_me_no_token(self, client: AsyncClient):
        """Acceso denegado sin token."""
        response = await client.get("/api/auth/me")
        
        assert response.status_code == 401

    async def test_me_invalid_token(self, client: AsyncClient):
        """Acceso denegado con token inválido."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer token-invalido"}
        )
        
        assert response.status_code == 401
