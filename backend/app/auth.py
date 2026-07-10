from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from .config import settings
from .db import get_db
from .models import User, Enrollment, LearningPath, LearningPathCourse

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2 = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

# SSO Clavis: mapeamento cargo → papel LMS
# Cargos que dão acesso administrativo (matriz, ranking do time, atividades, criar cursos)
_CLAVIS_ADMIN_CARGOS = {
    "gerente", "gerente de loja", "supervisor", "supervisor de vendas",
    "rh", "proprietario", "proprietário", "diretor", "diretora",
}
# Cargos que ficam como aluno (padrão)
# Qualquer cargo não listado acima cai em Learner-Type


def _map_clavis_to_lms_type(clavis_role: str, cargo: Optional[str] = None) -> str:
    """Decide user_type do LMS a partir do papel/cargo vindos do Clavis."""
    if (clavis_role or "").lower() == "admin":
        return "SuperAdmin"  # Renato / admins do Clavis
    c = (cargo or "").strip().lower()
    if c in _CLAVIS_ADMIN_CARGOS:
        return "Admin"
    return "Learner-Type"


def _slug_login(name: str, email: str) -> str:
    """Gera login curto (só letras/números) — precisa ser único e caber em 64 chars."""
    base = (email.split("@")[0] if email else name).lower()
    return "".join(c for c in base if c.isalnum() or c in "._-")[:64]


def _initials(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    if not parts: return "?"
    if len(parts) == 1: return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _provision_from_clavis(db: Session, payload: dict) -> User:
    """Cria/atualiza user LMS local a partir do payload do JWT Clavis. Idempotente por email."""
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="JWT Clavis sem email")
    name_full = (payload.get("name") or email.split("@")[0].title()).strip()
    parts = name_full.split(" ", 1)
    first = parts[0]
    surname = parts[1] if len(parts) > 1 else ""
    cargo = payload.get("cargo") or payload.get("job_title")
    branch_code = str(payload.get("branch") or payload.get("filial") or "MGA").upper()[:16]
    lms_type = _map_clavis_to_lms_type(payload.get("role", ""), cargo)

    user = db.query(User).filter(User.email == email).first()
    if user:
        # Atualiza dados que podem ter mudado no Clavis (nome)
        if user.name != first: user.name = first
        if surname and user.surname != surname: user.surname = surname
        # Papel só é ajustado a partir de sinal confiável do Clavis:
        #  - role=admin no Clavis → SuperAdmin (sempre elevar);
        #  - cargo explícito no payload → recomputa o papel;
        #  - sem cargo e não-admin → preserva o papel atual (respeita Admin setado à mão).
        # O JWT do Clavis hoje NÃO carrega cargo, então elevações manuais p/ Admin persistem.
        if lms_type == "SuperAdmin":
            user.user_type = "SuperAdmin"
        elif cargo and user.user_type != "SuperAdmin" and user.user_type != lms_type:
            user.user_type = lms_type
        user.last_login = datetime.utcnow()
        db.commit()
        return user

    # Novo: cria user
    login = _slug_login(name_full, email)
    # se colidir, adiciona sufixo
    if db.query(User).filter(User.login == login).first():
        i = 2
        while db.query(User).filter(User.login == f"{login}{i}").first():
            i += 1
        login = f"{login}{i}"

    user = User(
        login=login, email=email, name=first, surname=surname,
        password_hash=pwd_ctx.hash("clavis-sso-sem-senha-local"),
        user_type=lms_type, branch=branch_code,
        avatar_initials=_initials(name_full),
        last_login=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _auto_enroll_mandatory(db, user.id)
    return user


# Trilha obrigatória de onboarding: todo funcionário provisionado via SSO
# entra nela no 1º acesso (regra Napel: novo funcionário = aluno automático).
_MANDATORY_PATH_CODE = "ACAD"


def _auto_enroll_mandatory(db: Session, user_id: int) -> None:
    """Matricula o user nos cursos da trilha obrigatória. Idempotente, best-effort:
    falha aqui nunca pode quebrar o login."""
    try:
        path = db.query(LearningPath).filter(LearningPath.code == _MANDATORY_PATH_CODE).first()
        if not path:
            return
        rows = db.query(LearningPathCourse).filter(LearningPathCourse.path_id == path.id).all()
        added = False
        for r in rows:
            exists = db.query(Enrollment).filter(
                Enrollment.user_id == user_id, Enrollment.course_id == r.course_id).first()
            if not exists:
                db.add(Enrollment(user_id=user_id, course_id=r.course_id, role="Estudante"))
                added = True
        if added:
            db.commit()
    except Exception:
        db.rollback()


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_ctx.verify(plain, hashed)
    except Exception:
        return False


def make_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "login": user.login,
        "role": user.user_type,
        "exp": datetime.utcnow() + timedelta(minutes=settings.jwt_expires_min),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _decode_dual(token: str) -> dict:
    """Dual-mode decode:
    1) Se CLAVIS_JWT_SECRET setado, tenta decodificar como token do Clavis (SSO)
       → payload marcado com _source='clavis' para auto-provisionar.
    2) Fallback: decodifica como token local do LMS.
    Nunca EMITE token com o secret do Clavis — só valida.
    """
    if settings.clavis_jwt_secret:
        try:
            payload = jwt.decode(token, settings.clavis_jwt_secret, algorithms=[settings.jwt_algorithm])
            payload["_source"] = "clavis"
            return payload
        except JWTError:
            pass
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    payload["_source"] = "local"
    return payload


def current_user(token: Optional[str] = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    try:
        payload = _decode_dual(token)
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")

    # SSO Clavis: auto-provisiona user local pelo email do payload
    if payload.get("_source") == "clavis":
        return _provision_from_clavis(db, payload)

    # Local: lookup por sub (user_id)
    try:
        user_id = int(payload.get("sub", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")
    user = db.query(User).filter(User.id == user_id, User.status == "active").first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found or inactive")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.user_type not in ("SuperAdmin", "Admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")
    return user
