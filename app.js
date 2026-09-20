/*
 * The entire persistence layer is localStorage.  The object in localStorage is
 * a tiny in-browser database: { version, categories[], items[] }.
 * Keeping it in one place makes moving to SQLite/React Native later straightforward.
 */
const STORAGE_KEY = "item-ledger-v1";
const ICONS = ["📦", "👕", "💻", "🎮", "📚", "👜", "🍳", "🪴", "🎧", "⌚", "🧴", "✨"];
const DEFAULT_CATEGORIES = [
  { id: "cat-daily", name: "日常", icon: "📦" },
  { id: "cat-clothing", name: "服飾", icon: "👕" },
  { id: "cat-digital", name: "數碼", icon: "💻" },
];

let state = loadState();
let activeCategory = "all";

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.items) && Array.isArray(parsed.categories)) return parsed;
  } catch (_) { /* Invalid user data is replaced with a clean notebook. */ }
  return { version: 1, categories: DEFAULT_CATEGORIES, items: [] };
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* Using UTC calendar dates prevents daylight-saving transitions from changing the answer. */
function daysOwned(purchasedOn, now = new Date()) {
  const [year, month, day] = purchasedOn.split("-").map(Number);
  const purchaseDay = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((today - purchaseDay) / 86_400_000) + 1);
}

function money(amount, currency) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2 }).format(amount);
}

function categoryFor(id) { return state.categories.find((category) => category.id === id) || { name: "未分類", icon: "📦" }; }
function formatDate(date) { return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00`)); }
function escapeHtml(value) { const element = document.createElement("span"); element.textContent = value; return element.innerHTML; }

function render() {
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("zh-TW", { dateStyle: "full" }).format(new Date());
  const totals = state.items.reduce((acc, item) => ({ ...acc, [item.currency]: acc[item.currency] + item.price }), { CNY: 0, USD: 0 });
  document.querySelector("#item-count").textContent = state.items.length;
  document.querySelector("#cny-total").textContent = money(totals.CNY, "CNY");
  document.querySelector("#usd-total").textContent = money(totals.USD, "USD");

  const filters = [{ id: "all", name: "全部", icon: "" }, ...state.categories];
  document.querySelector("#category-filters").innerHTML = filters.map((category) => `<button class="filter-button ${category.id === activeCategory ? "active" : ""}" data-filter="${category.id}">${category.icon ? `${category.icon} ` : ""}${escapeHtml(category.name)}</button>`).join("");

  const items = state.items
    .filter((item) => activeCategory === "all" || item.categoryId === activeCategory)
    .sort((a, b) => b.purchasedOn.localeCompare(a.purchasedOn));
  const list = document.querySelector("#item-list");
  list.innerHTML = "";
  for (const item of items) {
    const category = categoryFor(item.categoryId);
    const days = daysOwned(item.purchasedOn);
    const node = document.querySelector("#item-template").content.firstElementChild.cloneNode(true);
    node.querySelector(".item-icon").textContent = category.icon;
    node.querySelector("h2").textContent = item.name;
    node.querySelector(".item-meta").textContent = `${category.name} · 持有 ${days} 天`;
    node.querySelector(".item-price strong").textContent = money(item.price, item.currency);
    node.querySelector(".item-price span").textContent = `日均 ${money(item.price / days, item.currency)}`;
    node.querySelector(".more-button").dataset.editItem = item.id;
    list.append(node);
  }
  document.querySelector("#empty-add-item").hidden = state.items.length !== 0;
}

function fillCategoryOptions(selectedId) {
  const select = document.querySelector("#item-category");
  select.innerHTML = state.categories.map((category) => `<option value="${category.id}">${category.icon} ${escapeHtml(category.name)}</option>`).join("");
  select.value = selectedId || state.categories[0]?.id || "";
}

function openItemDialog(item) {
  if (!state.categories.length) { alert("請先建立至少一個分類。"); openCategoryDialog(); return; }
  document.querySelector("#item-dialog-title").textContent = item ? "編輯物品" : "新增物品";
  document.querySelector("#item-id").value = item?.id || "";
  document.querySelector("#item-name").value = item?.name || "";
  document.querySelector("#item-purchased-on").value = item?.purchasedOn || new Date().toISOString().slice(0, 10);
  document.querySelector("#item-price").value = item?.price ?? "";
  document.querySelector("#item-currency").value = item?.currency || "CNY";
  document.querySelector("#item-note").value = item?.note|| "";
  fillCategoryOptions(item?.categoryId);
  document.querySelector("#item-dialog").showModal();
  document.querySelector("#item-name").focus();
}

function closeDialog(id) { document.querySelector(`#${id}`).close(); }

function openCategoryDialog() {
  const iconSelect = document.querySelector("#category-icon");
  iconSelect.innerHTML = ICONS.map((icon) => `<option value="${icon}">${icon}</option>`).join("");
  const list = document.querySelector("#category-list");
  list.innerHTML = state.categories.map((category) => `<div class="category-row"><span>${category.icon}</span><strong>${escapeHtml(category.name)}</strong><button class="delete-category" data-delete-category="${category.id}">刪除</button></div>`).join("");
  const dialog = document.querySelector("#category-dialog");
  if (!dialog.open) dialog.showModal();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: `item-ledger-backup-${new Date().toISOString().slice(0, 10)}.json` });
  link.click(); URL.revokeObjectURL(url);
}

document.querySelector("#open-add-item").addEventListener("click", () => openItemDialog());
document.querySelector("#empty-add-item").addEventListener("click", () => openItemDialog());
document.querySelector("#open-categories").addEventListener("click", openCategoryDialog);
document.querySelector("#export-data").addEventListener("click", exportBackup);
document.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close]");
  if (close) closeDialog(close.dataset.close);
  const filter = event.target.closest("[data-filter]");
  if (filter) { activeCategory = filter.dataset.filter; render(); }
  const edit = event.target.closest("[data-edit-item]");
  if (edit) openItemDialog(state.items.find((item) => item.id === edit.dataset.editItem));
  const deleteCategory = event.target.closest("[data-delete-category]");
  if (deleteCategory) {
    const category = categoryFor(deleteCategory.dataset.deleteCategory);
    const usedBy = state.items.some((item) => item.categoryId === deleteCategory.dataset.deleteCategory);
    if (usedBy) return alert(`「${category.name}」仍有物品，請先移動或刪除那些物品。`);
    if (confirm(`刪除分類「${category.name}」？`)) { state.categories = state.categories.filter((item) => item.id !== deleteCategory.dataset.deleteCategory); saveState(); openCategoryDialog(); render(); }
  }
});

document.querySelector("#item-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const id = document.querySelector("#item-id").value;
  const item = { id: id || newId("item"), name: document.querySelector("#item-name").value.trim(), purchasedOn: document.querySelector("#item-purchased-on").value, price: Number(document.querySelector("#item-price").value), 
    currency: document.querySelector("#item-currency").value, categoryId: document.querySelector("#item-category").value, note: document.querySelector("#item-note").value.trim(),
  };
  const existingIndex = state.items.findIndex((saved) => saved.id === id);
  if (existingIndex >= 0) state.items[existingIndex] = item; else state.items.push(item);
  saveState(); closeDialog("item-dialog"); render();
});

document.querySelector("#category-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#category-name").value.trim();
  if (!name) return;
  if (state.categories.some((category) => category.name === name)) return alert("已有同名分類。");
  state.categories.push({ id: newId("cat"), name, icon: document.querySelector("#category-icon").value });
  saveState(); document.querySelector("#category-form").reset(); openCategoryDialog(); render();
});

document.querySelector("#import-data").addEventListener("change", async (event) => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.items) || !Array.isArray(imported.categories)) throw new Error();
    if (!confirm("匯入會覆蓋本機現有資料。繼續嗎？")) return;
    state = imported; activeCategory = "all"; saveState(); render(); alert("備份已匯入。");
  } catch (_) { alert("這不是有效的帳本備份檔。") } finally { event.target.value = ""; }
});

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
render();
