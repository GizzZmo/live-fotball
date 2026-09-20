const API = "https://worldcup26.ir/get/soccer";

const LEAGUES = [
  { slug: "eng.1", name: "Premier League", short: "PL" },
  { slug: "esp.1", name: "La Liga", short: "LL" },
  { slug: "ger.1", name: "Bundesliga", short: "BL" },
  { slug: "ita.1", name: "Serie A", short: "SA" },
  { slug: "fra.1", name: "Ligue 1", short: "L1" },
  { slug: "ned.1", name: "Eredivisie", short: "ERE" },
  { slug: "por.1", name: "Primeira Liga", short: "POR" },
  { slug: "sco.1", name: "Scottish Premiership", short: "SCO" },
  { slug: "bel.1", name: "Pro League", short: "BEL" },
  { slug: "tur.1", name: "Süper Lig", short: "TUR" },
  { slug: "usa.1", name: "MLS", short: "MLS" },
  { slug: "bra.1", name: "Brasileirão", short: "BRA" },
];

const state = {
  view: "live",
  league: "all",
  query: "",
  matches: [],
  lastFetch: null,
  timer: null,
  openMatch: null,
  apiSync: null,
};

const STAT_LABELS = [
  ["possessionPct", "Ballbesittelse", true],
  ["totalShots", "Skudd", false],
  ["shotsOnTarget", "Skudd på mål", false],
  ["wonCorners", "Corners", false],
  ["foulsCommitted", "Foul", false],
  ["yellowCards", "Gule kort", false],
  ["redCards", "Røde kort", false],
  ["accuratePasses", "Presise pasninger", false],
];

const els = {
  chips: document.getElementById("leagueChips"),
  matchBoard: document.getElementById("matchBoard"),
  tableBoard: document.getElementById("tableBoard"),
  liveCount: document.getElementById("liveCountLabel"),
  livePill: document.getElementById("liveCountPill"),
  lastUpdate: document.getElementById("lastUpdate"),
  clock: document.getElementById("clock"),
  search: document.getElementById("searchInput"),
  refresh: document.getElementById("refreshBtn"),
  auto: document.getElementById("autoRefresh"),
  drawer: document.getElementById("matchDrawer"),
  drawerTitle: document.getElementById("drawerTitle"),
  drawerLeague: document.getElementById("drawerLeague"),
  drawerBody: document.getElementById("drawerBody"),
  closeDrawer: document.getElementById("closeDrawer"),
  apiMeta: document.getElementById("apiMeta"),
};

function todayStamp(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function parseMatch(event, league) {
  const comp = event.competitions?.[0] || {};
  const status = comp.status || event.status || {};
  const type = status.type || {};
  const competitors = comp.competitors || [];
  const home = competitors.find((c) => c.homeAway === "home") || competitors[0] || {};
  const away = competitors.find((c) => c.homeAway === "away") || competitors[1] || {};
  const stateCode = type.state || "pre";
  const desc = (type.description || type.detail || "").toLowerCase();
  const isHT = desc.includes("half") || type.shortDetail === "HT";
  const isLive = stateCode === "in" || isHT;
  const isPost = stateCode === "post" || type.completed;
  const kickoff = new Date(comp.startDate || event.date);

  return {
    id: event.id,
    leagueSlug: league.slug,
    leagueName: league.name,
    date: kickoff,
    venue: comp.venue?.fullName || "",
    city: comp.venue?.address?.city || "",
    clock: status.displayClock || type.shortDetail || "",
    period: status.period,
    state: isLive ? "live" : isPost ? "post" : "pre",
    statusText: type.shortDetail || type.detail || type.description || "",
    home: {
      name: home.team?.displayName || home.team?.name || "Hjemme",
      short: home.team?.shortDisplayName || home.team?.abbreviation || "",
      logo: home.team?.logo || "",
      score: home.score ?? "",
      form: home.form || "",
      winner: !!home.winner,
    },
    away: {
      name: away.team?.displayName || away.team?.name || "Borte",
      short: away.team?.shortDisplayName || away.team?.abbreviation || "",
      logo: away.team?.logo || "",
      score: away.score ?? "",
      form: away.form || "",
      winner: !!away.winner,
    },
  };
}

async function fetchLeague(league, date) {
  const url = `${API}/${league.slug}/scoreboard?dates=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${league.slug} ${res.status}`);
  const data = await res.json();
  return (data.events || []).map((event) => parseMatch(event, league));
}

async function loadMatches() {
  const dates = [todayStamp(0), todayStamp(-1)];
  const jobs = [];
  for (const date of dates) {
    for (const league of LEAGUES) {
      jobs.push(fetchLeague(league, date).catch(() => []));
    }
  }
  const chunks = await Promise.all(jobs);
  const byId = new Map();
  chunks.flat().forEach((m) => byId.set(m.id, m));
  state.matches = [...byId.values()].sort((a, b) => a.date - b.date);
  state.lastFetch = new Date();
  renderMatches();
  if (state.openMatch) openMatch(state.openMatch.id, state.openMatch.leagueSlug, false);
}

async function loadApiMeta() {
  try {
    const res = await fetch(`${API}/meta`);
    if (!res.ok) throw new Error("meta");
    const data = await res.json();
    state.apiSync = data.lastSuccessfulSyncAt;
    const sync = data.lastSuccessfulSyncAt
      ? new Date(data.lastSuccessfulSyncAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })
      : "ukjent";
    const matches = data.coverage?.matches ?? "–";
    els.apiMeta.textContent = `Sist synket ${sync} · ${data.coverage?.competitions || 0} ligaer · ${matches} kamper i databasen.`;
  } catch {
    els.apiMeta.textContent = "API-status kunne ikke hentes.";
  }
}

function matchesForView() {
  const q = state.query.trim().toLowerCase();
  return state.matches.filter((m) => {
    if (state.league !== "all" && m.leagueSlug !== state.league) return false;
    if (state.view === "live" && m.state !== "live") return false;
    if (state.view === "results" && m.state !== "post") return false;
    if (state.view === "upcoming" && m.state !== "pre") return false;
    if (q) {
      const hay = `${m.home.name} ${m.away.name} ${m.leagueName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function formHtml(form) {
  if (!form) return "";
  return `<div class="form">${[...form].slice(-5).map((c) => `<i class="${c}">${c}</i>`).join("")}</div>`;
}

function teamCell(team, side) {
  const img = team.logo
    ? `<img src="${team.logo}" alt="" onerror="this.style.display='none'" />`
    : "";
  const name = `<div><div class="team-name">${team.name}</div>${formHtml(team.form)}</div>`;
  return side === "away"
    ? `<div class="team away">${name}${img}</div>`
    : `<div class="team">${img}${name}</div>`;
}

function badge(match) {
  if (match.state === "live") {
    const label = match.statusText === "HT" || match.clock.includes("45") && match.statusText.includes("HT")
      ? `Pause ${match.clock}`
      : `LIVE ${match.clock || ""}`.trim();
    const cls = match.statusText === "HT" ? "ht" : "live";
    return `<span class="badge ${cls}">${label}</span>`;
  }
  if (match.state === "post") return `<span class="badge post">FT</span>`;
  return `<span class="badge pre">${formatTime(match.date)}</span>`;
}

function formatTime(date) {
  return date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function formatStamp(date) {
  return date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function renderMatches() {
  const liveN = state.matches.filter((m) => m.state === "live").length;
  els.liveCount.textContent = liveN ? `${liveN} live ${liveN === 1 ? "kamp" : "kamper"}` : "Ingen live kamper akkurat nå";
  els.livePill.classList.toggle("idle", liveN === 0);
  if (state.lastFetch) {
    els.lastUpdate.textContent = `Sist oppdatert ${formatStamp(state.lastFetch)}`;
  }

  if (state.view === "table") return;

  const list = matchesForView();
  if (!list.length) {
    els.matchBoard.innerHTML = `<div class="empty">Ingen kamper å vise i dette utvalget.</div>`;
    return;
  }

  const groups = new Map();
  list.forEach((m) => {
    if (!groups.has(m.leagueName)) groups.set(m.leagueName, []);
    groups.get(m.leagueName).push(m);
  });

  els.matchBoard.innerHTML = [...groups.entries()].map(([league, matches]) => `
    <article class="league-block">
      <h2>${league}</h2>
      <div class="match-grid">
        ${matches.map((m) => `
          <article class="card ${m.state === "live" ? "is-live" : ""}" data-match-id="${m.id}" tabindex="0">
            <div class="card-top">
              ${badge(m)}
              <span>${m.venue}${m.city ? " · " + m.city : ""}</span>
            </div>
            <div class="teams">
              ${teamCell(m.home, "home")}
              <div class="score">
                ${m.state === "pre" ? "–" : `${m.home.score ?? 0}–${m.away.score ?? 0}`}
                <small>${m.state === "live" ? m.clock : m.state === "post" ? "Fulltid" : formatTime(m.date)}</small>
              </div>
              ${teamCell(m.away, "away")}
            </div>
          </article>
        `).join("")}
      </div>
    </article>
  `).join("");
}

function statMap(stats) {
  const out = {};
  (stats || []).forEach((s) => { out[s.name] = s.displayValue; });
  return out;
}

async function loadTable() {
  const slug = state.league === "all" ? "eng.1" : state.league;
  const league = LEAGUES.find((l) => l.slug === slug) || LEAGUES[0];
  els.tableBoard.innerHTML = `<div class="loading">Henter tabellen for ${league.name}…</div>`;
  try {
    const res = await fetch(`${API}/${league.slug}/standings?season=2026`);
    if (!res.ok) throw new Error("Kunne ikke hente tabell");
    const data = await res.json();
    const entries = data.children?.[0]?.standings?.entries || [];
    if (!entries.length) {
      els.tableBoard.innerHTML = `<div class="empty">Ingen tabell tilgjengelig for ${league.name}.</div>`;
      return;
    }
    const rows = entries.map((row, i) => {
      const s = statMap(row.stats);
      return `<tr>
        <td class="num">${i + 1}</td>
        <td>
          <div class="club">
            ${row.team?.logo ? `<img src="${row.team.logo}" alt="" />` : ""}
            <span>${row.team?.displayName || row.team?.name}</span>
          </div>
        </td>
        <td class="num">${s.gamesPlayed || ""}</td>
        <td class="num">${s.wins || ""}</td>
        <td class="num">${s.ties || ""}</td>
        <td class="num">${s.losses || ""}</td>
        <td class="num">${s.pointsFor || ""}</td>
        <td class="num">${s.pointsAgainst || ""}</td>
        <td class="num">${s.pointDifferential || ""}</td>
        <td class="num"><strong>${s.points || ""}</strong></td>
      </tr>`;
    }).join("");
    els.tableBoard.innerHTML = `
      <article class="league-block">
        <h2>${league.name} 2026/27</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="num">#</th><th>Lag</th>
                <th class="num">K</th><th class="num">S</th><th class="num">U</th><th class="num">T</th>
                <th class="num">MF</th><th class="num">MM</th><th class="num">+/-</th><th class="num">P</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </article>`;
  } catch (err) {
    els.tableBoard.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

function statValue(stats, name) {
  const hit = (stats || []).find((s) => s.name === name);
  if (!hit) return null;
  const raw = String(hit.displayValue ?? "");
  const num = Number.parseFloat(raw);
  return Number.isFinite(num) ? num : raw;
}

function eventClass(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("goal") || t.includes("penalty-scored")) return "event-goal";
  if (t.includes("card") || t.includes("red") || t.includes("yellow")) return "event-card";
  return "";
}

function renderDrawer(match, summary) {
  const teams = summary?.boxscore?.teams || [];
  const home = teams.find((t) => t.homeAway === "home") || teams[0];
  const away = teams.find((t) => t.homeAway === "away") || teams[1];
  const events = (summary?.keyEvents || []).filter((ev) => {
    const t = ev.type?.type || ev.type?.text || "";
    return !["kickoff", "halftime", "end-delay", "start-delay", "end-regular-time"].includes(t);
  });
  const sync = summary?.meta?.lastSyncedAt
    ? new Date(summary.meta.lastSyncedAt).toLocaleTimeString("nb-NO")
    : "–";

  const rows = STAT_LABELS.map(([key, label, pct]) => {
    const hv = Number(statValue(home?.statistics, key) ?? 0);
    const av = Number(statValue(away?.statistics, key) ?? 0);
    const sum = hv + av || 1;
    const hs = pct ? `${hv}%` : hv;
    const as = pct ? `${av}%` : av;
    return `<div class="stat-row">
      <b>${hs}</b>
      <div>
        <span>${label}</span>
        <div class="bar" style="--h:${(hv / sum) * 100}%;--a:${(av / sum) * 100}%"><i></i><i></i></div>
      </div>
      <b>${as}</b>
    </div>`;
  }).join("");

  const timeline = events.length
    ? events.map((ev) => {
      const type = ev.type?.type || ev.type?.text || "";
      const clock = ev.clock?.displayValue || "";
      const text = ev.text || ev.shortText || ev.type?.text || type;
      return `<li class="${eventClass(type)}"><time>${clock || "–"}</time><span>${text}</span></li>`;
    }).join("")
    : "<li><span>Ingen nøkkelhendelser lagret ennå.</span></li>";

  els.drawerLeague.textContent = match.leagueName;
  els.drawerTitle.textContent = `${match.home.name} ${match.home.score || 0}–${match.away.score || 0} ${match.away.name}`;
  els.drawerBody.innerHTML = `
    <p class="meta">${match.statusText || ""} ${match.clock || ""} · ${match.venue || ""}</p>
    <div class="stat-grid">${rows}</div>
    <h3>Nøkkelhendelser</h3>
    <ol class="timeline">${timeline}</ol>
    <p class="meta">Kamp-snapshot synket ${sync}. Kilde: ${summary?.meta?.provider || "API"}.</p>
  `;
}

async function openMatch(id, leagueSlug, showLoading = true) {
  const match = state.matches.find((m) => m.id === id);
  if (!match) return;
  state.openMatch = { id, leagueSlug: leagueSlug || match.leagueSlug };
  els.drawer.hidden = false;
  if (showLoading) els.drawerBody.innerHTML = `<div class="loading">Henter kampsammendrag…</div>`;
  els.drawerLeague.textContent = match.leagueName;
  els.drawerTitle.textContent = `${match.home.name} vs ${match.away.name}`;
  try {
    const res = await fetch(`${API}/${match.leagueSlug}/summary?event=${match.id}`);
    if (!res.ok) throw new Error("Kunne ikke hente kampsammendrag");
    const summary = await res.json();
    renderDrawer(match, summary);
  } catch (err) {
    els.drawerBody.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

function closeDrawer() {
  state.openMatch = null;
  els.drawer.hidden = true;
}

function renderChips() {
  const all = [{ slug: "all", short: "Alle ligaer" }, ...LEAGUES];
  els.chips.innerHTML = all.map((l) =>
    `<button class="chip ${state.league === l.slug ? "is-active" : ""}" data-league="${l.slug}" type="button">${l.short || l.name}</button>`
  ).join("");
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === view);
  });
  const showTable = view === "table";
  els.matchBoard.classList.toggle("is-hidden", showTable);
  els.tableBoard.classList.toggle("is-hidden", !showTable);
  if (showTable) loadTable();
  else renderMatches();
}

function startClock() {
  const tick = () => {
    els.clock.textContent = new Date().toLocaleTimeString("nb-NO");
  };
  tick();
  setInterval(tick, 1000);
}

function scheduleRefresh() {
  clearInterval(state.timer);
  if (!els.auto.checked) return;
  const liveN = state.matches.filter((m) => m.state === "live").length;
  const ms = liveN ? 25000 : 60000;
  state.timer = setInterval(loadMatches, ms);
}

function bind() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });
  els.chips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-league]");
    if (!btn) return;
    state.league = btn.dataset.league;
    renderChips();
    if (state.view === "table") loadTable();
    else renderMatches();
  });
  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    renderMatches();
  });
  els.refresh.addEventListener("click", () => {
    els.lastUpdate.textContent = "Oppdaterer…";
    loadMatches().then(scheduleRefresh);
  });
  els.auto.addEventListener("change", scheduleRefresh);
  els.matchBoard.addEventListener("click", (e) => {
    const card = e.target.closest("[data-match-id]");
    if (card) openMatch(card.dataset.matchId);
  });
  els.matchBoard.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const card = e.target.closest("[data-match-id]");
    if (card) openMatch(card.dataset.matchId);
  });
  els.closeDrawer.addEventListener("click", closeDrawer);
  els.drawer.addEventListener("click", (e) => {
    if (e.target === els.drawer) closeDrawer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
}

renderChips();
bind();
startClock();
els.matchBoard.innerHTML = `<div class="loading">Henter dagens kamper…</div>`;
loadApiMeta();
loadMatches().then(scheduleRefresh);
