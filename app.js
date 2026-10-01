const state = {
  overview: null,
  products: [],
  movements: [],
  categories: [],
  suppliers: [],
  editingProductId: null,
  activeView: "overview",
};

const byId = (id) => document.getElementById(id);
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const numberFormat = new Intl.NumberFormat("id-ID");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Permintaan gagal. Coba lagi.");
  return data;
}

let toastTimer;
function showToast(message, isError = false) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function setConnectionStatus(status) {
  const dot = byId("connection-dot");
  dot.classList.toggle("is-connected", status === "connected");
  dot.classList.toggle("is-error", status === "error");
  byId("connection-detail").textContent = status === "connected"
    ? "Terhubung ke database"
    : status === "error" ? "Belum terhubung" : "Memeriksa koneksi...";
}

function relationName(value) {
  return Array.isArray(value) ? value[0]?.name : value?.name;
}

function stockStatus(product) {
  if (product.stock_quantity <= 0) return '<span class="status status-empty">Habis</span>';
  if (product.stock_quantity <= product.minimum_stock) return '<span class="status status-low">Menipis</span>';
  return '<span class="status status-ok">Tersedia</span>';
}

function productNameCell(product) {
  return `<span class="item-name">${escapeHtml(product.name)}</span><span class="item-code">${escapeHtml(product.sku)}</span>`;
}

function renderOverview() {
  const overview = state.overview;
  byId("metric-products").textContent = numberFormat.format(overview.productCount);
  byId("metric-low").textContent = numberFormat.format(overview.lowStockCount);
  byId("metric-value").textContent = rupiah.format(overview.inventoryValue);
  byId("metric-movements").textContent = numberFormat.format(overview.movementCount30d);
  byId("low-stock-count").textContent = `${numberFormat.format(overview.lowStockCount)} item`;

  const lowStockBody = byId("low-stock-body");
  lowStockBody.innerHTML = overview.lowStock.map((product) => `
    <tr>
      <td>${productNameCell(product)}</td>
      <td><span class="stock-value is-low">${numberFormat.format(product.stock_quantity)} ${escapeHtml(product.unit)}</span></td>
      <td>${numberFormat.format(product.minimum_stock)} ${escapeHtml(product.unit)}</td>
      <td>${stockStatus(product)}</td>
    </tr>`).join("");
  byId("low-stock-empty").hidden = overview.lowStock.length > 0;

  const recent = state.movements.slice(0, 5);
  byId("recent-movements").innerHTML = recent.map((movement) => {
    const outgoing = movement.movement_type === "out";
    const product = Array.isArray(movement.products) ? movement.products[0] : movement.products;
    return `<div class="activity-row">
      <span class="activity-icon ${outgoing ? "out" : ""}">${outgoing ? "↑" : "↓"}</span>
      <span class="activity-copy"><strong>${escapeHtml(product?.name || "Barang")}</strong><small>${formatDate(movement.created_at)}${movement.note ? ` · ${escapeHtml(movement.note)}` : ""}</small></span>
      <span class="activity-quantity ${outgoing ? "out" : ""}">${outgoing ? "−" : "+"}${numberFormat.format(movement.quantity)}</span>
    </div>`;
  }).join("");
  byId("activity-empty").hidden = recent.length > 0;
}

function renderProducts(products = state.products) {
  byId("product-count").textContent = `${numberFormat.format(products.length)} barang`;
  byId("products-body").innerHTML = products.map((product) => `
    <tr>
      <td>${productNameCell(product)}</td>
      <td>${escapeHtml(relationName(product.categories) || "—")}</td>
      <td>${escapeHtml(relationName(product.suppliers) || "—")}</td>
      <td><span class="stock-value ${product.stock_quantity <= product.minimum_stock ? "is-low" : ""}">${numberFormat.format(product.stock_quantity)} ${escapeHtml(product.unit)}</span></td>
      <td>${rupiah.format(product.unit_cost)}</td>
      <td>${stockStatus(product)}</td>
      <td><button class="table-action" type="button" data-edit-product="${escapeHtml(product.id)}">Ubah</button></td>
    </tr>`).join("");
  byId("products-empty").hidden = products.length > 0;
}

function renderMovements() {
  const body = byId("movements-body");
  body.innerHTML = state.movements.map((movement) => {
    const outgoing = movement.movement_type === "out";
    const product = Array.isArray(movement.products) ? movement.products[0] : movement.products;
    return `<tr>
      <td>${formatDate(movement.created_at, true)}</td>
      <td>${product ? productNameCell(product) : "—"}</td>
      <td><span class="status ${outgoing ? "status-low" : "status-ok"}">${outgoing ? "Keluar" : "Masuk"}</span></td>
      <td><strong>${outgoing ? "−" : "+"}${numberFormat.format(movement.quantity)}</strong>${product?.unit ? ` ${escapeHtml(product.unit)}` : ""}</td>
      <td>${escapeHtml(movement.note || "—")}</td>
    </tr>`;
  }).join("");
  byId("movements-empty").hidden = state.movements.length > 0;
}

function renderMasters() {
  byId("category-count").textContent = numberFormat.format(state.categories.length);
  byId("supplier-count").textContent = numberFormat.format(state.suppliers.length);
  byId("category-list").innerHTML = state.categories.map((category) => `<li><span>${escapeHtml(category.name)}</span><small>${numberFormat.format(state.products.filter((product) => product.category_id === category.id).length)} barang</small></li>`).join("");
  byId("supplier-list").innerHTML = state.suppliers.map((supplier) => `<li><span>${escapeHtml(supplier.name)}<small>${supplier.contact_name ? ` · ${escapeHtml(supplier.contact_name)}` : ""}</small></span><small>${escapeHtml(supplier.phone || supplier.email || "")}</small></li>`).join("");
  fillSelect(byId("product-form").elements.category_id, state.categories, "Pilih kategori");
  fillSelect(byId("product-form").elements.supplier_id, state.suppliers, "Pilih pemasok");
  fillSelect(byId("movement-form").elements.product_id, state.products, "Pilih barang", (product) => `${product.name} · ${product.sku} (${product.stock_quantity} ${product.unit})`);
}

function fillSelect(select, items, placeholder, label = (item) => item.name) {
  const selected = select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(label(item))}</option>`).join("")}`;
  if (items.some((item) => item.id === selected)) select.value = selected;
}

function formatDate(value, includeTime = false) {
  const options = includeTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short" };
  return new Intl.DateTimeFormat("id-ID", options).format(new Date(value));
}

async function refreshData() {
  setConnectionStatus("checking");
  try {
    const [health, overview, products, movements, categories, suppliers] = await Promise.all([
      api("/api/health"),
      api("/api/overview"),
      api("/api/products"),
      api("/api/movements"),
      api("/api/categories"),
      api("/api/suppliers"),
    ]);
    Object.assign(state, { overview, products, movements, categories, suppliers });
    renderOverview();
    renderProducts();
    renderMovements();
    renderMasters();
    setConnectionStatus(health.connected ? "connected" : "error");
  } catch (error) {
    setConnectionStatus("error");
    showToast(error.message, true);
  }
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll(".view").forEach((section) => {
    const active = section.id === `view-${view}`;
    section.hidden = !active;
    section.classList.toggle("is-visible", active);
  });
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view && button.classList.contains("nav-item")));
  byId("current-section").textContent = ({ overview: "Ringkasan", products: "Perlengkapan", movements: "Mutasi stok", masters: "Data referensi" })[view];
}

function openProductDialog(product = null) {
  const form = byId("product-form");
  form.reset();
  state.editingProductId = product?.id || null;
  byId("product-dialog").querySelector(".modal-heading h2").textContent = product ? "Ubah barang" : "Tambah barang";
  form.querySelector('[name="sku"]').value = product?.sku || "";
  form.querySelector('[name="name"]').value = product?.name || "";
  form.querySelector('[name="unit"]').value = product?.unit || "unit";
  form.querySelector('[name="unit_cost"]').value = product?.unit_cost ?? 0;
  form.querySelector('[name="minimum_stock"]').value = product?.minimum_stock ?? 5;
  form.querySelector('button[type="submit"]').textContent = product ? "Simpan perubahan" : "Simpan barang";
  fillSelect(form.elements.category_id, state.categories, "Pilih kategori");
  fillSelect(form.elements.supplier_id, state.suppliers, "Pilih pemasok");
  if (product) {
    form.elements.category_id.value = product.category_id;
    form.elements.supplier_id.value = product.supplier_id;
  }
  byId("product-dialog").showModal();
}

function openMovementDialog() {
  const form = byId("movement-form");
  form.reset();
  fillSelect(form.elements.product_id, state.products, "Pilih barang", (product) => `${product.name} · ${product.sku} (${product.stock_quantity} ${product.unit})`);
  byId("movement-dialog").showModal();
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll('[data-action="add-product"]').forEach((button) => button.addEventListener("click", () => openProductDialog()));
document.querySelectorAll('[data-action="add-movement"]').forEach((button) => button.addEventListener("click", openMovementDialog));
byId("product-open").addEventListener("click", () => openProductDialog());
byId("movement-open").addEventListener("click", openMovementDialog);
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => byId(button.dataset.close).close()));

byId("products-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-product]");
  if (!button) return;
  const product = state.products.find((item) => item.id === button.dataset.editProduct);
  if (product) openProductDialog(product);
});

byId("product-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  payload.unit_cost = Number(payload.unit_cost);
  payload.minimum_stock = Number(payload.minimum_stock);
  try {
    await api(state.editingProductId ? `/api/products/${encodeURIComponent(state.editingProductId)}` : "/api/products", {
      method: state.editingProductId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    byId("product-dialog").close();
    showToast(state.editingProductId ? "Perubahan barang tersimpan." : "Barang berhasil ditambahkan.");
    state.editingProductId = null;
    await refreshData();
  } catch (error) {
    showToast(error.message, true);
  }
});

byId("movement-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  payload.quantity = Number(payload.quantity);
  try {
    await api("/api/movements", { method: "POST", body: JSON.stringify(payload) });
    byId("movement-dialog").close();
    showToast("Mutasi stok berhasil dicatat.");
    await refreshData();
  } catch (error) {
    showToast(error.message, true);
  }
});

byId("category-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = new FormData(form).get("name");
  try {
    await api("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
    form.reset();
    showToast("Kategori berhasil ditambahkan.");
    await refreshData();
  } catch (error) {
    showToast(error.message, true);
  }
});

byId("supplier-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  try {
    await api("/api/suppliers", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    showToast("Pemasok berhasil ditambahkan.");
    await refreshData();
  } catch (error) {
    showToast(error.message, true);
  }
});

let searchTimer;
byId("product-search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const search = event.target.value.trim();
    try {
      renderProducts(search ? await api(`/api/products?search=${encodeURIComponent(search)}`) : state.products);
    } catch (error) {
      showToast(error.message, true);
    }
  }, 220);
});

byId("today-label").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
refreshData();