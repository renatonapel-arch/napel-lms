"""Startup script — cria tabelas e seed inicial. Executa antes do uvicorn."""
import time
import sys
from sqlalchemy.exc import OperationalError
from .db import engine, Base, SessionLocal
from .config import settings
from . import models  # registra tabelas
from .seed import seed_all


def wait_db(max_tries=30):
    for i in range(max_tries):
        try:
            with engine.connect() as c:
                c.execute(__import__("sqlalchemy").text("SELECT 1"))
            print(f"[startup] DB OK na tentativa {i+1}")
            return True
        except OperationalError as e:
            print(f"[startup] aguardando DB (tentativa {i+1}/{max_tries})...")
            time.sleep(2)
    print("[startup] FALHA: DB não respondeu")
    return False


def main():
    if not wait_db():
        sys.exit(1)
    print("[startup] criando tabelas...")
    Base.metadata.create_all(bind=engine)
    if settings.seed_on_startup:
        print("[startup] seed...")
        db = SessionLocal()
        try:
            seed_all(db)
        finally:
            db.close()
    print("[startup] OK")


if __name__ == "__main__":
    main()
