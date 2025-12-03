// ------------------------------------------------------
//  W.E. Funeral Platform - Multi-Tenant Backend
//  Fully Patched with Safe Email Handling
// ------------------------------------------------------

const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// ------------------------------------------------------
//  SAFE EMAIL TRANSPORT (Never Crashes)
// ------------------------------------------------------
const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

async function sendMailSafe(options) {
  try {
    const info = await mailer.sendMail(options);
    console.log("Email sent:", info.response);
  } catch (err) {
    console.error("Email Error:", err?.message || err);
  }
}

// ------------------------------------------------------
//  Helpers: Load & Save JSON Data
// ------------------------------------------------------
function loadJSON(file) {
  const filePath = path.join(__dirname, "data", file);
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJSON(file, data) {
  const filePath = path.join(__dirname, "data", file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const loadTenants = () => loadJSON("tenants.json");
const saveTenants = (d) => saveJSON("tenants.json", d);

const loadAdmins = () => loadJSON("admins.json");
const saveAdmins = (d) => saveJSON("admins.json", d);

// ------------------------------------------------------
//  CREATE NEW TENANT (Free Trial Signup)
// ------------------------------------------------------
app.post("/api/signup", (req, res) => {
  const { funeralHomeName, email } = req.body;
  if (!funeralHomeName || !email) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const tenants = loadTenants();
  const admins = loadAdmins();

  const slug = funeralHomeName.toLowerCase().replace(/\s+/g, "-");
  const tempAdminKey = crypto.randomBytes(4).toString("hex");

  if (tenants.find((t) => t.slug === slug)) {
    return res.status(400).json({ error: "Tenant already exists." });
  }

  const trialEndsAt = Date.now() + 14 * 24 * 60 * 60 * 1000;

  const newTenant = {
    slug,
    funeralHomeName,
    email,
    createdAt: Date.now(),
    trialEndsAt
  };

  tenants.push(newTenant);
  admins[slug] = { adminKey: tempAdminKey };

  saveTenants(tenants);
  saveAdmins(admins);

  // ------------------------------------------------------
  //  SAFE WELCOME EMAIL (Never Crashes)
  // ------------------------------------------------------
  sendMailSafe({
    from: `"WE Funeral Platform" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Welcome to WE Funeral Platform",
    html: `
      <h2>Welcome to the WE Funeral Platform!</h2>
      <p>Your funeral home <strong>${funeralHomeName}</strong> is now created.</p>

      <p><strong>Login URL:</strong><br>
      https://we-funeral-platform.onrender.com/admin/admin-login.html?tenant=${slug}</p>

      <p><strong>Your Temporary Admin Password:</strong><br>${tempAdminKey}</p>

      <p><strong>Free Trial Ends:</strong> ${new Date(trialEndsAt).toDateString()}</p>
    `
  });

  res.json({
    success: true,
    slug,
    message: "Tenant created and welcome email sent."
  });
});

// ------------------------------------------------------
//  ADMIN LOGIN
// ------------------------------------------------------
app.post("/api/admin/login", (req, res) => {
  const { slug, adminKey } = req.body;

  const tenants = loadTenants();
  const admins = loadAdmins();

  const tenant = tenants.find((t) => t.slug === slug);
  if (!tenant) return res.status(400).json({ error: "Tenant not found" });

  if (!admins[slug] || admins[slug].adminKey !== adminKey) {
    return res.status(400).json({ error: "Invalid admin key" });
  }

  res.json({ success: true });
});

// ------------------------------------------------------
//  PASSWORD RESET REQUEST
// ------------------------------------------------------
app.post("/api/auth/reset-request", (req, res) => {
  const { email } = req.body;
  const tenants = loadTenants();

  const tenant = tenants.find((t) => t.email === email);

  // Always return success to prevent enumeration attacks
  if (!tenant) return res.json({ success: true });

  const token = crypto.randomBytes(32).toString("hex");
  tenant.resetToken = token;
  tenant.resetExpiry = Date.now() + 30 * 60 * 1000;

  saveTenants(tenants);

  const resetURL = `https://we-funeral-platform.onrender.com/admin/reset-confirm.html?token=${token}`;

  sendMailSafe({
    from: `"WE Funeral Platform" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Password Reset",
    html: `
      <h2>Password Reset Request</h2>
      <p>Click below to reset your password:</p>
      <p><a href="${resetURL}">${resetURL}</a></p>
      <p>This link expires in 30 minutes.</p>
    `
  });

  res.json({ success: true });
});

// ------------------------------------------------------
//  PASSWORD RESET CONFIRMATION
// ------------------------------------------------------
app.post("/api/auth/reset-confirm", (req, res) => {
  const { token, password } = req.body;

  const tenants = loadTenants();
  const admins = loadAdmins();

  const tenant = tenants.find((t) => t.resetToken === token);

  if (!tenant) return res.status(400).json({ error: "Invalid or expired token" });
  if (Date.now() > tenant.resetExpiry) {
    return res.status(400).json({ error: "Token expired" });
  }

  admins[tenant.slug].adminKey = password;
  delete tenant.resetToken;
  delete tenant.resetExpiry;

  saveAdmins(admins);
  saveTenants(tenants);

  res.json({ success: true });
});

// ------------------------------------------------------
//  READ TENANT DATA
// ------------------------------------------------------
app.get("/api/tenant/:slug", (req, res) => {
  const tenants = loadTenants();
  const tenant = tenants.find((t) => t.slug === req.params.slug);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });
  res.json(tenant);
});

// ------------------------------------------------------
//  UPDATE TENANT SETTINGS
// ------------------------------------------------------
app.post("/api/tenant/:slug/settings", (req, res) => {
  const slug = req.params.slug;
  const tenants = loadTenants();

  const tenant = tenants.find((t) => t.slug === slug);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  Object.assign(tenant, req.body);

  saveTenants(tenants);

  res.json({ success: true, message: "Settings updated." });
});

// ------------------------------------------------------
//  SAFE TEST EMAIL ROUTE
// ------------------------------------------------------
app.get("/api/test-email", async (req, res) => {
  try {
    await sendMailSafe({
      from: `"WE Funeral Platform" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "Test Email",
      text: "This is a test email from WE Funeral Platform"
    });
    res.json({ success: true, message: "Test email attempted." });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ------------------------------------------------------
//  START SERVER
// ------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("////////////////////////////////////////////////////");
  console.log(`✓ Server running on Render port ${PORT}`);
  console.log("✓ Your service is live 🎉");
  console.log("////////////////////////////////////////////////////");
});
