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


def migrate_add_columns():
    """Adiciona colunas novas em tabelas existentes (idempotente, Postgres 9.6+)."""
    from sqlalchemy import text as _text
    mig = [
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS price_amount NUMERIC(10,2) DEFAULT 0",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS price_currency VARCHAR(8) DEFAULT 'BRL'",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS capacity INTEGER",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS ai_coach BOOLEAN DEFAULT FALSE",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS issue_certificate BOOLEAN DEFAULT TRUE",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS certificate_min_score INTEGER DEFAULT 70",
        "ALTER TABLE courses ADD COLUMN IF NOT EXISTS sequential BOOLEAN DEFAULT FALSE",
        "ALTER TABLE units ADD COLUMN IF NOT EXISTS section VARCHAR(64)",
        "ALTER TABLE progress ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE categories ADD COLUMN IF NOT EXISTS color VARCHAR(16) DEFAULT '#7DA4C6'",
        "ALTER TABLE groups ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT ''",
        # Onda 6 — item 6.3: rastreio de e-mail transacional enviado
        "ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP",
        "ALTER TABLE certificates ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMP",
    ]
    with engine.connect() as c:
        for sql in mig:
            try:
                c.execute(_text(sql))
                c.commit()
            except Exception as e:
                print(f"[migrate] skip: {sql[:60]}... ({e})")


def main():
    if not wait_db():
        sys.exit(1)
    print("[startup] criando tabelas...")
    Base.metadata.create_all(bind=engine)
    print("[startup] migrate add columns...")
    migrate_add_columns()
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
