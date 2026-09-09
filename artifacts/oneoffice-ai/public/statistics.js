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
function minutes(value) { const x = Number(value || 0); return `${Math.floor(x / 60)} soat ${Math.round(x % 60)} daqiqa`; }
function duration(value) { const x = Math.round(Number(value || 0)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`; }
function esc(value) { return String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c])); }

let currentUser = null;
let lastData = null;

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

function lineChart(rows) {
  if (!rows?.length) return '<div class="empty">Tarixiy maʼlumot hali mavjud emas.</div>';
  const width = 900, height = 250, left = 48, right = 18, top = 18, bottom = 30;
  const values = rows.map(r => Number(r.views || 0));
  const max = Math.max(1, ...values);
  const x = i => left + (i / Math.max(1, rows.length - 1)) * (width - left - right);
  const y = v => top + (1 - v / max) * (height - top - bottom);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${left},${height-bottom} ${points} ${x(values.length-1)},${height-bottom}`;
  const labels = [0, Math.floor(rows.length / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a78bfa" stop-opacity=".65"/><stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/></linearGradient></defs><polygon class="area" points="${area}"/><polyline class="line" points="${points}"/>${values.map((v,i)=>`<circle class="dot" cx="${x(i)}" cy="${y(v)}" r="${i===values.length-1?4:2}"/>`).join("")}${labels.map(i=>`<text class="axis" x="${x(i)}" y="${height-8}" text-anchor="middle">${esc(rows[i].day || "")}</text>`).join("")}<text class="axis" x="${left-8}" y="${top+4}" text-anchor="end">${n(max)}</text><text class="axis" x="${left-8}" y="${height-bottom}" text-anchor="end">0</text></svg></div>`;
}

function youtubeView(data) {
  const channels = data?.accounts || [];
  if (!channels.length) return empty("YouTube ulanmagan", "Avval Connectors → YouTube orqali kanal ulang.");
  const t = data.totals || {};
  const first = channels.find(c => !c.error) || channels[0];
  const daily = first?.analytics?.daily || [];
  const top = channels.slice().filter(c => !c.error).sort((a,b) => Number(b.viewCount||0)-Number(a.viewCount||0));
  const netSubs = Number(t.subscribersGained30d||0) - Number(t.subscribersLost30d||0);
  app.innerHTML = `<section class="hero"><div class="heroRow"><div class="channel">${first.thumbnailUrl ? `<img class="avatar" src="${esc(first.thumbnailUrl)}" alt=""/>` : `<div class="avatar"></div>`}<div><h2>${esc(first.title || "YouTube")}</h2><p>${esc(first.customUrl || first.channelId || "")} · ${data.rangeDays || 30} kunlik analytics</p></div></div><div class="updated">Yangilandi: ${new Date(data.updatedAt).toLocaleString("uz-UZ")}</div></div></section><div class="grid">${card("Jami ko‘rishlar", n(t.viewCount))}${card("Obunachilar", n(t.subscriberCount), `${netSubs >= 0 ? "+" : ""}${n(netSubs)} net · 30 kun`)}${card("Videolar", n(t.videoCount))}${card("30 kunlik views", n(t.views30d))}${card("Watch time", minutes(t.watchMinutes30d), "30 kun")}${card("Likes", n(t.likes30d), "30 kun")}${card("Comments", n(t.comments30d), "30 kun")}${card("Shares", n(t.shares30d), "30 kun")}</div><div class="two"><section class="panel"><div class="sectionTitle"><h3>Views · kunlik</h3><span class="muted">${esc(first.analytics?.startDate || "")} — ${esc(first.analytics?.endDate || "")}</span></div>${lineChart(daily)}</section><section class="panel"><h3>Audience & engagement</h3><table class="table"><tbody><tr><th>Average view duration</th><td>${duration(first.analytics?.totals?.averageViewDuration)}</td></tr><tr><th>Engaged views</th><td>${n(first.analytics?.totals?.engagedViews)}</td></tr><tr><th>Subscribers gained</th><td>${n(first.analytics?.totals?.subscribersGained)}</td></tr><tr><th>Subscribers lost</th><td>${n(first.analytics?.totals?.subscribersLost)}</td></tr><tr><th>Channel views</th><td>${n(first.viewCount)}</td></tr><tr><th>Public videos</th><td>${n(first.videoCount)}</td></tr></tbody></table></section></div><section class="panel"><div class="sectionTitle"><h3>Connected YouTube channels</h3><span class="muted">API orqali real maʼlumot</span></div><table class="table"><thead><tr><th>Channel</th><th>Views</th><th>Subscribers</th><th>Videos</th><th>Status</th></tr></thead><tbody>${top.map(c => `<tr><td>${esc(c.title || c.channelId)}</td><td>${n(c.viewCount)}</td><td>${n(c.subscriberCount)}</td><td>${n(c.videoCount)}</td><td>${c.error ? `<span style="color:#fda4af">${esc(c.error)}</span>` : '<span class="pill">Live API</span>'}</td></tr>`).join("")}</tbody></table></section>${first.analytics?.error ? `<div class="notice" style="margin-top:14px">YouTube Data API channel statistics ishladi, lekin Analytics API ayrim hisobotlari qaytmadi: ${esc(first.analytics.error)}</div>` : ""}`;
}

async function telegramView() {
  const [live, combined] = await Promise.all([api("/api/telegram-mtproto/stats/live"), api("/api/stats/dashboard/combined?granularity=day")]);
  const channels = live?.channels || [];
  app.innerHTML = `<section class="hero"><div class="heroRow"><div class="channel"><div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:23px">✈️</div><div><h2>Telegram</h2><p>MTProto orqali real kanal statistikasi</p></div></div><div class="updated">Yangilandi: ${new Date().toLocaleString("uz-UZ")}</div></div></section><div class="grid">${card("Jami obunachilar",n(live?.totalSubscribers))}${card("Jami views",n(live?.totalViews))}${card("Ulangan kanallar",n(channels.length))}${card("Bugungi views",n(combined?.today?.views))}</div><div class="two"><section class="panel"><div class="sectionTitle"><h3>Kunlik Telegram ko‘rsatkichlari</h3><span class="muted">Real history</span></div>${lineChart((combined?.buckets||[]).map(b=>({day:b.periodStart?.slice(5,10),views:b.views})) )}</section><section class="panel"><h3>Kanallar</h3><table class="table"><thead><tr><th>Kanal</th><th>Subscribers</th><th>Views</th></tr></thead><tbody>${channels.map(c=>`<tr><td>${esc(c.channelTitle)}</td><td>${n(c.subscribers)}</td><td>${n(c.views)}</td></tr>`).join("")}</tbody></table></section></div>`;
}

async function simpleConnectorView(kind) {
  const [stats, accounts] = await Promise.all([api(`/api/connectors/statistics/${kind}`), api(`/api/connectors/${kind}`)]);
  const list = Array.isArray(accounts) ? accounts : accounts?.accounts || [];
  if (stats?.available === false || !stats?.totals || Object.keys(stats.totals).length === 0) {
    app.innerHTML = `<section class="hero"><div class="heroRow"><div class="channel"><div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:23px">${kind === "instagram" ? "◎" : "VK"}</div><div><h2>${kind === "instagram" ? "Instagram" : "VK"}</h2><p>Connector account maʼlumotlari</p></div></div><div class="updated">${list.length} ta ulangan</div></div></section><div class="notice">${esc(stats?.message || "Bu connector uchun hozirgi API scope real analytics maʼlumotlarini bermayapti.")}<br/><br/>OneOffice statistikalar oynasi mavjud API imkoniyatlarini yashirmaydi: yangi analytics permission/API qo‘shilganda shu bo‘limga real ko‘rsatkichlar ulanishi mumkin.</div><div class="sectionTitle"><h3>Connected accounts</h3></div><section class="panel"><table class="table"><thead><tr><th>Account</th><th>Status</th></tr></thead><tbody>${list.map(a=>`<tr><td>${esc(a.username || a.title || a.screenName || a.name || `${kind} account`)}</td><td><span class="pill">Connected</span></td></tr>`).join("") || '<tr><td colspan="2">Ulangan akkaunt yo‘q.</td></tr>'}</tbody></table></section>`;
    return;
  }
  app.innerHTML = `<div class="grid">${Object.entries(stats.totals).map(([k,v])=>card(k,n(v))).join("")}</div>`;
}

async function load(kind = connectorSelect.value) {
  if (!currentUser) return;
  loading();
  try {
    if (kind === "youtube") {
      lastData = await api("/api/connectors/statistics/youtube");
      youtubeView(lastData);
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
backButton.addEventListener("click", () => { window.location.href = "/"; });

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (!user) {
    app.innerHTML = '<div class="empty"><strong style="color:#fff">Login kerak</strong><div style="margin-top:6px">Profile oynasiga qayting va qayta kiring.</div><div style="margin-top:18px"><button class="back" onclick="location.href=\'/sign-in\'">Sign in</button></div></div>';
    return;
  }
  load("youtube");
});
