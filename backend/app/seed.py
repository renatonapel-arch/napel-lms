"""Seed inicial: 7 users Napel reais + 6 cursos do mockup + units de exemplo + badges."""
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .models import User, Course, Unit, Badge, UserBadge, Enrollment, Progress
from .auth import hash_password
from .config import settings


USERS_SEED = [
    # admin/super
    {"login": "renato",    "email": "renatonapel@gmail.com",    "name": "Renato",   "surname": "Formagio Parra",  "user_type": "SuperAdmin",    "branch": "MGA", "points": 425,  "level": 1, "initials": "R"},
    {"login": "hudson",    "email": "hudson@napel.com.br",      "name": "Hudson",   "surname": "Napel",           "user_type": "Admin",         "branch": "MGA", "points": 320,  "level": 1, "initials": "H"},
    # vendedores
    {"login": "luiz",      "email": "vendas1pta@napel.com.br",  "name": "Luiz",     "surname": "Argel",           "user_type": "Learner-Type",  "branch": "PTA", "points": 5496, "level": 6, "initials": "LA"},
    {"login": "igor",      "email": "igorteixeira115@gmail.com","name": "Igor",     "surname": "Teixeira da Silva","user_type": "Learner-Type", "branch": "MGA", "points": 5434, "level": 6, "initials": "IT"},
    {"login": "marcos",    "email": "marcos@napel.com.br",      "name": "Marcos",   "surname": "Paulo Mendes da Silva", "user_type": "Learner-Type", "branch": "LEM", "points": 5373, "level": 6, "initials": "MP"},
    {"login": "guilherme", "email": "vendas1maringa@napel.com.br","name": "Guilherme","surname": "Silvestre Paixao",  "user_type": "Learner-Type", "branch": "MGA", "points": 5233, "level": 6, "initials": "GS"},
    {"login": "gilson",    "email": "gilsonperreira1@gmail.com","name": "Gilson",   "surname": "Pereira",         "user_type": "Learner-Type",  "branch": "LEM", "points": 1000, "level": 2, "initials": "GP"},
    {"login": "gabriel",   "email": "rdgs.gabriel098@gmail.com","name": "Gabriel",  "surname": "Napel",           "user_type": "Learner-Type",  "branch": "MGA", "points": 680,  "level": 1, "initials": "GN"},
]


COURSES_SEED = [
    {
        "name": "5 Técnicas de Persuasão para Fechar Vendas | Thiago Concer",
        "code": "VND-101", "category": "Técnicas de venda",
        "description": "Domine as 5 técnicas-chave que multiplicam a taxa de fechamento de pedidos de molas e suspensão para carretas.",
        "thumbnail_seed": 1, "icon": "phone-call",
        "units": [
            {"type": "video", "title": "1 · Introdução: o vendedor consultor", "duration_min": 8,
             "content": {"video_url": "https://www.w3schools.com/html/mov_bbb.mp4"}},
            {"type": "text",  "title": "2 · Tipos de objeção que o cliente faz", "duration_min": 5,
             "content": {"text_md": "## Tipos de objeção\n\n1. Preço\n2. Concorrência\n3. Confiança\n4. Tempo\n5. Necessidade"}},
            {"type": "quiz",  "title": "3 · Quiz: identifique a objeção", "duration_min": 10,
             "content": {"passing_score": 70, "max_attempts": 3, "questions": [
                {"q": "Cliente diz 'a mola da concorrência é mais barata'. Melhor resposta?", "options": [
                    "Posso fazer o mesmo preço, sem problema.",
                    "Já comparou as fichas técnicas? Nossa mola tem 30% mais ciclos de fadiga e garantia de 2 anos contra falha estrutural — vou mostrar o teste.",
                    "A concorrência é sempre pior, fica longe.",
                    "Cada um tem o seu mercado, tudo bem se preferir."
                ], "correct": 1},
                {"q": "Qual a primeira pergunta de diagnóstico a um cliente novo?", "options": [
                    "Quanto você quer pagar?",
                    "Qual a aplicação e quantos km/mês a carreta roda?",
                    "Já comprou de nós antes?",
                    "Tem orçamento da concorrência?"
                ], "correct": 1},
                {"q": "Vendedor consultor é aquele que:", "options": [
                    "Tira pedido rápido",
                    "Diagnostica a dor antes de oferecer a peça certa",
                    "Sempre dá o menor preço",
                    "Insiste até o cliente comprar"
                ], "correct": 1},
            ]}},
            {"type": "video", "title": "4 · Demo prática: visita ao cliente", "duration_min": 15,
             "content": {"video_url": "https://www.w3schools.com/html/mov_bbb.mp4"}},
            {"type": "pdf",   "title": "5 · Cheat-sheet: respostas-padrão", "duration_min": 5,
             "content": {"pdf_url": "https://example.com/cheatsheet.pdf"}},
        ]
    },
    {
        "name": "Vendedor Bonzinho Não Vende - Thiago Concer",
        "code": "VND-102", "category": "Técnicas de venda",
        "description": "Aprenda a vencer a síndrome do vendedor passivo e assumir o protagonismo da venda.",
        "thumbnail_seed": 2, "icon": "message-circle-warning",
        "units": [
            {"type": "video", "title": "1 · O que é vendedor bonzinho", "duration_min": 7, "content": {"video_url": "https://www.w3schools.com/html/mov_bbb.mp4"}},
            {"type": "text",  "title": "2 · 7 sinais que você é bonzinho demais", "duration_min": 5, "content": {"text_md": "Lista de sinais..."}},
            {"type": "quiz",  "title": "3 · Autoavaliação", "duration_min": 8,
             "content": {"passing_score": 60, "max_attempts": 3, "questions": [
                {"q": "Cliente sumiu há 5 dias. Você:", "options": ["Espera mais 5", "Liga, pergunta status e propõe próximo passo", "Manda mensagem pedindo desculpa", "Risca o cliente"], "correct": 1},
             ]}},
            {"type": "video", "title": "4 · Como cobrar pagamento sem ser chato", "duration_min": 12, "content": {"video_url": "https://www.w3schools.com/html/mov_bbb.mp4"}},
        ]
    },
    {
        "name": "Fidelização de Clientes — 5 Dicas Incríveis",
        "code": "VND-103", "category": "Atendimento ao cliente",
        "description": "5 dicas práticas para transformar clientes ocasionais em compradores recorrentes.",
        "thumbnail_seed": 3, "icon": "heart-handshake",
        "units": [
            {"type": "video", "title": "1 · Pós-venda como diferencial", "duration_min": 6, "content": {"video_url": "https://www.w3schools.com/html/mov_bbb.mp4"}},
            {"type": "text",  "title": "2 · Calendário de contato anual", "duration_min": 4, "content": {"text_md": "Plano de contato..."}},
            {"type": "quiz",  "title": "3 · Quiz fidelização", "duration_min": 6,
             "content": {"passing_score": 70, "max_attempts": 2, "questions": [
                {"q": "Cliente recorrente: quantos contatos/ano?", "options": ["1", "3-4", "12+", "Só quando ele liga"], "correct": 1},
             ]}},
        ]
    },
    {
        "name": "Catálogo Técnico — Molas e Suspensão",
        "code": "TEC-201", "category": "Catálogo técnico",
        "description": "Conheça a linha completa de molas e componentes de suspensão para carretas.",
        "thumbnail_seed": 4, "icon": "cog",
        "units": [
            {"type": "video", "title": "1 · Anatomia da mola parabólica", "duration_min": 10, "content": {"video_url": "https://www.w3schools.com/html/mov_bbb.mp4"}},
            {"type": "video", "title": "2 · Diferenças entre mola feixe e parabólica", "duration_min": 8, "content": {"video_url": "https://www.w3schools.com/html/mov_bbb.mp4"}},
            {"type": "pdf",   "title": "3 · Catálogo completo PDF", "duration_min": 5, "content": {"pdf_url": "https://example.com/catalogo.pdf"}},
            {"type": "quiz",  "title": "4 · Avaliação técnica", "duration_min": 15,
             "content": {"passing_score": 80, "max_attempts": 3, "questions": [
                {"q": "Quantas lâminas tem a mola padrão Napel para Scania 113?", "options": ["3", "5", "7", "9"], "correct": 1},
             ]}},
        ]
    },
    {
        "name": "Sistema de Freios para Carretas Pesadas",
        "code": "TEC-202", "category": "Catálogo técnico",
        "description": "Sistemas a ar, hidráulicos e ABS para carretas acima de 28 toneladas.",
        "thumbnail_seed": 5, "icon": "truck",
        "units": [
            {"type": "video", "title": "1 · Visão geral do sistema a ar", "duration_min": 12, "content": {"video_url": "https://www.w3schools.com/html/mov_bbb.mp4"}},
            {"type": "text",  "title": "2 · Componentes principais", "duration_min": 6, "content": {"text_md": "Lista..."}},
        ]
    },
    {
        "name": "Onboarding Napel — Cultura e Compliance",
        "code": "ONB-001", "category": "Compliance",
        "description": "Obrigatório para todos os novos colaboradores. Cultura, valores, LGPD e código de conduta.",
        "thumbnail_seed": 3, "icon": "shield-check",
        "units": [
            {"type": "video", "title": "1 · Boas-vindas — fundador Renato", "duration_min": 5, "content": {"video_url": "https://www.w3schools.com/html/mov_bbb.mp4"}},
            {"type": "text",  "title": "2 · Nossos valores e missão", "duration_min": 5, "content": {"text_md": "Valores Napel..."}},
            {"type": "text",  "title": "3 · LGPD básico", "duration_min": 8, "content": {"text_md": "O que é LGPD..."}},
            {"type": "quiz",  "title": "4 · Quiz obrigatório", "duration_min": 10,
             "content": {"passing_score": 80, "max_attempts": 5, "questions": [
                {"q": "Posso compartilhar email de cliente com terceiros sem permissão?", "options": ["Sim, se for parceiro", "Não, nunca", "Só se ele autorizar por escrito", "Só pra empresas Napel"], "correct": 2},
             ]}},
            {"type": "text",  "title": "5 · Próximos passos", "duration_min": 3, "content": {"text_md": "Onboarding concluído!"}},
        ]
    },
]


BADGES_SEED = [
    {"name": "First Steps",   "description": "Você fez seu primeiro login!",          "category": "activity",      "icon": "rocket",       "points": 25},
    {"name": "Profile Done",  "description": "Completou todos os dados do perfil",    "category": "activity",      "icon": "user-check",   "points": 50},
    {"name": "Quiz Master",   "description": "Passou em 5 quizzes seguidos",          "category": "test",          "icon": "brain",        "points": 100},
    {"name": "Perfectionist", "description": "Tirou 100% num quiz",                   "category": "test",          "icon": "target",       "points": 150},
    {"name": "Marathoner",    "description": "Completou um curso em menos de 24h",    "category": "learning",      "icon": "zap",          "points": 200},
    {"name": "Top 3",         "description": "Ficou nas 3 primeiras posições do mês", "category": "activity",      "icon": "trophy",       "points": 300},
    {"name": "Certified",     "description": "Recebeu seu primeiro certificado",      "category": "certification", "icon": "award",        "points": 150},
]


def seed_all(db: Session, force: bool = False):
    # Se já tem dados e !force, pula
    if not force and db.query(User).count() > 0:
        print("[seed] DB já populado, pulando.")
        return

    pw = hash_password(settings.admin_password)
    users = []
    for u in USERS_SEED:
        user = User(
            login=u["login"], email=u["email"], name=u["name"], surname=u["surname"],
            password_hash=pw, user_type=u["user_type"], branch=u["branch"],
            points=u["points"], level=u["level"], avatar_initials=u["initials"],
            last_login=datetime.utcnow() - timedelta(hours=u.get("hrs_ago", 1)),
        )
        db.add(user)
        users.append(user)
    db.flush()

    renato = users[0]  # SuperAdmin como instrutor padrão
    courses = []
    for c in COURSES_SEED:
        course = Course(
            name=c["name"], code=c["code"], category=c["category"], description=c["description"],
            status="active", instructor_id=renato.id, thumbnail_seed=c["thumbnail_seed"], icon=c["icon"],
        )
        db.add(course)
        db.flush()
        for i, u in enumerate(c["units"], start=1):
            unit = Unit(
                course_id=course.id, order_index=i, type=u["type"],
                title=u["title"], duration_min=u["duration_min"], content=u["content"],
            )
            db.add(unit)
        courses.append(course)
    db.flush()

    badges = []
    for b in BADGES_SEED:
        badge = Badge(**b)
        db.add(badge)
        badges.append(badge)
    db.flush()

    # Matriculas reais (refletindo a Matriz de formação do mockup)
    matriz = {
        # user_login: { course_idx: 'completed'|'in_progress'|'started'|None }
        "gabriel":   {3: "started"},
        "gilson":    {0: "completed", 1: "completed", 2: "in_progress"},
        "guilherme": {0: "completed", 1: "completed", 2: "completed", 3: "completed", 4: "completed", 5: "completed"},
        "igor":      {0: "completed", 1: "completed", 2: "completed", 3: "completed", 4: "completed", 5: "completed"},
        "luiz":      {0: "completed", 1: "completed", 2: "completed", 3: "completed", 4: "completed", 5: "completed"},
        "marcos":    {0: "completed", 1: "completed", 2: "completed", 3: "completed", 4: "completed", 5: "completed"},
        "renato":    {2: "in_progress", 3: "in_progress"},
        "hudson":    {5: "in_progress"},
    }
    for login, m in matriz.items():
        user = next((x for x in users if x.login == login), None)
        if not user:
            continue
        for course_idx, status in m.items():
            course = courses[course_idx]
            role = "Professor" if user.user_type in ("SuperAdmin", "Admin") and course_idx in (0, 1, 2, 5) else "Estudante"
            enroll = Enrollment(
                user_id=user.id, course_id=course.id, role=role,
                enrolled_at=datetime.utcnow() - timedelta(days=30),
                completed_at=datetime.utcnow() - timedelta(days=5) if status == "completed" else None,
            )
            db.add(enroll)
            db.flush()
            # progress
            if status == "completed":
                for unit in course.units:
                    p = Progress(user_id=user.id, unit_id=unit.id, completion_pct=100,
                                 completed_at=datetime.utcnow() - timedelta(days=5))
                    db.add(p)
            elif status == "in_progress":
                # primeira unidade completa, segunda em 40%
                if len(course.units) > 0:
                    db.add(Progress(user_id=user.id, unit_id=course.units[0].id, completion_pct=100,
                                    completed_at=datetime.utcnow() - timedelta(days=2)))
                if len(course.units) > 1:
                    db.add(Progress(user_id=user.id, unit_id=course.units[1].id, completion_pct=40))
            elif status == "started":
                if len(course.units) > 0:
                    db.add(Progress(user_id=user.id, unit_id=course.units[0].id, completion_pct=10))

    # Badges
    badge_map = {
        "luiz":      ["First Steps", "Profile Done", "Quiz Master", "Perfectionist", "Marathoner", "Top 3"],
        "igor":      ["First Steps", "Profile Done", "Quiz Master", "Perfectionist", "Marathoner"],
        "marcos":    ["First Steps", "Profile Done", "Quiz Master", "Perfectionist"],
        "guilherme": ["First Steps", "Profile Done", "Quiz Master"],
        "gilson":    ["First Steps", "Profile Done"],
        "renato":    ["First Steps", "Profile Done"],
        "hudson":    ["First Steps"],
        "gabriel":   ["First Steps"],
    }
    for login, names in badge_map.items():
        user = next((x for x in users if x.login == login), None)
        if not user:
            continue
        for name in names:
            badge = next((x for x in badges if x.name == name), None)
            if badge:
                db.add(UserBadge(user_id=user.id, badge_id=badge.id))

    db.commit()
    print(f"[seed] OK: {len(users)} users + {len(courses)} courses + {len(badges)} badges")
