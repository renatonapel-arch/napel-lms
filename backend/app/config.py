import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://lms:lms@localhost:5432/lms")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-CHANGE-IN-PROD-xZ7vQpL3mNw9KrTb")
    jwt_algorithm: str = "HS256"
    jwt_expires_min: int = 60 * 24 * 7  # 7 dias
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    seed_on_startup: bool = os.getenv("SEED_ON_STARTUP", "true").lower() == "true"
    admin_password: str = os.getenv("ADMIN_PASSWORD", "napel2026")
    # SSO Clavis — aceita tokens vindos do Clavis (assinados com esse secret)
    # Nunca EMITE tokens com esse secret; só valida. Auto-provisiona user local no primeiro acesso.
    clavis_jwt_secret: str = os.getenv("CLAVIS_JWT_SECRET", "")

    class Config:
        env_file = ".env"


settings = Settings()
