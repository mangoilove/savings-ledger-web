const STORAGE_KEY = "savings-ledger-web-v1";

const todayISO = () => new Date().toISOString().slice(0, 10);

const demoData = {
  goal: {
    name: "应急金",
    target: 30000,
    current: 8000,
    plan: 3000
  },
  records: [
    { id: crypto.randomUUID(), type: "income", amount: 9000, category: "工资", channel: "银行卡", date: todayISO(), note: "本月工资" },
    { id: crypto.randomUUID(), type: "expense", amount: 2400, category: "房租", channel: "支付宝", date: todayISO(), note: "房租" },
    { id: crypto.randomUUID(), type: "expense", amount: 36.8, category: "外卖", channel: "微信", date: todayISO(), note: "晚饭" }
  ],
  investments: [
    { id: crypto.randomUUID(), date: todayISO(), total: 12000, profit: 6.82, note: "理财总览" }
  ]
};

let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(demoData);

  try {
    const parsed = JSON.parse(raw);
    return {
      goal: { ...demoData.goal, ...parsed.goal },
      records: Array.isArray(parsed.records) ? parsed.records : [],
      investments: Array.isArray(parsed.investments) ? parsed.investments : []
    };
  } catch {
    return structuredClone(demoData);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function money(value, signed = false) {
  const amount = Number(value || 0);
  const prefix = signed && amount > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: Math.abs(amount % 1) > 0 ? 2 : 0
  }).format(amount)}`;
}

function numberFrom(value) {
  const result = Number(String(value).replaceAll(",", "").trim());
  return Number.isFinite(result) ? result : 0;
}

function isCurrentMonth(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function monthRecords() {
  return state.records.filter((record) => isCurrentMonth(record.date));
}

function monthInvestments() {
  return state.investments.filter((record) => isCurrentMonth(record.date));
}

function totals() {
  const records = monthRecords();
  const income = records.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = records.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const profit = monthInvestments().reduce((sum, item) => sum + item.profit, 0);
  const latestInvestment = [...state.investments].sort((a, b) => b.date.localeCompare(a.date))[0];

  return {
    income,
    expense,
    balance: income - expense,
    profit,
    latestInvestmentTotal: latestInvestment?.total || 0
  };
}

function render() {
  renderDashboard();
  renderRecords();
  renderInvestments();
  prepareForms();
}

function renderDashboard() {
  const total = totals();
  const progress = state.goal.target > 0 ? Math.min(state.goal.current / state.goal.target, 1) : 0;
  const projected = state.goal.current + total.balance + total.profit;

  setText("goal-name", state.goal.name);
  setText("goal-percent", `${Math.round(progress * 100)}%`);
  setText("goal-current", money(state.goal.current));
  setText("goal-left", money(Math.max(state.goal.target - state.goal.current, 0)));
  setText("goal-plan", money(state.goal.plan));
  setText("goal-projection", `按本月收支和理财收益估算，月底可能到 ${money(projected)}。`);
  setStyle("goal-progress", "width", `${progress * 100}%`);

  setText("month-income", money(total.income));
  setText("month-expense", money(total.expense));
  setText("month-balance", money(total.balance));
  setText("month-profit", money(total.profit, true));
  setText("investment-total", money(total.latestInvestmentTotal));
  setText("investment-profit-line", `本月收益 ${money(total.profit, true)}`);

  renderCategories();
}

function renderCategories() {
  const container = document.querySelector("#category-list");
  const grouped = monthRecords()
    .filter((item) => item.type === "expense")
    .reduce((map, item) => {
      map[item.category] = (map[item.category] || 0) + item.amount;
      return map;
    }, {});

  const rows = Object.entries(grouped)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  if (!rows.length) {
    container.innerHTML = `<p class="empty">还没有本月支出</p>`;
    return;
  }

  const max = Math.max(...rows.map((row) => row.amount));
  container.innerHTML = rows
    .map((row) => `
      <div class="category-row">
        <div class="category-main">
          <strong>${row.category}</strong>
          <p class="bar"><span style="width:${(row.amount / max) * 100}%"></span></p>
        </div>
        <strong>${money(row.amount)}</strong>
      </div>
    `)
    .join("");
}

function renderRecords() {
  const container = document.querySelector("#record-list");
  const records = [...state.records].sort((a, b) => b.date.localeCompare(a.date));

  if (!records.length) {
    container.innerHTML = `<p class="empty">还没有账单，先记一笔。</p>`;
    return;
  }

  container.innerHTML = records
    .map((record) => `
      <article class="record-row">
        <div class="record-main">
          <strong>${record.note || record.category}</strong>
          <p>${record.category} · ${record.channel} · ${record.date}</p>
        </div>
        <strong class="amount ${record.type}">${record.type === "income" ? money(record.amount, true) : `-${money(record.amount)}`}</strong>
      </article>
    `)
    .join("");
}

function renderInvestments() {
  const container = document.querySelector("#investment-list");
  const records = [...state.investments].sort((a, b) => b.date.localeCompare(a.date));

  if (!records.length) {
    container.innerHTML = `<p class="empty">还没有理财记录，今天可以先更新一次。</p>`;
    return;
  }

  container.innerHTML = records
    .map((record) => `
      <article class="record-row">
        <div class="record-main">
          <strong>${record.date}</strong>
          <p>${record.note || "理财记录"}</p>
        </div>
        <div class="amount profit">
          <strong>${money(record.total)}</strong>
          <p>${money(record.profit, true)}</p>
        </div>
      </article>
    `)
    .join("");
}

function prepareForms() {
  const goal = state.goal;
  document.querySelector("#goal-input-name").value = goal.name;
  document.querySelector("#goal-input-target").value = goal.target;
  document.querySelector("#goal-input-current").value = goal.current;
  document.querySelector("#goal-input-plan").value = goal.plan;

  document.querySelector("#record-form input[name='date']").value = todayISO();
  document.querySelector("#investment-form input[name='date']").value = todayISO();
}

function setText(id, text) {
  document.querySelector(`#${id}`).textContent = text;
}

function setStyle(id, property, value) {
  document.querySelector(`#${id}`).style[property] = value;
}

document.querySelectorAll("[data-nav]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.nav;
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    document.querySelector(`#view-${target}`).classList.add("active");
    document.querySelectorAll(".tabbar button").forEach((tab) => tab.classList.toggle("active", tab.dataset.nav === target));
  });
});

document.querySelectorAll("[data-open-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.openDialog}`).showModal();
  });
});

document.querySelector("#goal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.goal = {
    name: String(form.get("name") || "攒钱目标"),
    target: numberFrom(form.get("target")),
    current: numberFrom(form.get("current")),
    plan: numberFrom(form.get("plan"))
  };
  saveState();
  document.querySelector("#goal-dialog").close();
  render();
});

document.querySelector("#record-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.records.push({
    id: crypto.randomUUID(),
    type: String(form.get("type")),
    amount: numberFrom(form.get("amount")),
    category: String(form.get("category")),
    channel: String(form.get("channel")),
    date: String(form.get("date")),
    note: String(form.get("note") || "")
  });
  saveState();
  event.currentTarget.reset();
  document.querySelector("#record-dialog").close();
  render();
});

document.querySelector("#investment-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.investments.push({
    id: crypto.randomUUID(),
    date: String(form.get("date")),
    total: numberFrom(form.get("total")),
    profit: numberFrom(form.get("profit")),
    note: String(form.get("note") || "")
  });
  saveState();
  event.currentTarget.reset();
  document.querySelector("#investment-dialog").close();
  render();
});

document.querySelector("#export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `savings-ledger-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#import-data").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const text = await file.text();
  state = JSON.parse(text);
  saveState();
  render();
});

document.querySelector("#reset-demo").addEventListener("click", () => {
  state = structuredClone(demoData);
  saveState();
  render();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
