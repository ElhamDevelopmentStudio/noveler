from novelova_core.exceptions import NotFoundError
from novelova_core.models import ApiResponse
from novelova_core.utils import slugify


def test_slugify():
    assert slugify("Hello World!") == "hello-world"
    assert slugify("FastAPI & React Monorepo") == "fastapi-react-monorepo"


def test_api_response_envelope():
    resp = ApiResponse[dict](data={"item": 1}, message="Success")
    assert resp.success is True
    assert resp.data == {"item": 1}
    assert resp.message == "Success"
    assert resp.timestamp is not None


def test_exceptions():
    err = NotFoundError("Item not found", details={"id": 123})
    assert err.code == "NOT_FOUND"
    assert err.details == {"id": 123}
