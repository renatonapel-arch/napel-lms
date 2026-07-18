from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey, DateTime, Boolean, JSON, UniqueConstraint, Numeric
)
from sqlalchemy.orm import relationship
from .db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    login = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    surname = Column(String(120), default="")
    password_hash = Column(String(255), nullable=False)
    user_type = Column(String(32), default="Learner-Type")  # SuperAdmin | Admin | Instructor | Learner-Type
    branch = Column(String(16), default="MGA")  # MGA | LEM | PTA
    level = Column(Integer, default=1)
    points = Column(Integer, default=0)
    status = Column(String(16), default="active")
    avatar_initials = Column(String(4), default="?")
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    enrollments = relationship("Enrollment", back_populates="user", cascade="all, delete-orphan")
    progress = relationship("Progress", back_populates="user", cascade="all, delete-orphan")
    user_badges = relationship("UserBadge", back_populates="user", cascade="all, delete-orphan")


class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(String(32), unique=True, nullable=True)
    category = Column(String(64), default="Geral")
    description = Column(Text, default="")
    status = Column(String(16), default="active")  # active | draft | archived
    instructor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    thumbnail_seed = Column(Integer, default=1)
    icon = Column(String(32), default="book-open")
    # config avançada
    price_amount = Column(Numeric(10, 2), default=0)
    price_currency = Column(String(8), default="BRL")
    capacity = Column(Integer, nullable=True)
    is_hidden = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)
    ai_coach = Column(Boolean, default=False)
    issue_certificate = Column(Boolean, default=True)
    certificate_min_score = Column(Integer, default=70)  # nota média mínima p/ emitir certificado
    sequential = Column(Boolean, default=False)  # trava aula N+1 até concluir N (ajuste 3)
    created_at = Column(DateTime, default=datetime.utcnow)

    units = relationship("Unit", back_populates="course", cascade="all, delete-orphan", order_by="Unit.order_index")
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")


class Unit(Base):
    __tablename__ = "units"
    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False)
    type = Column(String(16), nullable=False)  # video|text|quiz|scorm|pdf|assignment|audio
    title = Column(String(255), nullable=False)
    duration_min = Column(Integer, default=5)
    section = Column(String(64), nullable=True)  # agrupador exibido no course-detail (ex: "Semana 1 — Casa e Língua")
    content = Column(JSON, default=dict)  # video_url, text_md, quiz questions, etc.
    __table_args__ = (UniqueConstraint("course_id", "order_index", name="uq_unit_order"),)

    course = relationship("Course", back_populates="units")


class Enrollment(Base):
    __tablename__ = "enrollments"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(16), default="Estudante")  # Estudante | Professor | Trainer
    enrolled_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    __table_args__ = (UniqueConstraint("user_id", "course_id", name="uq_enroll"),)

    user = relationship("User", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")


class Progress(Base):
    __tablename__ = "progress"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    unit_id = Column(Integer, ForeignKey("units.id", ondelete="CASCADE"), nullable=False, index=True)
    completion_pct = Column(Integer, default=0)
    completed_at = Column(DateTime, nullable=True)
    score = Column(Integer, nullable=True)  # quiz score
    data = Column(JSON, default=dict)  # respostas por pergunta do quiz
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (UniqueConstraint("user_id", "unit_id", name="uq_progress"),)

    user = relationship("User", back_populates="progress")


class Badge(Base):
    __tablename__ = "badges"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False, unique=True)
    description = Column(Text, default="")
    category = Column(String(32), default="activity")  # activity|learning|test|certification
    icon = Column(String(32), default="award")
    points = Column(Integer, default=50)


class UserBadge(Base):
    __tablename__ = "user_badges"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    badge_id = Column(Integer, ForeignKey("badges.id", ondelete="CASCADE"), nullable=False, index=True)
    earned_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("user_id", "badge_id", name="uq_user_badge"),)

    user = relationship("User", back_populates="user_badges")
    badge = relationship("Badge")


# ============ NOVOS MODELS (R3) ============
class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), unique=True, nullable=False)
    description = Column(Text, default="")
    category = Column(String(80), default="")
    status = Column(String(16), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)


class Certificate(Base):
    __tablename__ = "certificates"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(32), unique=True, nullable=False)  # ex: NAPEL-2026-AB12CD
    issued_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("user_id", "course_id", name="uq_certificate"),)


class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    name = Column(String(64), unique=True, nullable=False)
    slug = Column(String(64), unique=True, nullable=False)
    color = Column(String(16), default="#7DA4C6")
    created_at = Column(DateTime, default=datetime.utcnow)


class GroupUser(Base):
    __tablename__ = "group_users"
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    added_at = Column(DateTime, default=datetime.utcnow)


class GroupCourse(Base):
    __tablename__ = "group_courses"
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    unit_id = Column(Integer, ForeignKey("units.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_number = Column(Integer, nullable=False)
    score_pct = Column(Integer, nullable=False)
    passed = Column(Boolean, default=False)
    answers = Column(JSON, default=dict)  # {q_idx: selected_idx}
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String(64), primary_key=True)
    value = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============ LEARNING PATHS (L3) ============
class LearningPath(Base):
    __tablename__ = "learning_paths"
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(String(32), unique=True, nullable=True)
    description = Column(Text, default="")
    category = Column(String(64), default="Geral")
    status = Column(String(16), default="active")  # active | draft
    sequential = Column(Boolean, default=True)  # trava próximo curso até concluir o anterior
    icon = Column(String(32), default="route")
    created_at = Column(DateTime, default=datetime.utcnow)


class LearningPathCourse(Base):
    __tablename__ = "learning_path_courses"
    id = Column(Integer, primary_key=True)
    path_id = Column(Integer, ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False)
    __table_args__ = (
        UniqueConstraint("path_id", "course_id", name="uq_path_course"),
        UniqueConstraint("path_id", "order_index", name="uq_path_order"),
    )


class PathCertificate(Base):
    __tablename__ = "path_certificates"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    path_id = Column(Integer, ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(32), unique=True, nullable=False)
    issued_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("user_id", "path_id", name="uq_path_certificate"),)


# ============ NOTIFICAÇÕES (Onda 2 — item 2.1) ============
class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(32), default="info")  # certificate|badge|level_up|message|info
    title = Column(String(255), nullable=False)
    body = Column(Text, default="")
    link = Column(String(255), nullable=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ============ MENSAGENS (Onda 2 — item 2.2) ============
class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    from_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    to_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    subject = Column(String(255), default="")
    body = Column(Text, default="")
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ============ AUTH — REFRESH TOKEN (Onda 6 — item 6.1) ============
class RefreshToken(Base):
    """Refresh token opaco (não-JWT) — permite renovar o access token sem novo login
    e permite revogação server-side (logout / reset de senha). Token guardado em texto
    puro (não é senha, não passa por bcrypt): é um segredo aleatório de 256 bits,
    equivalente em força a uma session key — padrão comum p/ refresh tokens."""
    __tablename__ = "refresh_tokens"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class PasswordResetToken(Base):
    """Token de 'esqueci minha senha' — TTL curto (30min), uso único."""
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    email_sent_at = Column(DateTime, nullable=True)
