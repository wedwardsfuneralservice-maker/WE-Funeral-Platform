const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- STATIC PUBLIC FILES ----------
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));

// ---------- DATA FILE PATHS ----------
const tenantsFile = path.join(__dirname, "data", "tenants.json");
const adminFile = path.join(__dirname, "data", "admin.json");
const memorialsFile = path.join(__dirname, "data", "memorials.json");

// ---------- SAFE READ FUNCTION ----------
function safeReadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("JSON read error:", filePath, e);
    return fallback;
  }
}

// ---------- LOAD DATA ----------
function loadTenants() {
  return safeReadJSON(tenantsFile, []);
}

function loadAdmins() {
  return safeReadJSON(adminFile, {});
}

function loadMemorials() {
  return safeReadJSON(memorialsFile, {});
}

// ---------- SAVE FUNCTIONS ----------
function saveMemorials(data) {
  fs.writeFileSync(memorialsFile, JSON.stringify(data, null, 2));
}

// ---------- HOME PAGE ----------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- TENANT HOME PAGE ----------
app.get("/t/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tenant-home.html"));
});

// ---------- RETURN TENANT DATA ----------
app.get("/api/tenant/:slug", (req, res) => {
  const tenants = loadTenants();
  const tenant = tenants.find(t => t.slug === req.params.slug);

  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  res.json(tenant);
});

// ---------- ADMIN LOGIN ----------
app.post("/api/admin/login", (req, res) => {
  const { tenant, key } = req.body;

  const adminData = loadAdmins();

  if (!adminData[tenant])
    return res.status(404).json({ error: "Tenant admin not found" });

  if (adminData[tenant].adminKey !== key)
    return res.status(403).json({ error: "Invalid admin key" });

  res.json({ success: true });
});

// ---------- GET MEMORIALS ----------
app.get("/api/memorials/:slug", (req, res) => {
  const data = loadMemorials();
  const tenantMemorials = data[req.params.slug] || [];
  res.json(tenantMemorials);
});

// ---------- ADD MEMORIAL ----------
app.post("/api/memorials/add", (req, res) => {
  const { tenant, fullName, summary, dateOfBirth, dateOfDeath, serviceDate, serviceTime, serviceLocation } = req.body;

  const data = loadMemorials();

  if (!data[tenant]) data[tenant] = [];

  const newMemorial = {
    id: "mem-" + Date.now(),
    fullName,
    summary,
    dateOfBirth,
    dateOfDeath,
    serviceDate,
    serviceTime,
    serviceLocation
  };

  data[tenant].push(newMemorial);
  saveMemorials(data);

  res.json({ success: true, memorial: newMemorial });
});

// ---------- CATCH-ALL ----------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
