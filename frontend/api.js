/*
 * Napel LMS — frontend integration layer
 * Roda em cima do mockup HTML. Cuida de auth, fetch e render dinâmico das telas-chave.
 */

const API_BASE = (() => {
  if (location.protocol === "file:") return "http://localhost:8000";
  // produção: api em subdomínio dedicado (evita gambiarra de proxy DNS interno)
  if (location.hostname === "lms.demos.napel.com.br") return "https://api.lms.demos.napel.com.br";
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return "http://localhost:8000";
  return location.origin;
})();

const TOKEN_KEY = "napel_lms_token";
const USER_KEY = "napel_lms_user";
const state = { user: null, token: null };

/* ============ AUTH ============ */
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearAuth() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); state.user = null; state.token = null; }

async function api(path, opts = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (r.status === 401) {
    clearAuth();
    showLoginModal();
    throw new Error("unauthorized");
  }
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${r.status}: ${text}`);
  }
  return r.json();
}

async function doLogin(login, password) {
  const r = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: "erro" }));
    throw new Error(err.detail || "Login falhou");
  }
  const data = await r.json();
  setToken(data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  state.token = data.access_token;
  state.user = data.user;
  return data.user;
}

function doLogout() {
  clearAuth();
  location.reload();
}

/* ============ LOGIN MODAL ============ */
function injectLoginModal() {
  if (document.getElementById("login-modal")) return;
  const el = document.createElement("div");
  el.id = "login-modal";
  el.style.cssText = "position:fixed;inset:0;background:rgba(4,44,72,0.6);backdrop-filter:blur(4px);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;";
  el.innerHTML = `
    <div style="background:white;border-radius:12px;max-width:420px;width:100%;padding:32px;box-shadow:0 20px 50px rgba(0,0,0,0.3)">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:28px;font-weight:800;color:#113C58;letter-spacing:0.05em">NAPEL <span style="font-size:14px;color:#7DA4C6">LMS</span></div>
        <div style="font-size:13px;color:#64748B;margin-top:4px">Entre com suas credenciais</div>
      </div>
      <form id="login-form" style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#113C58;margin-bottom:4px">Login ou e-mail</label>
          <input id="login-user" type="text" autocomplete="username" required
                 style="width:100%;padding:10px 12px;border:1px solid #CFDEE7;border-radius:6px;font-size:14px;background:#EBF7FA"
                 placeholder="renato">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:#113C58;margin-bottom:4px">Senha</label>
          <input id="login-pass" type="password" autocomplete="current-password" required
                 style="width:100%;padding:10px 12px;border:1px solid #CFDEE7;border-radius:6px;font-size:14px;background:#EBF7FA">
        </div>
        <div id="login-err" style="display:none;background:#FEE2E2;color:#991B1B;border:1px solid #EF4444;border-radius:6px;padding:8px 12px;font-size:13px"></div>
        <button type="submit" id="login-btn"
                style="background:#113C58;color:white;font-weight:600;padding:12px;border-radius:6px;border:none;cursor:pointer;font-size:14px;margin-top:8px">
          Entrar
        </button>
        <div style="text-align:center;font-size:11px;color:#94A3B8;margin-top:12px;line-height:1.6">
          Usuários demo: <code>renato</code> · <code>hudson</code> · <code>luiz</code> · <code>gilson</code><br>
          Senha padrão: <code>napel2026</code>
        </div>
      </form>
    </div>`;
  document.body.appendChild(el);
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("login-btn");
    const errBox = document.getElementById("login-err");
    errBox.style.display = "none";
    btn.disabled = true; btn.textContent = "Entrando…";
    try {
      const u = await doLogin(
        document.getElementById("login-user").value.trim(),
        document.getElementById("login-pass").value
      );
      hideLoginModal();
      await bootstrapAfterLogin(u);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = "block";
    } finally {
      btn.disabled = false; btn.textContent = "Entrar";
    }
  });
}
function showLoginModal() { injectLoginModal(); document.getElementById("login-modal").style.display = "flex"; setTimeout(() => document.getElementById("login-user")?.focus(), 50); }
function hideLoginModal() { const m = document.getElementById("login-modal"); if (m) m.style.display = "none"; }

/* ============ RENDER HELPERS ============ */
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function avatarHtml(initials, size = "") {
  const cls = size === "lg" ? "avatar avatar-lg" : "avatar";
  return `<div class="${cls}">${escapeHtml(initials || "?")}</div>`;
}
const SEED_CLASS = ["skeleton-thumb", "skeleton-thumb-2", "skeleton-thumb-3", "skeleton-thumb-4", "skeleton-thumb-5"];
function thumbClass(seed) { return SEED_CLASS[(seed - 1) % SEED_CLASS.length] || "skeleton-thumb"; }
function rerunLucide() { if (window.lucide) window.lucide.createIcons(); }
async function showProfileHistory() {
  const attempts = await api(`/api/users/${state.user.id}/quiz-attempts`).catch(() => []);
  let zone = $("#profile-cert-zone");
  if (!zone) {
    zone = document.createElement("div"); zone.id = "profile-cert-zone";
    const coursesList = $("#page-profile .lg\\:col-span-2 .space-y-3");
    if (coursesList) coursesList.parentElement.insertBefore(zone, $("#page-profile .mt-8"));
  }
  zone.style.display = "";
  zone.innerHTML = attempts.length === 0
    ? `<div class="bg-white border border-borderd rounded-lg p-10 text-center"><i data-lucide="history" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i><p class="text-sm text-slate-500">Sem histórico de quiz ainda.</p></div>`
    : `<div class="bg-white border border-borderd rounded-lg overflow-hidden"><table class="data-table"><thead><tr><th>Quiz (unit_id)</th><th class="text-center">Tentativa</th><th class="text-center">Score</th><th class="text-center">Status</th><th>Data</th></tr></thead><tbody>${attempts.map(a => `<tr><td>#${a.unit_id}</td><td class="text-center">${a.attempt_number}</td><td class="text-center font-bold">${a.score_pct}%</td><td class="text-center"><span class="badge ${a.passed ? "badge-success" : "badge-danger"}">${a.passed ? "Aprovado" : "Reprovado"}</span></td><td class="text-xs">${new Date(a.started_at).toLocaleString("pt-BR")}</td></tr>`).join("")}</tbody></table></div>`;
  rerunLucide();
}

function relativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso); const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `há ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff/3600)}h`;
  if (diff < 604800) return `há ${Math.floor(diff/86400)}d`;
  return d.toLocaleDateString("pt-BR");
}

/* ============ TOPBAR / USER MENU ============ */
function renderTopbar(user) {
  if (!user) return;
  const topbarUserBlock = $(".main-shifted header .border-l");
  if (!topbarUserBlock) return;
  topbarUserBlock.innerHTML = `
    <div class="text-right hidden md:block leading-tight">
      <div class="text-sm font-semibold text-naval">${escapeHtml((user.name + " " + user.surname).toUpperCase())}</div>
      <div class="text-[11px] text-slate-500">${escapeHtml(user.user_type)} · Napel</div>
    </div>
    <div class="relative">
      <button id="user-menu-btn" class="avatar" aria-label="Menu do usuário" onclick="document.getElementById('user-menu-dropdown').classList.toggle('hidden')">${escapeHtml(user.avatar_initials)}</button>
      <div id="user-menu-dropdown" class="hidden absolute right-0 top-full mt-2 w-48 bg-white border border-borderd rounded-md shadow-lg z-50 py-1">
        <a href="#/profile" class="block px-4 py-2 text-sm text-naval hover:bg-gelo">Meu perfil</a>
        <a href="#/dashboard" class="block px-4 py-2 text-sm text-naval hover:bg-gelo">Dashboard</a>
        <div class="border-t border-borderd my-1"></div>
        <button onclick="doLogout()" class="block w-full text-left px-4 py-2 text-sm text-danger-fg hover:bg-danger-bg">Sair</button>
      </div>
    </div>`;
  // remove badges hardcoded de "Mensagens 3" e "Notificações ●" (sem endpoint ainda)
  document.querySelectorAll('.main-shifted header button[aria-label="Mensagens (3 não lidas)"] span').forEach(el => el.remove());
  document.querySelectorAll('.main-shifted header button[aria-label="Notificações"] span').forEach(el => el.remove());
}

/* ============ DASHBOARD ============ */
async function renderDashboard() {
  try {
    const [overview, leaderboard, topCourses, timeline, activity] = await Promise.all([
      api("/api/dashboard/overview"),
      api("/api/leaderboard?limit=5"),
      api("/api/dashboard/top-courses?limit=5"),
      api("/api/dashboard/timeline?limit=8"),
      api("/api/dashboard/portal-activity?days=7"),
    ]);

    // header "Bem-vindo, RENATO!"
    const h1 = $("#page-dashboard h1");
    if (h1) h1.innerHTML = `<i data-lucide="party-popper" class="w-7 h-7 text-warn-bd"></i> Bem-vindo, ${escapeHtml(state.user.name.toUpperCase())}!`;
    const subtitle = $("#page-dashboard h1 + p");
    if (subtitle) subtitle.textContent = `${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} · ${overview.users_active} ${overview.users_active === 1 ? "utilizador ativo" : "utilizadores ativos"} · ${overview.courses_total} ${overview.courses_total === 1 ? "curso" : "cursos"}`;

    // sidebar badge "Utilizadores" - atualiza count
    const sideUsers = document.querySelector('#sidebar a[data-nav="user-detail"] span.ml-auto');
    if (sideUsers) sideUsers.textContent = overview.users_active;

    // gráfico Atividade no portal
    const chartWidget = $$("#page-dashboard .widget")[0];
    if (chartWidget) {
      const chart = chartWidget.querySelector(".bar-chart");
      if (chart) {
        const maxL = Math.max(1, ...activity.map(a => a.logins));
        const maxC = Math.max(1, ...activity.map(a => a.completed));
        const days = ["dom","seg","ter","qua","qui","sex","sáb"];
        chart.innerHTML = activity.map(a => {
          const lh = Math.round((a.logins / Math.max(maxL, maxC)) * 90);
          const ch = Math.round((a.completed / Math.max(maxL, maxC)) * 90);
          const isToday = a.date === new Date().toISOString().slice(0, 10);
          return `<div class="flex flex-col items-center flex-1 gap-1" title="${days[new Date(a.date).getDay()]} ${a.day_num}: ${a.logins} logins · ${a.completed} concluídos">
            ${a.logins > 0 ? `<div class="bar bar-logins" style="height:${lh}%"></div>` : ""}
            ${a.completed > 0 ? `<div class="bar bar-completed" style="height:${ch}%; margin-top:2px"></div>` : ""}
            ${a.logins === 0 && a.completed === 0 ? `<div style="height:4px"></div>` : ""}
            <span class="text-[10px] text-slate-500 ${isToday ? "font-bold" : ""}">${days[new Date(a.date).getDay()]} ${a.day_num}</span>
          </div>`;
        }).join("");
      }
    }

    // KPIs (Visão Geral widget — 3º na grid)
    const kpiWidget = $$("#page-dashboard .widget")[2];
    if (kpiWidget) {
      const body = kpiWidget.querySelector(".widget-body");
      body.innerHTML = `
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="users" class="w-4 h-4 text-ceu"></i> Utilizadores ativos</div><div class="kpi-value">${overview.users_active}</div></div>
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="book-open" class="w-4 h-4 text-ceu"></i> Cursos ativos</div><div class="kpi-value">${overview.courses_total}</div></div>
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="graduation-cap" class="w-4 h-4 text-ceu"></i> Matrículas</div><div class="kpi-value">${overview.enrollments_total}</div></div>
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="clock" class="w-4 h-4 text-ceu"></i> Tempo total formação</div><div class="kpi-value">${overview.training_time_h.toFixed(1)}h</div></div>
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="trending-up" class="w-4 h-4 text-ceu"></i> Taxa de conclusão</div><div class="kpi-value text-success-fg">${overview.completion_rate}%</div></div>`;
    }

    // Leaderboard widget (último — 6º)
    const lbWidget = $$("#page-dashboard .widget")[5];
    if (lbWidget) {
      const body = lbWidget.querySelector(".widget-body");
      if (leaderboard.length === 0) {
        body.innerHTML = `<div class="text-center py-12 text-slate-500"><i data-lucide="trophy" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i><p class="text-sm">Ainda sem participantes. Conforme alunos ganham pontos, o ranking aparece aqui.</p></div>`;
      } else {
        const medals = ["🥇", "🥈", "🥉"];
        body.innerHTML = leaderboard.map((row, i) => `
          <div class="py-3 flex items-center gap-3 ${i < leaderboard.length - 1 ? "border-b border-slate-100" : ""}">
            <div class="w-8 text-center text-sm font-bold ${i === 0 ? "text-warn-bd" : i === 1 ? "text-slate-500" : i === 2 ? "text-[#B45309]" : "text-slate-400"}">${medals[i] || row.rank}</div>
            ${avatarHtml(row.avatar_initials)}
            <div class="flex-1"><div class="text-sm font-semibold text-naval">${escapeHtml(row.name)} ${escapeHtml(row.surname)}</div><div class="text-xs text-slate-500">${row.badges_count} ${row.badges_count === 1 ? "badge" : "badges"} · Nível ${row.level}</div></div>
            <div class="text-right"><div class="text-sm font-bold text-naval">${row.points.toLocaleString("pt-BR")}</div><div class="text-[10px] text-slate-500 uppercase">pontos</div></div>
          </div>`).join("");
      }
    }

    // Cronologia (4º widget)
    const timelineWidget = $$("#page-dashboard .widget")[3];
    if (timelineWidget) {
      const body = timelineWidget.querySelector(".widget-body");
      if (timeline.length === 0) {
        body.innerHTML = `<div class="text-center py-12 text-slate-500"><i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i><p class="text-sm">Sem atividade ainda. Faça login, complete uma unidade ou ganhe uma badge pra começar a cronologia.</p></div>`;
      } else {
        const iconByKind = { login: { color: "#7DA4C6", lucide: "log-in" }, course_completed: { color: "#10B981", lucide: "check-circle-2" }, badge_earned: { color: "#F59E0B", lucide: "trophy" } };
        body.innerHTML = timeline.map((ev, i) => {
          const ic = iconByKind[ev.kind] || { color: "#64748B", lucide: "circle" };
          const isYou = ev.actor_id === state.user.id;
          return `
            <div class="py-3 flex items-start gap-3 ${i < timeline.length - 1 ? "border-b border-slate-100" : ""}">
              <div class="avatar" style="background: linear-gradient(135deg, ${ic.color}, #113C58)">${escapeHtml(ev.actor_initials || "?")}</div>
              <div class="flex-1 text-sm">
                <div><span class="font-semibold text-naval">${isYou ? "Você" : escapeHtml(ev.actor_name)}</span> <span class="text-slate-600">${escapeHtml(ev.text)}</span></div>
                <div class="text-xs text-slate-400 mt-0.5">${relativeTime(ev.ts)}</div>
              </div>
              <i data-lucide="${ic.lucide}" class="w-4 h-4 mt-1" style="color:${ic.color}"></i>
            </div>`;
        }).join("");
      }
    }

    // Cursos mais acessados (5º widget) — agora usa /top-courses real
    const topCoursesWidget = $$("#page-dashboard .widget")[4];
    if (topCoursesWidget) {
      const body = topCoursesWidget.querySelector(".widget-body");
      if (topCourses.length === 0) {
        body.innerHTML = `<div class="text-center py-12 text-slate-500"><i data-lucide="book-x" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i><p class="text-sm">Sem cursos ativos. Crie o primeiro pra ver as métricas aqui.</p></div>`;
      } else {
        body.innerHTML = topCourses.map((c, i) => `
          <div class="py-3 ${i < topCourses.length - 1 ? "border-b border-slate-100" : ""}">
            <div class="flex items-center justify-between mb-2">
              <div class="text-sm font-medium text-naval flex-1 pr-2 line-clamp-1">${escapeHtml(c.name)}</div>
              <span class="text-xs text-slate-500 font-semibold">${c.pct}%</span>
            </div>
            <div class="progress-bar"><div class="progress-bar-fill" style="width: ${c.pct}%"></div></div>
            <div class="text-[10px] text-slate-400 mt-1">${c.enrollments} ${c.enrollments === 1 ? "matriculado" : "matriculados"}</div>
          </div>`).join("");
      }
    }

    rerunLucide();
  } catch (e) { console.error("[dashboard]", e); }
}

/* ============ COURSES LIST ============ */
async function renderCourses() {
  try {
    const courses = await api("/api/courses");
    const grid = $("#page-courses .grid.grid-cols-1");
    if (!grid) return;
    // subtítulo dinâmico
    const subtitle = $("#page-courses h1 + p");
    if (subtitle) {
      const active = courses.filter(c => c.status === "active").length;
      const totalEnroll = courses.reduce((s, c) => s + c.enrollments_count, 0);
      const completed = "—"; // sem endpoint específico de completed/mês ainda
      subtitle.textContent = `${courses.length} ${courses.length === 1 ? "curso" : "cursos"} · ${active} ${active === 1 ? "ativo" : "ativos"} · ${totalEnroll} matrículas total`;
    }
    if (courses.length === 0) {
      grid.innerHTML = `<div class="col-span-3 text-center py-16">
        <i data-lucide="book-x" class="w-16 h-16 mx-auto mb-3 text-slate-300"></i>
        <h3 class="text-lg font-semibold text-naval mb-1">Nenhum curso ainda</h3>
        <p class="text-sm text-slate-500 mb-5">Comece criando o primeiro curso pra equipe.</p>
        <button data-action="create-course" class="px-4 py-2.5 bg-naval text-white rounded-md text-sm font-semibold">+ Adicionar curso</button>
      </div>`;
      const footerCount = $("#page-courses .border-t.border-borderd .text-sm.text-slate-500");
      if (footerCount) footerCount.textContent = "Sem cursos cadastrados";
      rerunLucide();
      return;
    }
    grid.innerHTML = courses.map(c => `
      <article class="bg-white border border-borderd rounded-lg overflow-hidden hover:shadow-md transition-shadow group cursor-pointer" onclick="location.hash='#/course-detail?id=${c.id}'">
        <div class="${thumbClass(c.thumbnail_seed)} aspect-video relative">
          <span class="absolute top-3 left-3 badge ${c.status === "active" ? "badge-success" : c.status === "draft" ? "badge-warn" : "badge-neutral"}">${c.status === "active" ? "Ativo" : c.status === "draft" ? "Rascunho" : "Arquivado"}</span>
          <button class="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60 icon-only" aria-label="Opções" onclick="event.stopPropagation()"><i data-lucide="more-vertical" class="w-4 h-4"></i></button>
          <div class="absolute inset-0 flex items-center justify-center"><i data-lucide="${escapeHtml(c.icon)}" class="w-14 h-14 text-white/80 group-hover:scale-110 transition-transform"></i></div>
        </div>
        <div class="p-4">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-ceu mb-1.5">${escapeHtml(c.category)}${c.code ? " · " + escapeHtml(c.code) : ""}</div>
          <h3 class="text-sm font-semibold text-naval mb-3 line-clamp-2 min-h-[40px]">${escapeHtml(c.name)}</h3>
          <div class="flex items-center gap-3 text-xs text-slate-500 mb-3">
            <span class="flex items-center gap-1"><i data-lucide="layers" class="w-3.5 h-3.5"></i> ${c.units_count} units</span>
            <span class="flex items-center gap-1"><i data-lucide="users" class="w-3.5 h-3.5"></i> ${c.enrollments_count}</span>
          </div>
          <a href="#/course-detail?id=${c.id}" class="text-xs font-semibold text-naval flex items-center gap-1 hover:gap-2 transition-all">Ver curso <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></a>
        </div>
      </article>`).join("");
    // footer count
    const footerCount = $("#page-courses .border-t.border-borderd .text-sm.text-slate-500");
    if (footerCount) footerCount.innerHTML = `Mostrando <strong class="text-naval">1–${courses.length}</strong> de <strong class="text-naval">${courses.length}</strong> cursos`;
    rerunLucide();
  } catch (e) { console.error("[courses]", e); }
}

/* ============ COURSE DETAIL ============ */
async function renderCourseDetail() {
  try {
    const courseId = new URLSearchParams(location.hash.split("?")[1] || "").get("id");
    if (!courseId) return;
    const course = await api(`/api/courses/${courseId}`);
    // breadcrumb + title
    const bc = $("#page-course-detail nav span.text-naval.font-medium");
    if (bc) bc.textContent = course.name;
    const h1 = $("#page-course-detail h1");
    if (h1) h1.textContent = course.name;
    // status badge + categoria
    const tagsRow = $("#page-course-detail h1").previousElementSibling;
    if (tagsRow) {
      tagsRow.innerHTML = `
        <span class="badge ${course.status === "active" ? "badge-success" : "badge-warn"}">${course.status}</span>
        <span class="badge badge-info">${escapeHtml(course.category)}</span>
        ${course.code ? `<span class="text-xs text-slate-500">· código <code class="bg-gelo px-1.5 py-0.5 rounded">${escapeHtml(course.code)}</code></span>` : ""}`;
    }
    const desc = $("#page-course-detail h1 + p");
    if (desc) desc.textContent = course.description;

    // adiciona botão "Inscrever-me" se learner e não matriculado
    try {
      const myEnrolls = await api("/api/users/me/enrollments");
      const alreadyEnrolled = myEnrolls.some(e => e.course_id === course.id);
      const editBtnContainer = $("#page-course-detail .flex.gap-2");
      if (editBtnContainer && !alreadyEnrolled) {
        const has = editBtnContainer.querySelector('[data-action="enroll-self"]');
        if (!has) {
          const b = document.createElement("button");
          b.dataset.action = "enroll-self";
          b.dataset.id = course.id;
          b.className = "px-4 py-2.5 bg-success-bd text-white rounded-md text-sm font-semibold hover:opacity-90 flex items-center gap-2 shadow-sm";
          b.innerHTML = '<i data-lucide="plus" class="w-4 h-4"></i> Inscrever-me';
          editBtnContainer.appendChild(b);
        }
      }
    } catch (e) { /* ignora */ }

    // units (com botões edit + delete)
    const unitsList = $("#page-course-detail .bg-white.border.border-borderd.rounded-lg.divide-y");
    if (unitsList && course.units) {
      const iconByType = { video: "video", audio: "headphones", text: "file-text", quiz: "help-circle", pdf: "file", scorm: "package", assignment: "clipboard-check" };
      unitsList.innerHTML = course.units.map((u, i) => `
        <div class="unit-row">
          <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-300 cursor-grab" title="(drag pra reordenar — em breve)"></i>
          <div class="unit-icon"><i data-lucide="${iconByType[u.type] || "circle"}" class="w-4 h-4"></i></div>
          <div class="flex-1 cursor-pointer" onclick="location.hash='#/unit-player?course=${course.id}&unit=${u.id}'">
            <div class="text-sm font-semibold text-naval">${u.order_index} · ${escapeHtml(u.title)}</div>
            <div class="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
              <span class="flex items-center gap-1"><i data-lucide="${iconByType[u.type] || "circle"}" class="w-3 h-3"></i> ${escapeHtml(u.type)} · ${u.duration_min} min</span>
            </div>
          </div>
          <button data-action="edit-unit" data-id="${u.id}" class="p-2 hover:bg-gelo rounded-md icon-only" aria-label="Editar unidade"><i data-lucide="pencil" class="w-4 h-4 text-naval"></i></button>
          <button data-action="delete-unit" data-id="${u.id}" class="p-2 hover:bg-gelo rounded-md icon-only" aria-label="Deletar"><i data-lucide="trash-2" class="w-4 h-4 text-danger-bd"></i></button>
        </div>`).join("");
    }

    // tabs interativas: trocar entre Conteúdo / Alunos / Configurações
    const tabsContainer = $("#page-course-detail .flex.border-b.border-borderd");
    if (tabsContainer && !tabsContainer.dataset.bound) {
      tabsContainer.dataset.bound = "1";
      tabsContainer.addEventListener("click", async (e) => {
        const t = e.target.closest(".tab-trigger"); if (!t) return;
        const tabs = $$("#page-course-detail .tab-trigger");
        const idx = Array.from(tabs).indexOf(t);
        await switchCourseDetailTab(course.id, idx);
      });
    }

    // stats card real
    const stats = await api(`/api/courses/${courseId}/stats`).catch(() => null);
    const cards = $$("#page-course-detail aside .widget");
    if (cards[1] && stats) {
      const body = cards[1].querySelector(".widget-body");
      const horas = Math.floor(stats.duracao_min / 60); const mins = stats.duracao_min % 60;
      body.innerHTML = `
        <div class="kpi-row"><div class="kpi-label">Matriculados</div><div class="kpi-value">${stats.matriculados}</div></div>
        <div class="kpi-row"><div class="kpi-label">Concluíram</div><div class="kpi-value text-success-fg">${stats.concluiram}</div></div>
        <div class="kpi-row"><div class="kpi-label">Taxa de conclusão</div><div class="kpi-value ${stats.taxa_conclusao_pct >= 70 ? "text-success-fg" : "text-naval"}">${stats.taxa_conclusao_pct}%</div></div>
        <div class="kpi-row"><div class="kpi-label">Nota média (quiz)</div><div class="kpi-value">${stats.nota_media != null ? stats.nota_media : "—"}</div></div>
        <div class="kpi-row"><div class="kpi-label">Duração total</div><div class="kpi-value">${horas > 0 ? `${horas}h ${mins}m` : `${mins}m`}</div></div>`;
    }

    // tab counts
    const tabs = $$("#page-course-detail .tab-trigger");
    if (tabs[0]) tabs[0].textContent = `Conteúdo (${course.units_count})`;
    if (tabs[1]) tabs[1].textContent = `Alunos (${course.enrollments_count})`;
    // empty state pra units
    if ((course.units || []).length === 0) {
      const unitsContainer = $("#page-course-detail .bg-white.border.border-borderd.rounded-lg.divide-y");
      if (unitsContainer) unitsContainer.innerHTML = `<div class="p-10 text-center text-slate-500"><i data-lucide="layers" class="w-12 h-12 mx-auto mb-2 text-slate-300"></i><p class="text-sm mb-3">Nenhuma unidade neste curso ainda.</p><button data-action="create-unit" data-id="${course.id}" class="px-3 py-2 bg-naval text-white rounded-md text-xs font-semibold">+ Adicionar primeira unidade</button></div>`;
    }
    rerunLucide();
  } catch (e) { console.error("[course-detail]", e); }
}

async function switchCourseDetailTab(courseId, idx) {
  $$("#page-course-detail .tab-trigger").forEach((t, i) => t.classList.toggle("active", i === idx));
  const contentZone = $("#page-course-detail .lg\\:col-span-2 .bg-white.border.border-borderd.rounded-lg.divide-y, #page-course-detail .lg\\:col-span-2 #cd-tab-zone");
  let zone = $("#cd-tab-zone");
  if (!zone) {
    // criar zone wrapper se for primeira vez
    const list = $("#page-course-detail .bg-white.border.border-borderd.rounded-lg.divide-y");
    if (list) {
      list.id = "cd-tab-zone";
      zone = list;
    }
  }
  const header = $$("#page-course-detail .flex.items-center.justify-between.mb-3")[0];

  if (idx === 0) {
    // Conteúdo: restaura estrutura ANTES de re-render
    if (header) {
      header.style.display = "flex";
      header.innerHTML = `<h2 class="text-sm font-semibold text-naval">Unidades do curso</h2><button data-action="create-unit" class="px-3 py-2 bg-naval text-white rounded-md text-xs font-semibold hover:opacity-90 flex items-center gap-1.5 btn-small"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Adicionar unidade</button>`;
    }
    if (zone) {
      zone.className = "bg-white border border-borderd rounded-lg divide-y divide-slate-100";
      zone.innerHTML = "";
    }
    await renderCourseDetail();
    rerunLucide();
    return;
  }
  if (idx === 1) {
    // Alunos
    if (header) header.innerHTML = `<h2 class="text-sm font-semibold text-naval">Alunos matriculados</h2><button data-action="enroll-bulk" data-id="${courseId}" class="px-3 py-2 bg-naval text-white rounded-md text-xs font-semibold flex items-center gap-1.5 btn-small"><i data-lucide="plus" class="w-3.5 h-3.5"></i> Matricular alunos</button>`;
    const enrolls = await api(`/api/courses/${courseId}/enrollments`);
    const users = await api("/api/users");
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    if (!zone) return;
    zone.classList.remove("divide-y", "divide-slate-100");
    zone.className = "bg-white border border-borderd rounded-lg overflow-hidden";
    if (enrolls.length === 0) {
      zone.innerHTML = `<div class="p-10 text-center text-slate-500"><i data-lucide="users-x" class="w-12 h-12 mx-auto mb-2 text-slate-300"></i><p class="text-sm mb-3">Nenhum aluno matriculado ainda.</p><button data-action="enroll-bulk" data-id="${courseId}" class="px-3 py-2 bg-naval text-white rounded-md text-xs font-semibold">+ Matricular primeiro aluno</button></div>`;
    } else {
      zone.innerHTML = `<table class="data-table"><thead><tr><th>Aluno</th><th>Papel</th><th class="text-center">Progresso</th><th>Matriculado</th><th>Conclusão</th><th class="text-right">Ações</th></tr></thead><tbody>${
        enrolls.map(e => {
          const u = userMap[e.user_id] || { name: "?", surname: "", avatar_initials: "?" };
          return `<tr data-enroll-id="${e.id}">
            <td><div class="flex items-center gap-3">${avatarHtml(u.avatar_initials)}<div><div class="font-semibold text-naval">${escapeHtml(u.name)} ${escapeHtml(u.surname || "")}</div><div class="text-xs text-slate-500">${escapeHtml(u.email || "")}</div></div></div></td>
            <td><select class="h-8 px-2 border border-borderd rounded bg-white text-xs"><option ${e.role === "Estudante" ? "selected" : ""}>Estudante</option><option ${e.role === "Professor" ? "selected" : ""}>Professor</option><option ${e.role === "Trainer" ? "selected" : ""}>Trainer</option></select></td>
            <td class="text-center"><span class="text-sm font-bold ${e.progress_pct >= 100 ? "text-success-fg" : "text-naval"}">${e.progress_pct}%</span></td>
            <td class="text-xs text-slate-600">${new Date(e.enrolled_at).toLocaleDateString("pt-BR")}</td>
            <td>${e.completed_at ? `<span class="text-success-fg text-xs font-semibold">${new Date(e.completed_at).toLocaleDateString("pt-BR")}</span>` : '<span class="text-slate-400 text-xs">—</span>'}</td>
            <td><div class="flex justify-end gap-1"><a href="#/user-detail?id=${e.user_id}" class="p-2 hover:bg-gelo rounded icon-only"><i data-lucide="eye" class="w-4 h-4 text-naval"></i></a><button data-action="unenroll" data-id="${e.id}" class="p-2 hover:bg-gelo rounded icon-only"><i data-lucide="user-minus" class="w-4 h-4 text-danger-bd"></i></button></div></td>
          </tr>`;
        }).join("")
      }</tbody></table>`;
    }
    rerunLucide();
    return;
  }
  if (idx === 2) {
    // Configurações: abre modal direto
    if (header) header.style.display = "none";
    if (zone) zone.innerHTML = `<div class="p-10 text-center"><i data-lucide="settings" class="w-12 h-12 mx-auto mb-3 text-naval"></i><h3 class="text-lg font-semibold text-naval mb-1">Configurações do curso</h3><p class="text-sm text-slate-500 mb-4">Preço, capacidade, visibilidade, certificado, AI coach.</p><button data-action="course-settings" data-id="${courseId}" class="px-4 py-2.5 bg-naval text-white rounded-md text-sm font-semibold">Abrir configurações ⚙</button></div>`;
    rerunLucide();
    return;
  }
}

/* ============ GROUPS PAGE ============ */
async function renderGroups() {
  try {
    const groups = await api("/api/groups");
    const sub = $("#groups-subtitle");
    if (sub) sub.textContent = `${groups.length} ${groups.length === 1 ? "grupo" : "grupos"}`;
    const grid = $("#groups-grid");
    if (!grid) return;
    if (groups.length === 0) {
      grid.innerHTML = `<div class="col-span-3 text-center py-16 bg-white border border-borderd rounded-lg">
        <i data-lucide="users-round" class="w-16 h-16 mx-auto mb-3 text-slate-300"></i>
        <h3 class="text-lg font-semibold text-naval mb-1">Sem grupos ainda</h3>
        <p class="text-sm text-slate-500 mb-5">Crie grupos pra atribuir cursos em lote a vários utilizadores.</p>
        <button data-action="create-group" class="px-4 py-2.5 bg-naval text-white rounded-md text-sm font-semibold">+ Criar primeiro grupo</button>
      </div>`;
    } else {
      grid.innerHTML = groups.map(g => `
        <div class="bg-white border border-borderd rounded-lg p-5 hover:shadow-md transition-shadow">
          <div class="flex items-start justify-between mb-2">
            <h3 class="text-base font-semibold text-naval line-clamp-1">${escapeHtml(g.name)}</h3>
            <span class="badge ${g.status === "active" ? "badge-success" : "badge-neutral"}">${g.status}</span>
          </div>
          <p class="text-xs text-slate-500 line-clamp-2 mb-4 min-h-[32px]">${escapeHtml(g.description || "—")}</p>
          <div class="flex items-center gap-4 text-xs text-slate-600 mb-4">
            <span class="flex items-center gap-1"><i data-lucide="users" class="w-3.5 h-3.5"></i> <strong class="text-naval">${g.users_count}</strong> membros</span>
            <span class="flex items-center gap-1"><i data-lucide="book-open" class="w-3.5 h-3.5"></i> <strong class="text-naval">${g.courses_count}</strong> cursos</span>
          </div>
          <div class="flex gap-2 pt-3 border-t border-borderd">
            <button data-action="edit-group" data-id="${g.id}" class="flex-1 py-2 bg-naval text-white rounded text-xs font-semibold">Editar</button>
            <button data-action="delete-group" data-id="${g.id}" class="p-2 hover:bg-danger-bg rounded icon-only" aria-label="Deletar"><i data-lucide="trash-2" class="w-4 h-4 text-danger-bd"></i></button>
          </div>
        </div>`).join("");
    }
    rerunLucide();
  } catch (e) { console.error("[groups]", e); }
}

/* ============ ACCOUNT (settings) PAGE ============ */
async function renderAccount() {
  try {
    const tabs = $$("#account-tabs .tab-trigger");
    const activeTab = (tabs.find(t => t.classList.contains("active")) || tabs[0])?.dataset.accountTab || "portal";
    // bind tabs
    tabs.forEach(t => {
      if (t.dataset.bound) return;
      t.dataset.bound = "1";
      t.addEventListener("click", () => {
        tabs.forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        renderAccountTab(t.dataset.accountTab);
      });
    });
    await renderAccountTab(activeTab);
  } catch (e) { console.error("[account]", e); }
}

async function renderAccountTab(tab) {
  const content = $("#account-content");
  if (!content) return;
  if (tab === "portal") {
    const s = await api("/api/settings/portal");
    content.innerHTML = `
      <div class="bg-white border border-borderd rounded-lg p-6 max-w-2xl">
        <h3 class="text-base font-semibold text-naval mb-1">Identidade do portal</h3>
        <p class="text-xs text-slate-500 mb-5">Aparece no topbar, login e e-mails enviados.</p>
        <form id="portal-form" class="space-y-4">
          ${fld("p-name", "Nome do portal *", { value: s.site_name })}
          ${fld("p-desc", "Descrição", { value: s.site_description || "", required: false, rows: 2 })}
          ${fld("p-color", "Cor primária (hex)", { value: s.primary_color, hint: "Ex: #113C58 (naval Napel)" })}
          ${fld("p-logo", "URL do logo", { value: s.logo_url || "", required: false, hint: "Deixe vazio pra usar 'NAPEL' em texto" })}
          <div class="pt-4 border-t border-borderd flex justify-end">
            <button type="submit" class="px-4 py-2 bg-naval text-white rounded-md text-sm font-semibold">Salvar</button>
          </div>
        </form>
      </div>`;
    document.getElementById("portal-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/settings/portal", { method: "PUT", body: JSON.stringify({
          site_name: val("p-name"), site_description: val("p-desc"),
          primary_color: val("p-color"), logo_url: val("p-logo") || null,
        })});
        toast("Salvo ✓");
      } catch (err) { alert("Erro: " + err.message); }
    };
  } else if (tab === "categories") {
    const cats = await api("/api/categories");
    content.innerHTML = `
      <div class="bg-white border border-borderd rounded-lg p-6 max-w-2xl">
        <div class="flex items-center justify-between mb-4">
          <div><h3 class="text-base font-semibold text-naval">Categorias de curso</h3><p class="text-xs text-slate-500">${cats.length} cadastrada(s)</p></div>
          <button data-action="create-category" class="px-3 py-2 bg-naval text-white rounded-md text-xs font-semibold">+ Nova categoria</button>
        </div>
        <div class="border border-borderd rounded">
          ${cats.length === 0 ? '<div class="p-6 text-center text-sm text-slate-500">Sem categorias.</div>' : cats.map(c => `
            <div class="flex items-center justify-between p-3 border-b border-borderd last:border-b-0">
              <div><div class="text-sm font-medium text-naval">${escapeHtml(c.name)}</div><div class="text-xs text-slate-400 font-mono">${escapeHtml(c.slug)}</div></div>
              <button onclick="(async()=>{if(confirm('Deletar categoria \\'${escapeHtml(c.name)}\\'?')){await api('/api/categories/${c.id}',{method:'DELETE'});toast('Deletada');renderAccountTab('categories');}})()" class="p-2 hover:bg-danger-bg rounded text-danger-bd"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>`).join("")}
        </div>
      </div>`;
  } else if (tab === "gamification") {
    const g = await api("/api/settings/gamification");
    content.innerHTML = `
      <div class="bg-white border border-borderd rounded-lg p-6 max-w-2xl">
        <h3 class="text-base font-semibold text-naval mb-1">Pontuação por evento</h3>
        <p class="text-xs text-slate-500 mb-5">Define quantos pontos o aluno ganha em cada ação.</p>
        <form id="gam-form" class="grid grid-cols-2 gap-4">
          ${fld("g-login", "Login diário", { type: "number", value: String(g.login_points) })}
          ${fld("g-unit", "Unidade concluída", { type: "number", value: String(g.unit_completion_points) })}
          ${fld("g-course", "Curso completo", { type: "number", value: String(g.course_completion_points) })}
          ${fld("g-quiz", "Quiz aprovado", { type: "number", value: String(g.quiz_pass_points) })}
          ${fld("g-perfect", "Bônus 100% no quiz", { type: "number", value: String(g.quiz_perfect_bonus) })}
          ${fld("g-level", "Pontos pra subir 1 nível", { type: "number", value: String(g.level_up_points) })}
          <div class="col-span-2 pt-4 border-t border-borderd flex justify-end">
            <button type="submit" class="px-4 py-2 bg-naval text-white rounded-md text-sm font-semibold">Salvar</button>
          </div>
        </form>
      </div>`;
    document.getElementById("gam-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/settings/gamification", { method: "PUT", body: JSON.stringify({
          enabled: g.enabled,
          login_points: parseInt(val("g-login")) || 0,
          unit_completion_points: parseInt(val("g-unit")) || 0,
          course_completion_points: parseInt(val("g-course")) || 0,
          quiz_pass_points: parseInt(val("g-quiz")) || 0,
          quiz_perfect_bonus: parseInt(val("g-perfect")) || 0,
          level_up_points: parseInt(val("g-level")) || 1000,
        })});
        toast("Configuração de pontos salva ✓");
      } catch (err) { alert("Erro: " + err.message); }
    };
  } else if (tab === "info") {
    const health = await api("/api/health").catch(() => ({}));
    content.innerHTML = `
      <div class="bg-white border border-borderd rounded-lg p-6 max-w-2xl">
        <h3 class="text-base font-semibold text-naval mb-4">Sistema</h3>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between py-2 border-b border-borderd"><span class="text-slate-500">Versão API</span><span class="font-mono">${health.version || "?"}</span></div>
          <div class="flex justify-between py-2 border-b border-borderd"><span class="text-slate-500">Status</span><span class="font-semibold ${health.status === "ok" ? "text-success-fg" : "text-danger-fg"}">${health.status || "?"}</span></div>
          <div class="flex justify-between py-2 border-b border-borderd"><span class="text-slate-500">Banco</span><span class="font-semibold ${health.db ? "text-success-fg" : "text-danger-fg"}">${health.db ? "conectado" : "fora"}</span></div>
          <div class="flex justify-between py-2 border-b border-borderd"><span class="text-slate-500">Backend API</span><a href="https://api.lms.demos.napel.com.br/api/docs" target="_blank" class="text-naval font-semibold underline">Swagger ↗</a></div>
          <div class="flex justify-between py-2 border-b border-borderd"><span class="text-slate-500">Repositório</span><a href="https://github.com/renatonapel-arch/napel-lms" target="_blank" class="text-naval font-semibold underline">GitHub ↗</a></div>
        </div>
        <div class="mt-6 pt-4 border-t border-borderd">
          <h4 class="text-sm font-semibold text-danger-fg mb-2">Zona perigosa</h4>
          <button onclick="if(confirm('ZERAR TODO O BANCO? Apaga users, cursos, progressos. Só o admin renato será mantido.')){fetch('${API_BASE}/api/admin/reset-database?token=napel2026', {method:'POST'}).then(()=>{toast('Banco zerado');setTimeout(()=>location.reload(),1500);})}" class="px-4 py-2 bg-danger-bg text-danger-fg border border-danger-bd rounded-md text-sm font-semibold">Reset banco de dados</button>
        </div>
      </div>`;
  }
  rerunLucide();
}

/* ============ LEADERBOARD PAGE ============ */
async function renderLeaderboard() {
  try {
    const rows = await api("/api/leaderboard");
    // subtítulo dinâmico
    const subtitle = $("#page-leaderboard h1 + p");
    if (subtitle) subtitle.textContent = `${rows.length} ${rows.length === 1 ? "participante" : "participantes"} · pontuação acumulada`;
    if (rows.length === 0) {
      const podium = $("#page-leaderboard .grid.grid-cols-3");
      if (podium) podium.outerHTML = `<div class="text-center py-16 bg-white border border-borderd rounded-lg"><i data-lucide="trophy" class="w-16 h-16 mx-auto mb-3 text-slate-300"></i><h3 class="text-lg font-semibold text-naval mb-1">Sem ranking ainda</h3><p class="text-sm text-slate-500">Conforme alunos ganham pontos completando units e quizzes, o ranking aparece aqui.</p></div>`;
      const table = $("#page-leaderboard .bg-white.border.border-borderd.rounded-lg.overflow-hidden");
      if (table) table.style.display = "none";
      rerunLucide();
      return;
    }
    if (rows.length < 3) {
      // pódio precisa de 3 — mostra só tabela
      const podium = $("#page-leaderboard .grid.grid-cols-3");
      if (podium) podium.style.display = "none";
      const tbody = $("#page-leaderboard .data-table tbody");
      if (tbody) {
        tbody.innerHTML = rows.map(r => `<tr ${r.user_id === state.user.id ? 'class="bg-gelo"' : ""}>
          <td class="font-bold ${r.user_id === state.user.id ? "text-naval" : "text-slate-500"}">${r.rank}</td>
          <td><div class="flex items-center gap-3">${avatarHtml(r.avatar_initials)}<div><div class="font-semibold text-naval">${escapeHtml(r.name)} ${escapeHtml(r.surname)} ${r.user_id === state.user.id ? '<span class="badge badge-success text-[9px]">VOCÊ</span>' : ""}</div></div></div></td>
          <td class="hidden md:table-cell"><span class="badge badge-info">${escapeHtml(r.branch)}</span></td>
          <td class="text-right font-bold text-naval">${r.points.toLocaleString("pt-BR")}</td>
          <td class="hidden sm:table-cell text-center">${r.badges_count}</td>
          <td class="hidden lg:table-cell text-xs text-slate-500">Nível ${r.level}</td>
        </tr>`).join("");
      }
      rerunLucide();
      return;
    }
    const podium = $("#page-leaderboard .grid.grid-cols-3");
    if (podium) {
      podium.querySelectorAll(".text-xs.font-semibold.text-naval, .text-sm.font-bold.text-naval").forEach((el, idx) => {
        const positions = [1, 0, 2]; // visual: 2º | 1º | 3º
        const r = rows[positions[Math.floor(idx / 2)]];
        if (r && el.textContent.match(/^[A-Z]/i)) {
          el.textContent = `${r.name} ${r.surname}`;
        }
      });
      // mais robusto: substitui top3 explicitamente
      const cols = podium.children;
      const top3 = [rows[1], rows[0], rows[2]]; // ordem visual
      ["2", "1", "3"].forEach((rank, i) => {
        const col = cols[i]; if (!col || !top3[i]) return;
        const nameEl = col.querySelector(".text-xs.font-semibold.text-naval, .text-sm.font-bold.text-naval");
        const badgesEl = col.querySelector(".text-\\[11px\\].text-slate-500, .text-xs.text-slate-500");
        const ptsEl = col.querySelector(".text-xl.font-extrabold, .text-2xl.font-extrabold");
        const initEl = col.querySelector(".avatar.avatar-lg");
        if (nameEl) nameEl.textContent = `${top3[i].name} ${top3[i].surname}`;
        if (badgesEl) badgesEl.textContent = `${top3[i].badges_count} badges`;
        if (ptsEl) ptsEl.textContent = top3[i].points.toLocaleString("pt-BR");
        if (initEl) initEl.textContent = top3[i].avatar_initials;
      });
    }
    // tabela demais posições
    const tbody = $("#page-leaderboard .data-table tbody");
    if (tbody && rows.length > 3) {
      tbody.innerHTML = rows.slice(3).map(r => `
        <tr ${r.user_id === state.user.id ? 'class="bg-gelo"' : ""}>
          <td class="font-bold ${r.user_id === state.user.id ? "text-naval" : "text-slate-500"}">${r.rank}</td>
          <td>
            <div class="flex items-center gap-3">
              ${avatarHtml(r.avatar_initials)}
              <div><div class="font-semibold text-naval flex items-center gap-2">${escapeHtml(r.name)} ${escapeHtml(r.surname)} ${r.user_id === state.user.id ? '<span class="badge badge-success text-[9px]">VOCÊ</span>' : ""}</div><div class="text-xs text-slate-500 md:hidden">${escapeHtml(r.branch)}</div></div>
            </div>
          </td>
          <td class="hidden md:table-cell"><span class="badge badge-info">${escapeHtml(r.branch)}</span></td>
          <td class="text-right font-bold text-naval">${r.points.toLocaleString("pt-BR")}</td>
          <td class="hidden sm:table-cell text-center">${r.badges_count}</td>
          <td class="hidden lg:table-cell text-xs text-slate-500">Nível ${r.level}</td>
        </tr>`).join("");
    }
  } catch (e) { console.error("[leaderboard]", e); }
}

/* ============ MATRIX ============ */
async function renderMatrix() {
  try {
    const data = await api("/api/reports/training-matrix");
    // subtítulo dinâmico
    const subtitle = $("#page-matrix h1 + p");
    if (subtitle) subtitle.textContent = `Visão pivot · ${data.users.length} ${data.users.length === 1 ? "utilizador" : "utilizadores"} × ${data.courses.length} ${data.courses.length === 1 ? "curso" : "cursos"}`;
    const table = $("#page-matrix .matrix-table");
    if (!table) return;
    if (data.users.length === 0 || data.courses.length === 0) {
      const wrap = $("#page-matrix .matrix-wrap");
      if (wrap) wrap.innerHTML = `<div class="text-center py-16 px-4">
        <i data-lucide="grid-3x3" class="w-16 h-16 mx-auto mb-3 text-slate-300"></i>
        <h3 class="text-lg font-semibold text-naval mb-1">Matriz vazia</h3>
        <p class="text-sm text-slate-500 mb-4">${data.users.length === 0 ? "Sem utilizadores" : "Sem cursos"}. Cadastre antes de ver a matriz de formação.</p>
      </div>`;
      // KPI cards: zerar
      const kpiCards = $$("#page-matrix .grid.grid-cols-2.lg\\:grid-cols-4 .widget-body");
      if (kpiCards.length >= 4) {
        kpiCards[0].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Conclusão geral</div><div class="text-xl font-extrabold text-slate-400">—</div>`;
        kpiCards[1].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Top vendedor</div><div class="text-base font-bold text-slate-400">—</div>`;
        kpiCards[2].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Em atraso</div><div class="text-xl font-extrabold text-slate-400">—</div>`;
        kpiCards[3].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Curso menos engajado</div><div class="text-base font-bold text-slate-400">—</div>`;
      }
      const footer = $("#page-matrix .border-t.border-borderd.p-3 .text-slate-500:nth-child(2)");
      if (footer) footer.textContent = `0 utilizadores · 0 cursos`;
      rerunLucide();
      return;
    }
    const thead = table.querySelector("thead tr");
    thead.innerHTML = `
      <th class="user-header">Utilizadores <i data-lucide="arrow-up" class="w-3 h-3 inline ml-1"></i></th>
      ${data.courses.map(c => `<th class="course-col"><div class="course-label-wrap"><div class="course-label" title="${escapeHtml(c.name)}${c.code ? ' · ' + escapeHtml(c.code) : ''}">${escapeHtml(c.name)}${c.code ? `<span class="course-code">${escapeHtml(c.code)}</span>` : ""}</div></div></th>`).join("")}`;
    const tbody = table.querySelector("tbody");
    // normaliza célula: aceita formato novo {status,pct} ou legado (string)
    const cellOf = (uid, cid) => {
      const raw = data.cells[uid] ? data.cells[uid][cid] : null;
      if (raw && typeof raw === "object") return raw;
      // legado
      if (raw === "completed") return { status: "completed", pct: 100 };
      if (raw === "in_progress" || raw === "started") return { status: "in_progress", pct: 50 };
      return { status: "not_started", pct: 0 };
    };
    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td class="user-cell" ${u.id === state.user.id ? 'style="background:#EBF7FA"' : ""}>${escapeHtml(u.name)} ${u.id === state.user.id ? '<span class="badge badge-success text-[9px]">VOCÊ</span>' : ""}</td>
        ${data.courses.map(c => {
          const cell = cellOf(u.id, c.id);
          if (cell.status === "completed")
            return `<td><div class="matrix-cell completed" title="Concluído (100%)"><i data-lucide="check" class="w-4 h-4"></i></div></td>`;
          if (cell.status === "in_progress")
            return `<td><div class="matrix-cell in-progress" title="Cursando · ${cell.pct}% concluído" style="font-size:10px;font-weight:800;color:#92400E">${cell.pct}%</div></td>`;
          return `<td><div class="matrix-cell empty" title="Não iniciado"></div></td>`;
        }).join("")}
      </tr>`).join("");
    // contagem footer
    const counter = $$("#page-matrix .border-t.border-borderd.p-3 .text-slate-500")[1];
    if (counter) counter.textContent = `${data.users.length} utilizadores · ${data.courses.length} cursos`;
    // KPI cards reais
    const totalCells = data.users.length * data.courses.length;
    let completedN = 0;
    const userScores = {};
    const courseEng = {};
    for (const u of data.users) {
      userScores[u.id] = 0;
      for (const c of data.courses) {
        if (!(c.id in courseEng)) courseEng[c.id] = { started: 0, name: c.name };
        const cell = cellOf(u.id, c.id);
        if (cell.status === "completed") { completedN++; userScores[u.id]++; courseEng[c.id].started++; }
        else if (cell.status === "in_progress") courseEng[c.id].started++;
      }
    }
    const overallPct = totalCells ? Math.round(completedN * 100 / totalCells) : 0;
    const topUserId = Object.keys(userScores).sort((a, b) => userScores[b] - userScores[a])[0];
    const topUser = data.users.find(u => u.id == topUserId);
    const topPct = topUser ? Math.round(userScores[topUserId] * 100 / data.courses.length) : 0;
    const overdue = data.users.filter(u => userScores[u.id] === 0).length;
    const leastCourse = Object.values(courseEng).sort((a, b) => a.started - b.started)[0];

    const kpiCards = $$("#page-matrix .grid.grid-cols-2.lg\\:grid-cols-4 .widget-body");
    if (kpiCards.length >= 4) {
      kpiCards[0].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Conclusão geral</div><div class="text-xl font-extrabold ${overallPct >= 70 ? "text-success-fg" : "text-naval"}">${overallPct}%</div><div class="text-[11px] text-slate-500 mt-0.5">${completedN} de ${totalCells} cél. concluídas</div>`;
      kpiCards[1].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Top vendedor</div><div class="text-base font-bold text-naval line-clamp-1">${topUser ? escapeHtml(topUser.name) + " · " + topPct + "%" : "—"}</div><div class="text-[11px] text-slate-500 mt-0.5">${topUser ? userScores[topUserId] + " de " + data.courses.length + " cursos" : ""}</div>`;
      kpiCards[2].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Sem progresso</div><div class="text-xl font-extrabold ${overdue > 0 ? "text-warn-fg" : "text-success-fg"}">${overdue} ${overdue === 1 ? "user" : "users"}</div><div class="text-[11px] text-slate-500 mt-0.5">zero cursos concluídos</div>`;
      kpiCards[3].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Curso menos engajado</div><div class="text-base font-bold text-naval line-clamp-1">${leastCourse ? escapeHtml(leastCourse.name.slice(0, 30)) : "—"}</div><div class="text-[11px] text-slate-500 mt-0.5">${leastCourse ? leastCourse.started + " de " + data.users.length + " iniciaram" : ""}</div>`;
    }
    rerunLucide();
  } catch (e) { console.error("[matrix]", e); }
}

/* ============ USERS LIST ============ */
let usersAllCache = null;
async function renderUsers() {
  try {
    usersAllCache = await api("/api/users");
    const sub = $("#users-subtitle");
    if (sub) {
      const active = usersAllCache.filter(u => u.status === "active").length;
      const byBranch = {};
      usersAllCache.forEach(u => byBranch[u.branch] = (byBranch[u.branch] || 0) + 1);
      const branchSummary = Object.entries(byBranch).map(([b, n]) => `${n} ${b}`).join(" · ");
      sub.textContent = `${usersAllCache.length} ${usersAllCache.length === 1 ? "utilizador" : "utilizadores"} · ${active} ${active === 1 ? "ativo" : "ativos"}${branchSummary ? " · " + branchSummary : ""}`;
    }
    applyUsersFilter();
  } catch (e) { console.error("[users]", e); }
}

function applyUsersFilter() {
  if (!usersAllCache) return;
  const search = ($("#users-search")?.value || "").toLowerCase();
  const typeF = $("#users-filter-type")?.value || "";
  const branchF = $("#users-filter-branch")?.value || "";
  const statusF = $("#users-filter-status")?.value || "";
  const filtered = usersAllCache.filter(u => {
    if (search && !(u.name.toLowerCase().includes(search) || (u.surname || "").toLowerCase().includes(search) || u.login.toLowerCase().includes(search) || u.email.toLowerCase().includes(search))) return false;
    if (typeF && u.user_type !== typeF) return false;
    if (branchF && u.branch !== branchF) return false;
    if (statusF && u.status !== statusF) return false;
    return true;
  });
  const tbody = $("#users-tbody");
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-slate-500"><i data-lucide="users-x" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i><p class="text-sm">Nenhum utilizador encontrado.</p></td></tr>`;
  } else {
    tbody.innerHTML = filtered.map(u => `
      <tr class="cursor-pointer" onclick="location.hash='#/user-detail?id=${u.id}'" ${u.id === state.user.id ? 'style="background:#EBF7FA"' : ""}>
        <td>
          <div class="flex items-center gap-3">
            ${avatarHtml(u.avatar_initials)}
            <div>
              <div class="font-semibold text-naval flex items-center gap-2">${escapeHtml(u.name)} ${escapeHtml(u.surname || "")} ${u.id === state.user.id ? '<span class="badge badge-success text-[9px]">VOCÊ</span>' : ""}</div>
              <div class="text-xs text-slate-500">${escapeHtml(u.email)} · <code class="bg-gelo px-1 rounded">${escapeHtml(u.login)}</code></div>
            </div>
          </div>
        </td>
        <td class="hidden md:table-cell"><span class="badge ${u.user_type === "SuperAdmin" ? "badge-warn" : u.user_type === "Admin" ? "badge-info" : "badge-neutral"}">${escapeHtml(u.user_type)}</span></td>
        <td class="hidden md:table-cell"><span class="badge badge-info">${escapeHtml(u.branch)}</span></td>
        <td class="hidden lg:table-cell text-center font-bold text-naval">${u.level}</td>
        <td class="hidden lg:table-cell text-right font-bold text-naval">${u.points.toLocaleString("pt-BR")}</td>
        <td class="hidden lg:table-cell text-xs text-slate-500">${u.last_login ? relativeTime(u.last_login) : "—"}</td>
        <td onclick="event.stopPropagation()">
          <div class="flex items-center justify-end gap-1">
            <a href="#/user-detail?id=${u.id}" class="p-2 hover:bg-gelo rounded-md icon-only" aria-label="Ver detalhes"><i data-lucide="eye" class="w-4 h-4 text-naval"></i></a>
            <button data-action="edit-user" data-id="${u.id}" class="p-2 hover:bg-gelo rounded-md icon-only" aria-label="Editar"><i data-lucide="pencil" class="w-4 h-4 text-naval"></i></button>
            ${u.id !== state.user.id ? `<button data-action="delete-user" data-id="${u.id}" class="p-2 hover:bg-gelo rounded-md icon-only" aria-label="Deletar"><i data-lucide="trash-2" class="w-4 h-4 text-danger-bd"></i></button>` : ""}
          </div>
        </td>
      </tr>`).join("");
  }
  rerunLucide();
}

/* ============ USER DETAIL ============ */
async function renderUserDetail() {
  try {
    const userId = new URLSearchParams(location.hash.split("?")[1] || "").get("id") || state.user.id;
    const u = await api(`/api/users/${userId}`);
    const h1 = $("#page-user-detail h1");
    if (h1) h1.textContent = `${u.name.toUpperCase()} ${u.surname.toUpperCase()}`;
    const av = $("#page-user-detail .avatar.avatar-lg");
    if (av) av.textContent = u.avatar_initials;
    const sub = $("#page-user-detail h1 + .text-sm");
    if (sub) sub.innerHTML = `
      <span class="badge badge-info"><i data-lucide="shield-check" class="w-3 h-3"></i> ${escapeHtml(u.user_type)}</span>
      <span class="badge ${u.status === "active" ? "badge-success" : "badge-neutral"}">${u.status === "active" ? "Ativo" : "Inativo"}</span>
      <span>·</span><span class="flex items-center gap-1"><i data-lucide="mail" class="w-3.5 h-3.5"></i> ${escapeHtml(u.email)}</span>
      ${u.last_login ? `<span>·</span><span class="flex items-center gap-1"><i data-lucide="log-in" class="w-3.5 h-3.5"></i> ${new Date(u.last_login).toLocaleDateString("pt-BR")}</span>` : ""}`;

    // tab counts dinâmicos
    const tabs = $$("#page-user-detail .tab-trigger");
    if (tabs[0]) tabs[0].innerHTML = `<i data-lucide="book-open" class="w-4 h-4"></i> Cursos <span class="ml-1 bg-gelo text-naval text-[10px] font-bold rounded-full px-1.5 py-0.5">${u.enrollments.length}</span>`;
    if (tabs[1]) tabs[1].innerHTML = `<i data-lucide="users-round" class="w-4 h-4"></i> Grupos <span class="ml-1 text-[10px] text-slate-400">0</span>`;
    if (tabs[2]) tabs[2].innerHTML = `<i data-lucide="git-branch" class="w-4 h-4"></i> Ramificações <span class="ml-1 text-[10px] text-slate-400">0</span>`;

    // tabela cursos (com nomes reais)
    const tbody = $("#page-user-detail .data-table tbody");
    if (tbody) {
      const allCourses = await api("/api/courses").catch(() => []);
      const courseMap = Object.fromEntries(allCourses.map(c => [c.id, c]));
      tbody.innerHTML = u.enrollments.map((e, i) => {
        const c = courseMap[e.course_id] || { name: `curso #${e.course_id}`, code: "", icon: "book-open", thumbnail_seed: 1 };
        return `
        <tr data-enroll-id="${e.id}" ${i === 0 ? 'class="bg-gelo"' : ""}>
          <td><input type="checkbox" class="rounded border-borders"></td>
          <td>
            <div class="flex items-center gap-3">
              <div class="${thumbClass(c.thumbnail_seed)} w-9 h-9 rounded-md flex-shrink-0 flex items-center justify-center"><i data-lucide="${escapeHtml(c.icon)}" class="w-4 h-4 text-white"></i></div>
              <div>
                <div class="font-medium text-naval line-clamp-1">${escapeHtml(c.name)}</div>
                <div class="text-[11px] text-slate-500">${e.progress_pct}% concluído</div>
              </div>
            </div>
          </td>
          <td class="hidden md:table-cell"><code class="text-xs bg-white px-2 py-1 rounded text-slate-500">${escapeHtml(c.code || "—")}</code></td>
          <td>
            <select class="h-8 px-2 border border-borderd rounded bg-white text-xs font-medium text-naval">
              <option ${e.role === "Estudante" ? "selected" : ""}>Estudante</option>
              <option ${e.role === "Professor" ? "selected" : ""}>Professor</option>
              <option ${e.role === "Trainer" ? "selected" : ""}>Trainer</option>
            </select>
          </td>
          <td class="hidden md:table-cell text-slate-600">${new Date(e.enrolled_at).toLocaleDateString("pt-BR")}</td>
          <td class="hidden lg:table-cell">${e.completed_at ? `<span class="text-success-fg font-semibold">${new Date(e.completed_at).toLocaleDateString("pt-BR")}</span>` : '<span class="text-slate-400">—</span>'}</td>
          <td>
            <div class="flex items-center justify-end gap-1">
              <a href="#/course-detail?id=${e.course_id}" class="p-2 hover:bg-gelo rounded-md icon-only" aria-label="Ver curso"><i data-lucide="eye" class="w-4 h-4 text-naval"></i></a>
              <button data-action="unenroll" data-id="${e.id}" class="p-2 hover:bg-gelo rounded-md icon-only" aria-label="Desmatricular"><i data-lucide="user-minus" class="w-4 h-4 text-danger-bd"></i></button>
            </div>
          </td>
        </tr>`;}).join("");
      // empty state se zero cursos
      if (u.enrollments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-12 text-slate-500"><i data-lucide="book-x" class="w-10 h-10 mx-auto mb-2 text-slate-300"></i><p class="text-sm mb-3">Este utilizador não está em nenhum curso ainda.</p><button data-action="enroll-user" data-id="${u.id}" class="px-3 py-2 bg-naval text-white rounded-md text-xs font-semibold">+ Inscrever em curso</button></td></tr>`;
      }
    }

    // footer da tabela: counts reais
    const completed = u.enrollments.filter(e => e.completed_at).length;
    const inProgress = u.enrollments.filter(e => !e.completed_at && e.progress_pct > 0).length;
    const counter = $("#page-user-detail .border-t.border-borderd.p-3 span");
    if (counter) counter.textContent = `${u.enrollments.length} ${u.enrollments.length === 1 ? "curso atribuído" : "cursos atribuídos"} · ${completed} ${completed === 1 ? "concluído" : "concluídos"} · ${inProgress} em progresso`;

    // info widgets
    const widgets = $$("#page-user-detail .grid.grid-cols-2.md\\:grid-cols-5 .widget .widget-body");
    if (widgets.length >= 5) {
      widgets[0].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Cadastro</div><div class="text-sm font-bold text-naval">—</div>`;
      widgets[1].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Login</div><div class="text-sm font-bold text-naval font-mono">${escapeHtml(u.login)}</div>`;
      widgets[2].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Fuso</div><div class="text-sm font-bold text-naval">${escapeHtml(u.branch)}</div>`;
      widgets[3].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Nível</div><div class="text-sm font-bold text-naval">${u.level} · ${u.points} pts</div>`;
      widgets[4].innerHTML = `<div class="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Filial</div><div class="text-sm font-bold text-naval">${escapeHtml(u.branch)}</div>`;
    }
    rerunLucide();
  } catch (e) { console.error("[user-detail]", e); }
}

/* ============ PROFILE ============ */
async function renderProfile() {
  try {
    const [me, enrollments, badges] = await Promise.all([
      api("/api/auth/me"),
      api("/api/users/me/enrollments"),
      api(`/api/users/${state.user.id}/badges`),
    ]);
    // sub-header dados (email + branch)
    const subHeader = $("#page-profile h1 + .text-sm");
    if (subHeader) subHeader.innerHTML = `
      <span class="badge badge-info"><i data-lucide="shield-check" class="w-3 h-3"></i> ${escapeHtml(me.user_type)}</span>
      <span>·</span>
      <span class="flex items-center gap-1"><i data-lucide="mail" class="w-3.5 h-3.5"></i> ${escapeHtml(me.email)}</span>
      <span class="hidden md:inline">·</span>
      <span class="hidden md:flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i> ${escapeHtml(me.branch)}</span>`;
    // sidebar Informações + Próximo nível dinâmicos
    const infoWidget = $$("#page-profile aside .widget")[0];
    if (infoWidget) {
      const body = infoWidget.querySelector(".widget-body");
      body.innerHTML = `
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="user" class="w-4 h-4 text-ceu"></i> Login</div><div class="text-sm font-mono font-semibold text-naval">${escapeHtml(me.login)}</div></div>
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="map-pin" class="w-4 h-4 text-ceu"></i> Filial</div><div class="text-sm font-semibold text-naval">${escapeHtml(me.branch)}</div></div>
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="clock" class="w-4 h-4 text-ceu"></i> Fuso</div><div class="text-sm font-semibold text-naval">${escapeHtml(me.timezone || "America/Sao_Paulo")}</div></div>
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="languages" class="w-4 h-4 text-ceu"></i> Idioma</div><div class="text-sm font-semibold text-naval">${escapeHtml(me.locale || "pt-BR")}</div></div>
        <div class="kpi-row"><div class="kpi-label"><i data-lucide="log-in" class="w-4 h-4 text-ceu"></i> Último acesso</div><div class="text-sm font-semibold text-success-fg">${me.last_login ? relativeTime(me.last_login) : "—"}</div></div>`;
    }
    const nextWidget = $$("#page-profile aside .widget")[1];
    if (nextWidget) {
      const body = nextWidget.querySelector(".widget-body");
      const nextThreshold = me.level * 1000;
      const pctToNext = Math.min(100, Math.round((me.points / nextThreshold) * 100));
      body.innerHTML = `
        <div class="flex items-center justify-between text-xs mb-2">
          <span class="font-semibold text-naval">Nível ${me.level}</span>
          <span class="text-slate-500">${me.points.toLocaleString("pt-BR")} / ${nextThreshold.toLocaleString("pt-BR")} pts</span>
        </div>
        <div class="progress-bar mb-3"><div class="progress-bar-fill" style="width: ${pctToNext}%"></div></div>
        <p class="text-xs text-slate-500">Faltam <strong class="text-naval">${Math.max(0, nextThreshold - me.points).toLocaleString("pt-BR")} pts</strong> para o Nível ${me.level + 1}.</p>`;
    }
    const h1 = $("#page-profile h1");
    if (h1) h1.textContent = `${me.name.toUpperCase()} ${me.surname.toUpperCase()}`;
    const av = $("#page-profile .avatar.avatar-lg");
    if (av) av.textContent = me.avatar_initials;
    // stats row
    const statsRow = $("#page-profile .grid.grid-cols-2.md\\:grid-cols-5");
    if (statsRow) {
      const completed = enrollments.filter(e => e.completed_at).length;
      const inProgress = enrollments.filter(e => !e.completed_at && e.progress_pct > 0).length;
      statsRow.innerHTML = `
        <div class="px-4 py-4 text-center"><div class="text-2xl font-extrabold text-naval">${me.level}</div><div class="text-[11px] uppercase tracking-wider text-slate-500 mt-1">Nível</div></div>
        <div class="px-4 py-4 text-center"><div class="text-2xl font-extrabold text-naval">${me.points.toLocaleString("pt-BR")}</div><div class="text-[11px] uppercase tracking-wider text-slate-500 mt-1">Pontos</div></div>
        <div class="px-4 py-4 text-center border-t md:border-t-0 border-borderd"><div class="text-2xl font-extrabold text-warn-bd">${badges.length}</div><div class="text-[11px] uppercase tracking-wider text-slate-500 mt-1">Badges</div></div>
        <div class="px-4 py-4 text-center border-t md:border-t-0 border-borderd"><div class="text-2xl font-extrabold text-naval">${enrollments.length}</div><div class="text-[11px] uppercase tracking-wider text-slate-500 mt-1">Cursos</div></div>
        <div class="px-4 py-4 text-center border-t md:border-t-0 border-borderd col-span-2 md:col-span-1"><div class="text-2xl font-extrabold text-success-fg">${completed}</div><div class="text-[11px] uppercase tracking-wider text-slate-500 mt-1">Concluídos</div></div>`;
    }
    // tab counts + certificados
    const certs = await api("/api/users/me/certificates").catch(() => []);
    const tabs = $$("#page-profile .tab-trigger");
    if (tabs[0]) tabs[0].textContent = "Meus cursos";
    if (tabs[1]) tabs[1].textContent = `Badges (${badges.length})`;
    if (tabs[2]) tabs[2].textContent = `Certificados (${certs.length})`;
    // bind click nas tabs (toggle visibility entre cursos/badges/certs)
    if (!tabs[0]?.dataset.pbound) {
      tabs.forEach((t, i) => {
        if (!t) return;
        t.dataset.pbound = "1";
        t.addEventListener("click", () => {
          tabs.forEach(x => x?.classList.remove("active"));
          t.classList.add("active");
          const coursesList = $("#page-profile .lg\\:col-span-2 .space-y-3");
          const badgesSec = $("#page-profile .mt-8");
          if (coursesList && badgesSec) {
            coursesList.style.display = i === 0 ? "" : "none";
            badgesSec.style.display = i === 1 ? "" : "none";
            // tab "Certificados" cria zone abaixo se i===2
            let certZone = $("#profile-cert-zone");
            if (i === 2) {
              if (!certZone) {
                certZone = document.createElement("div"); certZone.id = "profile-cert-zone";
                coursesList.parentElement.insertBefore(certZone, badgesSec);
              }
              certZone.style.display = "";
              if (certs.length === 0) {
                certZone.innerHTML = `<div class="bg-white border border-borderd rounded-lg p-10 text-center"><i data-lucide="award" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i><h3 class="text-sm font-semibold text-naval mb-1">Sem certificados ainda</h3><p class="text-xs text-slate-500">Conclua um curso pra ganhar o primeiro.</p></div>`;
              } else {
                certZone.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${certs.map(c => `
                  <div class="bg-white border border-borderd rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div class="flex items-start gap-3 mb-3">
                      <div class="w-10 h-10 rounded-md bg-warn-bg text-warn-fg flex items-center justify-center"><i data-lucide="award" class="w-5 h-5"></i></div>
                      <div class="flex-1 min-w-0">
                        <div class="text-sm font-semibold text-naval line-clamp-2">${escapeHtml(c.course_name || "Curso")}</div>
                        <div class="text-[11px] text-slate-500 mt-0.5">Emitido em ${new Date(c.issued_at).toLocaleDateString("pt-BR")}</div>
                      </div>
                    </div>
                    <div class="text-[10px] font-mono text-slate-400 mb-3">${escapeHtml(c.code)}</div>
                    <button data-action="view-certificate" data-id="${c.id}" class="w-full py-2 bg-naval text-white rounded text-xs font-semibold">Ver / Imprimir</button>
                  </div>`).join("")}</div>`;
              }
              rerunLucide();
            } else if (certZone) {
              certZone.style.display = "none";
            }
            // "Histórico" tab (i===3) → mostra tentativas de quiz
            if (i === 3) {
              showProfileHistory();
            }
          }
        });
      });
    }
    // cursos list
    const coursesList = $("#page-profile .lg\\:col-span-2 .space-y-3");
    if (coursesList && enrollments.length === 0) {
      coursesList.innerHTML = `<div class="bg-white border border-borderd rounded-lg p-10 text-center">
        <i data-lucide="book-x" class="w-12 h-12 mx-auto mb-3 text-slate-300"></i>
        <h3 class="text-sm font-semibold text-naval mb-1">Você ainda não está matriculado em nenhum curso</h3>
        <p class="text-xs text-slate-500 mb-4">Vá em <a href="#/courses" class="text-naval font-semibold underline">Cursos</a> pra se inscrever.</p>
      </div>`;
    } else if (coursesList && enrollments.length > 0) {
      const allCourses = await api("/api/courses");
      const courseMap = Object.fromEntries(allCourses.map(c => [c.id, c]));
      coursesList.innerHTML = enrollments.map(e => {
        const c = courseMap[e.course_id]; if (!c) return "";
        const status = e.completed_at ? "Concluído" : e.progress_pct > 0 ? "Em andamento" : "Não iniciado";
        return `
          <div class="bg-white border border-borderd rounded-lg p-4 flex items-center gap-4">
            <div class="${thumbClass(c.thumbnail_seed)} w-16 h-16 rounded-md flex-shrink-0 flex items-center justify-center">
              <i data-lucide="${escapeHtml(c.icon)}" class="w-6 h-6 text-white/80"></i>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-semibold text-naval mb-1 line-clamp-1">${escapeHtml(c.name)}</h3>
              <div class="text-xs text-slate-500 mb-2">${status} · ${c.units_count} unidades</div>
              <div class="progress-bar"><div class="progress-bar-fill" style="width: ${e.progress_pct}%"></div></div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-xs font-bold ${e.progress_pct >= 100 ? "text-success-fg" : e.progress_pct > 0 ? "text-naval" : "text-slate-400"}">${e.progress_pct}%</div>
              <a href="#/course-detail?id=${c.id}" class="mt-2 inline-block px-3 py-1.5 ${e.progress_pct > 0 ? "bg-naval text-white" : "bg-white border border-borderd text-naval"} rounded-md text-xs font-semibold hover:opacity-90 btn-small">${e.progress_pct > 0 ? "Continuar" : "Começar"}</a>
            </div>
          </div>`;
      }).join("");
    }
    // badges grid
    const badgesGrid = $("#page-profile .grid.grid-cols-3.md\\:grid-cols-6");
    if (badgesGrid) {
      const allBadges = await api("/api/badges");
      const earnedIds = new Set(badges.map(b => b.id));
      badgesGrid.innerHTML = allBadges.map(b => {
        const earned = earnedIds.has(b.id);
        const ub = badges.find(x => x.id === b.id);
        return `
          <div class="bg-white border border-borderd rounded-lg p-3 text-center ${earned ? "hover:shadow-md transition-shadow" : "opacity-40"}">
            <div class="w-12 h-12 mx-auto mb-2 rounded-full ${earned ? (b.category === "test" ? "bg-naval text-white" : "badge-trophy text-white") : "bg-slate-200 text-slate-400"} flex items-center justify-center ${earned ? "shadow-md" : ""}">
              <i data-lucide="${earned ? escapeHtml(b.icon) : "lock"}" class="w-${earned ? "6" : "5"} h-${earned ? "6" : "5"}"></i>
            </div>
            <div class="text-[11px] font-semibold ${earned ? "text-naval" : "text-slate-500"} line-clamp-1">${escapeHtml(b.name)}</div>
            <div class="text-[10px] text-slate-${earned ? "500" : "400"}">${earned && ub.earned_at ? new Date(ub.earned_at).toLocaleDateString("pt-BR") : "Bloqueado"}</div>
          </div>`;
      }).join("");
    }
    rerunLucide();
  } catch (e) { console.error("[profile]", e); }
}

/* ============ UNIT PLAYER (interactive: marcar concluído) ============ */
async function renderUnitPlayer() {
  try {
    const qs = new URLSearchParams(location.hash.split("?")[1] || "");
    const unitId = qs.get("unit"); const courseId = qs.get("course");
    if (!unitId || !courseId) return;
    const [unit, allUnits, myEnrolls, courseInfo] = await Promise.all([
      api(`/api/units/${unitId}`),
      api(`/api/courses/${courseId}/units`),
      api("/api/users/me/enrollments").catch(() => []),
      api(`/api/courses/${courseId}`).catch(() => null),
    ]);
    // breadcrumb dinâmico (era hardcoded "5 Técnicas de Persuasão")
    const bc = $("#page-unit-player nav");
    if (bc && courseInfo) {
      bc.innerHTML = `<a href="#/courses" class="hover:text-naval">Cursos</a>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        <a href="#/course-detail?id=${courseId}" class="hover:text-naval">${escapeHtml(courseInfo.name)}</a>
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
        <span class="text-naval font-medium">Unidade ${unit.order_index}</span>`;
    }
    const enroll = myEnrolls.find(e => e.course_id === parseInt(courseId));
    const progressPct = enroll ? enroll.progress_pct : 0;
    const completedCount = Math.round((progressPct / 100) * allUnits.length);

    const h1 = $("#page-unit-player h1");
    if (h1) h1.textContent = `${unit.order_index} · ${unit.title}`;
    const sub = $("#page-unit-player p.text-sm.text-slate-500");
    if (sub) sub.textContent = `${unit.type} · ${unit.duration_min} min`;

    // substitui o player + descrição por conteúdo REAL conforme tipo
    const videoBlock = $("#page-unit-player .video-mockup");
    const descCard = $("#page-unit-player .bg-white.border.border-borderd.rounded-lg.p-5.mb-4");
    const c = unit.content || {};
    if (videoBlock) {
      if (unit.type === "video" && c.video_url) {
        const url = c.video_url;
        // YouTube?
        const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
        if (yt) {
          videoBlock.outerHTML = `<div class="mb-4 shadow-lg rounded-lg overflow-hidden aspect-video bg-black"><iframe class="w-full h-full" src="https://www.youtube.com/embed/${yt[1]}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        } else {
          // MP4 direto
          videoBlock.outerHTML = `<div class="mb-4 shadow-lg rounded-lg overflow-hidden aspect-video bg-black"><video class="w-full h-full" controls preload="metadata" src="${escapeHtml(url)}"></video></div>`;
        }
      } else if (unit.type === "audio" && c.audio_url) {
        videoBlock.outerHTML = `<div class="mb-4 bg-white border border-borderd rounded-lg p-8 flex flex-col items-center gap-4">
          <div class="w-20 h-20 rounded-full bg-gelo text-naval flex items-center justify-center"><i data-lucide="headphones" class="w-10 h-10"></i></div>
          <div class="text-sm font-semibold text-naval">${escapeHtml(unit.title)}</div>
          <audio class="w-full max-w-lg" controls preload="metadata" src="${escapeHtml(c.audio_url)}">Seu navegador não suporta áudio.</audio>
        </div>`;
      } else if (unit.type === "text") {
        const md = c.text_md || "Sem conteúdo.";
        const html = window.marked ? marked.parse(md) : `<pre>${escapeHtml(md)}</pre>`;
        videoBlock.outerHTML = `<div class="mb-4 bg-white border border-borderd rounded-lg p-6 md:p-8 prose-content"><div class="markdown">${html}</div></div>`;
      } else if (unit.type === "pdf" && c.pdf_url) {
        videoBlock.outerHTML = `<div class="mb-4 shadow-lg rounded-lg overflow-hidden bg-slate-100" style="height:600px"><iframe class="w-full h-full" src="${escapeHtml(c.pdf_url)}#toolbar=1"></iframe><div class="p-3 bg-white border-t border-borderd text-center"><a href="${escapeHtml(c.pdf_url)}" target="_blank" class="text-sm text-naval font-semibold">Abrir PDF em nova aba ↗</a></div></div>`;
      } else if (unit.type === "quiz") {
        videoBlock.outerHTML = `<div class="mb-4 bg-warn-bg border border-warn-bd rounded-lg p-6 text-center"><i data-lucide="help-circle" class="w-10 h-10 mx-auto mb-3 text-warn-fg"></i><h3 class="text-naval font-bold mb-2">Esta é uma unidade de Quiz</h3><a href="#/quiz?course=${courseId}&unit=${unit.id}" class="inline-block px-4 py-2 bg-naval text-white rounded-md text-sm font-semibold">Iniciar quiz →</a></div>`;
      } else {
        videoBlock.outerHTML = `<div class="mb-4 bg-slate-100 border border-borderd rounded-lg p-12 text-center text-slate-500"><i data-lucide="alert-circle" class="w-10 h-10 mx-auto mb-2"></i><p class="text-sm">Conteúdo desta unidade ainda não foi configurado.</p></div>`;
      }
    }
    if (descCard) {
      let about = "";
      if (unit.type === "video") about = c.video_url ? `Vídeo · ${unit.duration_min} min · ${(c.video_url.match(/youtube|youtu\.be/) ? "YouTube" : "MP4")}` : "Vídeo sem URL configurada.";
      else if (unit.type === "audio") about = c.audio_url ? `Áudio · ${unit.duration_min} min` : "Áudio sem URL configurada.";
      else if (unit.type === "text") about = `Leitura · ${unit.duration_min} min`;
      else if (unit.type === "quiz") about = `Quiz · ${(c.questions || []).length} pergunta(s) · aprovação ≥${c.passing_score || 70}% · ${c.max_attempts || 3} tentativas`;
      else if (unit.type === "pdf") about = `PDF · ${unit.duration_min} min`;
      else about = `${unit.type} · ${unit.duration_min} min`;
      descCard.innerHTML = `<h3 class="text-sm font-semibold text-naval mb-2">Sobre esta unidade</h3><p class="text-sm text-slate-600">${escapeHtml(about)}</p>`;
    }

    // painel direito: progresso real
    const progWidget = $$("#page-unit-player aside .widget")[0];
    if (progWidget) {
      progWidget.innerHTML = `
        <div class="widget-header">
          <h3 class="widget-title">Progresso do curso</h3>
          <span class="text-xs font-bold ${progressPct >= 100 ? "text-success-fg" : "text-naval"}">${progressPct}%</span>
        </div>
        <div class="px-5 pb-4">
          <div class="progress-bar"><div class="progress-bar-fill" style="width: ${progressPct}%"></div></div>
          <p class="text-xs text-slate-500 mt-2">${completedCount} de ${allUnits.length} ${allUnits.length === 1 ? "unidade" : "unidades"}${enroll ? "" : " · não matriculado"}</p>
        </div>`;
    }

    // painel direito: lista de units real
    const listWidget = $$("#page-unit-player aside .widget")[1];
    if (listWidget) {
      const iconByType = { video: "video", audio: "headphones", text: "file-text", quiz: "help-circle", pdf: "file", scorm: "package", assignment: "clipboard-check" };
      const list = listWidget.querySelector(".px-2.py-2") || listWidget.querySelector(".widget-body") || listWidget;
      list.innerHTML = allUnits.map(u => {
        const isCurrent = u.id === parseInt(unitId);
        const isCompleted = false; // não temos endpoint per-unit completion ainda
        return `<a href="#/unit-player?course=${courseId}&unit=${u.id}" class="unit-row ${isCurrent ? "current" : ""}" style="text-decoration:none">
          <div class="unit-icon" ${isCurrent ? 'style="background:#FEF3C7;color:#92400E"' : ""}><i data-lucide="${isCurrent ? "play" : iconByType[u.type] || "circle"}" class="w-4 h-4"></i></div>
          <div class="flex-1 min-w-0"><div class="text-xs font-semibold ${isCurrent ? "text-naval" : "text-slate-500"} truncate">${u.order_index} · ${escapeHtml(u.title)}</div><div class="text-[10px] ${isCurrent ? "text-slate-500" : "text-slate-400"}">${escapeHtml(u.type)} · ${u.duration_min} min</div></div>
        </a>`;
      }).join("");
    }

    // botão "Marcar como concluído"
    const btn = $$('#page-unit-player button').find(b => /Marcar como conclu/i.test(b.textContent));
    if (btn) {
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = "Salvando…";
        try {
          await api("/api/progress", { method: "POST", body: JSON.stringify({ unit_id: parseInt(unitId), completion_pct: 100 }) });
          btn.innerHTML = '<i data-lucide="check-circle-2" class="w-4 h-4"></i> Concluída ✓';
          btn.classList.add("bg-success-bd", "text-white");
          rerunLucide();
          if (state.user) { state.user = await api("/api/auth/me"); localStorage.setItem(USER_KEY, JSON.stringify(state.user)); }
          toast("Unidade concluída! +pontos", "success");
        } catch (e) { alert("Erro: " + e.message); btn.disabled = false; btn.textContent = "Tentar novamente"; }
      };
    }
    rerunLucide();
  } catch (e) { console.error("[unit-player]", e); }
}

/* ============ ROUTER ============ */
const routes = {
  "dashboard": renderDashboard,
  "courses": renderCourses,
  "course-detail": renderCourseDetail,
  "unit-player": renderUnitPlayer,
  "leaderboard": renderLeaderboard,
  "matrix": renderMatrix,
  "user-detail": renderUserDetail,
  "profile": renderProfile,
  "users": renderUsers,
  "groups": renderGroups,
  "account": renderAccount,
};
async function handleRoute() {
  // Guard: se não há user/token, força login antes de tentar render
  if (!state.user || !getToken()) { showLoginModal(); return; }
  const name = (location.hash || "#/dashboard").replace("#/", "").split("?")[0];
  if (routes[name]) {
    try { await routes[name](); } catch (e) { console.error("[route]", e); }
  }
  // refresh sidebar user count em toda navegação
  try {
    const ov = await api("/api/dashboard/overview");
    const el = document.getElementById("sb-users-count");
    if (el) el.textContent = ov.users_active;
  } catch {}
}

/* ============ BOOTSTRAP ============ */
async function bootstrapAfterLogin(user) {
  state.user = user;
  state.token = getToken();
  renderTopbar(user);
  // atualiza badge "Utilizadores N" no sidebar (count real, em todas as telas)
  try {
    const ov = await api("/api/dashboard/overview");
    const sideUsers = document.querySelector('#sidebar a[data-nav="user-detail"] span.ml-auto');
    if (sideUsers) sideUsers.textContent = ov.users_active;
  } catch {}
  await handleRoute();
}

window.addEventListener("DOMContentLoaded", async () => {
  injectLoginModal();
  const token = getToken();
  if (!token) { showLoginModal(); return; }
  state.token = token;
  try {
    state.user = await api("/api/auth/me");
    localStorage.setItem(USER_KEY, JSON.stringify(state.user));
    renderTopbar(state.user);
    await handleRoute();
  } catch {
    clearAuth();
    showLoginModal();
  }
});

window.addEventListener("hashchange", handleRoute);
window.doLogout = doLogout;
