const STORAGE_KEY = "savings-ledger-web-v1";
const UI_KEY = "xiaoman-ui-v2";

const localISO = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const todayISO = () => localISO();
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const demoData = {
  goal: { name: "三个月应急金", target: 30000, current: 8000, plan: 3000 },
  budget: 5000,
  records: [
    { id: uid(), type: "income", amount: 9000, category: "工资", channel: "银行卡", date: todayISO(), note: "本月工资" },
    { id: uid(), type: "expense", amount: 2400, category: "房租", channel: "支付宝", date: todayISO(), note: "房租" },
    { id: uid(), type: "expense", amount: 36.8, category: "餐饮", channel: "微信", date: todayISO(), note: "晚饭" },
    { id: uid(), type: "expense", amount: 12, category: "交通", channel: "支付宝", date: todayISO(), note: "地铁" }
  ],
  investments: [
    { id: uid(), date: todayISO(), total: 12000, profit: 6.82, note: "基金和余额宝" }
  ]
};

const categoryMeta = {
  "餐饮": ["餐", "#f6eee0"], "外卖": ["餐", "#f6eee0"], "房租": ["住", "#e6ece8"],
  "水电燃气": ["居", "#e6ece8"], "交通": ["行", "#e5edf5"], "日用品": ["用", "#f0ece6"],
  "购物": ["购", "#f5e8e6"], "娱乐": ["乐", "#ece8f4"], "医疗": ["医", "#e5f0eb"],
  "工资": ["收", "#dceae4"], "理财": ["财", "#e3edf0"], "其他": ["其", "#eceeeb"]
};

let state = loadState();
let recordFilter = "all";
let privacyMode = JSON.parse(localStorage.getItem(UI_KEY) || "{}").privacy || false;
let screenshotURL = "";

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed) return clone(demoData);
    return {
      goal: { ...demoData.goal, ...(parsed.goal || {}) },
      budget: numberFrom(parsed.budget) || demoData.budget,
      records: Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord) : [],
      investments: Array.isArray(parsed.investments) ? parsed.investments.map(normalizeInvestment) : []
    };
  } catch {
    return clone(demoData);
  }
}

function normalizeRecord(record) {
  return { id: record.id || uid(), type: record.type === "income" ? "income" : "expense", amount: numberFrom(record.amount), category: String(record.category || "其他"), channel: String(record.channel || "其他"), date: record.date || todayISO(), note: String(record.note || "") };
}

function normalizeInvestment(item) {
  return { id: item.id || uid(), date: item.date || todayISO(), total: numberFrom(item.total), profit: numberFrom(item.profit), note: String(item.note || "") };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function numberFrom(value) {
  const result = Number(String(value ?? "").replaceAll(",", "").trim());
  return Number.isFinite(result) ? result : 0;
}

function money(value, signed = false) {
  const amount = Number(value || 0);
  const sign = signed && amount > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: Math.abs(amount % 1) > 0 ? 2 : 0 }).format(amount)}`;
}

function isCurrentMonth(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function monthRecords() { return state.records.filter((record) => isCurrentMonth(record.date)); }
function monthInvestments() { return state.investments.filter((item) => isCurrentMonth(item.date)); }

function totals() {
  const records = monthRecords();
  const income = records.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = records.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const monthProfit = monthInvestments().reduce((sum, item) => sum + item.profit, 0);
  const allProfit = state.investments.reduce((sum, item) => sum + item.profit, 0);
  const latest = [...state.investments].sort((a, b) => b.date.localeCompare(a.date))[0];
  return { income, expense, monthProfit, allProfit, investmentTotal: latest?.total || 0 };
}

function daysLeftInMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
}

function render() {
  renderDashboard();
  renderRecords();
  renderInvestments();
  prepareForms();
  document.body.classList.toggle("privacy", privacyMode);
  refreshIcons();
}

function renderDashboard() {
  const total = totals();
  const budgetRemaining = state.budget - total.expense;
  const available = total.income > 0 ? Math.min(total.income - total.expense, budgetRemaining) : budgetRemaining;
  const daily = Math.max(available, 0) / daysLeftInMonth();
  const savingRate = total.income > 0 ? ((total.income - total.expense) / total.income) * 100 : 0;
  const progress = state.goal.target > 0 ? Math.min(state.goal.current / state.goal.target, 1) : 0;
  const left = Math.max(state.goal.target - state.goal.current, 0);
  const months = state.goal.plan > 0 ? Math.ceil(left / state.goal.plan) : 0;

  setText("today-line", new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date()));
  setText("month-available", money(available));
  setText("month-income", money(total.income));
  setText("month-expense", money(total.expense));
  setText("saving-rate", `${Math.round(savingRate)}%`);

  let insight = `距离月底还有 ${daysLeftInMonth()} 天，建议每天控制在 ${money(daily)} 内。`;
  if (available < 0) insight = `本月已超出预算 ${money(Math.abs(available))}，接下来先守住必要支出。`;
  else if (total.expense === 0) insight = `本月预算 ${money(state.budget)}，记下第一笔后会计算每日可花额度。`;
  setText("month-insight", insight);

  setText("goal-name", state.goal.name);
  setText("goal-percent", `${Math.round(progress * 100)}%`);
  setText("goal-current", money(state.goal.current));
  setText("goal-target", money(state.goal.target));
  setText("goal-left", left > 0 ? `还差 ${money(left)}` : "目标已完成");
  setText("goal-eta", left === 0 ? "做得很好" : months > 0 ? `约 ${months} 个月完成` : "设置月计划后可估算");
  document.querySelector("#goal-progress").style.width = `${progress * 100}%`;
  renderCategories(total.expense);
}

function renderCategories(monthExpense) {
  const container = document.querySelector("#category-list");
  const grouped = monthRecords().filter((item) => item.type === "expense").reduce((map, item) => {
    map[item.category] = (map[item.category] || 0) + item.amount;
    return map;
  }, {});
  const rows = Object.entries(grouped).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  if (!rows.length) { container.innerHTML = '<p class="empty">本月还没有支出记录</p>'; return; }
  container.innerHTML = rows.map((row) => {
    const [icon, color] = categoryMeta[row.category] || categoryMeta["其他"];
    const ratio = monthExpense ? (row.amount / monthExpense) * 100 : 0;
    return `<div class="category-row"><span class="category-icon" style="background:${color}">${icon}</span><div class="category-main"><div><strong>${escapeHTML(row.category)}</strong><span>${Math.round(ratio)}%</span></div><p class="bar"><span style="width:${ratio}%"></span></p></div><strong class="category-amount money-value">${money(row.amount)}</strong></div>`;
  }).join("");
}

function renderRecords() {
  const container = document.querySelector("#record-list");
  const query = document.querySelector("#record-search")?.value.trim().toLowerCase() || "";
  const records = [...state.records].filter((item) => recordFilter === "all" || item.type === recordFilter).filter((item) => `${item.note} ${item.category} ${item.channel}`.toLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date));
  const total = totals();
  setText("ledger-expense", money(total.expense));
  setText("ledger-count", `${monthRecords().length} 笔`);
  if (!records.length) { container.innerHTML = '<p class="empty">没有找到符合条件的账目</p>'; return; }
  let lastDate = "";
  container.innerHTML = records.map((record) => {
    const [icon, color] = categoryMeta[record.category] || categoryMeta["其他"];
    const dateHeading = record.date !== lastDate ? `<p class="date-group">${friendlyDate(record.date)}</p>` : "";
    lastDate = record.date;
    return `${dateHeading}<article class="record-row"><span class="record-icon" style="background:${color}">${icon}</span><div class="record-main"><strong>${escapeHTML(record.note || record.category)}</strong><p>${escapeHTML(record.category)} · ${escapeHTML(record.channel)}</p></div><strong class="amount money-value ${record.type}">${record.type === "income" ? money(record.amount, true) : `-${money(record.amount)}`}</strong><button class="delete-button" data-delete-record="${record.id}" aria-label="删除账目" title="删除"><i data-lucide="trash-2"></i></button></article>`;
  }).join("");
}

function renderInvestments() {
  const container = document.querySelector("#investment-list");
  const total = totals();
  setText("investment-total", money(total.investmentTotal));
  setText("investment-month-profit", money(total.monthProfit, true));
  setText("investment-all-profit", money(total.allProfit, true));
  const records = [...state.investments].sort((a, b) => b.date.localeCompare(a.date));
  renderProfitChart(records.slice(0, 7).reverse());
  if (!records.length) { container.innerHTML = '<p class="empty">还没有理财记录，今天可以更新一次</p>'; return; }
  container.innerHTML = records.map((item) => `<article class="record-row"><span class="record-icon">财</span><div class="record-main"><strong>${friendlyDate(item.date)}</strong><p>${escapeHTML(item.note || "理财总览")}</p></div><div class="amount profit ${item.profit >= 0 ? "positive" : "negative"}"><strong class="money-value">${money(item.total)}</strong><p class="money-value">${money(item.profit, true)}</p></div><button class="delete-button" data-delete-investment="${item.id}" aria-label="删除记录" title="删除"><i data-lucide="trash-2"></i></button></article>`).join("");
}

function renderProfitChart(records) {
  const chart = document.querySelector("#profit-chart");
  if (!records.length) { chart.innerHTML = '<p class="empty">暂无收益走势</p>'; return; }
  const max = Math.max(...records.map((item) => Math.abs(item.profit)), 1);
  chart.innerHTML = records.map((item) => `<div class="spark-bar ${item.profit < 0 ? "negative" : ""}" style="--height:${Math.max(12, Math.abs(item.profit) / max * 76)}%" title="${item.date} ${money(item.profit, true)}"><span>${item.date.slice(5).replace("-", "/")}</span></div>`).join("");
}

function prepareForms() {
  const goal = state.goal;
  document.querySelector("#goal-input-name").value = goal.name;
  document.querySelector("#goal-input-target").value = goal.target;
  document.querySelector("#goal-input-current").value = goal.current;
  document.querySelector("#goal-input-plan").value = goal.plan;
  document.querySelector("#budget-input").value = state.budget;
  document.querySelector("#record-form input[name='date']").value ||= todayISO();
  document.querySelector("#investment-form input[name='date']").value ||= todayISO();
  const latest = [...state.investments].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latest && !document.querySelector("#investment-form input[name='total']").value) document.querySelector("#investment-form input[name='total']").value = latest.total;
}

function friendlyDate(dateText) {
  if (dateText === todayISO()) return "今天";
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dateText === localISO(yesterday)) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${dateText}T00:00:00`));
}

function escapeHTML(value) {
  const div = document.createElement("div"); div.textContent = value; return div.innerHTML;
}

function setText(id, text) { document.querySelector(`#${id}`).textContent = text; }
function refreshIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } }); }

function navigate(target) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${target}`));
  document.querySelectorAll(".tabbar [data-nav]").forEach((tab) => tab.classList.toggle("active", tab.dataset.nav === target));
  window.scrollTo({ top: 0, behavior: "smooth" });
  refreshIcons();
}

function openDialog(id) {
  const dialog = document.querySelector(`#${id}`);
  if (!dialog.open) dialog.showModal();
  refreshIcons();
}

function openRecordDialog(type = "expense") {
  const form = document.querySelector("#record-form");
  form.querySelector(`input[name="type"][value="${type}"]`).checked = true;
  setText("record-dialog-title", type === "income" ? "记一笔收入" : "记一笔支出");
  openDialog("record-dialog");
  setTimeout(() => form.querySelector("input[name='amount']").focus(), 80);
}

function toast(message) {
  const element = document.querySelector("#toast");
  element.textContent = message; element.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove("show"), 1800);
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) navigate(nav.dataset.nav);
  const opener = event.target.closest("[data-open-dialog]");
  if (opener) openDialog(opener.dataset.openDialog);
  const recordButton = event.target.closest("[data-record-type]");
  if (recordButton) openRecordDialog(recordButton.dataset.recordType);
  const close = event.target.closest(".dialog-close");
  if (close) close.closest("dialog").close();

  const deleteRecord = event.target.closest("[data-delete-record]");
  if (deleteRecord && confirm("删除这笔账目？")) {
    state.records = state.records.filter((item) => item.id !== deleteRecord.dataset.deleteRecord);
    saveState(); render(); toast("账目已删除");
  }
  const deleteInvestment = event.target.closest("[data-delete-investment]");
  if (deleteInvestment && confirm("删除这条理财记录？")) {
    state.investments = state.investments.filter((item) => item.id !== deleteInvestment.dataset.deleteInvestment);
    saveState(); render(); toast("记录已删除");
  }
});

document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
}));

document.querySelector("#goal-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  state.goal = { name: String(form.get("name") || "攒钱目标"), target: numberFrom(form.get("target")), current: numberFrom(form.get("current")), plan: numberFrom(form.get("plan")) };
  state.budget = numberFrom(form.get("budget")); saveState(); event.currentTarget.closest("dialog").close(); render(); toast("计划已更新");
});

document.querySelector("#record-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  const amount = numberFrom(form.get("amount")); if (amount <= 0) return toast("请输入正确金额");
  state.records.push(normalizeRecord({ id: uid(), type: form.get("type"), amount, category: form.get("category"), channel: form.get("channel"), date: form.get("date"), note: form.get("note") }));
  saveState(); event.currentTarget.reset(); event.currentTarget.closest("dialog").close(); render(); toast("已记入账本");
});

document.querySelector("#investment-form").addEventListener("submit", (event) => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  state.investments.push(normalizeInvestment({ id: uid(), date: form.get("date"), total: form.get("total"), profit: form.get("profit"), note: form.get("note") }));
  saveState(); event.currentTarget.reset(); event.currentTarget.closest("dialog").close(); render(); toast("理财收益已更新");
});

document.querySelector("#record-search").addEventListener("input", () => { renderRecords(); refreshIcons(); });
document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
  recordFilter = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button)); renderRecords(); refreshIcons();
}));

document.querySelector("#toggle-privacy").addEventListener("click", () => {
  privacyMode = !privacyMode; localStorage.setItem(UI_KEY, JSON.stringify({ privacy: privacyMode }));
  document.body.classList.toggle("privacy", privacyMode); toast(privacyMode ? "金额已隐藏" : "金额已显示");
});

document.querySelector("#screenshot-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  if (screenshotURL) URL.revokeObjectURL(screenshotURL);
  screenshotURL = URL.createObjectURL(file);
  const preview = document.querySelector("#screenshot-preview"); preview.src = screenshotURL; preview.hidden = false;
  document.querySelector("#screenshot-zone").hidden = true; document.querySelector("#screenshot-continue").disabled = false;
});

document.querySelector("#screenshot-form").addEventListener("submit", (event) => {
  event.preventDefault(); event.currentTarget.closest("dialog").close(); openRecordDialog("expense");
});

document.querySelector("#export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `xiaoman-backup-${todayISO()}.json`; link.click(); URL.revokeObjectURL(url); toast("备份已导出");
});

document.querySelector("#import-data").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; if (!file) return;
  try { const parsed = JSON.parse(await file.text()); localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); state = loadState(); render(); toast("备份已导入"); }
  catch { toast("备份文件无法识别"); }
});

document.querySelector("#reset-demo").addEventListener("click", () => {
  if (!confirm("恢复示例数据会覆盖当前账本，确定继续？")) return;
  state = clone(demoData); saveState(); render(); toast("已恢复示例数据");
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=5").catch(() => {});
render();
