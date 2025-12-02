// ------------------------------
// W.E Multi-Tenant Funeral Platform – SERVER.JS
// ------------------------------

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const PDFDocument = require("pdfkit");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static folders
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure uploads folder exists
if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
if (!fs.existsSync("./uploads/memorial-photos")) fs.mkdirSync("./uploads/memorial-photos");
if (!fs.existsSync("./uploads/pdf")) fs.mkdirSync("./uploads/pdf");

// ------------------------------
// Multer Storage
// ------------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads/memorial-photos");
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ------------------------------
// Helper: Load/Save JSON
// ------------------------------
function tenantFile(tenant, file) {
  const dir = path.join(__dirname, "data", tenant);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, file);
}

function loadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath));
  } catch (err) {
    console.error("JSON load error:", err);
    return fallback;
  }
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("JSON save error:", err);
  }
}

// ------------------------------
// TENANTS LIST (SUPER ADMIN LEVEL)
// ------------------------------
const tenantsPath = path.join(__dirname, "data", "tenants.json");
if (!fs.existsSync(tenantsPath)) {
  saveJSON(tenantsPath, [
    { name: "W. Edwards Funeral Services", slug: "w-edwards" }
  ]);
}

app.get("/api/tenants", (req, res) => {
  const tenants = loadJSON(tenantsPath, []);
  res.json(tenants);
});

// ------------------------------
// PUBLIC SITE ROUTING
// ------------------------------
app.get("/t/:tenantSlug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tenant-home.html"));
});

app.get("/t/:tenantSlug/memorial/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "memorial.html"));
});

// ------------------------------
// ADMIN LOGIN
// ------------------------------
app.get("/admin/admin-login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "admin-login.html"));
});

app.get("/admin/admin-dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "admin-dashboard.html"));
});

// ------------------------------
// ADMIN API — OVERVIEW
// ------------------------------
app.get("/api/:tenantSlug/admin/overview", (req, res) => {
  const { tenantSlug } = req.params;

  const memorials = loadJSON(tenantFile(tenantSlug, "memorials.json"), []);
  const appts = loadJSON(tenantFile(tenantSlug, "appointments.json"), []);
  const invoices = loadJSON(tenantFile(tenantSlug, "invoices.json"), []);

  res.json({
    memorialCount: memorials.length,
    appointmentCount: appts.length,
    invoiceCount: invoices.length,
  });
});

// ------------------------------
// ADMIN API — GET MEMORIALS
// ------------------------------
app.get("/api/:tenantSlug/admin/memorials", (req, res) => {
  const { tenantSlug } = req.params;
  const list = loadJSON(tenantFile(tenantSlug, "memorials.json"), []);
  res.json(list);
});

// ------------------------------
// ADMIN API — CREATE MEMORIAL (FULL VERSION)
// ------------------------------
app.post("/api/:tenantSlug/admin/memorials", upload.single("photo"), (req, res) => {
  const { tenantSlug } = req.params;
  const filePath = tenantFile(tenantSlug, "memorials.json");
  const memorials = loadJSON(filePath, []);

  const {
    fullName,
    dob,
    dod,
    summary,
    obituary,
    viewingDate,
    viewingTime,
    viewingLocation,
    serviceDate,
    serviceTime,
    serviceLocation,
    burialPlace,
    burialDate,
    burialTime,
    livestreamLink,
  } = req.body;

  const id = "mem-" + Date.now();
  const photoPath = req.file ? `/uploads/memorial-photos/${req.file.filename}` : null;

  const memorial = {
    id,
    tenantSlug,
    fullName,
    dob,
    dod,
    summary,
    obituary,
    viewingDate,
    viewingTime,
    viewingLocation,
    serviceDate,
    serviceTime,
    serviceLocation,
    burialPlace,
    burialDate,
    burialTime,
    livestreamLink,
    photoPath,
    createdAt: new Date().toISOString(),
  };

  memorials.push(memorial);
  saveJSON(filePath, memorials);

  res.json({ ok: true, memorial });
});

// ------------------------------
// PUBLIC API — GET SINGLE MEMORIAL
// ------------------------------
app.get("/api/:tenantSlug/memorial/:id", (req, res) => {
  const { tenantSlug, id } = req.params;
  const memorials = loadJSON(tenantFile(tenantSlug, "memorials.json"), []);
  const mem = memorials.find((m) => m.id === id);

  if (!mem) return res.status(404).json({ error: "Not found" });
  res.json(mem);
});

// ------------------------------
// PDF AUTO-FILL (Funeral Form)
// ------------------------------
app.post("/api/:tenantSlug/admin/pdf/from-form", (req, res) => {
  const { tenantSlug } = req.params;
  const { deceasedName, refNumber, serviceDate, serviceTime, serviceLocation } = req.body;

  const filename = `funeral-form-${Date.now()}.pdf`;
  const outputPath = path.join(__dirname, "uploads/pdf", filename);

  const doc = new PDFDocument();
  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(20).text("Funeral Arrangement Summary", { underline: true });
  doc.moveDown();

  doc.fontSize(12).text(`Deceased Name: ${deceasedName || ""}`);
  doc.text(`Reference Number: ${refNumber || ""}`);
  doc.text(`Service Date: ${serviceDate || ""}`);
  doc.text(`Service Time: ${serviceTime || ""}`);
  doc.text(`Location: ${serviceLocation || ""}`);

  doc.end();

  stream.on("finish", () => {
    res.json({ ok: true, url: `/uploads/pdf/${filename}` });
  });
});

// ------------------------------
// APPOINTMENT SCHEDULER
// ------------------------------
app.get("/api/:tenantSlug/admin/appointments", (req, res) => {
  const { tenantSlug } = req.params;
  const list = loadJSON(tenantFile(tenantSlug, "appointments.json"), []);
  res.json(list);
});

app.post("/api/:tenantSlug/admin/appointments", (req, res) => {
  const { tenantSlug } = req.params;
  const file = tenantFile(tenantSlug, "appointments.json");
  const list = loadJSON(file, []);

  const appt = {
    id: "appt-" + Date.now(),
    ...req.body,
    createdAt: new Date().toISOString(),
  };

  list.push(appt);
  saveJSON(file, list);
  res.json({ ok: true, appt });
});

// ------------------------------
// ACCOUNTING
// ------------------------------
app.get("/api/:tenantSlug/admin/accounting/invoices", (req, res) => {
  const { tenantSlug } = req.params;
  const invoices = loadJSON(tenantFile(tenantSlug, "invoices.json"), []);
  res.json(invoices);
});

app.post("/api/:tenantSlug/admin/accounting/invoices", (req, res) => {
  const { tenantSlug } = req.params;
  const file = tenantFile(tenantSlug, "invoices.json");
  const invoices = loadJSON(file, []);

  const invoice = {
    id: "inv-" + Date.now(),
    ...req.body,
    createdAt: new Date().toISOString(),
  };

  invoices.push(invoice);
  saveJSON(file, invoices);
  res.json({ ok: true, invoice });
});

// ------------------------------
// FALLBACK HOME → MULTI-TENANT LANDING PAGE
// ------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ------------------------------
// START SERVER
// ------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
