const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

// ------------ BASIC MIDDLEWARE ------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static assets
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));

// ------------ DATA FILE PATHS ------------
const dataDir = path.join(__dirname, "data");
const tenantsFile = path.join(dataDir, "tenants.json");
const adminFile = path.join(dataDir, "admin.json");
const memorialsFile = path.join(dataDir, "memorials.json");

// ------------ HELPER FUNCTIONS ------------
function safeReadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error("JSON read error:", filePath, err.message);
    return fallback;
  }
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("JSON write error:", filePath, err.message);
  }
}

function loadTenants() {
  return safeReadJSON(tenantsFile, []);
}

function loadAdmins() {
  return safeReadJSON(adminFile, {});
}

function loadMemorialMap() {
  return safeReadJSON(memorialsFile, {}); // { slug: [memorials...] }
}

function saveMemorialMap(map) {
  saveJSON(memorialsFile, map);
}

// ------------ CORE PAGES ------------

// Main multi-tenant landing
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Tenant public site
app.get("/t/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tenant-home.html"));
});

// ------------ TENANT API ------------

// Get tenant info by slug
app.get("/api/tenant/:slug", (req, res) => {
  const tenants = loadTenants();
  const tenant = tenants.find((t) => t.slug === req.params.slug);
  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found" });
  }
  res.json(tenant);
});

// ------------ ADMIN LOGIN API ------------

app.post("/api/admin/login", (req, res) => {
  const { tenant, key } = req.body;
  if (!tenant || !key) {
    return res.status(400).json({ error: "Missing tenant or admin key" });
  }

  const admins = loadAdmins();
  const record = admins[tenant];

  if (!record) {
    return res.status(404).json({ error: "Tenant admin not found" });
  }

  if (record.adminKey !== key) {
    return res.status(403).json({ error: "Invalid admin key" });
  }

  res.json({ success: true });
});

// ------------ MEMORIAL API ------------

// Get all memorials for a tenant
app.get("/api/memorials/:slug", (req, res) => {
  const slug = req.params.slug;
  const map = loadMemorialMap();
  const list = map[slug] || [];
  res.json(list);
});

// Get a single memorial by tenant + id
app.get("/api/memorials/:slug/:id", (req, res) => {
  const slug = req.params.slug;
  const id = req.params.id;

  const map = loadMemorialMap();
  const list = map[slug] || [];
  const memorial = list.find((m) => m.id === id);

  if (!memorial) {
    return res.status(404).json({ error: "Memorial not found" });
  }

  res.json(memorial);
});

// Add new memorial
app.post("/api/memorials/add", (req, res) => {
  const {
    tenant,
    fullName,
    summary,
    dateOfBirth,
    dateOfDeath,
    serviceDate,
    serviceTime,
    serviceLocation,
    burialDate,
    burialTime,
    burialLocation,
    livestreamUrl,
    obituary
  } = req.body;

  if (!tenant || !fullName) {
    return res.status(400).json({ error: "Tenant and full name are required" });
  }

  const map = loadMemorialMap();
  if (!map[tenant]) map[tenant] = [];

  const newMemorial = {
    id: "mem-" + Date.now(),
    tenant,
    fullName: fullName || "",
    summary: summary || "",
    dateOfBirth: dateOfBirth || "",
    dateOfDeath: dateOfDeath || "",
    serviceDate: serviceDate || "",
    serviceTime: serviceTime || "",
    serviceLocation: serviceLocation || "",
    burialDate: burialDate || "",
    burialTime: burialTime || "",
    burialLocation: burialLocation || "",
    livestreamUrl: livestreamUrl || "",
    obituary: obituary || "",
    createdAt: Date.now(),
    status: "published"
  };

  map[tenant].push(newMemorial);
  saveMemorialMap(map);

  res.json({ success: true, memorial: newMemorial });
});

// Update an existing memorial
app.post("/api/memorials/update", (req, res) => {
  const {
    tenant,
    id,
    fullName,
    summary,
    dateOfBirth,
    dateOfDeath,
    serviceDate,
    serviceTime,
    serviceLocation,
    burialDate,
    burialTime,
    burialLocation,
    livestreamUrl,
    obituary,
    status
  } = req.body;

  if (!tenant || !id) {
    return res.status(400).json({ error: "Tenant and memorial id are required" });
  }

  const map = loadMemorialMap();
  const list = map[tenant] || [];
  const memorial = list.find((m) => m.id === id);

  if (!memorial) {
    return res.status(404).json({ error: "Memorial not found" });
  }

  // Only update fields that were provided
  if (fullName !== undefined) memorial.fullName = fullName;
  if (summary !== undefined) memorial.summary = summary;
  if (dateOfBirth !== undefined) memorial.dateOfBirth = dateOfBirth;
  if (dateOfDeath !== undefined) memorial.dateOfDeath = dateOfDeath;
  if (serviceDate !== undefined) memorial.serviceDate = serviceDate;
  if (serviceTime !== undefined) memorial.serviceTime = serviceTime;
  if (serviceLocation !== undefined) memorial.serviceLocation = serviceLocation;
  if (burialDate !== undefined) memorial.burialDate = burialDate;
  if (burialTime !== undefined) memorial.burialTime = burialTime;
  if (burialLocation !== undefined) memorial.burialLocation = burialLocation;
  if (livestreamUrl !== undefined) memorial.livestreamUrl = livestreamUrl;
  if (obituary !== undefined) memorial.obituary = obituary;
  if (status !== undefined) memorial.status = status;

  saveMemorialMap(map);
  res.json({ success: true, memorial });
});

// Delete a memorial
app.post("/api/memorials/delete", (req, res) => {
  const { tenant, id } = req.body;

  if (!tenant || !id) {
    return res.status(400).json({ error: "Tenant and memorial id are required" });
  }

  const map = loadMemorialMap();
  const list = map[tenant] || [];
  const nextList = list.filter((m) => m.id !== id);

  if (nextList.length === list.length) {
    return res.status(404).json({ error: "Memorial not found" });
  }

  map[tenant] = nextList;
  saveMemorialMap(map);

  res.json({ success: true });
});

// ------------ CATCH-ALL (SPA style) ------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ------------ START SERVER ------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
