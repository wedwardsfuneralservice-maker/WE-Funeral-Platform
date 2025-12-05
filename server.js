// ------------------------------------------------------
//  W.E. Funeral Platform - Multi-Tenant Backend (JWT)
// ------------------------------------------------------

const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve /public (includes /public/admin and /public/superadmin)
app.use(express.static("public"));

// ------------------------------------------------------
//  CONFIG
// ------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SUPERADMIN_SECRET";

// ------------------------------------------------------
//  SAFE EMAIL TRANSPORT
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
//  JSON HELPERS
// ------------------------------------------------------
function loadJSON(file, fallback) {
  const filePath = path.join(__dirname, "data", file);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJSON(file, data) {
  const filePath = path.join(__dirname, "data", file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const loadTenants = () => loadJSON("tenants.json", []);
const saveTenants = (d) => saveJSON("tenants.json", d);

const loadAdmins = () => loadJSON("admins.json", {});
const saveAdmins = (d) => saveJSON("admins.json", d);

const loadUsers = () => loadJSON("users.json", []); // for superadmin

// ------------------------------------------------------
//  SUPERADMIN PAGES
// ------------------------------------------------------
app.get("/superadmin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/superadmin/login.html"));
});

app.get("/superadmin/dashboard", requireSuperadmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public/superadmin/dashboard.html"));
});

app.get("/superadmin", (req, res) => {
  res.redirect("/superadmin/login");
});

// ------------------------------------------------------
//  SUPERADMIN LOGIN (JWT)
// ------------------------------------------------------
app.post("/superadmin/login", (req, res) => {
  const { email, password } = req.body;

  try {
    const users = loadUsers();

    const user = users.find(
      (u) => u.email === email && u.password === password
    );

    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid login" });
    }

    const token = jwt.sign(
      {
        email: user.email,
        role: user.role || "superadmin"
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ success: true, token });
  } catch (err) {
    console.error("Superadmin login error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Server error" });
  }
});

// ==================================
// SUPERADMIN TOKEN REFRESH ENDPOINT
// ==================================
app.post("/superadmin/api/refresh", (req, res) => {
    try {
        const refresh = req.body.refreshToken;
        if (!refresh) {
            return res.status(401).json({ success: false, error: "Missing refresh token" });
        }

        // Verify refresh token
        const decoded = jwt.verify(refresh, process.env.JWT_REFRESH_SECRET);

        // Issue new access token
        const newAccessToken = jwt.sign(
            { email: decoded.email, role: "superadmin" },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );

        return res.json({ success: true, accessToken: newAccessToken });

    } catch (err) {
        console.error("Refresh token error:", err.message);
        return res.status(401).json({ success: false, error: "Invalid refresh token" });
    }
});


// -------------------------------------------------------------
// SUPERADMIN AUTH MIDDLEWARE (JWT VERSION)
// -------------------------------------------------------------
function requireSuperadmin(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const token = auth.replace("Bearer ", "").trim();

    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded || decoded.role !== "superadmin") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    req.superadmin = decoded;
    next();

  } catch (err) {
    console.error("Superadmin auth error:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, error: "token_expired" });
    }

    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
}




// ------------------------------------------------------
//  SUPERADMIN LOGOUT
// ------------------------------------------------------
app.post("/superadmin/logout", (req, res) => {
  return res.json({ success: true, message: "Logged out" });
});

// ------------------------------------------------------
//  SUPERADMIN — READ ALL TENANTS
// ------------------------------------------------------
app.get("/superadmin/api/tenants", requireSuperadmin, (req, res) => {
    try {
        const tenants = loadTenants() || [];
        res.json({
            success: true,
            tenants
        });
    }catch (err) {
    console.error("Load tenants failed:", err);

    if (err.message.includes("Unauthorized")) {
        localStorage.removeItem("superadminToken");
        window.location.href = "/superadmin/login.html";
    }
}

});


// Alias
app.get("/api/superadmin/tenants", requireSuperadmin, (req, res) => {
  try {
    const tenants = loadTenants();
    res.json(tenants);
  } catch (err) {
    console.error("Error reading tenants:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ------------------------------------------------------
//  SUPERADMIN — CREATE TENANT
// ------------------------------------------------------
app.post("/superadmin/api/tenants", requireSuperadmin, (req, res) => {
  try {
    const tenants = loadTenants();

    const slug = req.body.slug;
    if (!slug) {
      return res.status(400).json({ success: false, error: "Missing slug" });
    }

    if (tenants.find((t) => t.slug === slug)) {
      return res.status(400).json({
        success: false,
        error: "Tenant already exists"
      });
    }

    const newTenant = {
      slug,
      funeralHomeName: req.body.businessName || "",
      email: req.body.email || "",
      status: req.body.status || "trial",
      createdAt: Date.now(),
      trialEndsAt:
        req.body.trialEndsAt || Date.now() + 14 * 24 * 60 * 60 * 1000
    };

    tenants.push(newTenant);
    saveTenants(tenants);

    res.json({ success: true, tenant: newTenant });
  } catch (err) {
    console.error("Error creating tenant:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ------------------------------------------------------
//  SUPERADMIN — DELETE TENANT
// ------------------------------------------------------
app.delete("/superadmin/api/tenants/:slug", requireSuperadmin, (req, res) => {
  try {
    const slug = req.params.slug;
    let tenants = loadTenants();

    const existed = tenants.some((t) => t.slug === slug);
    tenants = tenants.filter((t) => t.slug !== slug);

    if (!existed) {
      return res
        .status(404)
        .json({ success: false, error: "Tenant not found" });
    }

    saveTenants(tenants);

    res.json({ success: true, message: "Tenant removed" });
  } catch (err) {
    console.error("Error deleting tenant:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ------------------------------------------------------
//  ADMIN STATIC ROUTES
// ------------------------------------------------------
app.get("/admin/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/admin-login.html"));
});

app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/admin-dashboard.html"));
});

app.get("/admin/onboarding", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/onboarding.html"));
});

app.get("/admin/reset-password", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/reset-password.html"));
});

app.get("/admin/reset-confirm", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/reset-confirm.html"));
});

// ------------------------------------------------------
//  PUBLIC TENANT SIGNUP
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

  sendMailSafe({
    from: `"WE Funeral Platform" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Welcome to WE Funeral Platform",
    html: `
      <h2>Welcome!</h2>
      <p>Your funeral home <strong>${funeralHomeName}</strong> is now created.</p>
      <p><strong>Login URL:</strong><br>
      https://we-funeral-platform.onrender.com/admin/login?tenant=${slug}</p>
      <p><strong>Temporary Admin Password:</strong><br>${tempAdminKey}</p>
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
//  ADMIN LOGIN — supports BOTH naming formats
// ------------------------------------------------------
app.post("/api/admin/login", (req, res) => {
  const slug = req.body.slug || req.body.tenant;
  const adminKey = req.body.adminKey || req.body.key;

  if (!slug || !adminKey) {
    return res.status(400).json({ error: "Missing login fields" });
  }

  const tenants = loadTenants();
  const admins = loadAdmins();

  const tenant = tenants.find((t) => t.slug === slug);
  if (!tenant) {
    return res.status(400).json({ error: "Tenant not found" });
  }

  if (!admins[slug] || admins[slug].adminKey !== adminKey) {
    return res.status(400).json({ error: "Invalid admin key" });
  }

  return res.json({ success: true });
});

// ------------------------------------------------------
//  PASSWORD RESET REQUEST
// ------------------------------------------------------
app.post("/api/auth/reset-request", (req, res) => {
  const { email } = req.body;

  const tenants = loadTenants();
  const tenant = tenants.find((t) => t.email === email);

  if (!tenant) {
    return res.json({ success: true });
  }

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
      <h2>Password Reset</h2>
      <p>Click below to reset your password:</p>
      <a href="${resetURL}">${resetURL}</a>
      <p>Link expires in 30 minutes.</p>
    `
  });

  res.json({ success: true });
});

// ------------------------------------------------------
//  PASSWORD RESET CONFIRM
// ------------------------------------------------------
app.post("/api/auth/reset-confirm", (req, res) => {
  const { token, password } = req.body;

  const tenants = loadTenants();
  const admins = loadAdmins();

  const tenant = tenants.find((t) => t.resetToken === token);
  if (!tenant) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

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
  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found" });
  }
  res.json(tenant);
});

// ------------------------------------------------------
//  UPDATE TENANT SETTINGS
// ------------------------------------------------------
app.post("/api/tenant/:slug/settings", (req, res) => {
  const slug = req.params.slug;

  const tenants = loadTenants();
  const tenant = tenants.find((t) => t.slug === slug);

  if (!tenant) {
    return res.status(404).json({ error: "Tenant not found" });
  }

  Object.assign(tenant, req.body);
  saveTenants(tenants);

  res.json({ success: true });
});

// ------------------------------------------------------
//  TEST EMAIL ROUTE
// ------------------------------------------------------
app.get("/api/test-email", async (req, res) => {
  try {
    await sendMailSafe({
      from: `"WE Funeral Platform" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: "Test Email",
      text: "This is a test email"
    });

    res.json({ success: true });
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
  console.log(`✓ Server is running on port ${PORT}`);
  console.log("////////////////////////////////////////////////////");
});
