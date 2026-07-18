import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://lms:lms@localhost:5432/lms")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-CHANGE-IN-PROD-xZ7vQpL3mNw9KrTb")
    jwt_algorithm: str = "HS256"
    # Onda 6 — item 6.1: access token curto (era 7 dias) + refresh token de vida longa.
    # Renovação silenciosa no frontend (api.js) evita que o usuário sinta a diferença.
    jwt_expires_min: int = int(os.getenv("JWT_EXPIRES_MIN", "120"))  # 2h
    refresh_token_expires_days: int = int(os.getenv("REFRESH_TOKEN_EXPIRES_DAYS", "30"))
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    seed_on_startup: bool = os.getenv("SEED_ON_STARTUP", "true").lower() == "true"
    admin_password: str = os.getenv("ADMIN_PASSWORD", "napel2026")
    # SSO Clavis — aceita tokens vindos do Clavis (assinados com esse secret)
    # Nunca EMITE tokens com esse secret; só valida. Auto-provisiona user local no primeiro acesso.
    clavis_jwt_secret: str = os.getenv("CLAVIS_JWT_SECRET", "")

    class Config:
        env_file = ".env"


settings = Settings()
