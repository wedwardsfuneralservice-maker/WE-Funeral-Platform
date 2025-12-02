// -----------------------------------------
// W.E Multi-Tenant Funeral Platform – SERVER
// -----------------------------------------

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const PDFDocument = require("pdfkit");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -----------------------------------------
// STATIC FOLDERS
// -----------------------------------------
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure uploads folder exists
if (!fs.existsSync("./uploads")) fs.mkdirSync("./uploads");
if (!fs.existsSync("./uploads/memorial-photos")) fs.mkdirSync("./uploads/memorial-photos");
if (!fs.existsSync("./uploads/pdf")) fs.mkdirSync("./uploads/pdf");

// -----------------------------------------
// MULTER STORAGE
// -----------------------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads/memorial-photos");
  },
  filename: function (req, file, cb) {
    const name = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, name + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// -----------------------------------------
// JSON HELPERS
// -----------------------------------------
function tenantFile(tenant, fileName) {
  const dir = path.join(__dirname, "data", tenant);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, fileName);
}

function loadJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// -----------------------------------------
// TENANTS LIST
// -----------------------------------------
const tenantsPath = path.join(__dirname, "data", "tenants.json");
if (!fs.existsSync(tenantsPath)) {
  saveJSON(tenantsPath, [
    { slug: "w-edwards", name: "W. Edwards Funeral Services" }
  ]);
}

app.get("/api/tenants", (req, res) => {
  res.json(loadJSON(tenantsPath, []));
});

// -----------------------------------------
// PUBLIC ROUTES
// -----------------------------------------
app.get("/t/:tenantSlug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tenant-home.html"));
});

app.get("/t/:tenantSlug/memorial/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "memorial.html"));
});

// -----------------------------------------
// ADMIN LOGIN PAGES
// -----------------------------------------
app.get("/admin/admin-login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "admin-login.html"));
});

app.get("/admin/admin-dashboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "admin-dashboard.html"));
});

// -----------------------------------------
// 🔥 ADMIN LOGIN API (FIXED + ADDED)
// -----------------------------------------
app.post("/api/auth-admin", (req, res) => {
  const { tenant, key } = req.body;

  const adminPath = path.join(__dirname, "data", "admin.json");

  if (!fs.existsSync(adminPath)) {
    return res.status(500).json({ success: false, message: "admin.json missing" });
  }

  let admins = JSON.parse(fs.readFileSync(adminPath, "utf8"));

  if (!admins[tenant]) {
    return res.status(404).json({ success: false, message: "Tenant not registered" });
  }

  if (admins[tenant].adminKey === key) {
    return res.json({ success: true });
  }

  return res.status(401).json({ success: false, message: "Invalid admin key" });
});

// -----------------------------------------
// ADMIN OVERVIEW
// -----------------------------------------
app.get("/api/:tenantSlug/admin/overview", (req, res) => {
  const tenant = req.params.tenantSlug;

  const memorials = loadJSON(tenantFile(tenant, "memorials.json"));
  const appts = loadJSON(tenantFile(tenant, "appointments.json"));
  const invoices = loadJSON(tenantFile(tenant, "invoices.json"));

  res.json({
    memorialCount: memorials.length,
    appointmentCount: appts.length,
    invoiceCount: invoices.length
  });
});

// -----------------------------------------
// GET ALL MEMORIALS
// -----------------------------------------
app.get("/api/:tenantSlug/admin/memorials", (req, res) => {
  const tenant = req.params.tenantSlug;
  const list = loadJSON(tenantFile(tenant, "memorials.json"));
  res.json(list);
});

// -----------------------------------------
// CREATE MEMORIAL (EXTENDED FIELDS)
// -----------------------------------------
app.post("/api/:tenantSlug/admin/memorials", upload.single("photo"), (req, res) => {
  const tenant = req.params.tenantSlug;
  const file = tenantFile(tenant, "memorials.json");
  const list = loadJSON(file, []);

  const {
    fullName,
    summary,
    dob,
    dod,
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
    livestreamLink
  } = req.body;

  const id = "mem-" + Date.now();

  const memorial = {
    id,
    tenant,
    fullName,
    summary,
    dob,
    dod,
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
    photoPath: req.file ? "/uploads/memorial-photos/" + req.file.filename : null,
    createdAt: new Date().toISOString()
  };

  list.push(memorial);
  saveJSON(file, list);

  res.json({ success: true, memorial });
});

// -----------------------------------------
// GET ONE MEMORIAL
// -----------------------------------------
app.get("/api/:tenantSlug/memorial/:id", (req, res) => {
  const tenant = req.params.tenantSlug;
  const id = req.params.id;

  const memorials = loadJSON(tenantFile(tenant, "memorials.json"), []);
  const mem = memorials.find(m => m.id === id);

  if (!mem) return res.status(404).json({ error: "Not found" });
  res.json(mem);
});

// -----------------------------------------
// PDF AUTO-FILL
// -----------------------------------------
app.post("/api/:tenantSlug/admin/pdf/from-form", (req, res) => {
  const { deceasedName, refNumber, serviceDate, serviceTime, serviceLocation } = req.body;

  const fileName = "form-" + Date.now() + ".pdf";
  const savePath = path.join(__dirname, "uploads/pdf", fileName);

  const doc = new PDFDocument();
  const stream = fs.createWriteStream(savePath);
  doc.pipe(stream);

  doc.fontSize(20).text("Funeral Form Summary", { underline: true });
  doc.moveDown();
  doc.fontSize(12).text(`Deceased: ${deceasedName}`);
  doc.text(`Reference: ${refNumber}`);
  doc.text(`Service Date: ${serviceDate}`);
  doc.text(`Service Time: ${serviceTime}`);
  doc.text(`Location: ${serviceLocation}`);

  doc.end();

  stream.on("finish", () => {
    res.json({ success: true, url: "/uploads/pdf/" + fileName });
  });
});

// -----------------------------------------
// APPOINTMENTS
// -----------------------------------------
app.get("/api/:tenantSlug/admin/appointments", (req, res) => {
  res.json(loadJSON(tenantFile(req.params.tenantSlug, "appointments.json")));
});

app.post("/api/:tenantSlug/admin/appointments", (req, res) => {
  const file = tenantFile(req.params.tenantSlug, "appointments.json");
  const list = loadJSON(file, []);

  const appt = {
    id: "appt-" + Date.now(),
    ...req.body,
    createdAt: new Date().toISOString()
  };

  list.push(appt);
  saveJSON(file, list);

  res.json({ success: true, appt });
});

// -----------------------------------------
// ACCOUNTING
// -----------------------------------------
app.get("/api/:tenantSlug/admin/accounting/invoices", (req, res) => {
  res.json(loadJSON(tenantFile(req.params.tenantSlug, "invoices.json")));
});

app.post("/api/:tenantSlug/admin/accounting/invoices", (req, res) => {
  const file = tenantFile(req.params.tenantSlug, "invoices.json");
  const list = loadJSON(file, []);

  const invoice = {
    id: "inv-" + Date.now(),
    ...req.body,
    createdAt: new Date().toISOString()
  };

  list.push(invoice);
  saveJSON(file, list);

  res.json({ success: true, invoice });
});

// -----------------------------------------
// FALLBACK HOME ROUTE
// -----------------------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -----------------------------------------
// START SERVER
// -----------------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
