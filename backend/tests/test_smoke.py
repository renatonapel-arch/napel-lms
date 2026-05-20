"""Smoke tests — roda contra SQLite em memória."""
import os
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET"] = "test"
os.environ["SEED_ON_STARTUP"] = "false"

from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine, SessionLocal
from app.seed import seed_all

Base.metadata.create_all(bind=engine)
db = SessionLocal()
seed_all(db, force=True)
db.close()

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_and_courses():
    # login
    r = client.post("/api/auth/login", json={"login": "renato", "password": "napel2026"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    # courses
    r = client.get("/api/courses", headers=h)
    assert r.status_code == 200
    courses = r.json()
    assert len(courses) >= 6
    # leaderboard
    r = client.get("/api/leaderboard", headers=h)
    assert r.status_code == 200
    rows = r.json()
    assert rows[0]["rank"] == 1


def test_progress_grants_points():
    r = client.post("/api/auth/login", json={"login": "gabriel", "password": "napel2026"})
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    courses = client.get("/api/courses", headers=h).json()
    unit_id = client.get(f"/api/courses/{courses[0]['id']}/units", headers=h).json()[0]["id"]
    before = client.get("/api/auth/me", headers=h).json()["points"]
    r = client.post("/api/progress", json={"unit_id": unit_id, "completion_pct": 100}, headers=h)
    assert r.status_code == 200
    after = client.get("/api/auth/me", headers=h).json()["points"]
    assert after > before
