const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://fekweyxkojyzdcuxdwvh.supabase.co").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(data === null ? "null" : JSON.stringify(data));
}

function describeSupabaseKey() {
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_")) return "sb_secret";
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_publishable_")) return "sb_publishable";
  if (SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(SUPABASE_SERVICE_ROLE_KEY.split(".")[1], "base64url").toString("utf8"));
      return `legacy:${payload.role || "unknown"}${payload.ref ? `:${payload.ref}` : ""}`;
    } catch {
      return "legacy:invalid";
    }
  }
  return SUPABASE_SERVICE_ROLE_KEY ? "unknown" : "missing";
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) {
      const error = new Error("Ukuran permintaan terlalu besar.");
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Format JSON tidak valid.");
    error.status = 400;
    throw error;
  }
}

async function supabase(resource, options = {}) {
  const isSecretApiKey = SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_secret_");
  const isLegacyServiceKey = SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_publishable_") || (!isSecretApiKey && !isLegacyServiceKey)) {
    const message = SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_publishable_")
      ? "Key publishable tidak dapat digunakan oleh backend ini. Gunakan key secret/service_role di environment server."
      : !SUPABASE_URL
        ? "Atur SUPABASE_URL ke Project URL Supabase Anda di environment server."
        : !SUPABASE_SERVICE_ROLE_KEY
          ? "Atur SUPABASE_SERVICE_ROLE_KEY dengan key secret/service_role di environment server."
          : "Format key tidak dikenali. Masukkan seluruh key yang berawalan sb_secret_ atau eyJ.";
    const error = new Error(message);
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      ...(isSecretApiKey ? {} : { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }),
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await response.text();
  let result = null;
  try {
    result = text ? JSON.parse(text) : null;
  } catch {
    result = null;
  }
  if (!response.ok) {
    const error = new Error(result?.message || "Permintaan ke Supabase gagal.");
    error.status = response.status;
    throw error;
  }
  return result;
}

async function handleApi(request, response, url) {
  const method = request.method;
  const pathname = url.pathname;

  if (pathname === "/api/health" && method === "GET") {
    try {
      await supabase("categories?select=id&limit=1");
      return sendJson(response, 200, { connected: true });
    } catch (error) {
      return sendJson(response, 502, {
        connected: false,
        error: error.message,
        projectHost: new URL(SUPABASE_URL).host,
        keyType: describeSupabaseKey(),
      });
    }
  }

  if (pathname === "/api/overview" && method === "GET") {
    const products = await supabase("products?select=id,name,sku,stock_quantity,minimum_stock,unit,unit_cost");
    const since = encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString());
    const movements = await supabase(`stock_movements?select=id&created_at=gte.${since}`);
    const lowStock = products.filter((product) => product.stock_quantity <= product.minimum_stock);
    return sendJson(response, 200, {
      productCount: products.length,
      lowStockCount: lowStock.length,
      inventoryValue: products.reduce((total, product) => total + product.stock_quantity * Number(product.unit_cost), 0),
      movementCount30d: movements.length,
      lowStock: lowStock.sort((a, b) => a.stock_quantity - b.stock_quantity).slice(0, 6),
    });
  }

  if (pathname === "/api/products" && method === "GET") {
    const search = url.searchParams.get("search")?.trim();
    const query = new URLSearchParams({
      select: "id,sku,name,category_id,supplier_id,unit,unit_cost,minimum_stock,stock_quantity,created_at,categories(name),suppliers(name)",
      order: "name.asc",
    });
    if (search) query.set("or", `(name.ilike.*${search}*,sku.ilike.*${search}*)`);
    return sendJson(response, 200, await supabase(`products?${query}`));
  }

  if (pathname === "/api/products" && method === "POST") {
    const body = await readJson(request);
    if (!body.sku?.trim() || !body.name?.trim() || !body.category_id || !body.supplier_id) {
      return sendJson(response, 400, { error: "Kode, nama, kategori, dan pemasok wajib diisi." });
    }
    const product = {
      sku: body.sku.trim(),
      name: body.name.trim(),
      category_id: body.category_id,
      supplier_id: body.supplier_id,
      unit: body.unit?.trim() || "unit",
      unit_cost: Number(body.unit_cost || 0),
      minimum_stock: Number(body.minimum_stock || 0),
    };
    if (!Number.isFinite(product.unit_cost) || product.unit_cost < 0 || !Number.isInteger(product.minimum_stock) || product.minimum_stock < 0) {
      return sendJson(response, 400, { error: "Harga dan batas minimum harus berupa angka yang valid." });
    }
    const created = await supabase("products?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(product),
    });
    return sendJson(response, 201, created[0]);
  }

  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && method === "PATCH") {
    const body = await readJson(request);
    const allowed = ["sku", "name", "category_id", "supplier_id", "unit", "unit_cost", "minimum_stock"];
    const update = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
    if ("unit_cost" in update) update.unit_cost = Number(update.unit_cost);
    if ("minimum_stock" in update) update.minimum_stock = Number(update.minimum_stock);
    if (("unit_cost" in update && (!Number.isFinite(update.unit_cost) || update.unit_cost < 0)) ||
        ("minimum_stock" in update && (!Number.isInteger(update.minimum_stock) || update.minimum_stock < 0))) {
      return sendJson(response, 400, { error: "Harga dan batas minimum harus berupa angka yang valid." });
    }
    const updated = await supabase(`products?id=eq.${encodeURIComponent(productMatch[1])}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(update),
    });
    return updated.length ? sendJson(response, 200, updated[0]) : sendJson(response, 404, { error: "Barang tidak ditemukan." });
  }

  if (pathname === "/api/movements" && method === "GET") {
    const movements = await supabase("stock_movements?select=id,movement_type,quantity,note,created_at,products(id,name,sku,unit)&order=created_at.desc&limit=100");
    return sendJson(response, 200, movements);
  }

  if (pathname === "/api/movements" && method === "POST") {
    const body = await readJson(request);
    const quantity = Number(body.quantity);
    if (!body.product_id || !["in", "out"].includes(body.movement_type) || !Number.isInteger(quantity) || quantity <= 0) {
      return sendJson(response, 400, { error: "Barang, jenis mutasi, dan jumlah positif wajib diisi." });
    }
    const movement = await supabase("rpc/record_stock_movement", {
      method: "POST",
      body: JSON.stringify({
        p_product_id: body.product_id,
        p_movement_type: body.movement_type,
        p_quantity: quantity,
        p_note: body.note?.trim() || null,
      }),
    });
    return sendJson(response, 201, { id: movement });
  }

  if (pathname === "/api/categories" && method === "GET") {
    return sendJson(response, 200, await supabase("categories?select=id,name,description&order=name.asc"));
  }

  if (pathname === "/api/categories" && method === "POST") {
    const body = await readJson(request);
    if (!body.name?.trim()) return sendJson(response, 400, { error: "Nama kategori wajib diisi." });
    const created = await supabase("categories?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: body.name.trim(), description: body.description?.trim() || null }),
    });
    return sendJson(response, 201, created[0]);
  }

  if (pathname === "/api/suppliers" && method === "GET") {
    return sendJson(response, 200, await supabase("suppliers?select=id,name,contact_name,phone,email&order=name.asc"));
  }

  if (pathname === "/api/suppliers" && method === "POST") {
    const body = await readJson(request);
    if (!body.name?.trim()) return sendJson(response, 400, { error: "Nama pemasok wajib diisi." });
    const created = await supabase("suppliers?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        name: body.name.trim(),
        contact_name: body.contact_name?.trim() || null,
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
      }),
    });
    return sendJson(response, 201, created[0]);
  }

  return sendJson(response, 404, { error: "Endpoint tidak ditemukan." });
}

async function serveFrontend(response, pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^[/\\]+/, "");
  const filePath = path.resolve(FRONTEND_DIR, relativePath);
  if (!filePath.startsWith(`${FRONTEND_DIR}${path.sep}`)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("File tidak ditemukan.");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else if (request.method === "GET") {
      await serveFrontend(response, url.pathname);
    } else {
      sendJson(response, 405, { error: "Metode tidak didukung." });
    }
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error(error);
    const message = error.cause?.message ? `${error.message}: ${error.cause.message}` : error.message;
    sendJson(response, status, { error: message || "Server gagal memproses permintaan." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Inventaris berjalan di http://localhost:${PORT}`);
});