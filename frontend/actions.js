/*
 * Napel LMS — actions.js
 * Conecta TODOS os botões CRUD à API. Roda depois do api.js (depende de window.api).
 * Strategy: event delegation via data-action no document.
 */

/* ============ MODAL GENÉRICO ============ */
function injectActionsModal() {
  if (document.getElementById("acts-modal")) return;
  const el = document.createElement("div");
  el.id = "acts-modal";
  el.style.cssText = "position:fixed;inset:0;background:rgba(4,44,72,0.6);backdrop-filter:blur(4px);z-index:9000;display:none;align-items:center;justify-content:center;padding:16px;overflow-y:auto;";
  el.innerHTML = `
    <div id="acts-modal-card" style="background:white;border-radius:12px;max-width:520px;width:100%;padding:0;box-shadow:0 20px 50px rgba(0,0,0,0.3);max-height:92vh;overflow-y:auto">
      <div id="acts-modal-header" style="padding:20px 24px;border-bottom:1px solid #E4EEF3;display:flex;align-items:center;justify-content:space-between">
        <h3 id="acts-modal-title" style="font-size:16px;font-weight:600;color:#113C58">Título</h3>
        <button onclick="hideModal()" style="background:transparent;border:none;cursor:pointer;color:#64748B;padding:4px" aria-label="Fechar">✕</button>
      </div>
      <div id="acts-modal-body" style="padding:20px 24px"></div>
      <div id="acts-modal-footer" style="padding:16px 24px;border-top:1px solid #E4EEF3;display:flex;justify-content:flex-end;gap:8px">
        <button onclick="hideModal()" style="padding:8px 16px;background:white;border:1px solid #CFDEE7;border-radius:6px;color:#113C58;cursor:pointer">Cancelar</button>
        <button id="acts-modal-ok" style="padding:8px 18px;background:#113C58;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener("click", e => { if (e.target.id === "acts-modal") hideModal(); });
}

function showModal({ title, bodyHtml, okText = "Salvar", onOk, hideFooter = false }) {
  injectActionsModal();
  document.getElementById("acts-modal-title").textContent = title;
  document.getElementById("acts-modal-body").innerHTML = bodyHtml;
  const footer = document.getElementById("acts-modal-footer");
  footer.style.display = hideFooter ? "none" : "flex";
  const ok = document.getElementById("acts-modal-ok");
  ok.textContent = okText;
  ok.onclick = async () => {
    ok.disabled = true; const old = ok.textContent; ok.textContent = "Salvando…";
    try { await onOk(); hideModal(); }
    catch (err) { alert("Erro: " + (err.message || err)); }
    finally { ok.disabled = false; ok.textContent = old; }
  };
  document.getElementById("acts-modal").style.display = "flex";
  setTimeout(() => document.querySelector("#acts-modal-body input, #acts-modal-body textarea, #acts-modal-body select")?.focus(), 60);
}
function hideModal() {
  const m = document.getElementById("acts-modal");
  if (m) m.style.display = "none";
}
window.hideModal = hideModal;

/* ============ TOAST ============ */
function toast(msg, type = "success") {
  const bg = { success: "#10B981", error: "#EF4444", info: "#7DA4C6" }[type] || "#113C58";
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;top:20px;right:20px;background:${bg};color:white;padding:12px 20px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:10000;font-size:14px;font-weight:500;max-width:380px;animation:slidein 200ms ease-out;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 200ms"; setTimeout(() => el.remove(), 200); }, 3500);
}
window.toast = toast;

/* ============ HELPERS ============ */
function fld(id, label, opts = {}) {
  const { type = "text", value = "", placeholder = "", required = true, choices = null, rows = 0, hint = "" } = opts;
  let input;
  if (choices) {
    input = `<select id="${id}" ${required ? "required" : ""} style="width:100%;padding:9px 12px;border:1px solid #CFDEE7;border-radius:6px;font-size:14px;background:white">${
      choices.map(c => {
        const v = typeof c === "object" ? c.value : c;
        const l = typeof c === "object" ? c.label : c;
        return `<option value="${escapeHtml(v)}" ${String(value) === String(v) ? "selected" : ""}>${escapeHtml(l)}</option>`;
      }).join("")
    }</select>`;
  } else if (rows > 0) {
    input = `<textarea id="${id}" rows="${rows}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} style="width:100%;padding:9px 12px;border:1px solid #CFDEE7;border-radius:6px;font-size:14px;font-family:inherit;resize:vertical">${escapeHtml(value)}</textarea>`;
  } else {
    input = `<input id="${id}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? "required" : ""} style="width:100%;padding:9px 12px;border:1px solid #CFDEE7;border-radius:6px;font-size:14px">`;
  }
  return `<div style="margin-bottom:14px"><label for="${id}" style="display:block;font-size:12px;font-weight:600;color:#113C58;margin-bottom:4px">${escapeHtml(label)}</label>${input}${hint ? `<div style="font-size:11px;color:#94A3B8;margin-top:3px">${escapeHtml(hint)}</div>` : ""}</div>`;
}

function val(id) { return (document.getElementById(id)?.value || "").trim(); }
function valNum(id) { const v = parseInt(val(id)); return isNaN(v) ? null : v; }

/* ============ MODAIS DE FORM ============ */
async function openCreateCourse() {
  showModal({
    title: "Adicionar curso",
    bodyHtml:
      fld("c-name", "Nome do curso *", { placeholder: "Ex: Treinamento de Vendas Avançado" }) +
      fld("c-code", "Código (opcional)", { required: false, placeholder: "Ex: VND-105" }) +
      fld("c-category", "Categoria", { choices: ["Técnicas de venda", "Catálogo técnico", "Atendimento ao cliente", "Compliance", "Geral"] }) +
      fld("c-description", "Descrição", { rows: 3, required: false, placeholder: "O que esse curso ensina?" }) +
      fld("c-status", "Status", { choices: [{value:"active",label:"Ativo"},{value:"draft",label:"Rascunho"}] }),
    okText: "Criar curso",
    onOk: async () => {
      const name = val("c-name"); if (!name) throw new Error("nome obrigatório");
      const body = {
        name,
        code: val("c-code") || null,
        category: val("c-category"),
        description: val("c-description"),
        status: val("c-status"),
      };
      await api("/api/courses", { method: "POST", body: JSON.stringify(body) });
      toast("Curso criado ✓");
      if (typeof renderCourses === "function") await renderCourses();
    },
  });
}

async function openEditCourse(courseId) {
  const c = await api(`/api/courses/${courseId}`);
  showModal({
    title: "Editar curso",
    bodyHtml:
      fld("c-name", "Nome", { value: c.name }) +
      fld("c-code", "Código", { value: c.code || "", required: false }) +
      fld("c-category", "Categoria", { value: c.category, choices: ["Técnicas de venda", "Catálogo técnico", "Atendimento ao cliente", "Compliance", "Geral"] }) +
      fld("c-description", "Descrição", { rows: 3, required: false, value: c.description || "" }) +
      fld("c-status", "Status", { value: c.status, choices: [{value:"active",label:"Ativo"},{value:"draft",label:"Rascunho"},{value:"archived",label:"Arquivado"}] }),
    okText: "Salvar",
    onOk: async () => {
      await api(`/api/courses/${courseId}`, { method: "PATCH", body: JSON.stringify({
        name: val("c-name"), code: val("c-code") || null, category: val("c-category"),
        description: val("c-description"), status: val("c-status"),
      })});
      toast("Curso atualizado ✓");
      if (typeof renderCourseDetail === "function") await renderCourseDetail();
    },
  });
}

async function openArchiveCourse(courseId) {
  if (!confirm("Arquivar este curso? Ele não aparecerá mais pra alunos.")) return;
  try {
    await api(`/api/courses/${courseId}`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) });
    toast("Curso arquivado");
    location.hash = "#/courses";
  } catch (e) { alert("Erro: " + e.message); }
}

async function openCreateUser() {
  showModal({
    title: "Adicionar utilizador",
    bodyHtml:
      fld("u-name", "Nome *") +
      fld("u-surname", "Sobrenome", { required: false }) +
      fld("u-email", "E-mail *", { type: "email" }) +
      fld("u-login", "Login *", { hint: "Único, usado pra entrar (ex: 'rcarlos')" }) +
      fld("u-password", "Senha inicial *", { type: "password", hint: "Mínimo 6 caracteres", value: "napel2026" }) +
      fld("u-type", "Tipo", { choices: ["Learner-Type", "Instructor-Type", "Admin", "SuperAdmin"] }) +
      fld("u-branch", "Filial", { choices: ["MGA", "LEM", "PTA"] }),
    okText: "Criar utilizador",
    onOk: async () => {
      const body = {
        name: val("u-name"), surname: val("u-surname"),
        email: val("u-email"), login: val("u-login"),
        password: val("u-password"),
        user_type: val("u-type"), branch: val("u-branch"),
      };
      await api("/api/users", { method: "POST", body: JSON.stringify(body) });
      toast("Usuário criado ✓");
    },
  });
}

async function openEditUser(userId) {
  const u = await api(`/api/users/${userId}`);
  const meRole = state.user?.user_type;
  const canChangeType = meRole === "SuperAdmin" || meRole === "Admin";
  showModal({
    title: "Editar utilizador",
    bodyHtml:
      fld("u-name", "Nome", { value: u.name }) +
      fld("u-surname", "Sobrenome", { value: u.surname || "", required: false }) +
      fld("u-email", "E-mail", { type: "email", value: u.email }) +
      (canChangeType ? fld("u-type", "Tipo", { value: u.user_type, choices: ["Learner-Type", "Instructor-Type", "Admin", "SuperAdmin"] }) : "") +
      (canChangeType ? fld("u-branch", "Filial", { value: u.branch, choices: ["MGA", "LEM", "PTA"] }) : "") +
      (canChangeType ? fld("u-status", "Status", { value: u.status, choices: [{value:"active",label:"Ativo"},{value:"inactive",label:"Inativo"}] }) : ""),
    okText: "Salvar",
    onOk: async () => {
      const body = { name: val("u-name"), surname: val("u-surname"), email: val("u-email") };
      if (canChangeType) {
        body.user_type = val("u-type"); body.branch = val("u-branch"); body.status = val("u-status");
      }
      await api(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(body) });
      toast("Usuário atualizado ✓");
      if (typeof renderUserDetail === "function") await renderUserDetail();
    },
  });
}

async function openCreateUnit(courseId) {
  showModal({
    title: "Adicionar unidade",
    bodyHtml:
      fld("un-title", "Título da unidade *", { placeholder: "Ex: Como qualificar um lead" }) +
      fld("un-type", "Tipo", { choices: [
        {value:"video",label:"Vídeo"},
        {value:"text",label:"Texto"},
        {value:"quiz",label:"Quiz"},
        {value:"pdf",label:"PDF"},
        {value:"scorm",label:"SCORM"},
      ]}) +
      fld("un-duration", "Duração (min)", { type: "number", value: "10" }) +
      fld("un-content", "Conteúdo / URL", { rows: 3, required: false, hint: "Pra vídeo/pdf: URL. Pra texto: markdown. Pra quiz: deixe vazio (use admin avançado)." }),
    okText: "Adicionar",
    onOk: async () => {
      const type = val("un-type");
      const contentRaw = val("un-content");
      let content = {};
      if (type === "video") content = { video_url: contentRaw || "https://www.w3schools.com/html/mov_bbb.mp4" };
      else if (type === "pdf") content = { pdf_url: contentRaw || "https://example.com/file.pdf" };
      else if (type === "text") content = { text_md: contentRaw || "Conteúdo da unidade." };
      else if (type === "quiz") content = { passing_score: 70, max_attempts: 3, questions: [
        { q: "Editar essa pergunta no JSON do unit. Esta é a opção correta?", options: ["Não", "Sim", "Talvez", "Depois"], correct: 1 }
      ]};
      const body = { title: val("un-title"), type, duration_min: valNum("un-duration") || 5, content };
      await api(`/api/courses/${courseId}/units`, { method: "POST", body: JSON.stringify(body) });
      toast("Unidade adicionada ✓");
      if (typeof renderCourseDetail === "function") await renderCourseDetail();
    },
  });
}

async function openEnrollUserModal(userId) {
  const courses = await api("/api/courses?status=active");
  showModal({
    title: "Inscrever em um curso",
    bodyHtml:
      `<div style="margin-bottom:14px;font-size:13px;color:#64748B">Selecione um curso pra matricular este utilizador.</div>` +
      fld("en-course", "Curso", { choices: courses.map(c => ({value:c.id, label:c.name})) }) +
      fld("en-role", "Papel", { choices: ["Estudante", "Professor", "Trainer"] }),
    okText: "Inscrever",
    onOk: async () => {
      const courseId = parseInt(val("en-course"));
      const role = val("en-role");
      await api("/api/enrollments/admin", { method: "POST", body: JSON.stringify({
        user_id: userId, course_id: courseId, role
      })});
      toast("Inscrito ✓");
      if (typeof renderUserDetail === "function") await renderUserDetail();
    },
  });
}

async function selfEnroll(courseId) {
  if (!confirm("Inscrever-se neste curso?")) return;
  try {
    await api("/api/enrollments", { method: "POST", body: JSON.stringify({ course_id: courseId }) });
    toast("Você foi inscrito ✓");
    if (typeof renderProfile === "function" && location.hash.startsWith("#/profile")) await renderProfile();
  } catch (e) {
    if (e.message.includes("409")) toast("Você já está inscrito", "info"); else alert("Erro: " + e.message);
  }
}

async function unenroll(enrollId) {
  if (!confirm("Remover esta matrícula? O progresso da pessoa nesse curso será apagado.")) return;
  try {
    await api(`/api/enrollments/${enrollId}`, { method: "DELETE" });
    toast("Matrícula removida");
    if (typeof renderUserDetail === "function") await renderUserDetail();
  } catch (e) { alert("Erro: " + e.message); }
}

async function changeEnrollmentRole(enrollId, newRole) {
  try {
    await api(`/api/enrollments/${enrollId}`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
    toast(`Papel alterado pra ${newRole}`, "info");
  } catch (e) { alert("Erro: " + e.message); }
}

async function logoutEverywhere() {
  if (!confirm("Encerrar sessão e voltar ao login?")) return;
  doLogout();
}

async function openEditProfile() {
  await openEditUser(state.user.id);
}

async function impersonate(userId) {
  if (userId === state.user.id) { toast("Você já é você", "info"); return; }
  toast("Personificação não disponível na demo (gera nova sessão). Use logout + login direto.", "info");
}

/* ============ QUIZ INTERATIVO ============ */
let quizState = { unitId: null, qIdx: 0, totalQ: 0, answered: {}, finished: false };

async function loadQuizIntoPlayer(unitId) {
  try {
    const unit = await api(`/api/units/${unitId}`);
    if (unit.type !== "quiz") return false;
    const questions = (unit.content || {}).questions || [];
    quizState = { unitId, qIdx: 0, totalQ: questions.length, answered: {}, finished: false, unit };
    renderQuizQuestion();
    return true;
  } catch (e) { return false; }
}

function renderQuizQuestion() {
  const u = quizState.unit;
  const idx = quizState.qIdx;
  const q = u.content.questions[idx];
  // header da pergunta
  const h2 = document.querySelector("#page-quiz .bg-white.border.border-borderd.rounded-lg.p-6 h2");
  if (h2) h2.textContent = q.q;
  // alternativas
  const optionsContainer = document.querySelector('#page-quiz [role="radiogroup"]');
  if (optionsContainer) {
    optionsContainer.innerHTML = q.options.map((opt, i) => `
      <label class="quiz-option" data-q-opt="${i}" tabindex="0">
        <span class="opt-letter">${String.fromCharCode(65 + i)}</span>
        <div class="flex-1"><div class="text-sm text-slate-800">${escapeHtml(opt)}</div></div>
      </label>`).join("");
  }
  // header timer/tentativa (titulo)
  const headerH1 = document.querySelector("#page-quiz h1");
  if (headerH1) headerH1.textContent = u.title;
  const sub = document.querySelector("#page-quiz h1 + p");
  if (sub) sub.textContent = `Pergunta ${idx + 1} de ${quizState.totalQ} · nota mínima ${u.content.passing_score || 70}%`;
  // progresso bar
  const bars = document.querySelectorAll("#page-quiz .flex.gap-1 > span");
  bars.forEach((b, i) => {
    b.classList.remove("bg-success-bd", "bg-naval", "bg-borderd", "bg-danger-bd");
    if (i < idx) b.classList.add(quizState.answered[i]?.correct ? "bg-success-bd" : "bg-danger-bd");
    else if (i === idx) b.classList.add("bg-naval");
    else b.classList.add("bg-borderd");
  });
  const progLabel = document.querySelector("#page-quiz .flex.items-center.justify-between.mb-2 span:first-child");
  if (progLabel) progLabel.textContent = `Pergunta ${idx + 1} de ${quizState.totalQ}`;
  // footer buttons
  const nav = document.querySelector("#page-quiz .flex.flex-col.sm\\:flex-row.gap-3.justify-between.mb-12");
  if (nav) {
    const answered = quizState.answered[idx];
    nav.innerHTML = `
      <button data-action="quiz-prev" ${idx === 0 ? "disabled" : ""} class="px-4 py-3 bg-white border border-borderd rounded-md text-sm font-semibold text-naval hover:bg-gelo flex items-center justify-center gap-2 ${idx === 0 ? "opacity-40 cursor-not-allowed" : ""}">
        ← Pergunta anterior
      </button>
      <button data-action="${answered ? "quiz-next" : "quiz-submit"}" class="px-6 py-3 bg-naval text-white rounded-md text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-2 shadow-sm">
        ${answered ? (idx + 1 < quizState.totalQ ? "Próxima pergunta →" : "Ver resultado →") : "Submeter resposta"}
      </button>`;
  }
  // se já respondida, marca seleção e mostra resultado
  if (quizState.answered[idx]) {
    const ans = quizState.answered[idx];
    optionsContainer.querySelectorAll(".quiz-option").forEach((o, i) => {
      if (i === ans.selected) o.classList.add("selected");
      if (i === ans.correct_idx) o.style.borderColor = "#10B981";
    });
  }
}

async function submitQuizAnswer() {
  const idx = quizState.qIdx;
  const sel = document.querySelector("#page-quiz .quiz-option.selected");
  if (!sel) { toast("Escolha uma alternativa primeiro", "info"); return; }
  const selectedIdx = parseInt(sel.dataset.qOpt);
  try {
    const res = await api(`/api/units/${quizState.unitId}/quiz-answer?q_idx=${idx}`, {
      method: "POST", body: JSON.stringify({ selected_idx: selectedIdx })
    });
    quizState.answered[idx] = { selected: selectedIdx, correct: res.correct, correct_idx: res.correct_idx };
    if (res.correct) toast("Resposta correta! ✓", "success");
    else toast(`Errou. Resposta certa: opção ${String.fromCharCode(65 + res.correct_idx)}`, "error");
    // se finalizou
    if (idx + 1 >= quizState.totalQ) {
      quizState.finished = true;
      showQuizResult(res);
    } else {
      renderQuizQuestion(); // re-render mostrando resultado
    }
    // refresh user points
    if (res.earned_points) { state.user = await api("/api/auth/me"); }
  } catch (e) { alert("Erro: " + e.message); }
}

function showQuizResult(res) {
  const card = document.querySelector("#page-quiz .bg-white.border.border-borderd.rounded-lg.p-6, #page-quiz .bg-white.border.border-borderd.rounded-lg.p-6.md\\:p-8");
  if (!card) return;
  const correctN = Object.values(quizState.answered).filter(a => a.correct).length;
  const total = quizState.totalQ;
  card.outerHTML = `
    <div class="bg-white border border-borderd rounded-lg overflow-hidden mb-4">
      <div class="${res.passed ? "bg-success-bg" : "bg-danger-bg"} p-6 text-center border-b ${res.passed ? "border-success-bd" : "border-danger-bd"}">
        <div class="w-16 h-16 ${res.passed ? "bg-success-bd" : "bg-danger-bd"} text-white rounded-full mx-auto flex items-center justify-center mb-3">
          <i data-lucide="${res.passed ? "check" : "x"}" class="w-8 h-8"></i>
        </div>
        <h3 class="text-2xl font-bold ${res.passed ? "text-success-fg" : "text-danger-fg"} mb-1">${correctN} / ${total} — ${res.passed ? "Aprovado!" : "Reprovado"}</h3>
        <p class="text-sm ${res.passed ? "text-success-fg" : "text-danger-fg"}">Pontuação: ${res.score_pct}% · mínimo ${quizState.unit.content.passing_score || 70}%${res.earned_points ? ` · <strong>+${res.earned_points} pts ganhos!</strong>` : ""}</p>
      </div>
      <div class="p-6 flex justify-center gap-3 flex-wrap">
        ${res.next_unit_id ? `<a href="#/unit-player?course=${quizState.unit.course_id}&unit=${res.next_unit_id}" class="px-4 py-3 bg-naval text-white rounded-md text-sm font-semibold">Próxima unidade →</a>` : ""}
        <a href="#/course-detail?id=${quizState.unit.course_id}" class="px-4 py-3 bg-white border border-borderd rounded-md text-sm font-semibold text-naval">Voltar ao curso</a>
      </div>
    </div>`;
  rerunLucide();
}

/* ============ UNIT PLAYER NAV ============ */
async function navUnit(direction) {
  const qs = new URLSearchParams(location.hash.split("?")[1] || "");
  const courseId = qs.get("course");
  const unitId = qs.get("unit");
  if (!courseId || !unitId) return;
  try {
    const nav = await api(`/api/courses/${courseId}/units/${unitId}/next`);
    const target = direction === "next" ? nav.next_unit_id : nav.prev_unit_id;
    if (!target) {
      toast(direction === "next" ? "Esta é a última unidade" : "Esta é a primeira unidade", "info");
      return;
    }
    location.hash = `#/unit-player?course=${courseId}&unit=${target}`;
  } catch (e) { alert("Erro: " + e.message); }
}

/* ============ FILTROS DE CURSOS ============ */
let coursesAllCache = null;
async function applyCoursesFilter() {
  if (!coursesAllCache) coursesAllCache = await api("/api/courses");
  const search = document.querySelector("#page-courses input[type=search]")?.value.toLowerCase() || "";
  const cat = document.querySelector("#page-courses select:nth-of-type(1)")?.value || "";
  const status = document.querySelector("#page-courses select:nth-of-type(2)")?.value || "";
  const filtered = coursesAllCache.filter(c => {
    if (search && !(c.name.toLowerCase().includes(search) || (c.code || "").toLowerCase().includes(search))) return false;
    if (cat && !cat.startsWith("Todas") && c.category !== cat) return false;
    if (status && !status.startsWith("Todos") && c.status !== status.toLowerCase()) return false;
    return true;
  });
  // render filtered
  const grid = document.querySelector("#page-courses .grid.grid-cols-1");
  if (!grid) return;
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-3 text-center py-12 text-slate-500"><i data-lucide="search-x" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i><p>Nenhum curso encontrado com esses filtros.</p></div>`;
  } else {
    const html = filtered.map(c => courseCardHtml(c)).join("");
    grid.innerHTML = html;
  }
  rerunLucide();
}

function courseCardHtml(c) {
  const SEED_CLASS = ["skeleton-thumb","skeleton-thumb-2","skeleton-thumb-3","skeleton-thumb-4","skeleton-thumb-5"];
  const tc = SEED_CLASS[(c.thumbnail_seed - 1) % 5] || "skeleton-thumb";
  return `<article class="bg-white border border-borderd rounded-lg overflow-hidden hover:shadow-md transition-shadow group cursor-pointer" onclick="location.hash='#/course-detail?id=${c.id}'">
    <div class="${tc} aspect-video relative">
      <span class="absolute top-3 left-3 badge ${c.status === "active" ? "badge-success" : c.status === "draft" ? "badge-warn" : "badge-neutral"}">${c.status}</span>
      <div class="absolute inset-0 flex items-center justify-center"><i data-lucide="${escapeHtml(c.icon)}" class="w-14 h-14 text-white/80"></i></div>
    </div>
    <div class="p-4">
      <div class="text-[11px] font-semibold uppercase tracking-wider text-ceu mb-1.5">${escapeHtml(c.category)}${c.code ? " · " + escapeHtml(c.code) : ""}</div>
      <h3 class="text-sm font-semibold text-naval mb-3 line-clamp-2 min-h-[40px]">${escapeHtml(c.name)}</h3>
      <div class="flex items-center gap-3 text-xs text-slate-500 mb-3">
        <span>${c.units_count} units</span><span>${c.enrollments_count} matriculados</span>
      </div>
      <a href="#/course-detail?id=${c.id}" class="text-xs font-semibold text-naval">Ver curso →</a>
    </div>
  </article>`;
}

/* ============ EXPORT CSV ============ */
function exportCsv(filename, rows, headers) {
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast("CSV baixado ✓");
}

async function deleteUser(userId) {
  if (!confirm("Deletar este utilizador? Todas as matrículas e progresso dele serão apagados.")) return;
  try {
    await api(`/api/users/${userId}`, { method: "DELETE" });
    toast("Utilizador deletado");
    if (typeof renderUsers === "function") await renderUsers();
  } catch (e) { alert("Erro: " + e.message); }
}

async function exportUsersCsv() {
  const users = await api("/api/users");
  exportCsv("utilizadores.csv", users.map(u => ({
    id: u.id, login: u.login, nome: u.name, sobrenome: u.surname || "", email: u.email,
    tipo: u.user_type, filial: u.branch, status: u.status, nivel: u.level, pontos: u.points,
    ultimo_login: u.last_login || "",
  })), ["id", "login", "nome", "sobrenome", "email", "tipo", "filial", "status", "nivel", "pontos", "ultimo_login"]);
}

async function exportCoursesCsv() {
  if (!coursesAllCache) coursesAllCache = await api("/api/courses");
  exportCsv("cursos.csv", coursesAllCache.map(c => ({
    id: c.id, codigo: c.code || "", nome: c.name, categoria: c.category, status: c.status,
    units: c.units_count, matriculados: c.enrollments_count,
  })), ["id","codigo","nome","categoria","status","units","matriculados"]);
}

async function exportUserCoursesCsv(userId) {
  const u = await api(`/api/users/${userId}`);
  exportCsv(`cursos-${u.login}.csv`, u.enrollments.map(e => ({
    enrollment_id: e.id, course_id: e.course_id, role: e.role,
    matriculado_em: e.enrolled_at, concluido_em: e.completed_at || "",
    progresso_pct: e.progress_pct,
  })), ["enrollment_id","course_id","role","matriculado_em","concluido_em","progresso_pct"]);
}

/* ============ DELEGATION ============ */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const act = t.dataset.action;
  const id = t.dataset.id ? parseInt(t.dataset.id) : null;
  e.preventDefault(); e.stopPropagation();
  switch (act) {
    case "create-course": return openCreateCourse();
    case "create-user": return openCreateUser();
    case "create-unit": return openCreateUnit(id || currentCourseIdFromHash());
    case "edit-course": return openEditCourse(id || currentCourseIdFromHash());
    case "archive-course": return openArchiveCourse(id || currentCourseIdFromHash());
    case "edit-user": return openEditUser(id || currentUserIdFromHash());
    case "edit-profile": return openEditProfile();
    case "enroll-self": return selfEnroll(id || currentCourseIdFromHash());
    case "enroll-user": return openEnrollUserModal(id || currentUserIdFromHash());
    case "unenroll": return unenroll(id);
    case "impersonate": return impersonate(id);
    case "logout-all": return logoutEverywhere();
    case "quiz-submit": return submitQuizAnswer();
    case "quiz-next": { quizState.qIdx = Math.min(quizState.qIdx + 1, quizState.totalQ - 1); return renderQuizQuestion(); }
    case "quiz-prev": { quizState.qIdx = Math.max(quizState.qIdx - 1, 0); return renderQuizQuestion(); }
    case "next-unit": return navUnit("next");
    case "prev-unit": return navUnit("prev");
    case "export-courses-csv": return exportCoursesCsv();
    case "export-user-courses-csv": return exportUserCoursesCsv(id || currentUserIdFromHash());
    case "export-users-csv": return exportUsersCsv();
    case "delete-user": return deleteUser(id);
    case "placeholder": return toast("Em breve nesta demo. Por enquanto é só visual.", "info");
  }
});

// quiz: clique em opção
document.addEventListener("click", e => {
  const opt = e.target.closest("#page-quiz .quiz-option");
  if (!opt) return;
  document.querySelectorAll("#page-quiz .quiz-option").forEach(o => o.classList.remove("selected"));
  opt.classList.add("selected");
});

// search/filter cursos
document.addEventListener("input", e => {
  if (e.target.closest("#page-courses input[type=search], #page-courses select")) {
    applyCoursesFilter();
  }
  if (e.target.closest("#page-users input[type=search], #page-users select")) {
    applyUsersFilter();
  }
});
document.addEventListener("change", e => {
  if (e.target.closest("#page-users select")) applyUsersFilter();
});

// dropdown role no user-detail (delegated change)
document.addEventListener("change", e => {
  const sel = e.target.closest("#page-user-detail td select");
  if (!sel) return;
  const row = sel.closest("tr");
  const enrollId = row?.dataset.enrollId;
  if (enrollId) changeEnrollmentRole(parseInt(enrollId), sel.value);
});

// reset cache de courses quando navega
window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#/courses")) coursesAllCache = null;
  if (location.hash.startsWith("#/users")) usersAllCache = null;
  // quiz auto-load
  if (location.hash.startsWith("#/quiz")) {
    const qs = new URLSearchParams(location.hash.split("?")[1] || "");
    const unitId = qs.get("unit");
    if (unitId) loadQuizIntoPlayer(parseInt(unitId));
  }
  // unit player: se é quiz, redireciona pra quiz
  if (location.hash.startsWith("#/unit-player")) {
    setTimeout(async () => {
      const qs = new URLSearchParams(location.hash.split("?")[1] || "");
      const unitId = qs.get("unit");
      const courseId = qs.get("course");
      if (unitId) {
        try {
          const unit = await api(`/api/units/${unitId}`);
          if (unit.type === "quiz") location.hash = `#/quiz?course=${courseId}&unit=${unitId}`;
        } catch {}
      }
    }, 200);
  }
});

function currentCourseIdFromHash() {
  return parseInt(new URLSearchParams(location.hash.split("?")[1] || "").get("id") || "0") || null;
}
function currentUserIdFromHash() {
  return parseInt(new URLSearchParams(location.hash.split("?")[1] || "").get("id") || "0") || state.user?.id;
}

console.log("[actions.js] loaded — CRUD handlers ativos");
