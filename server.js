const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

// ---------------------------------------------
// DIRECTORIES
// ---------------------------------------------
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const ADMIN = path.join(ROOT, "admin");
const DATA = path.join(ROOT, "data");

// Ensure "data" directory exists
if (!fs.existsSync(DATA)) {
  fs.mkdirSync(DATA, { recursive: true });
}

// JSON data files
const tenantsFile = path.join(DATA, "tenants.json");
const adminFile = path.join(DATA, "admin.json");
const memorialsFile = path.join(DATA, "memorials.json");

// ---------------------------------------------
// MIDDLEWARE
// ---------------------------------------------
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Static files
app.use(express.static(PUBLIC));
app.use("/admin", express.static(ADMIN));

// ---------------------------------------------
// UTILS — JSON SAFE READ/WRITE
// ---------------------------------------------
function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const content = fs.readFileSync(file, "utf8");
    if (!content.trim()) return fallback;
    return JSON.parse(content);
  } catch (e) {
    console.error("JSON Read Error:", file, e);
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("JSON Write Error:", file, e);
  }
}

// ---------------------------------------------
// LOADERS
// ---------------------------------------------
const loadTenants = () => readJSON(tenantsFile, []);
const loadAdmins = () => readJSON(adminFile, {});
const loadMemorials = () => readJSON(memorialsFile, {});
const saveMemorials = (data) => writeJSON(memorialsFile, data);

// ---------------------------------------------
// ROOT PAGES
// ---------------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

// Tenant public site
app.get("/t/:slug", (req, res) => {
  res.sendFile(path.join(PUBLIC, "tenant-home.html"));
});

// ---------------------------------------------
// TENANT API
// ---------------------------------------------
app.get("/api/tenant/:slug", (req, res) => {
  const tenants = loadTenants();
  const tenant = tenants.find((t) => t.slug === req.params.slug);

  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  res.json(tenant);
});

app.get("/api/tenants", (req, res) => {
  res.json(loadTenants());
});

// ---------------------------------------------
// ADMIN LOGIN
// ---------------------------------------------
app.post("/api/admin/login", (req, res) => {
  const { tenant, key } = req.body;

  if (!tenant || !key)
    return res.status(400).json({ error: "Missing tenant or key" });

  const admins = loadAdmins();
  const info = admins[tenant];

  if (!info) return res.status(404).json({ error: "Tenant admin not found" });
  if (info.adminKey !== key)
    return res.status(403).json({ error: "Invalid admin key" });

  res.json({ success: true, tenant });
});

// ---------------------------------------------
// MEMORIALS API
// ---------------------------------------------
app.get("/api/memorials/:tenant", (req, res) => {
  const all = loadMemorials();
  res.json(all[req.params.tenant] || []);
});

app.get("/api/memorials/:tenant/:id", (req, res) => {
  const all = loadMemorials();
  const list = all[req.params.tenant] || [];
  const item = list.find((m) => m.id === req.params.id);

  if (!item) return res.status(404).json({ error: "Memorial not found" });

  res.json(item);
});

app.post("/api/memorials/add", (req, res) => {
  const data = req.body;
  const tenant = data.tenant;

  if (!tenant || !data.fullName)
    return res
      .status(400)
      .json({ error: "Tenant and fullName are required" });

  const all = loadMemorials();
  if (!all[tenant]) all[tenant] = [];

  const memorial = {
    id: "mem-" + Date.now().toString(36),
    ...data,
    createdAt: Date.now(),
  };

  all[tenant].push(memorial);
  saveMemorials(all);

  res.json({ success: true, memorial });
});

app.post("/api/memorials/update", (req, res) => {
  const { tenant, id, ...updates } = req.body;

  if (!tenant || !id)
    return res.status(400).json({ error: "Tenant and id required" });

  const all = loadMemorials();
  const list = all[tenant] || [];
  const item = list.find((m) => m.id === id);

  if (!item) return res.status(404).json({ error: "Memorial not found" });

  Object.assign(item, updates);
  saveMemorials(all);

  res.json({ success: true, memorial: item });
});

app.post("/api/memorials/delete", (req, res) => {
  const { tenant, id } = req.body;

  if (!tenant || !id)
    return res.status(400).json({ error: "Tenant and id required" });

  const all = loadMemorials();
  const list = all[tenant] || [];

  const filtered = list.filter((m) => m.id !== id);
  if (filtered.length === list.length)
    return res.status(404).json({ error: "Memorial not found" });

  all[tenant] = filtered;
  saveMemorials(all);

  res.json({ success: true });
});

// ---------------------------------------------
// FALLBACK—Render needs this for SPA navigation
// ---------------------------------------------
app.get("*", (req, res) => {
  // Only return index.html for HTML requests
  if ((req.headers.accept || "").includes("text/html")) {
    return res.sendFile(path.join(PUBLIC, "index.html"));
  }
  res.status(404).json({ error: "Not found" });
});

// ---------------------------------------------
// START SERVER (Render injects PORT)
// ---------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✔ Server running on Render port", PORT);
});
