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
}

/* ============ DASHBOARD ============ */
async function renderDashboard() {
  try {
    const [overview, leaderboard, courses] = await Promise.all([
      api("/api/dashboard/overview"),
      api("/api/leaderboard?limit=5"),
      api("/api/courses?status=active"),
    ]);

    // header "Bem-vindo, RENATO!"
    const h1 = $("#page-dashboard h1");
    if (h1) h1.innerHTML = `<i data-lucide="party-popper" class="w-7 h-7 text-warn-bd"></i> Bem-vindo, ${escapeHtml(state.user.name.toUpperCase())}!`;
    const subtitle = $("#page-dashboard h1 + p");
    if (subtitle) subtitle.textContent = `${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })} · ${overview.users_active} utilizadores ativos · ${overview.courses_total} cursos`;

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
      const medals = ["🥇", "🥈", "🥉"];
      body.innerHTML = leaderboard.map((row, i) => `
        <div class="py-3 flex items-center gap-3 ${i < leaderboard.length - 1 ? "border-b border-slate-100" : ""}">
          <div class="w-8 text-center text-sm font-bold ${i === 0 ? "text-warn-bd" : i === 1 ? "text-slate-500" : i === 2 ? "text-[#B45309]" : "text-slate-400"}">${medals[i] || row.rank}</div>
          ${avatarHtml(row.avatar_initials)}
          <div class="flex-1"><div class="text-sm font-semibold text-naval">${escapeHtml(row.name)} ${escapeHtml(row.surname)}</div><div class="text-xs text-slate-500">${row.badges_count} badges · Nível ${row.level}</div></div>
          <div class="text-right"><div class="text-sm font-bold text-naval">${row.points.toLocaleString("pt-BR")}</div><div class="text-[10px] text-slate-500 uppercase">pontos</div></div>
        </div>`).join("");
    }

    // Cursos mais acessados (5º widget)
    const topCoursesWidget = $$("#page-dashboard .widget")[4];
    if (topCoursesWidget) {
      const sorted = courses.slice(0, 5).map(c => ({ ...c, pct: Math.floor((c.enrollments_count / Math.max(overview.users_active, 1)) * 100) }));
      const body = topCoursesWidget.querySelector(".widget-body");
      body.innerHTML = sorted.map((c, i) => `
        <div class="py-3 ${i < sorted.length - 1 ? "border-b border-slate-100" : ""}">
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-medium text-naval flex-1 pr-2 line-clamp-1">${escapeHtml(c.name)}</div>
            <span class="text-xs text-slate-500 font-semibold">${c.pct}%</span>
          </div>
          <div class="progress-bar"><div class="progress-bar-fill" style="width: ${c.pct}%"></div></div>
        </div>`).join("");
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

    // units
    const unitsList = $("#page-course-detail .bg-white.border.border-borderd.rounded-lg.divide-y");
    if (unitsList && course.units) {
      const iconByType = { video: "video", text: "file-text", quiz: "help-circle", pdf: "file", scorm: "package", assignment: "clipboard-check" };
      unitsList.innerHTML = course.units.map((u, i) => `
        <div class="unit-row" onclick="location.hash='#/unit-player?course=${course.id}&unit=${u.id}'">
          <i data-lucide="grip-vertical" class="w-4 h-4 text-slate-300 cursor-grab"></i>
          <div class="unit-icon"><i data-lucide="${iconByType[u.type] || "circle"}" class="w-4 h-4"></i></div>
          <div class="flex-1">
            <div class="text-sm font-semibold text-naval">${u.order_index} · ${escapeHtml(u.title)}</div>
            <div class="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
              <span class="flex items-center gap-1"><i data-lucide="${iconByType[u.type] || "circle"}" class="w-3 h-3"></i> ${escapeHtml(u.type)} · ${u.duration_min} min</span>
            </div>
          </div>
          <button class="icon-only p-2 hover:bg-gelo rounded-md text-slate-400" aria-label="Opções" onclick="event.stopPropagation()"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>
        </div>`).join("");
    }

    // stats card
    const cards = $$("#page-course-detail aside .widget");
    if (cards[1]) {
      const body = cards[1].querySelector(".widget-body");
      body.innerHTML = `
        <div class="kpi-row"><div class="kpi-label">Matriculados</div><div class="kpi-value">${course.enrollments_count}</div></div>
        <div class="kpi-row"><div class="kpi-label">Units</div><div class="kpi-value">${course.units_count}</div></div>
        <div class="kpi-row"><div class="kpi-label">Categoria</div><div class="text-sm font-semibold text-naval">${escapeHtml(course.category)}</div></div>
        ${course.instructor ? `<div class="kpi-row"><div class="kpi-label">Instrutor</div><div class="text-sm font-semibold text-naval">${escapeHtml(course.instructor.name)} ${escapeHtml(course.instructor.surname)}</div></div>` : ""}`;
    }
    rerunLucide();
  } catch (e) { console.error("[course-detail]", e); }
}

/* ============ LEADERBOARD PAGE ============ */
async function renderLeaderboard() {
  try {
    const rows = await api("/api/leaderboard");
    if (rows.length < 3) return;
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
    const table = $("#page-matrix .matrix-table");
    if (!table) return;
    const thead = table.querySelector("thead tr");
    thead.innerHTML = `
      <th class="user-header">Utilizadores <i data-lucide="arrow-up" class="w-3 h-3 inline ml-1"></i></th>
      ${data.courses.map(c => `<th class="course-col"><div class="course-label">${escapeHtml(c.name)}</div></th>`).join("")}`;
    const tbody = table.querySelector("tbody");
    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td class="user-cell" ${u.id === state.user.id ? 'style="background:#EBF7FA"' : ""}>${escapeHtml(u.name)} ${u.id === state.user.id ? '<span class="badge badge-success text-[9px]">VOCÊ</span>' : ""}</td>
        ${data.courses.map(c => {
          const st = data.cells[u.id][c.id] || "empty";
          if (st === "completed") return `<td><div class="matrix-cell completed" title="Concluído"><i data-lucide="check" class="w-4 h-4"></i></div></td>`;
          if (st === "in_progress") return `<td><div class="matrix-cell in-progress" title="Em progresso"></div></td>`;
          if (st === "started") return `<td><div class="matrix-cell started" title="Iniciado"></div></td>`;
          return `<td><div class="matrix-cell empty"></div></td>`;
        }).join("")}
      </tr>`).join("");
    // contagem footer
    const counter = $$("#page-matrix .border-t.border-borderd.p-3 .text-slate-500")[1];
    if (counter) counter.textContent = `${data.users.length} utilizadores · ${data.courses.length} cursos`;
    rerunLucide();
  } catch (e) { console.error("[matrix]", e); }
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

    // tabela cursos
    const tbody = $("#page-user-detail .data-table tbody");
    if (tbody) {
      tbody.innerHTML = u.enrollments.map((e, i) => `
        <tr ${i === 0 ? 'class="bg-gelo"' : ""}>
          <td><input type="checkbox" class="rounded border-borders"></td>
          <td>
            <div class="flex items-center gap-3">
              <div class="skeleton-thumb w-9 h-9 rounded-md flex-shrink-0 flex items-center justify-center"><i data-lucide="book-open" class="w-4 h-4 text-white"></i></div>
              <div class="font-medium text-naval line-clamp-1">curso #${e.course_id} · ${e.progress_pct}%</div>
            </div>
          </td>
          <td class="hidden md:table-cell text-slate-400">—</td>
          <td><span class="badge ${e.role === "Professor" ? "badge-info" : "badge-neutral"}">${escapeHtml(e.role)}</span></td>
          <td class="hidden md:table-cell text-slate-600">${new Date(e.enrolled_at).toLocaleDateString("pt-BR")}</td>
          <td class="hidden lg:table-cell">${e.completed_at ? `<span class="text-success-fg font-semibold">${new Date(e.completed_at).toLocaleDateString("pt-BR")}</span>` : '<span class="text-slate-400">—</span>'}</td>
          <td><div class="flex items-center justify-end gap-1"><button class="p-2 hover:bg-gelo rounded-md icon-only"><i data-lucide="more-horizontal" class="w-4 h-4 text-naval"></i></button></div></td>
        </tr>`).join("");
    }

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
    // cursos list
    const coursesList = $("#page-profile .lg\\:col-span-2 .space-y-3");
    if (coursesList && enrollments.length > 0) {
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
    const unitId = qs.get("unit");
    const courseId = qs.get("course");
    if (!unitId) return;
    const unit = await api(`/api/units/${unitId}`);
    const h1 = $("#page-unit-player h1");
    if (h1) h1.textContent = `${unit.order_index} · ${unit.title}`;
    const sub = $("#page-unit-player p.text-sm.text-slate-500");
    if (sub) sub.textContent = `${unit.type} · ${unit.duration_min} min`;
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
          // recarrega perfil em background pra refletir pontos novos
          if (state.user) { state.user = await api("/api/auth/me"); localStorage.setItem(USER_KEY, JSON.stringify(state.user)); }
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
};
async function handleRoute() {
  const name = (location.hash || "#/dashboard").replace("#/", "").split("?")[0];
  if (routes[name]) {
    try { await routes[name](); } catch (e) { console.error("[route]", e); }
  }
}

/* ============ BOOTSTRAP ============ */
async function bootstrapAfterLogin(user) {
  state.user = user;
  state.token = getToken();
  renderTopbar(user);
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
