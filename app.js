/* Browser-local database. No item data is sent to GitHub or a server. */
const STORAGE_KEY = "item-ledger-v1";
const DEFAULT_SETTINGS = { primaryColor: "#416350" };
const ICONS = ["📦", "👕", "💻", "🎮", "🐈‍⬛", "👜", "🧸", "🍳", "📚", "🪴", "🎧", "⌚", "🧴", "✨"];
const DEFAULT_CATEGORIES = [
  { id: "cat-daily", name: "日常", icon: "📦" }, { id: "cat-clothing", name: "服飾", icon: "👕" }, { id: "cat-digital", name: "數碼", icon: "💻" },
];

/* Change these numbers later if your own definition of "low/high daily cost" differs. */
const DAILY_COST_BANDS = {
  CNY: [{ max: 1, tone: "low" }, { max: 5, tone: "medium" }, { max: Infinity, tone: "high" }],
  USD: [{ max: 0.2, tone: "low" }, { max: 1, tone: "medium" }, { max: Infinity, tone: "high" }],
};

let state = loadState();
let activeCategory = "all";
let pendingPhoto = "";

function newId(prefix) { return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`; }
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed && Array.isArray(parsed.items) && Array.isArray(parsed.categories)) return { ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } };
  } catch (_) { /* A corrupt local record is replaced with a clean notebook. */ }
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, categories: DEFAULT_CATEGORIES, items: [] };
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (_) { alert("裝置的本機儲存空間不足，無法儲存。請匯出備份並減少照片數量。"); throw _; }
}

function daysOwned(purchasedOn, now = new Date()) {
  const [year, month, day] = purchasedOn.split("-").map(Number);
  return Math.max(1, Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(year, month - 1, day)) / 86_400_000) + 1);
}
function ownedCalendarDuration(purchasedOn, now = new Date()) {
  const [year, month, day] = purchasedOn.split("-").map(Number);
  let months = (now.getFullYear() - year) * 12 + now.getMonth() - (month - 1);
  if (now.getDate() < day) months -= 1;
  months = Math.max(0, months);
  return `${Math.floor(months / 12)}年${months % 12}個月`;
}
function money(amount, currency) { return new Intl.NumberFormat("zh-CN", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2 }).format(amount); }
function categoryFor(id) { return state.categories.find((category) => category.id === id) || { name: "未分類", icon: "📦" }; }
function escapeHtml(value) { const element = document.createElement("span"); element.textContent = value; return element.innerHTML; }
function dailyCostTone(cost, currency) { return DAILY_COST_BANDS[currency].find((band) => cost <= band.max).tone; }

function hexRgb(hex) { const value = hex.slice(1); return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]; }
function mixWithBlack(hex, fraction) { const [r, g, b] = hexRgb(hex).map((part) => Math.round(part * (1 - fraction))); return `rgb(${r} ${g} ${b})`; }
function rgba(hex, alpha) { const [r, g, b] = hexRgb(hex); return `rgb(${r} ${g} ${b} / ${alpha})`; }
function applyTheme() {
  const color = state.settings.primaryColor;
  const root = document.documentElement;
  root.style.setProperty("--primary", color);
  root.style.setProperty("--primary-dark", mixWithBlack(color, 0.28));
  root.style.setProperty("--primary-soft", rgba(color, 0.15));
  root.style.setProperty("--primary-faint", rgba(color, 0.09));
  root.style.setProperty("--primary-shadow", rgba(color, 0.24));
  const [r, g, b] = hexRgb(color); const luminance = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
  root.style.setProperty("--on-primary", luminance > 0.62 ? "#183125" : "#ffffff");
  document.querySelector('meta[name="theme-color"]').content = color;
}

function render() {
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("zh-TW", { dateStyle: "full" }).format(new Date());
  const items = state.items.filter((item) => activeCategory === "all" || item.categoryId === activeCategory).sort((a, b) => b.purchasedOn.localeCompare(a.purchasedOn));
  const totals = state.items.reduce((acc, item) => ({ ...acc, [item.currency]: acc[item.currency] + item.price }), { CNY: 0, USD: 0 });
  document.querySelector("#item-count").textContent = items.length;
  document.querySelector("#cny-total").textContent = money(totals.CNY, "CNY");
  document.querySelector("#usd-total").textContent = money(totals.USD, "USD");
  const filters = [{ id: "all", name: "全部", icon: "" }, ...state.categories];
  document.querySelector("#category-filters").innerHTML = filters.map((category) => `<button class="filter-button ${category.id === activeCategory ? "active" : ""}" data-filter="${category.id}">${category.icon ? `${category.icon} ` : ""}${escapeHtml(category.name)}</button>`).join("");
  const list = document.querySelector("#item-list"); list.innerHTML = "";
  for (const item of items) {
    const category = categoryFor(item.categoryId); const days = daysOwned(item.purchasedOn); const cost = item.price / days;
    const node = document.querySelector("#item-template").content.firstElementChild.cloneNode(true);
    const iconBox = node.querySelector(".item-icon");
    if (item.photo) { const image = document.createElement("img"); image.src = item.photo; image.alt = ""; iconBox.append(image); iconBox.classList.add("has-photo"); }
    else iconBox.textContent = item.icon || category.icon;
    node.querySelector("h2").textContent = item.name;
    node.querySelector(".item-meta").textContent = `${category.name} · 持有 ${days} 天（${ownedCalendarDuration(item.purchasedOn)}）`;
    const note = node.querySelector(".item-note"); if (item.note) { note.hidden = false; note.textContent = item.note; }
    node.querySelector(".item-price strong").textContent = money(item.price, item.currency);
    const daily = node.querySelector(".item-price span"); daily.textContent = `日均 ${money(cost, item.currency)}`; daily.classList.add(`cost-${dailyCostTone(cost, item.currency)}`);
    node.querySelector(".more-button").dataset.editItem = item.id; list.append(node);
  }
  document.querySelector("#empty-add-item").hidden = state.items.length !== 0;
}

function fillCategoryOptions(selectedId) {
  const select = document.querySelector("#item-category"); select.innerHTML = state.categories.map((category) => `<option value="${category.id}">${category.icon} ${escapeHtml(category.name)}</option>`).join(""); select.value = selectedId || state.categories[0]?.id || "";
}
function updatePhotoPreview() {
  const preview = document.querySelector("#photo-preview"); preview.hidden = !pendingPhoto; document.querySelector("#photo-preview-image").src = pendingPhoto;
}
function openItemDialog(item) {
  if (!state.categories.length) { alert("請先建立至少一個分類。"); openCategoryDialog(); return; }
  document.querySelector("#item-dialog-title").textContent = item ? "編輯物品" : "新增物品";
  document.querySelector("#item-id").value = item?.id || ""; document.querySelector("#item-name").value = item?.name || "";
  document.querySelector("#item-purchased-on").value = item?.purchasedOn || new Date().toISOString().slice(0, 10); document.querySelector("#item-price").value = item?.price ?? "";
  document.querySelector("#item-currency").value = item?.currency || "CNY"; document.querySelector("#item-icon").value = item?.icon || ""; document.querySelector("#item-note").value = item?.note || "";
  document.querySelector("#item-photo").value = ""; pendingPhoto = item?.photo || ""; updatePhotoPreview(); fillCategoryOptions(item?.categoryId);
  document.querySelector("#item-dialog").showModal(); document.querySelector("#item-name").focus();
}
function closeDialog(id) { document.querySelector(`#${id}`).close(); }
function openCategoryDialog() {
  document.querySelector("#category-icon").innerHTML = ICONS.map((icon) => `<option value="${icon}">${icon}</option>`).join("");
  document.querySelector("#category-list").innerHTML = state.categories.map((category) => `<div class="category-row"><span>${category.icon}</span><strong>${escapeHtml(category.name)}</strong><button class="delete-category" data-delete-category="${category.id}">刪除</button></div>`).join("");
  const dialog = document.querySelector("#category-dialog"); if (!dialog.open) dialog.showModal();
}
function openSettings() { document.querySelector("#theme-color").value = state.settings.primaryColor; document.querySelector("#settings-dialog").showModal(); }
function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: `item-ledger-backup-${new Date().toISOString().slice(0, 10)}.json` }); link.click(); URL.revokeObjectURL(url);
}
function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = reject;
    reader.onload = () => { const image = new Image(); image.onerror = reject; image.onload = () => {
      const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement("canvas"); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", 0.78));
    }; image.src = reader.result; }; reader.readAsDataURL(file);
  });
}

document.querySelector("#open-add-item").addEventListener("click", () => openItemDialog()); document.querySelector("#empty-add-item").addEventListener("click", () => openItemDialog());
document.querySelector("#open-categories").addEventListener("click", openCategoryDialog); document.querySelector("#open-settings").addEventListener("click", openSettings); document.querySelector("#export-data").addEventListener("click", exportBackup);
document.querySelector("#item-photo").addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; try { pendingPhoto = await compressPhoto(file); updatePhotoPreview(); } catch (_) { alert("無法讀取這張照片。"); } finally { event.target.value = ""; } });
document.querySelector("#clear-photo").addEventListener("click", () => { pendingPhoto = ""; updatePhotoPreview(); });
document.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close]"); if (close) closeDialog(close.dataset.close);
  const filter = event.target.closest("[data-filter]"); if (filter) { activeCategory = filter.dataset.filter; render(); }
  const edit = event.target.closest("[data-edit-item]"); if (edit) openItemDialog(state.items.find((item) => item.id === edit.dataset.editItem));
  const remove = event.target.closest("[data-delete-category]"); if (remove) { const category = categoryFor(remove.dataset.deleteCategory); if (state.items.some((item) => item.categoryId === remove.dataset.deleteCategory)) return alert(`「${category.name}」仍有物品，請先移動或刪除那些物品。`); if (confirm(`刪除分類「${category.name}」？`)) { state.categories = state.categories.filter((item) => item.id !== remove.dataset.deleteCategory); saveState(); openCategoryDialog(); render(); } }
});
document.querySelector("#item-form").addEventListener("submit", (event) => {
  event.preventDefault(); const id = document.querySelector("#item-id").value;
  const item = { id: id || newId("item"), name: document.querySelector("#item-name").value.trim(), purchasedOn: document.querySelector("#item-purchased-on").value, price: Number(document.querySelector("#item-price").value), currency: document.querySelector("#item-currency").value, categoryId: document.querySelector("#item-category").value, icon: document.querySelector("#item-icon").value.trim(), photo: pendingPhoto, note: document.querySelector("#item-note").value.trim() };
  if (!item.name || !item.purchasedOn || !Number.isFinite(item.price) || item.price < 0) return;
  const index = state.items.findIndex((saved) => saved.id === id); if (index >= 0) state.items[index] = item; else state.items.push(item); saveState(); closeDialog("item-dialog"); render();
});
document.querySelector("#category-form").addEventListener("submit", (event) => { event.preventDefault(); const name = document.querySelector("#category-name").value.trim(); if (!name) return; if (state.categories.some((category) => category.name === name)) return alert("已有同名分類。"); state.categories.push({ id: newId("cat"), name, icon: document.querySelector("#category-icon").value }); saveState(); document.querySelector("#category-form").reset(); openCategoryDialog(); render(); });
document.querySelector("#settings-form").addEventListener("submit", (event) => { event.preventDefault(); state.settings.primaryColor = document.querySelector("#theme-color").value; saveState(); applyTheme(); closeDialog("settings-dialog"); });
document.querySelector("#import-data").addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); if (!Array.isArray(imported.items) || !Array.isArray(imported.categories)) throw new Error(); if (!confirm("匯入會覆蓋本機現有資料。繼續嗎？")) return; state = { ...imported, settings: { ...DEFAULT_SETTINGS, ...imported.settings } }; activeCategory = "all"; saveState(); applyTheme(); render(); alert("備份已匯入。"); } catch (_) { alert("這不是有效的帳本備份檔。"); } finally { event.target.value = ""; } });

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
applyTheme(); render();
