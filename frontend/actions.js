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
  const cats = await api("/api/categories").catch(() => []);
  const catChoices = cats.length ? cats.map(c => c.name) : ["Geral"];
  showModal({
    title: "Adicionar curso",
    bodyHtml:
      fld("c-name", "Nome do curso *", { placeholder: "Ex: Treinamento de Vendas Avançado" }) +
      fld("c-code", "Código (opcional)", { required: false, placeholder: "Ex: VND-105" }) +
      fld("c-category", "Categoria", { choices: catChoices }) +
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
  const [c, cats] = await Promise.all([
    api(`/api/courses/${courseId}`),
    api("/api/categories").catch(() => []),
  ]);
  const catChoices = cats.length ? cats.map(cat => cat.name) : ["Geral"];
  showModal({
    title: "Editar curso",
    bodyHtml:
      fld("c-name", "Nome", { value: c.name }) +
      fld("c-code", "Código", { value: c.code || "", required: false }) +
      fld("c-category", "Categoria", { value: c.category, choices: catChoices }) +
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

async function openEditUnit(unitId) {
  const u = await api(`/api/units/${unitId}`);
  const c = u.content || {};
  const typeIsQuiz = u.type === "quiz";
  const initialQuestions = typeIsQuiz ? (c.questions || [{ q: "", options: ["", "", "", ""], correct: 0 }]) : [];

  const body = `
    ${fld("eu-title", "Título *", { value: u.title })}
    ${fld("eu-section", "Grupo/Semana (opcional)", { value: u.section || "", required: false, placeholder: "Ex: Semana 1 — Casa e Língua", hint: "Se preenchido, aulas com o mesmo texto ficam agrupadas na tela do curso" })}
    ${fld("eu-type", "Tipo", { value: u.type, choices: [
      {value:"video",label:"Vídeo"},{value:"audio",label:"Áudio"},{value:"text",label:"Texto / Apostila"},{value:"quiz",label:"Quiz / Prova"},{value:"pdf",label:"PDF"},{value:"scorm",label:"SCORM"}
    ]})}
    ${fld("eu-duration", "Duração (min)", { type: "number", value: String(u.duration_min || 5) })}
    <div id="eu-content-area">
      <div id="eu-fld-video" class="${u.type === "video" ? "" : "hidden"}">${fld("eu-video-url", "URL do vídeo (YouTube ou MP4)", { value: c.video_url || "", required: false, placeholder: "https://www.youtube.com/watch?v=…" })}</div>
      <div id="eu-fld-audio" class="${u.type === "audio" ? "" : "hidden"}">${fld("eu-audio-url", "URL do áudio (MP3/OGG/WAV)", { value: c.audio_url || "", required: false, placeholder: "https://…/aula.mp3", hint: "Player de áudio HTML5 nativo" })}</div>
      <div id="eu-fld-pdf" class="${u.type === "pdf" ? "" : "hidden"}">${fld("eu-pdf-url", "URL do PDF", { value: c.pdf_url || "", required: false, placeholder: "https://…/arquivo.pdf" })}</div>
      <div id="eu-fld-text" class="${u.type === "text" ? "" : "hidden"}">${fld("eu-text-md", "Conteúdo (markdown)", { value: c.text_md || "", required: false, rows: 8, hint: "Suporta **negrito**, *itálico*, # títulos, listas, links" })}</div>
      <div id="eu-fld-quiz" class="${typeIsQuiz ? "" : "hidden"}">
        ${fld("eu-quiz-pass", "Nota mínima (%)", { type: "number", value: String(c.passing_score || 70), required: false })}
        ${fld("eu-quiz-attempts", "Máximo de tentativas", { type: "number", value: String(c.max_attempts || 3), required: false })}
        <div style="margin-top:8px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
          <label style="font-size:12px;font-weight:600;color:#113C58">Perguntas</label>
          <button type="button" onclick="addQuestionRow()" style="padding:4px 12px;background:#113C58;color:white;border:none;border-radius:6px;font-size:11px;cursor:pointer">+ Pergunta</button>
        </div>
        <div id="quiz-questions"></div>
      </div>
    </div>
  `;

  showModal({
    title: "Editar unidade",
    bodyHtml: body,
    okText: "Salvar",
    onOk: async () => {
      const type = val("eu-type");
      let content = {};
      if (type === "video") content = { video_url: val("eu-video-url") };
      else if (type === "audio") content = { audio_url: val("eu-audio-url") };
      else if (type === "pdf") content = { pdf_url: val("eu-pdf-url") };
      else if (type === "text") content = { text_md: val("eu-text-md") };
      else if (type === "quiz") {
        const questions = collectQuizQuestions();
        if (questions.length === 0) throw new Error("Adicione ao menos 1 pergunta");
        content = {
          passing_score: parseInt(val("eu-quiz-pass")) || 70,
          max_attempts: parseInt(val("eu-quiz-attempts")) || 3,
          questions,
        };
      }
      await api(`/api/units/${unitId}`, { method: "PATCH", body: JSON.stringify({
        title: val("eu-title"), type, duration_min: parseInt(val("eu-duration")) || 5,
        section: val("eu-section") || null, content,
      })});
      toast("Unidade atualizada ✓");
      if (typeof renderCourseDetail === "function") await renderCourseDetail();
    },
  });

  // popular perguntas de quiz
  if (typeIsQuiz) {
    initialQuestions.forEach(q => addQuestionRow(q));
  }

  // toggle conteúdo por tipo
  document.getElementById("eu-type").onchange = (e) => {
    ["video", "audio", "pdf", "text", "quiz"].forEach(t => {
      const el = document.getElementById(`eu-fld-${t}`);
      if (el) el.classList.toggle("hidden", e.target.value !== t);
    });
    if (e.target.value === "quiz" && document.querySelectorAll("#quiz-questions > div").length === 0) {
      addQuestionRow();
    }
  };
}

function addQuestionRow(initial) {
  const container = document.getElementById("quiz-questions");
  if (!container) return;
  const idx = container.children.length;
  const q = initial || { q: "", options: ["", "", "", ""], correct: 0 };
  const row = document.createElement("div");
  row.className = "qrow";
  row.style.cssText = "background:#FAFCFD;border:1px solid #E4EEF3;border-radius:6px;padding:12px;margin-bottom:8px";
  row.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase">Pergunta ${idx + 1}</span>
      <button type="button" onclick="this.parentElement.parentElement.remove()" style="background:transparent;border:none;color:#EF4444;cursor:pointer;font-size:18px">✕</button>
    </div>
    <input type="text" class="qrow-q" value="${escapeHtml(q.q)}" placeholder="Texto da pergunta…" style="width:100%;padding:6px 10px;border:1px solid #CFDEE7;border-radius:4px;font-size:13px;margin-bottom:8px">
    ${[0,1,2,3].map(i => `
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px;cursor:pointer">
        <input type="radio" name="correct-${idx}" class="qrow-correct" value="${i}" ${i === q.correct ? "checked" : ""}>
        <span style="font-weight:600;color:#113C58;width:18px">${String.fromCharCode(65+i)})</span>
        <input type="text" class="qrow-opt" data-i="${i}" value="${escapeHtml((q.options || [])[i] || '')}" placeholder="Alternativa ${String.fromCharCode(65+i)}" style="flex:1;padding:5px 8px;border:1px solid #CFDEE7;border-radius:4px;font-size:12px">
      </label>`).join("")}
  `;
  container.appendChild(row);
}
window.addQuestionRow = addQuestionRow;

function collectQuizQuestions() {
  const rows = document.querySelectorAll("#quiz-questions > .qrow");
  const out = [];
  rows.forEach(row => {
    const q = row.querySelector(".qrow-q").value.trim();
    if (!q) return;
    const opts = Array.from(row.querySelectorAll(".qrow-opt")).map(i => i.value.trim());
    const correct = parseInt((row.querySelector(".qrow-correct:checked") || { value: 0 }).value);
    out.push({ q, options: opts, correct });
  });
  return out;
}

async function deleteUnit(unitId) {
  if (!confirm("Deletar esta unidade? Conteúdo e progressos dos alunos serão perdidos.")) return;
  try {
    await api(`/api/units/${unitId}`, { method: "DELETE" });
    toast("Unidade deletada");
    if (typeof renderCourseDetail === "function") await renderCourseDetail();
  } catch (e) { alert("Erro: " + e.message); }
}

async function openCreateUnit(courseId) {
  showModal({
    title: "Adicionar unidade",
    bodyHtml:
      fld("un-title", "Título da unidade *", { placeholder: "Ex: Introdução em vídeo" }) +
      fld("un-type", "Tipo de conteúdo", { choices: [
        {value:"video",label:"Vídeo (YouTube ou MP4)"},
        {value:"audio",label:"Áudio (MP3/OGG)"},
        {value:"text",label:"Texto / Apostila"},
        {value:"pdf",label:"PDF"},
        {value:"quiz",label:"Quiz / Prova de proficiência"},
        {value:"scorm",label:"SCORM"},
      ]}) +
      fld("un-duration", "Duração estimada (min)", { type: "number", value: "10" }) +
      `<div style="font-size:12px;color:#64748B;padding:8px 10px;background:#EBF7FA;border-radius:6px">Após criar, o editor abre pra você colar a URL / escrever o texto / montar as perguntas.</div>`,
    okText: "Criar e editar conteúdo",
    onOk: async () => {
      const type = val("un-type");
      // conteúdo inicial vazio por tipo
      let content = {};
      if (type === "quiz") content = { passing_score: 70, max_attempts: 3, questions: [] };
      const body = { title: val("un-title"), type, duration_min: valNum("un-duration") || 5, content };
      const created = await api(`/api/courses/${courseId}/units`, { method: "POST", body: JSON.stringify(body) });
      toast("Unidade criada — configure o conteúdo ✓");
      if (typeof renderCourseDetail === "function") await renderCourseDetail();
      // abre o editor completo da unidade recém-criada
      setTimeout(() => openEditUnit(created.id), 150);
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
    // breadcrumb dinâmico do quiz
    const course = await api(`/api/courses/${unit.course_id}`).catch(() => null);
    const bc = document.querySelector("#page-quiz nav");
    if (bc && course) {
      bc.innerHTML = `<a href="#/courses" class="hover:text-naval">Cursos</a>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        <a href="#/course-detail?id=${unit.course_id}" class="hover:text-naval">${escapeHtml(course.name)}</a>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        <span class="text-naval font-medium">${escapeHtml(unit.title)}</span>`;
      if (window.lucide) lucide.createIcons();
    }
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

async function showQuizResult(res) {
  const card = document.querySelector("#page-quiz .bg-white.border.border-borderd.rounded-lg.p-6, #page-quiz .bg-white.border.border-borderd.rounded-lg.p-6.md\\:p-8");
  if (!card) return;
  const correctN = Object.values(quizState.answered).filter(a => a.correct).length;
  const total = quizState.totalQ;
  const minScore = quizState.unit.content.passing_score || 70;
  // status de tentativas
  let st = { remaining: 0, max_attempts: 3, attempts_used: 1 };
  try { st = await api(`/api/units/${quizState.unitId}/quiz-status`); } catch (e) {}
  const canRetry = !res.passed && st.remaining > 0;
  card.outerHTML = `
    <div class="bg-white border border-borderd rounded-lg overflow-hidden mb-4">
      <div class="${res.passed ? "bg-success-bg" : "bg-danger-bg"} p-6 text-center border-b ${res.passed ? "border-success-bd" : "border-danger-bd"}">
        <div class="w-16 h-16 ${res.passed ? "bg-success-bd" : "bg-danger-bd"} text-white rounded-full mx-auto flex items-center justify-center mb-3">
          <i data-lucide="${res.passed ? "award" : "x"}" class="w-8 h-8"></i>
        </div>
        <h3 class="text-2xl font-bold ${res.passed ? "text-success-fg" : "text-danger-fg"} mb-1">${correctN} / ${total} — ${res.passed ? "Aprovado!" : "Reprovado"}</h3>
        <p class="text-sm ${res.passed ? "text-success-fg" : "text-danger-fg"}">Pontuação: <strong>${res.score_pct}%</strong> · nota mínima ${minScore}%${res.earned_points ? ` · <strong>+${res.earned_points} pts</strong>` : ""}</p>
        <p class="text-xs mt-1 ${res.passed ? "text-success-fg" : "text-danger-fg"}">Tentativa ${st.attempts_used} de ${st.max_attempts}${!res.passed ? (st.remaining > 0 ? ` · ${st.remaining} restante(s)` : " · sem tentativas restantes") : ""}</p>
      </div>
      <div class="p-6 flex justify-center gap-3 flex-wrap">
        ${res.passed && res.next_unit_id ? `<a href="#/unit-player?course=${quizState.unit.course_id}&unit=${res.next_unit_id}" class="px-4 py-3 bg-naval text-white rounded-md text-sm font-semibold">Próxima unidade →</a>` : ""}
        ${canRetry ? `<button data-action="quiz-retry" data-id="${quizState.unitId}" class="px-4 py-3 bg-warn-bd text-white rounded-md text-sm font-semibold">↺ Refazer prova</button>` : ""}
        <a href="#/course-detail?id=${quizState.unit.course_id}" class="px-4 py-3 bg-white border border-borderd rounded-md text-sm font-semibold text-naval">Voltar ao curso</a>
      </div>
    </div>`;
  rerunLucide();
}

async function retryQuiz(unitId) {
  try {
    await api(`/api/units/${unitId}/quiz-reset`, { method: "POST" });
    toast("Prova reiniciada — boa sorte!", "info");
    await loadQuizIntoPlayer(unitId);
  } catch (e) { alert(e.message); }
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
  const cat = document.getElementById("courses-category-filter")?.value || "";
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

async function deleteCourse(courseId) {
  if (!confirm("Deletar este curso permanentemente? Todas as matrículas e progresso serão apagados. (Se quiser só esconder, use 'Arquivar curso')")) return;
  try {
    await api(`/api/courses/${courseId}`, { method: "DELETE" });
    toast("Curso deletado");
    location.hash = "#/courses";
  } catch (e) { alert("Erro: " + e.message); }
}

async function openCourseSettings(courseId) {
  const c = await api(`/api/courses/${courseId}`);
  showModal({
    title: "Configurações do curso",
    bodyHtml:
      `<div style="font-size:13px;color:#64748B;margin-bottom:14px">Ajustes avançados de <strong>${escapeHtml(c.name)}</strong></div>` +
      fld("cs-price", "Preço (R$)", { type: "number", value: String(c.price_amount || 0), required: false, hint: "0 = curso gratuito" }) +
      fld("cs-capacity", "Capacidade (máximo de alunos)", { type: "number", value: c.capacity ? String(c.capacity) : "", required: false, hint: "vazio = ilimitado" }) +
      `<div style="margin-bottom:14px;padding:10px;background:#FAFCFD;border:1px solid #E4EEF3;border-radius:6px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#113C58;cursor:pointer">
          <input type="checkbox" id="cs-hidden" ${c.is_hidden ? "checked" : ""}> <span>Oculto do catálogo (só admin vê)</span>
        </label>
      </div>` +
      `<div style="margin-bottom:14px;padding:10px;background:#FAFCFD;border:1px solid #E4EEF3;border-radius:6px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#113C58;cursor:pointer">
          <input type="checkbox" id="cs-locked" ${c.is_locked ? "checked" : ""}> <span>Bloqueado (precisa admin aprovar inscrição)</span>
        </label>
      </div>` +
      `<div style="margin-bottom:8px;padding:10px;background:#FAFCFD;border:1px solid #E4EEF3;border-radius:6px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#113C58;cursor:pointer">
          <input type="checkbox" id="cs-cert" ${c.issue_certificate ? "checked" : ""}> <span>Emite certificado ao concluir</span>
        </label>
      </div>` +
      fld("cs-certmin", "Nota mínima p/ emitir certificado (%)", { type: "number", value: String(c.certificate_min_score != null ? c.certificate_min_score : 70), required: false, hint: "Certificado só é emitido se a nota média dos quizzes do curso atingir esse valor. Ex: 70" }) +
      `<div style="margin-bottom:14px;padding:10px;background:#FAFCFD;border:1px solid #E4EEF3;border-radius:6px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#113C58;cursor:pointer">
          <input type="checkbox" id="cs-seq" ${c.sequential ? "checked" : ""}> <span>Curso sequencial — aula N+1 só destrava depois de concluir N</span>
        </label>
      </div>` +
      `<div style="margin-bottom:14px;padding:10px;background:#FAFCFD;border:1px solid #E4EEF3;border-radius:6px">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#113C58;cursor:pointer">
          <input type="checkbox" id="cs-ai" ${c.ai_coach ? "checked" : ""}> <span>AI Coach habilitado (futuro)</span>
        </label>
      </div>` +
      `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #E4EEF3">
        <button type="button" onclick="hideModal(); deleteCourse(${courseId})" style="background:#FEE2E2;color:#991B1B;border:1px solid #EF4444;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">🗑 Deletar permanentemente</button>
      </div>`,
    okText: "Salvar configurações",
    onOk: async () => {
      await api(`/api/courses/${courseId}`, { method: "PATCH", body: JSON.stringify({
        price_amount: parseFloat(val("cs-price")) || 0,
        capacity: val("cs-capacity") ? parseInt(val("cs-capacity")) : null,
        is_hidden: document.getElementById("cs-hidden").checked,
        is_locked: document.getElementById("cs-locked").checked,
        issue_certificate: document.getElementById("cs-cert").checked,
        certificate_min_score: parseInt(val("cs-certmin")) || 70,
        sequential: document.getElementById("cs-seq").checked,
        ai_coach: document.getElementById("cs-ai").checked,
      })});
      toast("Configurações salvas ✓");
      if (typeof renderCourseDetail === "function") await renderCourseDetail();
    },
  });
}

async function openBulkEnrollModal(courseId) {
  const [course, allUsers, enrolls] = await Promise.all([
    api(`/api/courses/${courseId}`),
    api("/api/users"),
    api(`/api/courses/${courseId}/enrollments`),
  ]);
  const enrolledIds = new Set(enrolls.map(e => e.user_id));
  const candidates = allUsers.filter(u => !enrolledIds.has(u.id));
  if (candidates.length === 0) {
    toast("Todos os utilizadores já estão matriculados neste curso.", "info");
    return;
  }
  showModal({
    title: `Matricular alunos em "${course.name}"`,
    bodyHtml:
      `<div style="font-size:13px;color:#64748B;margin-bottom:12px">Selecione os utilizadores pra matricular (${candidates.length} disponíveis)</div>` +
      `<div style="margin-bottom:12px"><input id="be-search" type="search" placeholder="Filtrar…" style="width:100%;padding:8px 12px;border:1px solid #CFDEE7;border-radius:6px;font-size:13px"></div>` +
      fld("be-role", "Papel", { choices: ["Estudante", "Professor", "Trainer"] }) +
      `<div style="max-height:300px;overflow-y:auto;border:1px solid #E4EEF3;border-radius:6px">
        <div style="padding:8px 12px;background:#FAFCFD;border-bottom:1px solid #E4EEF3;display:flex;justify-content:space-between;align-items:center">
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;font-weight:600;color:#113C58">
            <input type="checkbox" id="be-all" onchange="document.querySelectorAll('.be-row').forEach(r=>r.checked=this.checked)"> Selecionar todos
          </label>
        </div>
        <div id="be-list">
          ${candidates.map(u => `
            <label class="be-item" data-name="${escapeHtml((u.name + " " + u.surname).toLowerCase())}" data-email="${escapeHtml(u.email.toLowerCase())}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #F1F5F9;cursor:pointer">
              <input type="checkbox" class="be-row" value="${u.id}">
              <div class="avatar" style="width:28px;height:28px;font-size:11px">${escapeHtml(u.avatar_initials)}</div>
              <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#113C58">${escapeHtml(u.name)} ${escapeHtml(u.surname || "")}</div><div style="font-size:11px;color:#64748B">${escapeHtml(u.email)} · ${escapeHtml(u.user_type)} · ${escapeHtml(u.branch)}</div></div>
            </label>`).join("")}
        </div>
      </div>`,
    okText: "Matricular selecionados",
    onOk: async () => {
      const ids = Array.from(document.querySelectorAll(".be-row:checked")).map(c => parseInt(c.value));
      if (ids.length === 0) throw new Error("Selecione ao menos 1 utilizador");
      const r = await api(`/api/courses/${courseId}/enroll-bulk`, {
        method: "POST", body: JSON.stringify({ user_ids: ids, role: val("be-role") }),
      });
      toast(`${r.added} matriculado(s) ✓ · ${r.skipped} já estavam`);
      if (typeof renderCourseDetail === "function") await renderCourseDetail();
    },
  });
  // search filter
  setTimeout(() => {
    document.getElementById("be-search").oninput = (e) => {
      const v = e.target.value.toLowerCase();
      document.querySelectorAll(".be-item").forEach(el => {
        const match = el.dataset.name.includes(v) || el.dataset.email.includes(v);
        el.style.display = match ? "flex" : "none";
      });
    };
  }, 100);
}

/* ============ GROUPS ============ */
async function openCreateGroup() {
  showModal({
    title: "Criar grupo",
    bodyHtml:
      fld("g-name", "Nome do grupo *", { placeholder: "Ex: Vendedores MGA" }) +
      fld("g-description", "Descrição", { required: false, rows: 2, placeholder: "Pra que serve este grupo?" }),
    okText: "Criar grupo",
    onOk: async () => {
      await api("/api/groups", { method: "POST", body: JSON.stringify({
        name: val("g-name"), description: val("g-description"),
      })});
      toast("Grupo criado ✓");
      if (typeof renderGroups === "function") await renderGroups();
    },
  });
}

async function openEditGroup(groupId) {
  const [g, allUsers, allCourses] = await Promise.all([
    api(`/api/groups/${groupId}`),
    api("/api/users"),
    api("/api/courses?status=active"),
  ]);
  const memberSet = new Set(g.user_ids);
  const courseSet = new Set(g.course_ids);
  showModal({
    title: `Editar grupo "${g.name}"`,
    bodyHtml:
      fld("g-name", "Nome", { value: g.name }) +
      fld("g-description", "Descrição", { value: g.description || "", required: false, rows: 2 }) +
      `<label style="display:block;font-size:12px;font-weight:600;color:#113C58;margin:14px 0 6px">Membros</label>
      <div style="max-height:180px;overflow-y:auto;border:1px solid #E4EEF3;border-radius:6px;padding:6px">
        ${allUsers.map(u => `<label style="display:flex;align-items:center;gap:8px;padding:4px 8px;font-size:12px;cursor:pointer">
          <input type="checkbox" class="g-user" value="${u.id}" ${memberSet.has(u.id) ? "checked" : ""}>
          <span>${escapeHtml(u.name)} ${escapeHtml(u.surname || "")} <span style="color:#94A3B8">(${escapeHtml(u.login)})</span></span>
        </label>`).join("")}
      </div>
      <label style="display:block;font-size:12px;font-weight:600;color:#113C58;margin:14px 0 6px">Cursos atribuídos <span style="color:#94A3B8;font-weight:400">(membros são auto-matriculados)</span></label>
      <div style="max-height:160px;overflow-y:auto;border:1px solid #E4EEF3;border-radius:6px;padding:6px">
        ${allCourses.length === 0 ? '<div style="color:#94A3B8;font-size:12px;padding:6px">Sem cursos ativos.</div>' : allCourses.map(c => `<label style="display:flex;align-items:center;gap:8px;padding:4px 8px;font-size:12px;cursor:pointer">
          <input type="checkbox" class="g-course" value="${c.id}" ${courseSet.has(c.id) ? "checked" : ""}>
          <span>${escapeHtml(c.name)}</span>
        </label>`).join("")}
      </div>`,
    okText: "Salvar",
    onOk: async () => {
      const newUsers = Array.from(document.querySelectorAll(".g-user:checked")).map(c => parseInt(c.value));
      const newCourses = Array.from(document.querySelectorAll(".g-course:checked")).map(c => parseInt(c.value));
      await api(`/api/groups/${groupId}`, { method: "PATCH", body: JSON.stringify({
        name: val("g-name"), description: val("g-description"),
      })});
      await api(`/api/groups/${groupId}/users`, { method: "PUT", body: JSON.stringify({ user_ids: newUsers }) });
      const r = await api(`/api/groups/${groupId}/courses`, { method: "PUT", body: JSON.stringify({ course_ids: newCourses }) });
      toast(`Grupo salvo · ${r.auto_enrolled} novas matrículas`);
      if (typeof renderGroups === "function") await renderGroups();
    },
  });
}

async function deleteGroup(groupId) {
  if (!confirm("Deletar este grupo? As matrículas dos cursos atribuídos permanecem.")) return;
  try {
    await api(`/api/groups/${groupId}`, { method: "DELETE" });
    toast("Grupo deletado");
    if (typeof renderGroups === "function") await renderGroups();
  } catch (e) { alert("Erro: " + e.message); }
}

async function openCreateCategory() {
  showModal({
    title: "Nova categoria",
    bodyHtml: fld("cat-name", "Nome da categoria *", { placeholder: "Ex: Pós-venda" }),
    okText: "Criar",
    onOk: async () => {
      await api("/api/categories", { method: "POST", body: JSON.stringify({ name: val("cat-name") }) });
      toast("Categoria criada ✓");
      if (typeof renderAccount === "function") await renderAccount();
    },
  });
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
    case "course-settings": return openCourseSettings(id || currentCourseIdFromHash());
    case "enroll-bulk": return openBulkEnrollModal(id || currentCourseIdFromHash());
    case "archive-course": return openArchiveCourse(id || currentCourseIdFromHash());
    case "edit-unit": return openEditUnit(id);
    case "delete-unit": return deleteUnit(id);
    case "view-certificate": return window.open(`${API_BASE}/api/certificates/${id}/html`, "_blank");
    case "delete-course": return deleteCourse(id || currentCourseIdFromHash());
    case "create-group": return openCreateGroup();
    case "edit-group": return openEditGroup(id);
    case "delete-group": return deleteGroup(id);
    case "create-category": return openCreateCategory();
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
    case "quiz-retry": return retryQuiz(id);
    case "next-unit": return navUnit("next");
    case "prev-unit": return navUnit("prev");
    case "export-courses-csv": return exportCoursesCsv();
    case "export-user-courses-csv": return exportUserCoursesCsv(id || currentUserIdFromHash());
    case "export-users-csv": return exportUsersCsv();
    case "delete-user": return deleteUser(id);
    case "create-path": return openCreatePath();
    case "edit-path": return openEditPath(id);
    case "delete-path": return deletePath(id || currentPathIdFromHash());
    case "path-set-courses": return openSetPathCourses(id || currentPathIdFromHash());
    case "path-enroll-bulk": return openPathEnrollBulk(id || currentPathIdFromHash());
    case "view-path-certificate": return window.open(`${API_BASE}/api/path-certificates/${id}/html`, "_blank");
    case "activity-load-more": return renderActivity(false);
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
  if (e.target.closest("#page-courses select")) applyCoursesFilter();
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
function currentPathIdFromHash() {
  return parseInt(new URLSearchParams(location.hash.split("?")[1] || "").get("id") || "0") || null;
}

/* ============ LEARNING PATHS (L3) ============ */
async function openCreatePath() {
  showModal({
    title: "Criar trilha de aprendizagem",
    bodyHtml:
      fld("lp-name", "Nome da trilha *", { placeholder: "Ex: Formação Vendedor Júnior" }) +
      fld("lp-code", "Código (opcional)", { required: false, placeholder: "Ex: TRI-VND-01" }) +
      fld("lp-description", "Descrição", { rows: 2, required: false, placeholder: "Objetivo desta trilha" }) +
      fld("lp-sequential", "Bloquear próximo curso até concluir o anterior?", { choices: [{value:"true",label:"Sim, sequencial"},{value:"false",label:"Não, livre"}] }),
    okText: "Criar trilha",
    onOk: async () => {
      const name = val("lp-name"); if (!name) throw new Error("nome obrigatório");
      const p = await api("/api/paths", { method: "POST", body: JSON.stringify({
        name, code: val("lp-code") || null, description: val("lp-description"),
        sequential: val("lp-sequential") === "true",
      })});
      toast("Trilha criada ✓ · agora adicione os cursos");
      location.hash = `#/path-detail?id=${p.id}`;
    },
  });
}

async function openEditPath(pathId) {
  pathId = pathId || currentPathIdFromHash();
  const p = await api(`/api/paths/${pathId}`);
  showModal({
    title: `Editar "${p.name}"`,
    bodyHtml:
      fld("lp-name", "Nome", { value: p.name }) +
      fld("lp-code", "Código", { value: p.code || "", required: false }) +
      fld("lp-description", "Descrição", { value: p.description || "", required: false, rows: 2 }) +
      fld("lp-sequential", "Bloquear próximo curso até concluir o anterior?", { choices: [{value:"true",label:"Sim, sequencial"},{value:"false",label:"Não, livre"}], value: String(p.sequential) }) +
      fld("lp-status", "Status", { choices: [{value:"active",label:"Ativa"},{value:"draft",label:"Rascunho"}], value: p.status }) +
      `<div style="margin-top:14px;padding-top:14px;border-top:1px solid #E4EEF3"><button type="button" onclick="hideModal(); deletePath(${pathId})" style="background:#FEE2E2;color:#991B1B;border:1px solid #EF4444;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">🗑 Deletar trilha</button></div>`,
    okText: "Salvar",
    onOk: async () => {
      await api(`/api/paths/${pathId}`, { method: "PATCH", body: JSON.stringify({
        name: val("lp-name"), code: val("lp-code") || null, description: val("lp-description"),
        sequential: val("lp-sequential") === "true", status: val("lp-status"),
      })});
      toast("Trilha salva ✓");
      if (typeof renderPathDetail === "function") await renderPathDetail();
    },
  });
}

async function deletePath(pathId) {
  if (!confirm("Deletar esta trilha? Os cursos e matrículas continuam existindo — só a trilha some.")) return;
  try {
    await api(`/api/paths/${pathId}`, { method: "DELETE" });
    toast("Trilha deletada");
    location.hash = "#/paths";
  } catch (e) { alert("Erro: " + e.message); }
}

async function openSetPathCourses(pathId) {
  const [p, allCourses] = await Promise.all([
    api(`/api/paths/${pathId}`),
    api("/api/courses?status=active"),
  ]);
  const currentSet = new Set(p.courses.map(c => c.course_id));
  showModal({
    title: `Cursos da trilha "${p.name}"`,
    bodyHtml:
      `<div style="font-size:13px;color:#64748B;margin-bottom:12px">Marque os cursos que fazem parte da trilha. A ordem segue a ordem atual dos cursos abaixo.</div>` +
      `<div style="max-height:320px;overflow-y:auto;border:1px solid #E4EEF3;border-radius:6px;padding:6px">
        ${allCourses.length === 0 ? '<div style="color:#94A3B8;font-size:12px;padding:6px">Sem cursos ativos.</div>' : allCourses.map(c => `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:13px;cursor:pointer">
          <input type="checkbox" class="lp-course" value="${c.id}" ${currentSet.has(c.id) ? "checked" : ""}>
          <span>${escapeHtml(c.name)} ${c.code ? `<span style="color:#94A3B8">(${escapeHtml(c.code)})</span>` : ""}</span>
        </label>`).join("")}
      </div>`,
    okText: "Salvar cursos",
    onOk: async () => {
      const ids = Array.from(document.querySelectorAll(".lp-course:checked")).map(c => parseInt(c.value));
      await api(`/api/paths/${pathId}/courses`, { method: "PUT", body: JSON.stringify({ course_ids: ids }) });
      toast(`${ids.length} curso(s) na trilha ✓`);
      if (typeof renderPathDetail === "function") await renderPathDetail();
    },
  });
}

async function openPathEnrollBulk(pathId) {
  const [p, allUsers] = await Promise.all([
    api(`/api/paths/${pathId}`),
    api("/api/users"),
  ]);
  if (p.courses.length === 0) { toast("Adicione cursos à trilha antes de matricular utilizadores.", "info"); return; }
  showModal({
    title: `Matricular utilizadores em "${p.name}"`,
    bodyHtml:
      `<div style="font-size:13px;color:#64748B;margin-bottom:12px">Matricula automaticamente em todos os ${p.courses.length} cursos da trilha.</div>` +
      `<div style="margin-bottom:12px"><input id="pe-search" type="search" placeholder="Filtrar…" style="width:100%;padding:8px 12px;border:1px solid #CFDEE7;border-radius:6px;font-size:13px"></div>` +
      `<div style="max-height:300px;overflow-y:auto;border:1px solid #E4EEF3;border-radius:6px">
        <div id="pe-list">
          ${allUsers.map(u => `
            <label class="pe-item" data-name="${escapeHtml((u.name + " " + u.surname).toLowerCase())}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #F1F5F9;cursor:pointer">
              <input type="checkbox" class="pe-row" value="${u.id}">
              <div class="avatar" style="width:28px;height:28px;font-size:11px">${escapeHtml(u.avatar_initials)}</div>
              <div style="flex:1"><div style="font-size:13px;font-weight:600;color:#113C58">${escapeHtml(u.name)} ${escapeHtml(u.surname || "")}</div></div>
            </label>`).join("")}
        </div>
      </div>`,
    okText: "Matricular selecionados",
    onOk: async () => {
      const ids = Array.from(document.querySelectorAll(".pe-row:checked")).map(c => parseInt(c.value));
      if (ids.length === 0) throw new Error("Selecione ao menos 1 utilizador");
      const r = await api(`/api/paths/${pathId}/enroll-bulk`, { method: "POST", body: JSON.stringify({ user_ids: ids }) });
      toast(`${r.added} matrícula(s) criada(s) ✓ · ${r.skipped} já existiam`);
      if (typeof renderPathDetail === "function") await renderPathDetail();
    },
  });
  setTimeout(() => {
    const s = document.getElementById("pe-search");
    if (s) s.oninput = (e) => {
      const v = e.target.value.toLowerCase();
      document.querySelectorAll(".pe-item").forEach(el => { el.style.display = el.dataset.name.includes(v) ? "flex" : "none"; });
    };
  }, 100);
}

console.log("[actions.js] loaded — CRUD handlers ativos");
