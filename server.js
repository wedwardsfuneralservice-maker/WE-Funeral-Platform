const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const PDFDocument = require("pdfkit");

const app = express();
const PORT = process.env.PORT || 7860;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static
app.use("/public", express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Simple disk JSON helpers
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function loadJSON(file, fallback) {
  const filePath = path.join(dataDir, file);
  try {
    if (!fs.existsSync(filePath)) {
      if (fallback !== undefined) {
        fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
        return fallback;
      }
      return [];
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("Error loading JSON", file, err);
    return fallback !== undefined ? fallback : [];
  }
}

function saveJSON(file, data) {
  const filePath = path.join(dataDir, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Basic uploads setup (for photos later)
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = path.join(uploadDir, "memorial-photos");
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const safeName = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safeName);
  },
});
const upload = multer({ storage });

// Seed a default tenant if none exist
function ensureDefaultTenant() {
  let tenants = loadJSON("tenants.json", []);
  if (tenants.length === 0) {
    tenants = [
      {
        id: "tenant-1",
        slug: "w-edwards",
        name: "W. Edwards Funeral Services",
        brandColor: "#d97757",
        accentColor: "#fbbf24",
        logoText: "W. Edwards",
        createdAt: new Date().toISOString()
      }
    ];
    saveJSON("tenants.json", tenants);
  }
  return tenants;
}

// Home - marketing / tenant chooser
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API: list tenants
app.get("/api/tenants", (req, res) => {
  const tenants = ensureDefaultTenant();
  res.json(tenants);
});

// Public tenant home (HTML uses JS to read slug from URL)
app.get("/t/:tenantSlug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "tenant-home.html"));
});

// Public memorials listing for a tenant
app.get("/api/:tenantSlug/memorials", (req, res) => {
  const { tenantSlug } = req.params;
  const all = loadJSON("memorials.json", []);
  const filtered = all.filter((m) => m.tenantSlug === tenantSlug);
  res.json(filtered);
});

// Public single memorial
app.get("/api/:tenantSlug/memorials/:id", (req, res) => {
  const { tenantSlug, id } = req.params;
  const all = loadJSON("memorials.json", []);
  const mem = all.find((m) => m.tenantSlug === tenantSlug && m.id === id);
  if (!mem) return res.status(404).json({ error: "Memorial not found" });
  res.json(mem);
});

// Simple admin "auth" via shared key in query (starter, no real security)
app.post("/api/:tenantSlug/admin/login", (req, res) => {
  const { tenantSlug } = req.params;
  const { adminKey } = req.body;
  // In a real app, store per-tenant keys hashed; here we just accept any non-empty key
  if (!adminKey) return res.status(400).json({ error: "Admin key required" });
  res.json({ ok: true, tenantSlug });
});

// Admin dashboard data (overview stats)
app.get("/api/:tenantSlug/admin/overview", (req, res) => {
  const { tenantSlug } = req.params;
  const mems = loadJSON("memorials.json", [])
    .filter((m) => m.tenantSlug === tenantSlug);
  const appointments = loadJSON("appointments.json", [])
    .filter((a) => a.tenantSlug === tenantSlug);
  const invoices = loadJSON("accounting.json", [])
    .filter((i) => i.tenantSlug === tenantSlug);

  res.json({
    tenantSlug,
    memorialCount: mems.length,
    appointmentCount: appointments.length,
    invoiceCount: invoices.length
  });
});

// Admin: create a memorial (without full validation)
app.post("/api/:tenantSlug/admin/memorials", upload.single("photo"), (req, res) => {
  const { tenantSlug } = req.params;
  const memorials = loadJSON("memorials.json", []);
  const {
    fullName,
    dob,
    dod,
    summary,
    serviceDate,
    serviceTime,
    serviceLocation
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
    serviceDate,
    serviceTime,
    serviceLocation,
    photoPath,
    createdAt: new Date().toISOString()
  };

  memorials.push(memorial);
  saveJSON("memorials.json", memorials);
  res.json({ ok: true, memorial });
});

// Admin: list memorials (same as public but via admin endpoint)
app.get("/api/:tenantSlug/admin/memorials", (req, res) => {
  const { tenantSlug } = req.params;
  const all = loadJSON("memorials.json", []);
  res.json(all.filter((m) => m.tenantSlug === tenantSlug));
});

// Admin: simple appointment scheduler starter
app.get("/api/:tenantSlug/admin/appointments", (req, res) => {
  const { tenantSlug } = req.params;
  const all = loadJSON("appointments.json", []);
  res.json(all.filter((a) => a.tenantSlug === tenantSlug));
});

app.post("/api/:tenantSlug/admin/appointments", (req, res) => {
  const { tenantSlug } = req.params;
  const all = loadJSON("appointments.json", []);
  const {
    title,
    clientName,
    date,
    time,
    location,
    notes
  } = req.body;

  const id = "appt-" + Date.now();
  const appt = {
    id,
    tenantSlug,
    title,
    clientName,
    date,
    time,
    location,
    notes,
    createdAt: new Date().toISOString()
  };

  all.push(appt);
  saveJSON("appointments.json", all);
  res.json({ ok: true, appointment: appt });
});

// Admin: simple accounting starter (store invoices as JSON)
app.get("/api/:tenantSlug/admin/accounting/invoices", (req, res) => {
  const { tenantSlug } = req.params;
  const all = loadJSON("accounting.json", []);
  res.json(all.filter((inv) => inv.tenantSlug === tenantSlug));
});

app.post("/api/:tenantSlug/admin/accounting/invoices", (req, res) => {
  const { tenantSlug } = req.params;
  const all = loadJSON("accounting.json", []);
  const {
    invoiceNumber,
    clientName,
    amount,
    status,
    dueDate,
    notes
  } = req.body;

  const id = "inv-" + Date.now();
  const inv = {
    id,
    tenantSlug,
    invoiceNumber,
    clientName,
    amount: Number(amount || 0),
    status: status || "Unpaid",
    dueDate,
    notes,
    createdAt: new Date().toISOString()
  };

  all.push(inv);
  saveJSON("accounting.json", all);
  res.json({ ok: true, invoice: inv });
});

// Admin: PDF auto-fill starter from funeral form
app.post("/api/:tenantSlug/admin/pdf/from-form", (req, res) => {
  const { tenantSlug } = req.params;
  const formData = req.body || {};

  const pdfDir = path.join(uploadDir, "pdf");
  fs.mkdirSync(pdfDir, { recursive: true });

  const filename = `funeral-form-${tenantSlug}-${Date.now()}.pdf`;
  const filePath = path.join(pdfDir, filename);

  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(18).text("Funeral Arrangement Summary", { align: "center" });
  doc.moveDown();

  doc.fontSize(12);
  doc.text(`Tenant: ${tenantSlug}`);
  doc.moveDown();

  Object.entries(formData).forEach(([key, value]) => {
    doc.text(`${key}: ${value}`);
  });

  doc.end();

  stream.on("finish", () => {
    const publicUrl = `/uploads/pdf/${filename}`;
    res.json({ ok: true, url: publicUrl });
  });

  stream.on("error", (err) => {
    console.error("PDF error", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  });
});

// Fallback
app.use((req, res) => {
  res.status(404).send("Not found");
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
