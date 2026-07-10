const STORAGE_KEY = "savings-ledger-web-v1";
const UI_KEY = "xiaoman-ui-v2";
const OCR_SCRIPT = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const CATEGORY_OPTIONS = ["食", "衣", "住", "行", "网购", "通讯", "日用", "娱乐", "医疗", "人情", "工资", "理财", "其他"];

const localISO = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const todayISO = () => localISO();
const shiftDate = (days) => { const date = new Date(); date.setDate(date.getDate() + days); return localISO(date); };
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const demoAccountIds = { stocks: uid(), crypto: uid(), funds: uid() };
const demoData = {
  goal: { name: "三个月应急金", target: 30000, current: 8000, plan: 3000 },
  budget: 5000,
  records: [
    { id: uid(), type: "income", amount: 9000, category: "工资", channel: "银行卡", date: todayISO(), note: "本月工资" },
    { id: uid(), type: "expense", amount: 2400, category: "住", channel: "支付宝", date: todayISO(), note: "房租" },
    { id: uid(), type: "expense", amount: 36.8, category: "食", channel: "微信", date: todayISO(), note: "晚饭" },
    { id: uid(), type: "expense", amount: 12, category: "行", channel: "支付宝", date: todayISO(), note: "地铁" }
  ],
  investmentAccounts: [
    { id: demoAccountIds.stocks, name: "美股", type: "股票", currentValue: 18000 },
    { id: demoAccountIds.crypto, name: "比特币", type: "数字货币", currentValue: 8000 },
    { id: demoAccountIds.funds, name: "全部基金", type: "基金", currentValue: 12000 }
  ],
  investmentEntries: [
    { id: uid(), accountId: demoAccountIds.funds, date: shiftDate(-5), profit: 32.6, note: "基金整体上涨" },
    { id: uid(), accountId: demoAccountIds.stocks, date: shiftDate(-3), profit: -86.2, note: "科技股回调" },
    { id: uid(), accountId: demoAccountIds.crypto, date: shiftDate(-1), profit: 118.5, note: "比特币上涨" },
    { id: uid(), accountId: demoAccountIds.funds, date: todayISO(), profit: 16.8, note: "基金日收益" }
  ]
};

const categoryMeta = {
  "食": ["食", "#f6eee0"], "衣": ["衣", "#f5e8e6"], "住": ["住", "#e6ece8"],
  "行": ["行", "#e5edf5"], "网购": ["购", "#f3e8ed"], "通讯": ["讯", "#e5edf3"],
  "日用": ["用", "#f0ece6"], "娱乐": ["乐", "#ece8f4"], "医疗": ["医", "#e5f0eb"],
  "人情": ["礼", "#f5ece2"], "工资": ["收", "#dceae4"], "理财": ["财", "#e3edf0"], "其他": ["其", "#eceeeb"]
};
const accountMeta = {
  "股票": ["line-chart", "#e5edf5"], "基金": ["landmark", "#e6ece8"], "数字货币": ["bitcoin", "#f6eee0"],
  "存款理财": ["piggy-bank", "#ece8f4"], "其他": ["wallet", "#eceeeb"]
};

let state = loadState();
let recordFilter = "all";
let privacyMode = JSON.parse(localStorage.getItem(UI_KEY) || "{}").privacy || false;
let screenshotURL = "";
let screenshotFile = null;
let recognizedRecords = [];
let ocrWorker = null;

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed) return clone(demoData);

    let investmentAccounts = Array.isArray(parsed.investmentAccounts) ? parsed.investmentAccounts.map(normalizeAccount) : [];
    let investmentEntries = Array.isArray(parsed.investmentEntries) ? parsed.investmentEntries.map(normalizeEntry) : [];
    if (!investmentAccounts.length && Array.isArray(parsed.investments) && parsed.investments.length) {
      const accountId = "legacy-investment";
      const latest = [...parsed.investments].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      investmentAccounts = [{ id: accountId, name: "综合理财", type: "其他", currentValue: numberFrom(latest?.total) }];
      investmentEntries = parsed.investments.map((item) => normalizeEntry({ id: item.id, accountId, date: item.date, profit: item.profit, note: item.note }));
    }

    return {
      goal: { ...demoData.goal, ...(parsed.goal || {}) },
      budget: numberFrom(parsed.budget) || demoData.budget,
      records: Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord) : [],
      investmentAccounts,
      investmentEntries
    };
  } catch {
    return clone(demoData);
  }
}

function normalizeRecord(record) {
  const legacyCategories = { "餐饮": "食", "外卖": "食", "服饰": "衣", "房租": "住", "水电燃气": "住", "交通": "行", "购物": "网购", "日用品": "日用" };
  const category = legacyCategories[record.category] || record.category || "其他";
  return { id: record.id || uid(), type: record.type === "income" ? "income" : "expense", amount: Math.abs(numberFrom(record.amount)), category: CATEGORY_OPTIONS.includes(category) ? category : "其他", channel: String(record.channel || "其他"), date: record.date || todayISO(), note: String(record.note || "") };
}

function normalizeAccount(account) {
  return { id: account.id || uid(), name: String(account.name || "未命名资产"), type: String(account.type || "其他"), currentValue: Math.max(0, numberFrom(account.currentValue)) };
}

function normalizeEntry(entry) {
  return { id: entry.id || uid(), accountId: String(entry.accountId || ""), date: entry.date || todayISO(), profit: numberFrom(entry.profit), note: String(entry.note || "") };
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function numberFrom(value) { const result = Number(String(value ?? "").replaceAll(",", "").trim()); return Number.isFinite(result) ? result : 0; }
function money(value, signed = false) {
  const amount = Number(value || 0);
  const sign = signed && amount > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: Math.abs(amount % 1) > 0 ? 2 : 0 }).format(amount)}`;
}
function isCurrentMonth(dateText) { const date = new Date(`${dateText}T00:00:00`); const now = new Date(); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); }
function monthRecords() { return state.records.filter((record) => isCurrentMonth(record.date)); }
function monthEntries() { return state.investmentEntries.filter((entry) => isCurrentMonth(entry.date)); }
function investmentProfitFor(accountId) { return state.investmentEntries.filter((entry) => entry.accountId === accountId).reduce((sum, entry) => sum + entry.profit, 0); }

function totals() {
  const records = monthRecords();
  const income = records.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = records.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const todayProfit = state.investmentEntries.filter((item) => item.date === todayISO()).reduce((sum, item) => sum + item.profit, 0);
  const monthProfit = monthEntries().reduce((sum, item) => sum + item.profit, 0);
  const allProfit = state.investmentEntries.reduce((sum, item) => sum + item.profit, 0);
  const investmentTotal = state.investmentAccounts.reduce((sum, item) => sum + item.currentValue, 0);
  return { income, expense, todayProfit, monthProfit, allProfit, investmentTotal };
}

function daysLeftInMonth() { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1; }

function render() {
  renderDashboard(); renderRecords(); renderInvestments(); prepareForms();
  document.body.classList.toggle("privacy", privacyMode); refreshIcons();
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
  setText("month-available", money(available)); setText("month-income", money(total.income)); setText("month-expense", money(total.expense)); setText("saving-rate", `${Math.round(savingRate)}%`);
  let insight = `距离月底还有 ${daysLeftInMonth()} 天，建议每天控制在 ${money(daily)} 内。`;
  if (available < 0) insight = `本月已超出预算 ${money(Math.abs(available))}，接下来先守住必要支出。`;
  else if (total.expense === 0) insight = `本月预算 ${money(state.budget)}，记下第一笔后会计算每日可花额度。`;
  setText("month-insight", insight);
  setText("goal-name", state.goal.name); setText("goal-percent", `${Math.round(progress * 100)}%`); setText("goal-current", money(state.goal.current)); setText("goal-target", money(state.goal.target));
  setText("goal-left", left > 0 ? `还差 ${money(left)}` : "目标已完成"); setText("goal-eta", left === 0 ? "做得很好" : months > 0 ? `约 ${months} 个月完成` : "设置月计划后可估算");
  document.querySelector("#goal-progress").style.width = `${progress * 100}%`; renderCategories(total.expense);
}

function renderCategories(monthExpense) {
  const container = document.querySelector("#category-list");
  const grouped = monthRecords().filter((item) => item.type === "expense").reduce((map, item) => { map[item.category] = (map[item.category] || 0) + item.amount; return map; }, {});
  const rows = Object.entries(grouped).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  if (!rows.length) { container.innerHTML = '<p class="empty">本月还没有支出记录</p>'; return; }
  container.innerHTML = rows.map((row) => {
    const [icon, color] = categoryMeta[row.category] || categoryMeta["其他"];
    const ratio = monthExpense ? (row.amount / monthExpense) * 100 : 0;
    return `<div class="category-row"><span class="category-icon" style="background:${color}">${icon}</span><div class="category-main"><div><strong>${escapeHTML(row.category)}</strong><span>${ratio < 1 && ratio > 0 ? "<1" : Math.round(ratio)}%</span></div><p class="bar"><span style="width:${Math.max(ratio, 1)}%"></span></p></div><strong class="category-amount money-value">${money(row.amount)}</strong></div>`;
  }).join("");
}

function renderRecords() {
  const container = document.querySelector("#record-list");
  const query = document.querySelector("#record-search")?.value.trim().toLowerCase() || "";
  const records = [...state.records].filter((item) => recordFilter === "all" || item.type === recordFilter).filter((item) => `${item.note} ${item.category} ${item.channel}`.toLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date));
  const total = totals(); setText("ledger-expense", money(total.expense)); setText("ledger-count", `${monthRecords().length} 笔`);
  if (!records.length) { container.innerHTML = '<p class="empty">没有找到符合条件的账目</p>'; return; }
  let lastDate = "";
  container.innerHTML = records.map((record) => {
    const [icon, color] = categoryMeta[record.category] || categoryMeta["其他"];
    const dateHeading = record.date !== lastDate ? `<p class="date-group">${friendlyDate(record.date)}</p>` : ""; lastDate = record.date;
    return `${dateHeading}<article class="record-row"><span class="record-icon" style="background:${color}">${icon}</span><div class="record-main"><strong>${escapeHTML(record.note || record.category)}</strong><p>${escapeHTML(record.category)} · ${escapeHTML(record.channel)}</p></div><strong class="amount money-value ${record.type}">${record.type === "income" ? money(record.amount, true) : `-${money(record.amount)}`}</strong><button class="delete-button" data-delete-record="${record.id}" aria-label="删除账目" title="删除"><i data-lucide="trash-2"></i></button></article>`;
  }).join("");
}

function renderInvestments() {
  const total = totals();
  setText("investment-total", money(total.investmentTotal)); setSignedText("investment-today-profit", total.todayProfit); setSignedText("investment-month-profit", total.monthProfit); setSignedText("investment-all-profit", total.allProfit); setSignedText("trend-total", total.allProfit);
  renderProfitChart(); renderInvestmentAccounts(); renderInvestmentEntries();
}

function renderInvestmentAccounts() {
  const container = document.querySelector("#investment-account-list");
  if (!state.investmentAccounts.length) { container.innerHTML = '<p class="empty">先新建美股、比特币或基金等资产</p>'; return; }
  container.innerHTML = state.investmentAccounts.map((account) => {
    const [icon, color] = accountMeta[account.type] || accountMeta["其他"];
    const profit = investmentProfitFor(account.id);
    return `<article class="account-card"><span class="account-icon" style="background:${color}"><i data-lucide="${icon}"></i></span><div class="account-main"><strong>${escapeHTML(account.name)}</strong><p>${escapeHTML(account.type)} · 累计 <span class="${profit >= 0 ? "positive-text" : "negative-text"}">${money(profit, true)}</span></p></div><div class="account-value"><strong class="money-value">${money(account.currentValue)}</strong><button data-log-account="${account.id}" aria-label="记录${escapeHTML(account.name)}盈亏" title="记录盈亏"><i data-lucide="plus"></i></button></div><button class="delete-button" data-delete-account="${account.id}" aria-label="删除资产" title="删除资产"><i data-lucide="trash-2"></i></button></article>`;
  }).join("");
}

function renderInvestmentEntries() {
  const container = document.querySelector("#investment-list");
  const entries = [...state.investmentEntries].sort((a, b) => b.date.localeCompare(a.date));
  if (!entries.length) { container.innerHTML = '<p class="empty">记录一次今日盈利或亏损吧</p>'; return; }
  let lastDate = "";
  container.innerHTML = entries.map((entry) => {
    const account = state.investmentAccounts.find((item) => item.id === entry.accountId);
    const dateHeading = entry.date !== lastDate ? `<p class="date-group">${friendlyDate(entry.date)}</p>` : ""; lastDate = entry.date;
    return `${dateHeading}<article class="record-row investment-row"><span class="record-icon">财</span><div class="record-main"><strong>${escapeHTML(account?.name || "已删除资产")}</strong><p>${escapeHTML(entry.note || (entry.profit >= 0 ? "当日盈利" : "当日亏损"))}</p></div><strong class="amount profit money-value ${entry.profit >= 0 ? "positive" : "negative"}">${money(entry.profit, true)}</strong><button class="delete-button" data-delete-entry="${entry.id}" aria-label="删除盈亏记录" title="删除"><i data-lucide="trash-2"></i></button></article>`;
  }).join("");
}

function renderProfitChart() {
  const chart = document.querySelector("#profit-chart");
  const cutoff = shiftDate(-29);
  const grouped = state.investmentEntries.filter((entry) => entry.date >= cutoff).reduce((map, entry) => { map[entry.date] = (map[entry.date] || 0) + entry.profit; return map; }, {});
  const dates = Object.keys(grouped).sort();
  if (!dates.length) { chart.innerHTML = '<p class="empty">记录每日盈亏后会生成折线图</p>'; return; }
  let cumulative = 0;
  const values = dates.map((date) => ({ date, value: (cumulative += grouped[date]) }));
  const allValues = [0, ...values.map((item) => item.value)]; const min = Math.min(...allValues); const max = Math.max(...allValues); const range = max - min || 1;
  const width = 320; const height = 126; const padX = 12; const padY = 14;
  const pointFor = (item, index) => ({ x: values.length === 1 ? width / 2 : padX + index * ((width - padX * 2) / (values.length - 1)), y: padY + (max - item.value) / range * (height - padY * 2) });
  const points = values.map(pointFor); const pointString = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const zeroY = padY + (max / range) * (height - padY * 2); const positive = values.at(-1).value >= 0;
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="累计盈亏${money(values.at(-1).value, true)}"><line class="chart-zero" x1="${padX}" y1="${zeroY}" x2="${width - padX}" y2="${zeroY}"/><polyline class="chart-line ${positive ? "positive" : "negative"}" points="${pointString}"/>${points.map((point) => `<circle class="chart-dot ${positive ? "positive" : "negative"}" cx="${point.x}" cy="${point.y}" r="3"/>`).join("")}</svg><div class="chart-labels"><span>${dates[0].slice(5).replace("-", "/")}</span><span>${dates.at(-1).slice(5).replace("-", "/")}</span></div>`;
}

function prepareForms() {
  document.querySelector("#goal-input-name").value = state.goal.name; document.querySelector("#goal-input-target").value = state.goal.target; document.querySelector("#goal-input-current").value = state.goal.current; document.querySelector("#goal-input-plan").value = state.goal.plan; document.querySelector("#budget-input").value = state.budget;
  document.querySelector("#record-form input[name='date']").value ||= todayISO(); document.querySelector("#investment-form input[name='date']").value ||= todayISO();
  const select = document.querySelector("#investment-account-select"); const selected = select.value;
  select.innerHTML = state.investmentAccounts.map((account) => `<option value="${account.id}">${escapeHTML(account.name)}</option>`).join("");
  if (state.investmentAccounts.some((account) => account.id === selected)) select.value = selected;
}

function friendlyDate(dateText) { if (dateText === todayISO()) return "今天"; const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); if (dateText === localISO(yesterday)) return "昨天"; return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${dateText}T00:00:00`)); }
function escapeHTML(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function setText(id, text) { document.querySelector(`#${id}`).textContent = text; }
function setSignedText(id, value) { const element = document.querySelector(`#${id}`); element.textContent = money(value, true); element.classList.toggle("negative-text", value < 0); element.classList.toggle("positive-text", value > 0); }
function refreshIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } }); }

function navigate(target) { document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${target}`)); document.querySelectorAll(".tabbar [data-nav]").forEach((tab) => tab.classList.toggle("active", tab.dataset.nav === target)); window.scrollTo({ top: 0, behavior: "smooth" }); refreshIcons(); }
function openDialog(id) { const dialog = document.querySelector(`#${id}`); if (!dialog.open) dialog.showModal(); refreshIcons(); }
function openRecordDialog(type = "expense") { const form = document.querySelector("#record-form"); form.querySelector(`input[name="type"][value="${type}"]`).checked = true; setText("record-dialog-title", type === "income" ? "记一笔收入" : "记一笔支出"); openDialog("record-dialog"); setTimeout(() => form.querySelector("input[name='amount']").focus(), 80); }
function openInvestmentDialog(accountId = "") {
  if (!state.investmentAccounts.length) { openDialog("account-dialog"); toast("先新建一个理财资产"); return; }
  prepareForms(); const select = document.querySelector("#investment-account-select"); if (accountId) select.value = accountId;
  const account = state.investmentAccounts.find((item) => item.id === select.value); document.querySelector("#investment-form input[name='currentValue']").value = account?.currentValue || ""; openDialog("investment-dialog");
}
function toast(message) { const element = document.querySelector("#toast"); element.textContent = message; element.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove("show"), 2000); }

function classifyExpense(text) {
  const value = String(text || "").toLowerCase().replace(/\s+/g, "");
  const rules = [
    ["通讯", /话费|流量|宽带|中国移动|中国联通|中国电信|手机充值|通信/],
    ["行", /地铁|公交|滴滴|出行|车费|打车|铁路|火车|机票|航空|高铁|共享单车|加油|停车|ems|快递/],
    ["住", /房租|物业|水费|电费|燃气|住房|家电|冰箱|空调|家具|维修/],
    ["衣", /服饰|衣服|鞋|袜|帽|优衣库|zara|耐克|阿迪|万芙/],
    ["食", /餐|饭|汉堡|外卖|[饿钱]了么|美团|零食|水果|果蔬|奶茶|咖啡|麦当劳|肯德基|好想来|食品|超市|便利店/],
    ["网购", /淘宝|天猫|京东|拼多多|闲鱼|闪购|网购|购物|商户单号|电商|揽收/],
    ["医疗", /医院|药房|诊所|医疗|体检|挂号/],
    ["娱乐", /电影|游戏|会员|ktv|演出|视频|音乐/],
    ["人情", /红包|礼物|转账.*(朋友|同学|家人)|婚礼/],
    ["日用", /日用|生活用品|洗护|纸巾|清洁|百货/]
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] || "其他";
}

function parseDateText(text, context) {
  const full = text.match(/(20\d{2})\s*[-年/.]\s*(\d{1,2})\s*[-月/.]\s*(\d{1,2})/);
  if (full) return `${full[1]}-${String(full[2]).padStart(2, "0")}-${String(full[3]).padStart(2, "0")}`;
  const short = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (short) return `${context.year}-${String(short[1]).padStart(2, "0")}-${String(short[2]).padStart(2, "0")}`;
  return "";
}

function cleanOCRLabel(text) {
  return text.replace(/[¥￥]/g, "").replace(/^[\s|丨:：·•]+|[\s|丨:：·•]+$/g, "").replace(/^(\d{1,2}:\d{2})(:\d{2})?\s*[|丨·]?\s*/, "").replace(/^(?:[Oo0]|\([0Oo]\)|必用|全|\[5|OO)\s+(?=[\u4e00-\u9fff])/, "").replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

function parseOCRText(rawText) {
  const normalized = String(rawText || "").replace(/[−–—]/g, "-").replace(/，/g, ",");
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const now = new Date(); const context = { year: now.getFullYear(), month: now.getMonth() + 1, date: todayISO() };
  const yearMonth = normalized.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/); if (yearMonth) { context.year = Number(yearMonth[1]); context.month = Number(yearMonth[2]); }
  const compactText = normalized.replace(/\s+/g, "");
  const channel = /余额变动|支付宝|余额\d/.test(compactText) ? "支付宝" : /记账本|微信/.test(compactText) ? "微信" : "支付宝";
  const records = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]; const lineDate = parseDateText(line, context); if (lineDate) context.date = lineDate;
    if (/总支出|总入账|总收入|当前余额|余额\s*\d|星期|账单统计/.test(line)) continue;
    if ((line.match(/\d{1,7}[.,]\d{1,2}/g) || []).length > 1) continue;
    const match = line.match(/([+\-])?\s*[¥￥]?\s*(\d{1,7}(?:[.,]\d{1,2}))\s*(?:元)?\s*$/);
    if (!match) continue;
    const rawAmount = Number(match[2].replace(",", ".")); if (!Number.isFinite(rawAmount) || rawAmount === 0) continue;
    let label = cleanOCRLabel(line.slice(0, match.index));
    if (/^(出|入|支出|收入)?\s*$/.test(label)) continue;
    const previous = lines[index - 1] || ""; const next = lines[index + 1] || "";
    if (label.length < 2 && previous && !/余额|\d+[.,]\d{2}|星期|月/.test(previous)) label = cleanOCRLabel(previous);
    const nextDate = parseDateText(next, context); const recordDate = nextDate || context.date;
    const generic = /^(服饰|购物|服务|餐饮|交通|日用|其他)$/.test(label);
    let detail = "";
    if (generic && next && !nextDate && !/\d+[.,]\d{2}\s*$|余额/.test(next)) detail = cleanOCRLabel(next);
    const note = detail || label || "截图识别账目";
    const type = match[1] === "+" || /收入|入账|转入/.test(label) ? "income" : "expense";
    records.push({ id: uid(), selected: true, type, amount: Math.abs(rawAmount), category: type === "income" ? "其他" : classifyExpense(`${label} ${detail}`), channel, date: recordDate, note });
  }

  return records.filter((record, index, array) => array.findIndex((item) => item.amount === record.amount && item.date === record.date && item.note === record.note) === index).slice(0, 30);
}

function loadOCRLibrary() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = OCR_SCRIPT; script.async = true; script.onload = resolve; script.onerror = () => reject(new Error("识别组件加载失败，请检查网络后重试")); document.head.appendChild(script);
  });
}

async function prepareOCRImage(file) {
  let image;
  if (typeof createImageBitmap === "function") image = await createImageBitmap(file);
  else image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = URL.createObjectURL(file); });
  const sourceWidth = image.width || image.naturalWidth; const sourceHeight = image.height || image.naturalHeight; const maxWidth = 1600; const scale = Math.min(1, maxWidth / sourceWidth);
  const canvas = document.createElement("canvas"); canvas.width = Math.round(sourceWidth * scale); canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close?.();
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height); const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) { const gray = pixels[i] * .3 + pixels[i + 1] * .59 + pixels[i + 2] * .11; const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.25 + 128)); pixels[i] = contrast; pixels[i + 1] = contrast; pixels[i + 2] = contrast; }
  context.putImageData(imageData, 0, 0); return canvas;
}

function updateOCRProgress(message) {
  const progress = Math.round((message.progress || 0) * 100); const stages = { loading_tesseract_core: "正在加载识别引擎", initializing_tesseract: "正在初始化", loading_language_traineddata: "正在加载中文模型", initializing_api: "正在准备识别", recognizing_text: "正在读取账单" };
  setText("ocr-status", stages[message.status] || "正在分析截图"); setText("ocr-progress-text", `${progress}%`); document.querySelector("#ocr-progress-bar").style.width = `${progress}%`;
}

async function recognizeScreenshot() {
  if (!screenshotFile) return;
  setOCRView("working"); updateOCRProgress({ progress: 0, status: "loading_tesseract_core" });
  try {
    await loadOCRLibrary(); const canvas = await prepareOCRImage(screenshotFile);
    ocrWorker = await window.Tesseract.createWorker("chi_sim+eng", 1, { logger: updateOCRProgress });
    const result = await ocrWorker.recognize(canvas); await ocrWorker.terminate(); ocrWorker = null;
    recognizedRecords = parseOCRText(result.data.text);
    if (!recognizedRecords.length) throw new Error("这张图没有识别到完整账目，请换一张更清晰的账单截图");
    document.querySelector("#ocr-channel").value = recognizedRecords[0].channel; renderOCRReview(); setOCRView("review");
  } catch (error) {
    await ocrWorker?.terminate().catch(() => {}); ocrWorker = null; setText("ocr-error-text", error.message || "截图识别失败，请重新尝试"); setOCRView("error");
  }
}

function setOCRView(view) {
  document.querySelector("#screenshot-zone").hidden = view !== "upload"; document.querySelector("#ocr-working").hidden = view !== "working"; document.querySelector("#screenshot-preview").hidden = view === "upload"; document.querySelector("#ocr-review").hidden = view !== "review"; document.querySelector("#ocr-error").hidden = view !== "error"; refreshIcons();
}

function renderOCRReview() {
  setText("ocr-summary-text", `识别到 ${recognizedRecords.length} 笔`);
  const options = CATEGORY_OPTIONS.filter((item) => item !== "工资" && item !== "理财").map((item) => `<option>${item}</option>`).join("");
  document.querySelector("#ocr-results").innerHTML = recognizedRecords.map((record, index) => `<article class="ocr-row" data-ocr-index="${index}"><label class="ocr-check"><input type="checkbox" ${record.selected ? "checked" : ""} aria-label="选择第${index + 1}笔" /></label><div class="ocr-fields"><input class="ocr-note" value="${escapeHTML(record.note)}" aria-label="商户或备注" /><div><select class="ocr-category" aria-label="分类">${options}</select><input class="ocr-date" type="date" value="${record.date}" aria-label="日期" /></div></div><div class="ocr-amount"><span>${record.type === "income" ? "+" : "-"}</span><input inputmode="decimal" value="${record.amount.toFixed(2)}" aria-label="金额" /></div></article>`).join("");
  document.querySelectorAll(".ocr-row").forEach((row) => { const index = Number(row.dataset.ocrIndex); row.querySelector(".ocr-category").value = recognizedRecords[index].category; });
}

function resetOCR() {
  screenshotFile = null; recognizedRecords = []; document.querySelector("#screenshot-input").value = ""; if (screenshotURL) URL.revokeObjectURL(screenshotURL); screenshotURL = ""; document.querySelector("#screenshot-preview").src = ""; setOCRView("upload");
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]"); if (nav) navigate(nav.dataset.nav);
  const opener = event.target.closest("[data-open-dialog]"); if (opener) openDialog(opener.dataset.openDialog);
  const recordButton = event.target.closest("[data-record-type]"); if (recordButton) openRecordDialog(recordButton.dataset.recordType);
  if (event.target.closest("[data-open-investment]")) openInvestmentDialog();
  const accountLog = event.target.closest("[data-log-account]"); if (accountLog) openInvestmentDialog(accountLog.dataset.logAccount);
  const close = event.target.closest(".dialog-close"); if (close) close.closest("dialog").close();
  const deleteRecord = event.target.closest("[data-delete-record]"); if (deleteRecord && confirm("删除这笔账目？")) { state.records = state.records.filter((item) => item.id !== deleteRecord.dataset.deleteRecord); saveState(); render(); toast("账目已删除"); }
  const deleteEntry = event.target.closest("[data-delete-entry]"); if (deleteEntry && confirm("删除这条盈亏记录？")) { state.investmentEntries = state.investmentEntries.filter((item) => item.id !== deleteEntry.dataset.deleteEntry); saveState(); render(); toast("盈亏记录已删除"); }
  const deleteAccount = event.target.closest("[data-delete-account]"); if (deleteAccount && confirm("删除这个资产及其全部盈亏记录？")) { state.investmentAccounts = state.investmentAccounts.filter((item) => item.id !== deleteAccount.dataset.deleteAccount); state.investmentEntries = state.investmentEntries.filter((item) => item.accountId !== deleteAccount.dataset.deleteAccount); saveState(); render(); toast("资产已删除"); }
});

document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
document.querySelector("#goal-form").addEventListener("submit", (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); state.goal = { name: String(form.get("name") || "攒钱目标"), target: numberFrom(form.get("target")), current: numberFrom(form.get("current")), plan: numberFrom(form.get("plan")) }; state.budget = numberFrom(form.get("budget")); saveState(); event.currentTarget.closest("dialog").close(); render(); toast("计划已更新"); });
document.querySelector("#record-form").addEventListener("submit", (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const amount = numberFrom(form.get("amount")); if (amount <= 0) return toast("请输入正确金额"); state.records.push(normalizeRecord({ id: uid(), type: form.get("type"), amount, category: form.get("category"), channel: form.get("channel"), date: form.get("date"), note: form.get("note") })); saveState(); event.currentTarget.reset(); event.currentTarget.closest("dialog").close(); render(); toast("已记入账本"); });
document.querySelector("#account-form").addEventListener("submit", (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const account = normalizeAccount({ id: uid(), name: form.get("name"), type: form.get("type"), currentValue: form.get("currentValue") }); state.investmentAccounts.push(account); saveState(); event.currentTarget.reset(); event.currentTarget.closest("dialog").close(); render(); toast("资产已创建"); });
document.querySelector("#investment-form").addEventListener("submit", (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const amount = Math.abs(numberFrom(form.get("amount"))); if (!amount) return toast("请输入今日涨跌金额"); const profit = form.get("direction") === "loss" ? -amount : amount; const account = state.investmentAccounts.find((item) => item.id === form.get("accountId")); if (!account) return toast("请选择理财资产"); const currentValue = String(form.get("currentValue") || "").trim(); if (currentValue) account.currentValue = Math.max(0, numberFrom(currentValue)); state.investmentEntries.push(normalizeEntry({ id: uid(), accountId: account.id, date: form.get("date"), profit, note: form.get("note") })); saveState(); event.currentTarget.reset(); event.currentTarget.closest("dialog").close(); render(); toast(profit >= 0 ? "今日盈利已记录" : "今日亏损已记录"); });

document.querySelector("#investment-account-select").addEventListener("change", (event) => { const account = state.investmentAccounts.find((item) => item.id === event.target.value); document.querySelector("#investment-form input[name='currentValue']").value = account?.currentValue || ""; });
document.querySelector("#record-search").addEventListener("input", () => { renderRecords(); refreshIcons(); });
document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { recordFilter = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button)); renderRecords(); refreshIcons(); }));
document.querySelector("#toggle-privacy").addEventListener("click", () => { privacyMode = !privacyMode; localStorage.setItem(UI_KEY, JSON.stringify({ privacy: privacyMode })); document.body.classList.toggle("privacy", privacyMode); toast(privacyMode ? "金额已隐藏" : "金额已显示"); });

document.querySelector("#screenshot-input").addEventListener("change", (event) => { const file = event.target.files?.[0]; if (!file) return; screenshotFile = file; if (screenshotURL) URL.revokeObjectURL(screenshotURL); screenshotURL = URL.createObjectURL(file); const preview = document.querySelector("#screenshot-preview"); preview.src = screenshotURL; preview.hidden = false; recognizeScreenshot(); });
document.querySelector("#ocr-reset").addEventListener("click", resetOCR); document.querySelector("#ocr-retry").addEventListener("click", recognizeScreenshot);
document.querySelector("#ocr-import").addEventListener("click", () => {
  const channel = document.querySelector("#ocr-channel").value; const imported = [];
  document.querySelectorAll(".ocr-row").forEach((row) => { if (!row.querySelector(".ocr-check input").checked) return; const index = Number(row.dataset.ocrIndex); const source = recognizedRecords[index]; const record = normalizeRecord({ id: uid(), type: source.type, amount: row.querySelector(".ocr-amount input").value, category: row.querySelector(".ocr-category").value, channel, date: row.querySelector(".ocr-date").value, note: row.querySelector(".ocr-note").value }); const duplicate = state.records.some((item) => item.date === record.date && item.amount === record.amount && item.note === record.note && item.channel === record.channel); if (!duplicate) imported.push(record); });
  if (!imported.length) return toast("没有可导入的新账目"); state.records.push(...imported); saveState(); document.querySelector("#screenshot-dialog").close(); resetOCR(); render(); toast(`已导入 ${imported.length} 笔账目`);
});

document.querySelector("#export-data").addEventListener("click", () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `xiaoman-backup-${todayISO()}.json`; link.click(); URL.revokeObjectURL(url); toast("备份已导出"); });
document.querySelector("#import-data").addEventListener("change", async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const parsed = JSON.parse(await file.text()); localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); state = loadState(); render(); toast("备份已导入"); } catch { toast("备份文件无法识别"); } });
document.querySelector("#reset-demo").addEventListener("click", () => { if (!confirm("恢复示例数据会覆盖当前账本，确定继续？")) return; state = clone(demoData); saveState(); render(); toast("已恢复示例数据"); });

window.__xiaomanTest = { parseOCRText, classifyExpense };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=6").catch(() => {});
render();
