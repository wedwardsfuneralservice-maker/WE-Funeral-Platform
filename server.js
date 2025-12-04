// ------------------------------------------------------
//  W.E. Funeral Platform - Multi-Tenant Backend
//  Fully Updated + Admin Folder Now in /public/admin
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

// Serve /public and /public/admin
app.use(express.static("public"));

// ------------------------------------------------------
// SUPERADMIN LOGIN PAGE
// ------------------------------------------------------
app.get("/superadmin/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public/superadmin/login.html"));
});

// ------------------------------------------------------
// SUPERADMIN LOGIN (POST)
// ------------------------------------------------------
let superadminSessions = {};

app.post("/superadmin/login", (req, res) => {
    const { email, password } = req.body;

    try {
        const users = JSON.parse(fs.readFileSync("./data/users.json"));

        const user = users.find(
            (u) => u.email === email && u.password === password
        );

        if (!user) {
            return res.status(401).json({ success: false, error: "Invalid login" });
        }

        // Create session token
        const token = crypto.randomBytes(16).toString("hex");

        superadminSessions[token] = {
            email: user.email,
            role: user.role,
            createdAt: Date.now(),
        };

        return res.json({ success: true, token });
    } catch (err) {
        console.error("Superadmin login error:", err);
        return res.status(500).json({ success: false, error: "Server error" });
    }
});

// ------------------------------------------------------
// SUPERADMIN AUTH MIDDLEWARE
// ------------------------------------------------------
function requireSuperadmin(req, res, next) {
    const token = req.headers["x-auth-token"];
    if (!token || !superadminSessions[token]) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    next();
}

// ------------------------------------------------------
// SUPERADMIN LOGOUT
// ------------------------------------------------------
app.post("/superadmin/logout", (req, res) => {
    const token = req.headers["x-auth-token"];
    if (token && superadminSessions[token]) {
        delete superadminSessions[token];
    }
    return res.json({ success: true, message: "Logged out" });
});

// ------------------------------------------------------
// SUPERADMIN AUTO-REDIRECT
// ------------------------------------------------------
app.get("/superadmin", (req, res) => {
    const token = req.headers["x-auth-token"];
    if (token && superadminSessions[token]) {
        return res.redirect("/superadmin/dashboard");
    }
    return res.redirect("/superadmin/login");
});

// ------------------------------------------------------
// SUPERADMIN DASHBOARD PAGE
// ------------------------------------------------------
app.get("/superadmin/dashboard", requireSuperadmin, (req, res) => {
    res.sendFile(path.join(__dirname, "public/superadmin/dashboard.html"));
});

// ------------------------------------------------------
// SUPERADMIN — READ ALL TENANTS
// ------------------------------------------------------
app.get("/superadmin/api/tenants", requireSuperadmin, (req, res) => {
    try {
        const tenants = JSON.parse(fs.readFileSync("./data/tenants.json"));
        res.json({ success: true, tenants });
    } catch (err) {
        console.error("Error reading tenants:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// ------------------------------------------------------
// 🔥 FIX: Alias route for dashboard.html compatibility
// ------------------------------------------------------
app.get("/api/superadmin/tenants", requireSuperadmin, (req, res) => {
    try {
        const tenants = JSON.parse(fs.readFileSync("./data/tenants.json"));
        res.json(tenants);
    } catch (err) {
        console.error("Error reading tenants:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// ------------------------------------------------------
// SUPERADMIN — CREATE NEW TENANT
// ------------------------------------------------------
app.post("/superadmin/api/tenants", requireSuperadmin, (req, res) => {
    try {
        const tenants = JSON.parse(fs.readFileSync("./data/tenants.json"));

        const slug = req.body.slug;
        if (!slug)
            return res.status(400).json({ success: false, error: "Missing slug" });

        if (tenants.find((t) => t.slug === slug)) {
            return res.status(400).json({
                success: false,
                error: "Tenant already exists",
            });
        }

        const newTenant = {
            slug,
            businessName: req.body.businessName || "",
            email: req.body.email || "",
            adminKey: req.body.adminKey || "",
            createdAt: Date.now(),
        };

        tenants.push(newTenant);
        fs.writeFileSync("./data/tenants.json", JSON.stringify(tenants, null, 2));

        res.json({ success: true, tenant: newTenant });
    } catch (err) {
        console.error("Error creating tenant:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

// ------------------------------------------------------
// SUPERADMIN — DELETE TENANT
// ------------------------------------------------------
app.delete("/superadmin/api/tenants/:slug", requireSuperadmin, (req, res) => {
    try {
        const slug = req.params.slug;
        let tenants = JSON.parse(fs.readFileSync("./data/tenants.json"));

        const existed = tenants.some((t) => t.slug === slug);
        tenants = tenants.filter((t) => t.slug !== slug);

        if (!existed) {
            return res
                .status(404)
                .json({ success: false, error: "Tenant not found" });
        }

        fs.writeFileSync("./data/tenants.json", JSON.stringify(tenants, null, 2));

        res.json({ success: true, message: "Tenant removed" });
    } catch (err) {
        console.error("Error deleting tenant:", err);
        res.status(500).json({ success: false, error: "Server error" });
    }
});

//------------------------------------------------------
// ADMIN STATIC ROUTES
//------------------------------------------------------
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
// SAFE EMAIL TRANSPORT
// ------------------------------------------------------
const mailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
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
// JSON HELPERS
// ------------------------------------------------------
function loadJSON(file) {
    const filePath = path.join(__dirname, "data", file);
    if (!fs.existsSync(filePath)) return [];
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
// PUBLIC TENANT SIGNUP
// ------------------------------------------------------
app.post("/api/signup", (req, res) => {
    const { funeralHomeName, email } = req.body;

    if (!funeralHomeName || !email)
        return res.status(400).json({ error: "Missing required fields." });

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
        trialEndsAt,
    };

    tenants.push(newTenant);
    admins[slug] = { adminKey: tempAdminKey };

    saveTenants(tenants);
    saveAdmins(admins);

    // Send Welcome Email
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
        `,
    });

    res.json({
        success: true,
        slug,
        message: "Tenant created and welcome email sent.",
    });
});

// ------------------------------------------------------
// ADMIN LOGIN
// ------------------------------------------------------
app.post("/api/admin/login", (req, res) => {
    const { slug, adminKey } = req.body;

    const tenants = loadTenants();
    const admins = loadAdmins();

    const tenant = tenants.find((t) => t.slug === slug);
    if (!tenant) return res.status(400).json({ error: "Tenant not found" });

    if (!admins[slug] || admins[slug].adminKey !== adminKey)
        return res.status(400).json({ error: "Invalid admin key" });

    res.json({ success: true });
});

// ------------------------------------------------------
// PASSWORD RESET REQUEST
// ------------------------------------------------------
app.post("/api/auth/reset-request", (req, res) => {
    const { email } = req.body;

    const tenants = loadTenants();
    const tenant = tenants.find((t) => t.email === email);

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
            <h2>Password Reset</h2>
            <p>Click below to reset your password:</p>
            <a href="${resetURL}">${resetURL}</a>
            <p>Link expires in 30 minutes.</p>
        `,
    });

    res.json({ success: true });
});

// ------------------------------------------------------
// PASSWORD RESET CONFIRM
// ------------------------------------------------------
app.post("/api/auth/reset-confirm", (req, res) => {
    const { token, password } = req.body;

    const tenants = loadTenants();
    const admins = loadAdmins();

    const tenant = tenants.find((t) => t.resetToken === token);
    if (!tenant)
        return res.status(400).json({ error: "Invalid or expired token" });

    if (Date.now() > tenant.resetExpiry)
        return res.status(400).json({ error: "Token expired" });

    admins[tenant.slug].adminKey = password;

    delete tenant.resetToken;
    delete tenant.resetExpiry;

    saveAdmins(admins);
    saveTenants(tenants);

    res.json({ success: true });
});

// ------------------------------------------------------
// READ TENANT DATA
// ------------------------------------------------------
app.get("/api/tenant/:slug", (req, res) => {
    const tenants = loadTenants();
    const tenant = tenants.find((t) => t.slug === req.params.slug);
    if (!tenant) return res.status(404).json({ error: "Tenant not found" });
    res.json(tenant);
});

// ------------------------------------------------------
// UPDATE TENANT SETTINGS
// ------------------------------------------------------
app.post("/api/tenant/:slug/settings", (req, res) => {
    const slug = req.params.slug;

    const tenants = loadTenants();
    const tenant = tenants.find((t) => t.slug === slug);

    if (!tenant) return res.status(404).json({ error: "Tenant not found" });

    Object.assign(tenant, req.body);
    saveTenants(tenants);

    res.json({ success: true });
});

// ------------------------------------------------------
// TEST EMAIL ROUTE
// ------------------------------------------------------
app.get("/api/test-email", async (req, res) => {
    try {
        await sendMailSafe({
            from: `"WE Funeral Platform" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: "Test Email",
            text: "This is a test email",
        });

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ------------------------------------------------------
// START SERVER
// ------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("////////////////////////////////////////////////////");
    console.log(`✓ Server is running on port ${PORT}`);
    console.log("////////////////////////////////////////////////////");
});
