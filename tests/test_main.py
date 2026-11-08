from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert "Visor de diagramas Mermaid" in response.text
    assert "Diagrama de flujo" in response.text
    assert "Mapa mental" in response.text
    assert "Línea de tiempo" in response.text

def test_read_diagram():
    response = client.get("/diagrams/flowchart/045")
    assert response.status_code == 200
    assert "Ingeniería de sistemas" in response.text
