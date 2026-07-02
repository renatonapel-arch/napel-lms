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
from .models import User, Course, Unit, Enrollment, Progress, Badge, UserBadge, Certificate, Category, GroupUser, GroupCourse, QuizAttempt, Setting

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


@app.patch("/api/units/{unit_id}", response_model=schemas.UnitOut)
def update_unit(unit_id: int, data: schemas.UnitUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(404, "unit not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(unit, k, v)
    db.commit(); db.refresh(unit)
    return unit


@app.delete("/api/units/{unit_id}", status_code=204)
def delete_unit(unit_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(404, "unit not found")
    db.delete(unit); db.commit()


@app.patch("/api/courses/{course_id}/units/reorder")
def reorder_units(course_id: int, items: List[schemas.UnitReorderItem], db: Session = Depends(get_db), _: User = Depends(require_admin)):
    for it in items:
        unit = db.query(Unit).filter(Unit.id == it.id, Unit.course_id == course_id).first()
        if unit:
            unit.order_index = it.order_index
    db.commit()
    return {"status": "ok", "count": len(items)}


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


def compute_course_grade(db: Session, user_id: int, course_id: int):
    """Nota consolidada = média das notas de quiz do curso. None se não há quiz respondido."""
    quiz_units = db.query(Unit).filter(Unit.course_id == course_id, Unit.type == "quiz").all()
    if not quiz_units:
        return None
    scores = db.query(Progress.score).filter(
        Progress.user_id == user_id,
        Progress.unit_id.in_([u.id for u in quiz_units]),
        Progress.score.isnot(None),
    ).all()
    if not scores:
        return None
    return int(round(sum(s[0] for s in scores) / len(scores)))


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


# matrícula em massa de vários users num curso
@app.post("/api/courses/{course_id}/enroll-bulk")
def bulk_enroll_course(course_id: int, data: schemas.BulkEnrollIn, db: Session = Depends(get_db),
                       _: User = Depends(require_admin)):
    added = 0; skipped = 0
    for uid in data.user_ids:
        existing = db.query(Enrollment).filter(
            Enrollment.user_id == uid, Enrollment.course_id == course_id
        ).first()
        if existing:
            skipped += 1; continue
        db.add(Enrollment(user_id=uid, course_id=course_id, role=data.role))
        added += 1
    db.commit()
    return {"added": added, "skipped": skipped}


@app.get("/api/courses/{course_id}/enrollments", response_model=List[schemas.EnrollmentOut])
def list_course_enrollments(course_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    enrolls = db.query(Enrollment).filter(Enrollment.course_id == course_id).all()
    out = []
    for e in enrolls:
        eo = schemas.EnrollmentOut.model_validate(e)
        eo.progress_pct = compute_course_progress(db, e.user_id, course_id)
        out.append(eo)
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

    # acumula respostas na coluna data do Progress
    from sqlalchemy.orm.attributes import flag_modified
    prog = db.query(Progress).filter(Progress.user_id == user.id, Progress.unit_id == unit_id).first()
    if not prog:
        prog = Progress(user_id=user.id, unit_id=unit_id, data={})
        db.add(prog)
        db.flush()
    base = dict(prog.data) if isinstance(prog.data, dict) else {}
    answers = dict(base.get("answers", {}))          # cópia nova (não muta in-place)
    answers[str(q_idx)] = {"selected": data.selected_idx, "correct": is_correct}
    base["answers"] = answers
    prog.data = base                                  # reatribui objeto novo
    flag_modified(prog, "data")                       # força SQLAlchemy a persistir o JSON

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
    attempts_used = db.query(func.count(QuizAttempt.id)).filter(
        QuizAttempt.user_id == user.id, QuizAttempt.unit_id == unit_id
    ).scalar() or 0
    max_attempts = (unit.content or {}).get("max_attempts", 3)
    if answered >= total:
        passed = score_pct >= passing
        prog.score = score_pct
        # registra a tentativa (aprovado ou não)
        from datetime import datetime as _dtq
        db.add(QuizAttempt(
            user_id=user.id, unit_id=unit_id, attempt_number=attempts_used + 1,
            score_pct=score_pct, passed=passed, answers=answers, completed_at=_dtq.utcnow(),
        ))
        if passed:
            prog.completion_pct = 100
            if not prog.completed_at:
                prog.completed_at = _dtq.utcnow()
            earned = 25 + (50 if score_pct == 100 else 0)
            user.points = (user.points or 0) + earned
            nxt = db.query(Unit).filter(
                Unit.course_id == unit.course_id, Unit.order_index > unit.order_index
            ).order_by(Unit.order_index).first()
            next_uid = nxt.id if nxt else None
            # completou o curso? checa se TODAS as units estão concluídas (não só quiz final)
            db.flush()  # garante que o completion_pct=100 do quiz esteja visível na query abaixo
            course_pct = compute_course_progress(db, user.id, unit.course_id)
            if course_pct >= 100:
                enr = db.query(Enrollment).filter(
                    Enrollment.user_id == user.id, Enrollment.course_id == unit.course_id
                ).first()
                if enr and not enr.completed_at:
                    enr.completed_at = _dtq.utcnow()
                    user.points = (user.points or 0) + 150
                    grant_badge_if_missing(db, user.id, "Quiz Master")
                    _maybe_issue_certificate(db, user.id, unit.course_id)
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


@app.post("/api/units/{unit_id}/quiz-reset")
def quiz_reset(unit_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Refazer quiz: limpa respostas se ainda há tentativas disponíveis."""
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.type == "quiz").first()
    if not unit:
        raise HTTPException(404, "quiz não encontrado")
    max_attempts = (unit.content or {}).get("max_attempts", 3)
    used = db.query(func.count(QuizAttempt.id)).filter(
        QuizAttempt.user_id == user.id, QuizAttempt.unit_id == unit_id
    ).scalar() or 0
    if used >= max_attempts:
        raise HTTPException(403, f"Sem tentativas restantes ({used}/{max_attempts})")
    prog = db.query(Progress).filter(Progress.user_id == user.id, Progress.unit_id == unit_id).first()
    if prog:
        prog.data = {}
        prog.score = None
        prog.completion_pct = 0
        prog.completed_at = None
        db.commit()
    return {"status": "reset", "attempts_used": used, "max_attempts": max_attempts, "remaining": max_attempts - used}


@app.get("/api/units/{unit_id}/quiz-status")
def quiz_status(unit_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    unit = db.query(Unit).filter(Unit.id == unit_id, Unit.type == "quiz").first()
    if not unit:
        raise HTTPException(404, "quiz não encontrado")
    max_attempts = (unit.content or {}).get("max_attempts", 3)
    used = db.query(func.count(QuizAttempt.id)).filter(
        QuizAttempt.user_id == user.id, QuizAttempt.unit_id == unit_id
    ).scalar() or 0
    best = db.query(func.max(QuizAttempt.score_pct)).filter(
        QuizAttempt.user_id == user.id, QuizAttempt.unit_id == unit_id
    ).scalar()
    return {"attempts_used": used, "max_attempts": max_attempts, "remaining": max(0, max_attempts - used), "best_score": best}


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
    # se todas as units do curso concluídas, marca enrollment.completed_at + bonus + emite certificado
    pct = compute_course_progress(db, user.id, unit.course_id)
    if pct >= 100:
        enroll = db.query(Enrollment).filter(
            Enrollment.user_id == user.id, Enrollment.course_id == unit.course_id
        ).first()
        if enroll and not enroll.completed_at:
            enroll.completed_at = datetime.utcnow()
            user.points += 150  # bônus curso completo
            grant_badge_if_missing(db, user.id, "Quiz Master")
            _maybe_issue_certificate(db, user.id, unit.course_id)
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


# ============ GROUPS ============
from .models import Group

def _group_out(db: Session, g: Group) -> schemas.GroupOut:
    out = schemas.GroupOut.model_validate(g)
    out.users_count = db.query(func.count(GroupUser.user_id)).filter(GroupUser.group_id == g.id).scalar() or 0
    out.courses_count = db.query(func.count(GroupCourse.course_id)).filter(GroupCourse.group_id == g.id).scalar() or 0
    return out


@app.get("/api/groups", response_model=List[schemas.GroupOut])
def list_groups(db: Session = Depends(get_db), _: User = Depends(current_user)):
    groups = db.query(Group).order_by(Group.name).all()
    return [_group_out(db, g) for g in groups]


@app.get("/api/groups/{group_id}")
def get_group(group_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g: raise HTTPException(404, "group not found")
    user_ids = [r.user_id for r in db.query(GroupUser).filter(GroupUser.group_id == group_id).all()]
    course_ids = [r.course_id for r in db.query(GroupCourse).filter(GroupCourse.group_id == group_id).all()]
    return {
        **_group_out(db, g).model_dump(),
        "user_ids": user_ids, "course_ids": course_ids,
    }


@app.post("/api/groups", response_model=schemas.GroupOut, status_code=201)
def create_group(data: schemas.GroupCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(Group).filter(Group.name == data.name).first():
        raise HTTPException(409, "grupo já existe")
    g = Group(**data.model_dump())
    db.add(g); db.commit(); db.refresh(g)
    return _group_out(db, g)


@app.patch("/api/groups/{group_id}", response_model=schemas.GroupOut)
def update_group(group_id: int, data: schemas.GroupUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g: raise HTTPException(404, "group not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    db.commit(); db.refresh(g)
    return _group_out(db, g)


@app.delete("/api/groups/{group_id}", status_code=204)
def delete_group(group_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    g = db.query(Group).filter(Group.id == group_id).first()
    if not g: raise HTTPException(404, "group not found")
    db.query(GroupUser).filter(GroupUser.group_id == group_id).delete()
    db.query(GroupCourse).filter(GroupCourse.group_id == group_id).delete()
    db.delete(g); db.commit()


@app.put("/api/groups/{group_id}/users")
def set_group_users(group_id: int, data: schemas.GroupMembersIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    db.query(GroupUser).filter(GroupUser.group_id == group_id).delete()
    for uid in data.user_ids:
        db.add(GroupUser(group_id=group_id, user_id=uid))
    db.commit()
    return {"members": len(data.user_ids)}


@app.put("/api/groups/{group_id}/courses")
def set_group_courses(group_id: int, data: schemas.GroupCoursesIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    db.query(GroupCourse).filter(GroupCourse.group_id == group_id).delete()
    # Atribui curso ao grupo + auto-matricula todos os members
    enrolled = 0
    member_ids = [r.user_id for r in db.query(GroupUser).filter(GroupUser.group_id == group_id).all()]
    for cid in data.course_ids:
        db.add(GroupCourse(group_id=group_id, course_id=cid))
        for uid in member_ids:
            existing = db.query(Enrollment).filter(Enrollment.user_id == uid, Enrollment.course_id == cid).first()
            if not existing:
                db.add(Enrollment(user_id=uid, course_id=cid, role="Estudante"))
                enrolled += 1
    db.commit()
    return {"courses": len(data.course_ids), "auto_enrolled": enrolled}


# ============ CERTIFICATES ============
import secrets

@app.get("/api/users/me/certificates", response_model=List[schemas.CertificateOut])
def my_certificates(db: Session = Depends(get_db), user: User = Depends(current_user)):
    certs = db.query(Certificate).filter(Certificate.user_id == user.id).all()
    out = []
    for c in certs:
        course = db.query(Course).get(c.course_id)
        co = schemas.CertificateOut.model_validate(c)
        co.course_name = course.name if course else "?"
        co.user_name = f"{user.name} {user.surname}".strip()
        out.append(co)
    return out


def _maybe_issue_certificate(db: Session, user_id: int, course_id: int):
    course = db.query(Course).get(course_id)
    if not course or not course.issue_certificate:
        return None
    existing = db.query(Certificate).filter(Certificate.user_id == user_id, Certificate.course_id == course_id).first()
    if existing:
        return existing
    # gate de nota mínima: se o curso tem quiz, a nota média precisa >= certificate_min_score
    min_score = getattr(course, "certificate_min_score", 70) or 0
    grade = compute_course_grade(db, user_id, course_id)
    if grade is not None and grade < min_score:
        return None  # concluiu conteúdo mas não atingiu a nota — não emite
    code = f"NAPEL-{datetime.utcnow().year}-{secrets.token_hex(3).upper()}"
    cert = Certificate(user_id=user_id, course_id=course_id, code=code)
    db.add(cert); db.commit(); db.refresh(cert)
    return cert


from fastapi.responses import HTMLResponse

@app.get("/api/certificates/{cert_id}/html", response_class=HTMLResponse)
def render_certificate_html(cert_id: int, db: Session = Depends(get_db)):
    cert = db.query(Certificate).get(cert_id)
    if not cert:
        raise HTTPException(404, "certificate not found")
    user = db.query(User).get(cert.user_id)
    course = db.query(Course).get(cert.course_id)
    html = f"""<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><title>Certificado · {user.name} {user.surname}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
* {{ margin:0; padding:0; box-sizing:border-box; font-family:'Inter',sans-serif; }}
body {{ background:#FAFCFD; min-height:100vh; padding:32px; display:flex; align-items:center; justify-content:center; }}
.cert {{ width:100%; max-width:880px; aspect-ratio: 11/8.5; background:white; border:12px solid #113C58; box-shadow:0 25px 60px rgba(0,0,0,0.15); padding:48px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; position:relative; }}
.cert::before {{ content:''; position:absolute; inset:18px; border:2px solid #7DA4C6; pointer-events:none; }}
.brand {{ font-size:38px; font-weight:800; color:#113C58; letter-spacing:.12em; }}
.brand span {{ font-size:14px; color:#7DA4C6; vertical-align:middle; margin-left:6px; }}
.title {{ font-size:14px; text-transform:uppercase; letter-spacing:.4em; color:#7DA4C6; margin-top:24px; }}
.cert h1 {{ font-size:46px; font-weight:800; color:#113C58; margin:18px 0 24px; }}
.recipient {{ font-size:32px; font-weight:700; color:#042C48; margin:8px 0 20px; padding-bottom:8px; border-bottom:2px solid #E4EEF3; }}
.body-text {{ font-size:15px; color:#475569; max-width:620px; line-height:1.7; }}
.course {{ font-weight:700; color:#113C58; }}
.footer {{ margin-top:36px; display:flex; gap:48px; align-items:center; justify-content:center; font-size:12px; color:#64748B; }}
.footer .col {{ text-align:center; }}
.footer .col .label {{ text-transform:uppercase; letter-spacing:.15em; font-size:10px; }}
.footer .col .value {{ font-weight:700; color:#113C58; margin-top:4px; font-size:13px; }}
.code {{ position:absolute; bottom:24px; left:50%; transform:translateX(-50%); font-family:monospace; color:#94A3B8; font-size:11px; letter-spacing:.2em; }}
@media print {{
  body {{ padding:0; background:white; }}
  .cert {{ border:8px solid #113C58; box-shadow:none; max-width:100%; }}
  .print-btn {{ display:none !important; }}
}}
.print-btn {{ position:fixed; bottom:24px; right:24px; padding:12px 24px; background:#113C58; color:white; border:none; border-radius:8px; font-weight:600; cursor:pointer; box-shadow:0 8px 24px rgba(17,60,88,0.3); }}
</style>
</head><body>
<div class="cert">
  <div class="brand">NAPEL <span>LMS</span></div>
  <div class="title">Certificado de Conclusão</div>
  <h1>Conferimos a</h1>
  <div class="recipient">{user.name.upper()} {user.surname.upper()}</div>
  <p class="body-text">
    Por ter concluído com aproveitamento o curso<br>
    <span class="course">"{course.name}"</span><br>
    aplicando-se os conhecimentos necessários à formação contínua da equipe Napel.
  </p>
  <div class="footer">
    <div class="col"><div class="label">Data emissão</div><div class="value">{cert.issued_at.strftime('%d/%m/%Y')}</div></div>
    <div class="col"><div class="label">Código de validação</div><div class="value">{cert.code}</div></div>
  </div>
  <div class="code">Verifique em lms.napel.com.br/certificates/{cert.code}</div>
</div>
<button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
</body></html>"""
    return HTMLResponse(content=html)


# ============ CATEGORIES ============
import re as _re

def _slugify(s: str) -> str:
    return _re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


@app.get("/api/categories", response_model=List[schemas.CategoryOut])
def list_categories(db: Session = Depends(get_db), _: User = Depends(current_user)):
    cats = db.query(Category).order_by(Category.name).all()
    # padrão fallback se vazio
    if not cats:
        defaults = ["Técnicas de venda", "Catálogo técnico", "Atendimento ao cliente", "Compliance", "Geral"]
        for n in defaults:
            db.add(Category(name=n, slug=_slugify(n)))
        db.commit()
        cats = db.query(Category).order_by(Category.name).all()
    return cats


@app.post("/api/categories", response_model=schemas.CategoryOut, status_code=201)
def create_category(data: schemas.CategoryCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    slug = _slugify(data.name)
    if db.query(Category).filter((Category.name == data.name) | (Category.slug == slug)).first():
        raise HTTPException(409, "categoria já existe")
    c = Category(name=data.name, slug=slug)
    db.add(c); db.commit(); db.refresh(c)
    return c


@app.delete("/api/categories/{cat_id}", status_code=204)
def delete_category(cat_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    c = db.query(Category).filter(Category.id == cat_id).first()
    if not c: raise HTTPException(404, "category not found")
    db.delete(c); db.commit()


# ============ SETTINGS ============
def _get_setting(db: Session, key: str, default: dict) -> dict:
    s = db.query(Setting).filter(Setting.key == key).first()
    if not s:
        return default
    return {**default, **(s.value or {})}


def _set_setting(db: Session, key: str, value: dict):
    s = db.query(Setting).filter(Setting.key == key).first()
    if not s:
        s = Setting(key=key, value=value)
        db.add(s)
    else:
        s.value = value
    db.commit()


@app.get("/api/settings/portal", response_model=schemas.PortalSettings)
def get_portal_settings(db: Session = Depends(get_db), _: User = Depends(current_user)):
    d = schemas.PortalSettings().model_dump()
    return schemas.PortalSettings(**_get_setting(db, "portal", d))


@app.put("/api/settings/portal", response_model=schemas.PortalSettings)
def update_portal_settings(data: schemas.PortalSettings, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    _set_setting(db, "portal", data.model_dump())
    return data


@app.get("/api/settings/gamification", response_model=schemas.GamificationSettings)
def get_gam_settings(db: Session = Depends(get_db), _: User = Depends(current_user)):
    d = schemas.GamificationSettings().model_dump()
    return schemas.GamificationSettings(**_get_setting(db, "gamification", d))


@app.put("/api/settings/gamification", response_model=schemas.GamificationSettings)
def update_gam_settings(data: schemas.GamificationSettings, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    _set_setting(db, "gamification", data.model_dump())
    return data


# ============ QUIZ HISTORY ============
@app.get("/api/users/{user_id}/quiz-attempts", response_model=List[schemas.QuizAttemptOut])
def user_quiz_attempts(user_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.query(QuizAttempt).filter(QuizAttempt.user_id == user_id).order_by(QuizAttempt.started_at.desc()).all()


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
    # 3 estados: 'completed' (concluído) · 'in_progress' (cursando, com pct) · 'not_started' (não iniciou)
    cells = {}
    for u in users:
        cells[u.id] = {}
        for c in courses:
            enroll = db.query(Enrollment).filter(
                Enrollment.user_id == u.id, Enrollment.course_id == c.id
            ).first()
            if not enroll:
                cells[u.id][c.id] = {"status": "not_started", "pct": 0}
            elif enroll.completed_at:
                cells[u.id][c.id] = {"status": "completed", "pct": 100}
            else:
                pct = compute_course_progress(db, u.id, c.id)
                if pct <= 0:
                    # matriculado mas não começou = ainda conta como "cursando" (0%), pois há matrícula
                    cells[u.id][c.id] = {"status": "in_progress", "pct": 0}
                else:
                    cells[u.id][c.id] = {"status": "in_progress", "pct": pct}
    return {
        "users": [{"id": u.id, "name": f"{u.name} {u.surname}".strip(), "branch": u.branch} for u in users],
        "courses": [{"id": c.id, "name": c.name, "code": c.code} for c in courses],
        "cells": cells,
    }
