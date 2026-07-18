"""Valida ponta-a-ponta: aluno consome conteúdo, faz prova, ganha (ou não) certificado, matriz reflete."""
import sys, json, urllib.request, urllib.error

BASE = "https://api.lms.demos.napel.com.br"

def req(method, path, token=None, body=None):
    r = urllib.request.Request(f"{BASE}{path}", data=(json.dumps(body).encode() if body is not None else None), method=method)
    r.add_header("Content-Type", "application/json")
    if token: r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode(); return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]

def login(l, p):
    st, o = req("POST", "/api/auth/login", body={"login": l, "password": p}); return o["access_token"]

admin = login("renato", "napel2026")

# acha o curso TEC-SUSP (id=2)
_, courses = req("GET", "/api/courses", admin)
course = next(c for c in courses if c.get("code") == "TEC-SUSP")
cid = course["id"]
print(f"curso {cid} · certificate_min_score={course['certificate_min_score']} · issue={course['issue_certificate']}")
_, units = req("GET", f"/api/courses/{cid}/units", admin)
quiz = next(u for u in units if u["type"] == "quiz")
non_quiz = [u for u in units if u["type"] != "quiz"]
questions = quiz["content"]["questions"]
print(f"units={len(units)} · quiz unit={quiz['id']} · {len(questions)} perguntas")

def run_student(base_name, correct_ratio):
    _, allu = req("GET", "/api/users", admin)
    login_name = f"{base_name}_{len(allu)}"   # único por run
    email = f"{login_name}@napel.com.br"
    st, u = req("POST", "/api/users", admin, {"login": login_name, "email": email, "name": base_name.capitalize(), "surname": "Teste", "password": "napel2026", "user_type": "Learner-Type", "branch": "MGA"})
    if not isinstance(u, dict) or "id" not in u:
        print(f"  ERRO criar {login_name}: {st} {u}"); return None
    uid = u["id"]
    # matricula
    req("POST", "/api/enrollments/admin", admin, {"user_id": uid, "course_id": cid, "role": "Estudante"})
    # login como ele
    tok = login(login_name, "napel2026")
    # consome apostilas/video/audio (marca concluído)
    for un in non_quiz:
        req("POST", "/api/progress", tok, {"unit_id": un["id"], "completion_pct": 100})
    # responde a prova
    n_correct = round(len(questions) * correct_ratio)
    res = {}
    for i, q in enumerate(questions):
        correct_idx = q["correct"]
        sel = correct_idx if i < n_correct else (correct_idx + 1) % 4  # erra de propósito o resto
        st, res = req("POST", f"/api/units/{quiz['id']}/quiz-answer?q_idx={i}", tok, {"selected_idx": sel})
        if not isinstance(res, dict):
            print(f"  ERRO quiz q{i}: {st} {res}"); res = {}; break
    # resultado
    _, certs = req("GET", "/api/users/me/certificates", tok)
    _, me = req("GET", "/api/auth/me", tok)
    print(f"\n== {login_name} (acertou {n_correct}/{len(questions)}) ==")
    print(f"  score final quiz: {res.get('score_pct')}% · passou={res.get('passed')}")
    print(f"  pontos: {me['points']}")
    print(f"  certificados: {len(certs)} {'✓ EMITIDO' if certs else '✗ (não atingiu nota)'}")
    return uid

u_pass = run_student("aluno_bom", 1.0)     # 100% → passa, certificado
u_fail = run_student("aluno_fraco", 0.4)   # 40% → reprova, sem certificado

# matriz
_, matrix = req("GET", "/api/reports/training-matrix", admin)
print("\n== MATRIZ (curso TEC-SUSP) ==")
for usr in matrix["users"]:
    cell = matrix["cells"][str(usr["id"])][str(cid)] if str(usr["id"]) in matrix["cells"] else matrix["cells"][usr["id"]][cid]
    if usr["id"] in (u_pass, u_fail):
        print(f"  {usr['name']}: status={cell['status']} pct={cell['pct']}%")
