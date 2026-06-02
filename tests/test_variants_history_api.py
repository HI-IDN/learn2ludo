from fastapi.testclient import TestClient

import server


def test_variants_history_endpoint_returns_curated_variants():
    with TestClient(server.app) as client:
        response = client.get("/api/variants/history")
    assert response.status_code == 200
    payload = response.json()
    assert payload["timeline_start"] == 500
    assert isinstance(payload["variants"], list)
    assert payload["variants"]
    first = payload["variants"][0]
    assert "id" in first
    assert "coordinates" in first
