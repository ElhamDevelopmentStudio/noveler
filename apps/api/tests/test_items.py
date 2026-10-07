def test_list_items(client):
    client.post(
        "/api/v1/items",
        json={"title": "List Test", "description": "Desc", "status": "published"},
    )
    response = client.get("/api/v1/items")
    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert "items" in payload["data"]
    assert len(payload["data"]["items"]) >= 1


def test_create_and_get_item(client):
    new_item = {
        "title": "Automated Test Item",
        "description": "Created via pytest",
        "status": "published",
    }
    response = client.post("/api/v1/items", json=new_item)
    assert response.status_code == 201
    created = response.json()
    assert created["success"] is True
    item_id = created["data"]["id"]
    assert created["data"]["title"] == "Automated Test Item"

    # Fetch it
    get_res = client.get(f"/api/v1/items/{item_id}")
    assert get_res.status_code == 200
    assert get_res.json()["data"]["id"] == item_id
