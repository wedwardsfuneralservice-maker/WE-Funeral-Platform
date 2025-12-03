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
const tenantsFile = path.join(DATA, "tenants.json");   // array of tenants
const adminFile = path.join(DATA, "admin.json");       // map: { [slug]: { adminKey } }
const memorialsFile = path.join(DATA, "memorials.json"); // map: { [slug]: [memorials] }

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
// LOADERS / SAVERS
// ---------------------------------------------
const loadTenants = () => readJSON(tenantsFile, []);      // array
const saveTenants = (tenants) => writeJSON(tenantsFile, tenants);

const loadAdmins = () => readJSON(adminFile, {});         // map
const saveAdmins = (admins) => writeJSON(adminFile, admins);

const loadMemorials = () => readJSON(memorialsFile, {});  // map
const saveMemorials = (data) => writeJSON(memorialsFile, data);

// ---------------------------------------------
// HELPERS
// ---------------------------------------------
function slugifyName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "tenant";
}

function generateUniqueSlug(baseSlug, existingSlugs) {
  let slug = baseSlug;
  let i = 1;
  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${i}`;
    i++;
  }
  return slug;
}

function generateTempKey(length = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Day helpers
const DAYS = 24 * 60 * 60 * 1000;

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
// HEALTHCHECK (optional)
// ---------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

// ---------------------------------------------
// TENANT API (READ)
// ---------------------------------------------
app.get("/api/tenant/:slug", (req, res) => {
  const tenants = loadTenants();
  const tenant = tenants.find((t) => t.slug === req.params.slug);

  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  res.json(tenant);
});

// Status (includes trial info)
app.get("/api/tenant/:slug/status", (req, res) => {
  const tenants = loadTenants();
  const tenant = tenants.find((t) => t.slug === req.params.slug);

  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found" });
  }

  const now = Date.now();
  const trialExpired =
    tenant.trialEndsAt && typeof tenant.trialEndsAt === "number"
      ? now > tenant.trialEndsAt
      : false;

  res.json({
    slug: tenant.slug,
    name: tenant.name,
    package: tenant.package,
    status: tenant.status,    // "trial", "active", "suspended", etc.
    trialEndsAt: tenant.trialEndsAt || null,
    trialExpired,
    createdAt: tenant.createdAt || null,
    paidAt: tenant.paidAt || null,
  });
});

// List all tenants (optional admin usage)
app.get("/api/tenants", (req, res) => {
  res.json(loadTenants());
});

// ---------------------------------------------
// SIGNUP (AUTO-PROVISION + 14-DAY TRIAL)
// ---------------------------------------------
// This is called by your public signup form
app.post("/api/signup", (req, res) => {
  const {
    funeralHomeName,
    ownerName,
    email,
    phone,
    website,
    country,
    packageName, // e.g. "starter", "pro", "premium"
  } = req.body;

  if (!funeralHomeName || !email || !packageName) {
    return res
      .status(400)
      .json({ error: "funeralHomeName, email, and packageName are required" });
  }

  const tenants = loadTenants();
  const baseSlug = slugifyName(funeralHomeName);
  const existingSlugs = tenants.map((t) => t.slug);
  const slug = generateUniqueSlug(baseSlug, existingSlugs);

  const now = Date.now();
  const trialEndsAt = now + 14 * DAYS;

  const newTenant = {
    slug,
    name: funeralHomeName,
    ownerName: ownerName || "",
    email,
    phone: phone || "",
    website: website || "",
    country: country || "",
    package: packageName,
    status: "trial", // trial until payment / upgrade
    trialEndsAt,
    createdAt: now,
    paidAt: null,
  };

  tenants.push(newTenant);
  saveTenants(tenants);

  const admins = loadAdmins();
  const tempAdminKey = generateTempKey();
  admins[slug] = { adminKey: tempAdminKey };
  saveAdmins(admins);

  // TODO: plug in SMTP email here later:
  // sendWelcomeEmail({ to: email, slug, tempAdminKey, trialEndsAt });

  console.log(
    `New tenant signup: ${slug} (${funeralHomeName}) – trial until ${new Date(
      trialEndsAt
    ).toISOString()}`
  );

  res.json({
    success: true,
    tenantSlug: slug,
    tempAdminKey,
    trialEndsAt,
  });
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

  // Optional: check trial status and block if expired and not paid
  const tenants = loadTenants();
  const t = tenants.find((x) => x.slug === tenant);
  if (t) {
    const now = Date.now();
    const trialExpired =
      t.trialEndsAt && typeof t.trialEndsAt === "number"
        ? now > t.trialEndsAt
        : false;

    if (trialExpired && t.status !== "active") {
      return res.status(402).json({
        error: "Trial expired",
        code: "TRIAL_EXPIRED",
        tenant: tenant,
      });
    }
  }

  res.json({ success: true, tenant });
});

// ---------------------------------------------
// PAYMENT WEBHOOK / ACTIVATION
// ---------------------------------------------
// Call this from your payment provider webhook when payment succeeds
app.post("/api/tenants/mark-paid", (req, res) => {
  const { slug } = req.body;

  if (!slug) {
    return res.status(400).json({ error: "slug required" });
  }

  const tenants = loadTenants();
  const tenant = tenants.find((t) => t.slug === slug);

  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found" });
  }

  tenant.status = "active";
  tenant.paidAt = Date.now();

  saveTenants(tenants);

  console.log(`Tenant ${slug} marked as PAID and ACTIVE.`);
  res.json({ success: true, tenant });
});

// ---------------------------------------------
// MEMORIALS API (per-tenant)
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
// FALLBACK—Render needs this for SPA-ish navigation
// ---------------------------------------------
app.get("*", (req, res) => {
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
