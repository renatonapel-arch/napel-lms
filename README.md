# Napel LMS — Demo Funcional

Clone funcional do TalentLMS para Napel, hospedado em `lms.demos.napel.com.br`.

**Stack:** FastAPI + Postgres + JWT HS256 (backend) · HTML+Tailwind+vanilla JS (frontend) · Coolify+Traefik (deploy).

## Rodar local

```powershell
docker compose up --build
```

- Frontend: http://localhost:8080
- API: http://localhost:8000/api/docs
- DB: localhost:5433 (user/pass `lms/lms`)

## Usuários demo (senha padrão `napel2026`)

| Login | Role | Branch |
|-------|------|--------|
| `renato` | SuperAdmin | MGA |
| `hudson` | Admin | MGA |
| `luiz`, `igor`, `marcos`, `guilherme`, `gilson`, `gabriel` | Learner-Type | MGA/LEM/PTA |

## Estrutura

```
napel-lms/
├── backend/      # FastAPI + SQLAlchemy + Alembic
│   ├── app/
│   │   ├── main.py       # endpoints
│   │   ├── models.py     # 7 tabelas
│   │   ├── schemas.py    # Pydantic DTOs
│   │   ├── auth.py       # JWT
│   │   ├── seed.py       # dados iniciais
│   │   └── startup.py    # cria tabelas + seed
│   └── tests/
└── frontend/     # HTML estático + JS de integração
    ├── index.html        # mockup aprovado
    └── api.js            # cliente API + render dinâmico
```

## Endpoints principais

- `POST /api/auth/login` — `{login, password}` → `{access_token, user}`
- `GET /api/auth/me` — user atual
- `GET /api/courses` — lista cursos
- `GET /api/courses/:id` — detalhe + units
- `GET /api/leaderboard` — top N
- `GET /api/reports/training-matrix` — matriz pivot user × curso
- `GET /api/users/:id` — detalhe + matrículas + badges
- `POST /api/progress` — `{unit_id, completion_pct}` (ganha pontos)
- `GET /api/dashboard/overview` — KPIs

Docs interativa: `/api/docs` (Swagger UI).

## Deploy

Coolify Napel · projeto Demos:
- `napel-lms-db` (Postgres dedicado)
- `napel-lms-api` (backend container)
- `napel-lms-fe` (nginx + proxy `/api` para api container)

Domain via Traefik: `https://lms.demos.napel.com.br`.

## Limitações da demo

- Auth: senha local hash bcrypt (sem OIDC Clavis ainda)
- Vídeos: links externos placeholder (não tem upload)
- SCORM: tipo cadastrado mas player não funcional
- Certificados: não gera PDF ainda (stub)
- Não tem worker Celery (tudo síncrono)
