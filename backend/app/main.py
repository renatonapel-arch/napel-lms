from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from . import models, schemas
from .config import settings
from .db import get_db, engine, Base, SessionLocal
from .auth import current_user, require_admin, make_token, verify_password, hash_password
from .models import User, Course, Unit, Enrollment, Progress, Badge, UserBadge

# garante tabelas existem (idempotente em prod)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Napel LMS API",
    description="Demo API · clone funcional TalentLMS",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")] if settings.cors_origins != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ ADMIN DANGER ZONE ============
@app.post("/api/admin/reset-database")
def reset_database(token: str, keep_admin: bool = True, db: Session = Depends(get_db)):
    """
    Apaga TODOS os dados do banco. Re-cria schema vazio.
    Se keep_admin=true (default), recria APENAS o user 'renato' (SuperAdmin) com senha do ADMIN_PASSWORD.
    Senão, banco fica totalmente vazio e você não conseguirá logar.

    Proteção: ?token={ADMIN_PASSWORD}
    """
    if token != settings.admin_password:
        raise HTTPException(403, "token inválido")

    db.close()
    # drop e recria via metadata
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    if keep_admin:
        new_db = SessionLocal()
        try:
            from .auth import hash_password
            admin = User(
                login="renato",
                email="renatonapel@gmail.com",
                name="Renato",
                surname="Formagio Parra",
                password_hash=hash_password(settings.admin_password),
                user_type="SuperAdmin",
                branch="MGA",
                avatar_initials="R",
                level=1,
                points=0,
            )
            new_db.add(admin)
            new_db.commit()
            new_db.refresh(admin)
            return {
                "status": "reset_ok",
                "message": "Banco zerado. Único user restante: 'renato' (SuperAdmin).",
                "admin_login": "renato",
                "admin_password_hint": "use o ADMIN_PASSWORD do env",
                "admin_id": admin.id,
            }
        finally:
            new_db.close()
    return {"status": "reset_ok_empty", "message": "Banco completamente vazio. Ninguém pode logar."}


# ============ HEALTH ============
@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "db": db_ok,
        "ts": datetime.utcnow().isoformat(),
        "version": app.version,
    }


# ============ AUTH ============
@app.post("/api/auth/login", response_model=schemas.TokenOut)
def login(data: schemas.LoginIn, db: Session = Depends(get_db)):
    # aceita login OU email
    user = db.query(User).filter(
        (User.login == data.login) | (User.email == data.login)
    ).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Login ou senha incorretos")
    if user.status != "active":
        raise HTTPException(403, "Usuário inativo")
    user.last_login = datetime.utcnow()
    db.commit()
    return schemas.TokenOut(access_token=make_token(user), user=schemas.UserOut.model_validate(user))


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(user: User = Depends(current_user)):
    return user


# ============ USERS ============
@app.get("/api/users", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(User).order_by(User.points.desc()).all()


@app.get("/api/users/{user_id}", response_model=schemas.UserDetail)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "user not found")
    detail = schemas.UserDetail.model_validate(user)
    # enrich enrollments with progress
    enrolls = db.query(Enrollment).filter(Enrollment.user_id == user_id).all()
    detail.enrollments = []
    for e in enrolls:
        pct = compute_course_progress(db, user_id, e.course_id)
        eo = schemas.EnrollmentOut.model_validate(e)
        eo.progress_pct = pct
        detail.enrollments.append(eo)
    # badges
    user_badges = db.query(UserBadge).filter(UserBadge.user_id == user_id).join(Badge).all()
    detail.badges = []
    for ub in user_badges:
        bo = schemas.BadgeOut.model_validate(ub.badge)
        bo.earned_at = ub.earned_at
        detail.badges.append(bo)
    return detail


@app.post("/api/users", response_model=schemas.UserOut, status_code=201)
def create_user(data: schemas.UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(User).filter((User.login == data.login) | (User.email == data.email)).first():
        raise HTTPException(409, "login ou email já existe")
    user = User(
        login=data.login, email=data.email, name=data.name, surname=data.surname,
        password_hash=hash_password(data.password), user_type=data.user_type, branch=data.branch,
        avatar_initials=(data.name[:1] + (data.surname[:1] if data.surname else "")).upper() or "?",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ============ COURSES ============
def course_out_with_counts(db: Session, course: Course) -> schemas.CourseOut:
    out = schemas.CourseOut.model_validate(course)
    out.units_count = db.query(func.count(Unit.id)).filter(Unit.course_id == course.id).scalar() or 0
    out.enrollments_count = db.query(func.count(Enrollment.id)).filter(Enrollment.course_id == course.id).scalar() or 0
    return out


@app.get("/api/courses", response_model=List[schemas.CourseOut])
def list_courses(status: Optional[str] = None, db: Session = Depends(get_db), _: User = Depends(current_user)):
    q = db.query(Course)
    if status:
        q = q.filter(Course.status == status)
    courses = q.order_by(Course.created_at.desc()).all()
    return [course_out_with_counts(db, c) for c in courses]


@app.get("/api/courses/{course_id}", response_model=schemas.CourseDetail)
def get_course(course_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    course = db.query(Course).options(joinedload(Course.units)).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "course not found")
    detail = schemas.CourseDetail.model_validate(course)
    detail.units_count = len(course.units)
    detail.enrollments_count = db.query(func.count(Enrollment.id)).filter(Enrollment.course_id == course_id).scalar() or 0
    if course.instructor_id:
        detail.instructor = schemas.UserOut.model_validate(db.query(User).get(course.instructor_id))
    return detail


@app.post("/api/courses", response_model=schemas.CourseOut, status_code=201)
def create_course(data: schemas.CourseCreate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    course = Course(**data.model_dump(), instructor_id=user.id)
    db.add(course)
    db.commit()
    db.refresh(course)
    return course_out_with_counts(db, course)


@app.patch("/api/courses/{course_id}", response_model=schemas.CourseOut)
def update_course(course_id: int, data: schemas.CourseUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "course not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(course, k, v)
    db.commit()
    db.refresh(course)
    return course_out_with_counts(db, course)


@app.delete("/api/courses/{course_id}", status_code=204)
def delete_course(course_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "course not found")
    db.delete(course)
    db.commit()


# ============ UNITS ============
@app.get("/api/courses/{course_id}/units", response_model=List[schemas.UnitOut])
def list_units(course_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(Unit).filter(Unit.course_id == course_id).order_by(Unit.order_index).all()


@app.get("/api/units/{unit_id}", response_model=schemas.UnitOut)
def get_unit(unit_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(404, "unit not found")
    return unit


@app.post("/api/courses/{course_id}/units", response_model=schemas.UnitOut, status_code=201)
def add_unit(course_id: int, data: schemas.UnitCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    last = db.query(func.max(Unit.order_index)).filter(Unit.course_id == course_id).scalar() or 0
    unit = Unit(course_id=course_id, order_index=last + 1, **data.model_dump())
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


# ============ ENROLLMENTS ============
def compute_course_progress(db: Session, user_id: int, course_id: int) -> int:
    units = db.query(Unit).filter(Unit.course_id == course_id).all()
    if not units:
        return 0
    completed = db.query(func.count(Progress.id)).filter(
        Progress.user_id == user_id,
        Progress.unit_id.in_([u.id for u in units]),
        Progress.completion_pct >= 100
    ).scalar() or 0
    return int(round(completed * 100 / len(units)))


@app.post("/api/enrollments", response_model=schemas.EnrollmentOut, status_code=201)
def enroll_me(data: schemas.EnrollmentMe, db: Session = Depends(get_db), user: User = Depends(current_user)):
    existing = db.query(Enrollment).filter(
        Enrollment.user_id == user.id, Enrollment.course_id == data.course_id
    ).first()
    if existing:
        raise HTTPException(409, "já matriculado")
    e = Enrollment(user_id=user.id, course_id=data.course_id, role="Estudante")
    db.add(e)
    db.commit()
    db.refresh(e)
    out = schemas.EnrollmentOut.model_validate(e)
    out.progress_pct = 0
    return out


@app.get("/api/users/me/enrollments", response_model=List[schemas.EnrollmentOut])
def my_enrollments(db: Session = Depends(get_db), user: User = Depends(current_user)):
    enrolls = db.query(Enrollment).filter(Enrollment.user_id == user.id).all()
    out = []
    for e in enrolls:
        eo = schemas.EnrollmentOut.model_validate(e)
        eo.progress_pct = compute_course_progress(db, user.id, e.course_id)
        out.append(eo)
    return out


@app.delete("/api/enrollments/{enroll_id}", status_code=204)
def remove_enroll(enroll_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    e = db.query(Enrollment).filter(Enrollment.id == enroll_id).first()
    if not e:
        raise HTTPException(404, "not found")
    # learner pode remover própria matrícula, admin pode remover qualquer
    if e.user_id != user.id and user.user_type not in ("SuperAdmin", "Admin"):
        raise HTTPException(403, "forbidden")
    db.delete(e)
    db.commit()


@app.patch("/api/enrollments/{enroll_id}", response_model=schemas.EnrollmentOut)
def update_enroll_role(enroll_id: int, data: schemas.EnrollmentRoleUpdate,
                       db: Session = Depends(get_db), _: User = Depends(require_admin)):
    e = db.query(Enrollment).filter(Enrollment.id == enroll_id).first()
    if not e:
        raise HTTPException(404, "not found")
    if data.role not in ("Professor", "Estudante", "Trainer"):
        raise HTTPException(400, "invalid role")
    e.role = data.role
    db.commit()
    db.refresh(e)
    out = schemas.EnrollmentOut.model_validate(e)
    out.progress_pct = compute_course_progress(db, e.user_id, e.course_id)
    return out


# matrícula em nome de outro user (admin enrola alguém)
@app.post("/api/enrollments/admin", response_model=schemas.EnrollmentOut, status_code=201)
def enroll_user_as_admin(data: schemas.EnrollmentCreate, db: Session = Depends(get_db),
                         _: User = Depends(require_admin)):
    existing = db.query(Enrollment).filter(
        Enrollment.user_id == data.user_id, Enrollment.course_id == data.course_id
    ).first()
    if existing:
        raise HTTPException(409, "já matriculado")
    e = Enrollment(user_id=data.user_id, course_id=data.course_id, role=data.role)
    db.add(e); db.commit(); db.refresh(e)
    out = schemas.EnrollmentOut.model_validate(e)
    out.progress_pct = 0
    return out


# ============ USERS (extras) ============
@app.patch("/api/users/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, data: schemas.UserUpdate, db: Session = Depends(get_db),
                user: User = Depends(current_user)):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "user not found")
    # admin pode editar qualquer; user pode editar a si mesmo (name/surname/email só)
    is_admin = user.user_type in ("SuperAdmin", "Admin")
    is_self = user.id == user_id
    if not (is_admin or is_self):
        raise HTTPException(403, "forbidden")
    updates = data.model_dump(exclude_unset=True)
    if not is_admin:
        for k in ("user_type", "branch", "status"):
            updates.pop(k, None)
    for k, v in updates.items():
        setattr(target, k, v)
    db.commit(); db.refresh(target)
    return target


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if user_id == user.id:
        raise HTTPException(400, "não pode deletar a si mesmo")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(404, "user not found")
    db.delete(target); db.commit()


# ============ QUIZ ============
@app.post("/api/units/{unit_id}/quiz-answer", response_model=schemas.QuizAnswerOut)
def submit_quiz_answer(unit_id: int, q_idx: int, data: schemas.QuizAnswerIn,
                       db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Submete UMA resposta de quiz. q_idx = índice da pergunta (0-based)."""
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit or unit.type != "quiz":
        raise HTTPException(404, "quiz unit not found")
    questions = (unit.content or {}).get("questions", [])
    if q_idx < 0 or q_idx >= len(questions):
        raise HTTPException(400, f"q_idx fora de range (0..{len(questions)-1})")
    q = questions[q_idx]
    correct_idx = q.get("correct", -1)
    is_correct = data.selected_idx == correct_idx

    # acumula score na coluna data do Progress (sessão simples — não persiste por questão)
    prog = db.query(Progress).filter(Progress.user_id == user.id, Progress.unit_id == unit_id).first()
    if not prog:
        prog = Progress(user_id=user.id, unit_id=unit_id, data={})
        db.add(prog)
    if not isinstance(prog.data, dict):
        prog.data = {}
    answers = prog.data.get("answers", {})
    answers[str(q_idx)] = {"selected": data.selected_idx, "correct": is_correct}
    prog.data = {**prog.data, "answers": answers}

    # score atual
    total = len(questions)
    answered = len(answers)
    correct_count = sum(1 for a in answers.values() if a.get("correct"))
    score_pct = int(round(correct_count * 100 / total)) if total else 0
    passing = (unit.content or {}).get("passing_score", 70)

    # se respondeu todas, finaliza unit
    earned = 0
    next_uid = None
    passed = False
    if answered >= total:
        passed = score_pct >= passing
        prog.score = score_pct
        if passed:
            prog.completion_pct = 100
            from datetime import datetime as _dt
            if not prog.completed_at:
                prog.completed_at = _dt.utcnow()
            earned = 25 + (50 if score_pct == 100 else 0)
            user.points = (user.points or 0) + earned
            # próxima unit
            nxt = db.query(Unit).filter(
                Unit.course_id == unit.course_id, Unit.order_index > unit.order_index
            ).order_by(Unit.order_index).first()
            next_uid = nxt.id if nxt else None
            # se foi a última, marca enrollment como completo
            if not next_uid:
                enr = db.query(Enrollment).filter(
                    Enrollment.user_id == user.id, Enrollment.course_id == unit.course_id
                ).first()
                if enr and not enr.completed_at:
                    from datetime import datetime as _dt2
                    enr.completed_at = _dt2.utcnow()
                    user.points = (user.points or 0) + 150  # bônus
                    grant_badge_if_missing(db, user.id, "Quiz Master")
    db.commit()

    return schemas.QuizAnswerOut(
        correct=is_correct,
        correct_idx=correct_idx,
        explanation=q.get("explanation"),
        score_pct=score_pct,
        passed=passed,
        earned_points=earned,
        next_unit_id=next_uid,
    )


# ============ NAVIGATION ============
@app.get("/api/courses/{course_id}/units/{unit_id}/next")
def get_next_unit(course_id: int, unit_id: int, db: Session = Depends(get_db),
                  _: User = Depends(current_user)):
    cur = db.query(Unit).filter(Unit.id == unit_id, Unit.course_id == course_id).first()
    if not cur:
        return {"next_unit_id": None, "prev_unit_id": None}
    nxt = db.query(Unit).filter(
        Unit.course_id == course_id, Unit.order_index > cur.order_index
    ).order_by(Unit.order_index).first()
    prv = db.query(Unit).filter(
        Unit.course_id == course_id, Unit.order_index < cur.order_index
    ).order_by(Unit.order_index.desc()).first()
    return {"next_unit_id": nxt.id if nxt else None, "prev_unit_id": prv.id if prv else None}


# ============ PROGRESS ============
@app.post("/api/progress", response_model=schemas.ProgressOut)
def post_progress(data: schemas.ProgressIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    unit = db.query(Unit).filter(Unit.id == data.unit_id).first()
    if not unit:
        raise HTTPException(404, "unit not found")
    p = db.query(Progress).filter(Progress.user_id == user.id, Progress.unit_id == data.unit_id).first()
    if not p:
        p = Progress(user_id=user.id, unit_id=data.unit_id)
        db.add(p)
    p.completion_pct = max(p.completion_pct or 0, data.completion_pct)
    if data.score is not None:
        p.score = data.score
    if p.completion_pct >= 100 and not p.completed_at:
        p.completed_at = datetime.utcnow()
        # ganha pontos
        if unit.type == "quiz":
            user.points += 25
        elif unit.type == "video":
            user.points += 25
        else:
            user.points += 10
    # se todas as units do curso concluídas, marca enrollment.completed_at + bonus
    pct = compute_course_progress(db, user.id, unit.course_id)
    if pct >= 100:
        enroll = db.query(Enrollment).filter(
            Enrollment.user_id == user.id, Enrollment.course_id == unit.course_id
        ).first()
        if enroll and not enroll.completed_at:
            enroll.completed_at = datetime.utcnow()
            user.points += 150  # bônus curso completo
            # auto-grant badge Quiz Master se foi quiz
            grant_badge_if_missing(db, user.id, "Quiz Master")
    db.commit()
    db.refresh(p)
    return p


def grant_badge_if_missing(db: Session, user_id: int, badge_name: str):
    badge = db.query(Badge).filter(Badge.name == badge_name).first()
    if not badge:
        return
    exists = db.query(UserBadge).filter(UserBadge.user_id == user_id, UserBadge.badge_id == badge.id).first()
    if not exists:
        db.add(UserBadge(user_id=user_id, badge_id=badge.id))
        user = db.query(User).get(user_id)
        if user:
            user.points += badge.points


# ============ LEADERBOARD ============
@app.get("/api/leaderboard", response_model=List[schemas.LeaderboardRow])
def leaderboard(limit: int = 50, db: Session = Depends(get_db), _: User = Depends(current_user)):
    users = db.query(User).filter(User.status == "active").order_by(User.points.desc()).limit(limit).all()
    rows = []
    for rank, u in enumerate(users, start=1):
        badges_n = db.query(func.count(UserBadge.id)).filter(UserBadge.user_id == u.id).scalar() or 0
        rows.append(schemas.LeaderboardRow(
            user_id=u.id, name=u.name, surname=u.surname, avatar_initials=u.avatar_initials,
            branch=u.branch, points=u.points, level=u.level, badges_count=badges_n, rank=rank,
        ))
    return rows


# ============ BADGES ============
@app.get("/api/users/{user_id}/badges", response_model=List[schemas.BadgeOut])
def user_badges(user_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    ubs = db.query(UserBadge).filter(UserBadge.user_id == user_id).join(Badge).all()
    out = []
    for ub in ubs:
        bo = schemas.BadgeOut.model_validate(ub.badge)
        bo.earned_at = ub.earned_at
        out.append(bo)
    return out


@app.get("/api/badges", response_model=List[schemas.BadgeOut])
def all_badges(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(Badge).all()


# ============ DASHBOARD ============
@app.get("/api/dashboard/overview")
def dashboard_overview(db: Session = Depends(get_db), _: User = Depends(current_user)):
    total_users = db.query(func.count(User.id)).filter(User.status == "active").scalar() or 0
    total_courses = db.query(func.count(Course.id)).filter(Course.status == "active").scalar() or 0
    total_enrolls = db.query(func.count(Enrollment.id)).scalar() or 0
    completed = db.query(func.count(Enrollment.id)).filter(Enrollment.completed_at.isnot(None)).scalar() or 0
    pct = round(completed * 100 / total_enrolls, 2) if total_enrolls else 0
    return {
        "users_active": total_users,
        "courses_total": total_courses,
        "enrollments_total": total_enrolls,
        "completion_rate": pct,
        "groups_total": 0,
        "training_time_h": completed * 1.2,  # mock
    }


# ============ DASHBOARD EXTRAS ============
@app.get("/api/dashboard/timeline")
def dashboard_timeline(limit: int = 10, db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Eventos recentes: logins + cursos completos + badges ganhas, ordenado por data."""
    from datetime import datetime as _dt
    events = []
    # logins recentes (últimos 30d)
    recent_logins = db.query(User).filter(User.last_login.isnot(None)).order_by(User.last_login.desc()).limit(limit).all()
    for u in recent_logins:
        events.append({
            "ts": u.last_login.isoformat() if u.last_login else None,
            "kind": "login",
            "actor_initials": u.avatar_initials,
            "actor_name": f"{u.name} {u.surname}".strip(),
            "actor_id": u.id,
            "text": "entrou no portal",
        })
    # cursos concluídos
    completed = db.query(Enrollment).filter(Enrollment.completed_at.isnot(None)).order_by(Enrollment.completed_at.desc()).limit(limit).all()
    for e in completed:
        u = db.query(User).get(e.user_id)
        c = db.query(Course).get(e.course_id)
        if not u or not c: continue
        events.append({
            "ts": e.completed_at.isoformat(),
            "kind": "course_completed",
            "actor_initials": u.avatar_initials,
            "actor_name": f"{u.name} {u.surname}".strip(),
            "actor_id": u.id,
            "text": f"concluiu o curso \"{c.name}\"",
        })
    # badges ganhas
    badges_earned = db.query(UserBadge).order_by(UserBadge.earned_at.desc()).limit(limit).all()
    for ub in badges_earned:
        u = db.query(User).get(ub.user_id)
        b = db.query(Badge).get(ub.badge_id)
        if not u or not b: continue
        events.append({
            "ts": ub.earned_at.isoformat(),
            "kind": "badge_earned",
            "actor_initials": u.avatar_initials,
            "actor_name": f"{u.name} {u.surname}".strip(),
            "actor_id": u.id,
            "text": f"desbloqueou a badge \"{b.name}\"",
        })
    events.sort(key=lambda e: e["ts"] or "", reverse=True)
    return events[:limit]


@app.get("/api/dashboard/portal-activity")
def portal_activity(days: int = 7, db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Logins + cursos concluídos por dia, últimos N dias."""
    from datetime import datetime as _dt, timedelta as _td
    today = _dt.utcnow().date()
    out = []
    for i in range(days - 1, -1, -1):
        d = today - _td(days=i)
        start = _dt(d.year, d.month, d.day)
        end = start + _td(days=1)
        logins = db.query(func.count(User.id)).filter(User.last_login >= start, User.last_login < end).scalar() or 0
        completed = db.query(func.count(Enrollment.id)).filter(Enrollment.completed_at >= start, Enrollment.completed_at < end).scalar() or 0
        out.append({
            "date": d.isoformat(),
            "day_short": d.strftime("%a"),
            "day_num": d.day,
            "logins": logins,
            "completed": completed,
        })
    return out


@app.get("/api/dashboard/top-courses")
def top_courses(limit: int = 5, db: Session = Depends(get_db), _: User = Depends(current_user)):
    """Cursos com mais matrículas."""
    rows = (
        db.query(Course, func.count(Enrollment.id).label("n"))
        .outerjoin(Enrollment, Enrollment.course_id == Course.id)
        .filter(Course.status == "active")
        .group_by(Course.id)
        .order_by(func.count(Enrollment.id).desc())
        .limit(limit)
        .all()
    )
    total_users = db.query(func.count(User.id)).filter(User.status == "active").scalar() or 1
    return [{
        "id": c.id, "name": c.name, "category": c.category, "icon": c.icon,
        "enrollments": int(n), "pct": int(round(n * 100 / total_users)),
    } for c, n in rows]


# ============ COURSE STATS ============
@app.get("/api/courses/{course_id}/stats")
def course_stats(course_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    enrolls = db.query(Enrollment).filter(Enrollment.course_id == course_id).all()
    total = len(enrolls)
    completed = sum(1 for e in enrolls if e.completed_at)
    units = db.query(Unit).filter(Unit.course_id == course_id).all()
    # nota média (de progress.score nas units quiz desse curso)
    unit_ids = [u.id for u in units]
    scores = db.query(Progress.score).filter(
        Progress.unit_id.in_(unit_ids), Progress.score.isnot(None)
    ).all() if unit_ids else []
    avg_score = round(sum(s[0] for s in scores) / len(scores), 1) if scores else None
    # tempo médio (estimativa via duration_min)
    duration_total = sum(u.duration_min for u in units)
    return {
        "matriculados": total,
        "concluiram": completed,
        "taxa_conclusao_pct": int(round(completed * 100 / total)) if total else 0,
        "nota_media": avg_score,
        "duracao_min": duration_total,
        "units_count": len(units),
    }


# ============ MATRIX ============
@app.get("/api/reports/training-matrix")
def training_matrix(db: Session = Depends(get_db), _: User = Depends(current_user)):
    users = db.query(User).filter(User.status == "active").order_by(User.name).all()
    courses = db.query(Course).filter(Course.status == "active").order_by(Course.created_at).all()
    cells = {}
    for u in users:
        cells[u.id] = {}
        for c in courses:
            enroll = db.query(Enrollment).filter(
                Enrollment.user_id == u.id, Enrollment.course_id == c.id
            ).first()
            if not enroll:
                cells[u.id][c.id] = "empty"
            elif enroll.completed_at:
                cells[u.id][c.id] = "completed"
            else:
                pct = compute_course_progress(db, u.id, c.id)
                if pct == 0:
                    cells[u.id][c.id] = "empty"
                elif pct < 50:
                    cells[u.id][c.id] = "started"
                else:
                    cells[u.id][c.id] = "in_progress"
    return {
        "users": [{"id": u.id, "name": f"{u.name} {u.surname}".strip(), "branch": u.branch} for u in users],
        "courses": [{"id": c.id, "name": c.name, "code": c.code} for c in courses],
        "cells": cells,
    }
