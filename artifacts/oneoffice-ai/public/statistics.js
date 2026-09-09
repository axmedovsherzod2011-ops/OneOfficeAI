import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBnESMGkgj17bQNVXOD3f7W7u5noxNXipY",
  authDomain: "oneoffice-ai-011.firebaseapp.com",
  projectId: "oneoffice-ai-011",
  storageBucket: "oneoffice-ai-011.firebasestorage.app",
  messagingSenderId: "1092049548876",
  appId: "1:1092049548876:web:bbcadc5709024e16f526e9",
  measurementId: "G-6WZV87V56K",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const API_BASE = ["localhost", "127.0.0.1"].includes(location.hostname) ? "" : "https://oneofficeai-1.onrender.com";
const app = document.querySelector("#app");
const connectorSelect = document.querySelector("#connector");
const refreshButton = document.querySelector("#refresh");
const backButton = document.querySelector("#back");

const nf = new Intl.NumberFormat("uz-UZ");
function n(value) { return nf.format(Number(value || 0)); }
function money(value) { return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function minutes(value) { const x = Number(value || 0); return `${Math.floor(x / 60)} soat ${Math.round(x % 60)} daqiqa`; }
function duration(value) { const x = Math.round(Number(value || 0)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`; }
function esc(value) { return String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c])); }
function isoDate(value) { return value ? new Date(value).toLocaleDateString("uz-UZ") : "—"; }

let currentUser = null;

async function api(path) {
  if (!currentUser) throw new Error("Tizimga kirish kerak.");
  const token = await currentUser.getIdToken();
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `API xatosi: ${response.status}`);
  return data;
}

function loading() { app.innerHTML = '<div class="loading"><div class="spinner"></div></div>'; }
function errorView(message) { app.innerHTML = `<div class="error">${esc(message)}</div>`; }
function empty(title, text) { app.innerHTML = `<div class="empty"><div style="font-size:28px;margin-bottom:10px">📊</div><strong style="color:#e2e8f0">${esc(title)}</strong><div style="margin-top:6px">${esc(text)}</div></div>`; }
function card(label, value, sub = "") { return `<div class="card"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>`; }

function lineChart(rows, key = "views", stroke = "#a78bfa", fillId = "fill") {
  if (!rows?.length) return '<div class="empty">Tarixiy maʼlumot hali mavjud emas.</div>';
  const width = 900, height = 250, left = 48, right = 18, top = 18, bottom = 30;
  const values = rows.map(r => Number(r[key] || 0));
  const max = Math.max(1, ...values);
  const x = i => left + (i / Math.max(1, rows.length - 1)) * (width - left - right);
  const y = v => top + (1 - v / max) * (height - top - bottom);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${left},${height-bottom} ${points} ${x(values.length-1)},${height-bottom}`;
  const labels = [0, Math.floor(rows.length / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${stroke}" stop-opacity=".65"/><stop offset="100%" stop-color="${stroke}" stop-opacity="0"/></linearGradient></defs><line class="chartGrid" x1="${left}" x2="${width-right}" y1="${top}" y2="${top}"/><line class="chartGrid" x1="${left}" x2="${width-right}" y1="${(top+height-bottom)/2}" y2="${(top+height-bottom)/2}"/><line class="chartGrid" x1="${left}" x2="${width-right}" y1="${height-bottom}" y2="${height-bottom}"/><polygon class="area" points="${area}" fill="url(#${fillId})"/><polyline class="line" style="stroke:${stroke}" points="${points}"/>${values.map((v,i)=>`<circle class="dot" style="fill:${stroke}" cx="${x(i)}" cy="${y(v)}" r="${i===values.length-1?4:2}"/>`).join("")}${labels.map(i=>`<text class="axis" x="${x(i)}" y="${height-8}" text-anchor="middle">${esc(rows[i].day || "")}</text>`).join("")}<text class="axis" x="${left-8}" y="${top+4}" text-anchor="end">${n(max)}</text><text class="axis" x="${left-8}" y="${height-bottom}" text-anchor="end">0</text></svg></div>`;
}

function metricChart(rows, metrics) {
  if (!rows?.length) return '<div class="empty">Tarixiy maʼlumot hali mavjud emas.</div>';
  const width = 900, height = 250, left = 48, right = 18, top = 18, bottom = 30;
  const all = metrics.flatMap(m => rows.map(r => Number(r[m.key] || 0)));
  const max = Math.max(1, ...all);
  const x = i => left + (i / Math.max(1, rows.length - 1)) * (width - left - right);
  const y = v => top + (1 - v / max) * (height - top - bottom);
  const labels = [0, Math.floor(rows.length / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const defs = metrics.map((m, i) => `<linearGradient id="metric-fill-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${m.color}" stop-opacity=".32"/><stop offset="100%" stop-color="${m.color}" stop-opacity="0"/></linearGradient>`).join("");
  const series = metrics.map((m, mi) => {
    const values = rows.map(r => Number(r[m.key] || 0));
    const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    return `<polyline class="line" style="stroke:${m.color};stroke-width:2" points="${points}"/>`;
  }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs>${defs}</defs><line class="chartGrid" x1="${left}" x2="${width-right}" y1="${top}" y2="${top}"/><line class="chartGrid" x1="${left}" x2="${width-right}" y1="${(top+height-bottom)/2}" y2="${(top+height-bottom)/2}"/><line class="chartGrid" x1="${left}" x2="${width-right}" y1="${height-bottom}" y2="${height-bottom}"/>${series}${labels.map(i=>`<text class="axis" x="${x(i)}" y="${height-8}" text-anchor="middle">${esc(rows[i].day || "")}</text>`).join("")}<text class="axis" x="${left-8}" y="${top+4}" text-anchor="end">${n(max)}</text><text class="axis" x="${left-8}" y="${height-bottom}" text-anchor="end">0</text></svg></div>`;
}

function legend(metrics) {
  return `<div style="display:flex;gap:16px;flex-wrap:wrap;margin:0 0 10px">${metrics.map(m => `<span style="font-size:11px;color:#94a3b8;display:inline-flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:50%;background:${m.color};display:inline-block"></i>${esc(m.label)}</span>`).join("")}</div>`;
}

function youtubeView(data) {
  const channels = data?.accounts || [];
  if (!channels.length) return empty("YouTube ulanmagan", "Avval Connectors → YouTube orqali kanal ulang.");
  const t = data.totals || {};
  const validChannels = channels.filter(c => !c.error);
  const first = validChannels[0] || channels[0];
  const daily = first?.analytics?.daily || [];
  const top = validChannels.slice().sort((a,b) => Number(b.viewCount||0)-Number(a.viewCount||0));
  const netSubs = Number(t.subscribersGained30d||0) - Number(t.subscribersLost30d||0);
  const avgDuration = first.analytics?.totals?.averageViewDuration || 0;
  const revenue = first.analytics?.revenue || {};
  const metrics = [
    { key: "views", label: "Views", color: "#a78bfa" },
    { key: "likes", label: "Likes", color: "#22d3ee" },
    { key: "comments", label: "Comments", color: "#34d399" },
  ];

  const videoRows = first.recentVideos || [];
  const videoTable = videoRows.length
    ? `<section class="panel"><div class="sectionTitle"><h3>Videos · real Data API</h3><span class="muted">Oxirgi ${videoRows.length} ta video</span></div><div class="tableWrap"><table class="table"><thead><tr><th>Video</th><th>Published</th><th>Views</th><th>Likes</th><th>Comments</th><th>Duration</th><th>Status</th></tr></thead><tbody>${videoRows.map(v => `<tr><td><div style="display:flex;align-items:center;gap:9px;min-width:260px">${v.thumbnails?.default?.url ? `<img class="thumb" src="${esc(v.thumbnails.default.url)}" alt=""/>` : ""}<span class="videoTitle">${esc(v.title)}</span></div></td><td>${isoDate(v.publishedAt)}</td><td>${n(v.viewCount)}</td><td>${n(v.likeCount)}</td><td>${n(v.commentCount)}</td><td>${esc(v.duration || "—")}</td><td><span class="pill">${esc(v.privacyStatus || "unknown")}</span></td></tr>`).join("")}</tbody></table></div></section>`
    : `<section class="panel"><div class="sectionTitle"><h3>Videos</h3></div><div class="empty">Video ro'yxati hozircha qaytmadi.</div></section>`;

  app.innerHTML = `<section class="hero"><div class="heroRow"><div class="channel">${first.thumbnailUrl ? `<img class="avatar" src="${esc(first.thumbnailUrl)}" alt=""/>` : `<div class="avatar"></div>`}<div><h2>${esc(first.title || "YouTube")}</h2><p>${esc(first.customUrl || first.channelId || "")} · ${data.rangeDays || 30} kunlik analytics</p></div></div><div class="updated">Yangilandi: ${new Date(data.updatedAt).toLocaleString("uz-UZ")}</div></div></section><div class="grid">${card("Jami ko‘rishlar", n(t.viewCount))}${card("Obunachilar", n(t.subscriberCount), `${netSubs >= 0 ? "+" : ""}${n(netSubs)} net · 30 kun`)}${card("Videolar", n(t.videoCount))}${card("30 kunlik views", n(t.views30d))}${card("Watch time", minutes(t.watchMinutes30d), "30 kun")}${card("Likes", n(t.likes30d), "30 kun")}${card("Comments", n(t.comments30d), "30 kun")}${card("Shares", n(t.shares30d), "30 kun")}${card("Est. revenue", revenue.estimatedRevenue ? `$${money(revenue.estimatedRevenue)}` : "—", revenue.estimatedRevenue ? "30 kun" : "Monetizatsiya maʼlumoti mavjud emas")}</div><div class="two"><section class="panel"><div class="sectionTitle"><h3>Performance · kunlik</h3><span class="muted">${esc(first.analytics?.startDate || "")} — ${esc(first.analytics?.endDate || "")}</span></div>${legend(metrics)}${metricChart(daily, metrics)}</section><section class="panel"><h3 style="margin-bottom:14px">Audience & engagement</h3><div class="miniGrid"><div class="mini"><div class="k">Average view duration</div><div class="v">${duration(avgDuration)}</div></div><div class="mini"><div class="k">Engaged views</div><div class="v">${n(first.analytics?.totals?.engagedViews)}</div></div><div class="mini"><div class="k">Subscribers gained</div><div class="v">${n(first.analytics?.totals?.subscribersGained)}</div></div><div class="mini"><div class="k">Subscribers lost</div><div class="v">${n(first.analytics?.totals?.subscribersLost)}</div></div><div class="mini"><div class="k">Channel views</div><div class="v">${n(first.viewCount)}</div></div><div class="mini"><div class="k">Public videos</div><div class="v">${n(first.videoCount)}</div></div><div class="mini"><div class="k">Channel comments</div><div class="v">${n(first.commentCount)}</div></div><div class="mini"><div class="k">Ad revenue</div><div class="v">${revenue.estimatedAdRevenue ? `$${money(revenue.estimatedAdRevenue)}` : "—"}</div></div></div></section></div>${videoTable}<section class="panel"><div class="sectionTitle"><h3>Connected YouTube channels</h3><span class="muted">API orqali real maʼlumot</span></div><div class="tableWrap"><table class="table"><thead><tr><th>Channel</th><th>Views</th><th>Subscribers</th><th>Videos</th><th>Status</th></tr></thead><tbody>${top.map(c => `<tr><td>${esc(c.title || c.channelId)}</td><td>${n(c.viewCount)}</td><td>${n(c.subscriberCount)}</td><td>${n(c.videoCount)}</td><td>${c.error ? `<span style="color:#fda4af">${esc(c.error)}</span>` : '<span class="pill">Live API</span>'}</td></tr>`).join("")}</tbody></table></div></section>${first.analytics?.error ? `<div class="notice" style="margin-top:14px">YouTube Data API ishladi, lekin Analytics API ayrim hisobotlari qaytmadi: ${esc(first.analytics.error)}</div>` : ""}`;
}

async function telegramView() {
  const [live, combined] = await Promise.all([api("/api/telegram-mtproto/stats/live"), api("/api/stats/dashboard/combined?granularity=day")]);
  const channels = live?.channels || [];
  app.innerHTML = `<section class="hero"><div class="heroRow"><div class="channel"><div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:23px">✈️</div><div><h2>Telegram</h2><p>MTProto orqali real kanal statistikasi</p></div></div><div class="updated">Yangilandi: ${new Date().toLocaleString("uz-UZ")}</div></div></section><div class="grid">${card("Jami obunachilar",n(live?.totalSubscribers))}${card("Jami views",n(live?.totalViews))}${card("Ulangan kanallar",n(channels.length))}${card("Bugungi views",n(combined?.today?.views))}</div><div class="two"><section class="panel"><div class="sectionTitle"><h3>Kunlik Telegram ko‘rsatkichlari</h3><span class="muted">Real history</span></div>${lineChart((combined?.buckets||[]).map(b=>({day:b.periodStart?.slice(5,10),views:b.views})))}</section><section class="panel"><h3 style="margin-bottom:14px">Kanallar</h3><div class="tableWrap"><table class="table"><thead><tr><th>Kanal</th><th>Subscribers</th><th>Views</th></tr></thead><tbody>${channels.map(c=>`<tr><td>${esc(c.channelTitle)}</td><td>${n(c.subscribers)}</td><td>${n(c.views)}</td></tr>`).join("")}</tbody></table></div></section></div>`;
}

async function simpleConnectorView(kind) {
  const [stats, accounts] = await Promise.all([api(`/api/connectors/statistics/${kind}`), api(`/api/connectors/${kind}`)]);
  const list = Array.isArray(accounts) ? accounts : accounts?.accounts || [];
  if (stats?.available === false || !stats?.totals || Object.keys(stats.totals).length === 0) {
    app.innerHTML = `<section class="hero"><div class="heroRow"><div class="channel"><div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:20px">${kind === "instagram" ? "◎" : "VK"}</div><div><h2>${kind === "instagram" ? "Instagram" : "VK"}</h2><p>Connector account maʼlumotlari</p></div></div><div class="updated">${list.length} ta ulangan</div></div></section><div class="notice">${esc(stats?.message || "Bu connector uchun hozirgi API scope real analytics maʼlumotlarini bermayapti.")}<br/><br/>OneOffice bu yerda fake raqam ko‘rsatmaydi. Connector API analytics permissionlari paydo bo‘lsa, shu oynaga real metrikalar ulanadi.</div><div class="sectionTitle"><h3>Connected accounts</h3></div><section class="panel"><div class="tableWrap"><table class="table"><thead><tr><th>Account</th><th>Status</th></tr></thead><tbody>${list.map(a=>`<tr><td>${esc(a.username || a.title || a.screenName || a.name || `${kind} account`)}</td><td><span class="pill">Connected</span></td></tr>`).join("") || '<tr><td colspan="2">Ulangan akkaunt yo‘q.</td></tr>'}</tbody></table></div></section>`;
    return;
  }
  app.innerHTML = `<div class="grid">${Object.entries(stats.totals).map(([k,v])=>card(k,n(v))).join("")}</div>`;
}

async function load(kind = connectorSelect.value) {
  if (!currentUser) return;
  loading();
  try {
    if (kind === "youtube") {
      const data = await api("/api/connectors/statistics/youtube");
      youtubeView(data);
    } else if (kind === "telegram") {
      await telegramView();
    } else {
      await simpleConnectorView(kind);
    }
  } catch (err) {
    errorView(err?.message || "Statistika yuklanmadi.");
  }
}

connectorSelect.addEventListener("change", () => load());
refreshButton.addEventListener("click", () => load());
backButton.addEventListener("click", () => {
  if (window.parent !== window) {
    window.parent.postMessage({ type: "ONEOFFICE_CLOSE_STATISTICS" }, "*");
  } else {
    window.location.href = "/";
  }
});

window.addEventListener("message", event => {
  if (event.data?.type === "ONEOFFICE_REFRESH_STATISTICS") load();
});

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (!user) {
    app.innerHTML = '<div class="empty"><strong style="color:#fff">Login kerak</strong><div style="margin-top:6px">Profile oynasiga qayting va qayta kiring.</div><div style="margin-top:18px"><button class="action" onclick="location.href=\'/sign-in\'">Sign in</button></div></div>';
    return;
  }
  load("youtube");
});
