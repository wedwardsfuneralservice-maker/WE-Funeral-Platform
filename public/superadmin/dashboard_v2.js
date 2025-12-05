/* ============================================================
   GLOBAL STATE
============================================================ */
let tenants = [];
let currentTenant = null;
let drawerOpen = false;
let unsavedChanges = false;

const FEATURES = [
  "Memorial Pages",
  "Condolence Messages",
  "Funeral Intake Form",
  "Hymn Sheet Designer",
  "Appointment Scheduler",
  "PDF Auto-Fill",
  "Accounting & Payments",
  "Inventory Tracking",
  "Staff Management",
  "Analytics Dashboard"
];

/* ============================================================
   ON LOAD
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("yearSpan").textContent = new Date().getFullYear();

  setupThemeToggle();
  setupSidebarCollapse();
  setupSearch();
  setupCreateTenantModal();
  setupDrawer();

  loadTenants();
});

/* ============================================================
   SECURE FETCH WRAPPER (prep for new server_v2)
============================================================ */
async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include", // important for session cookies
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (res.status === 401) {
    window.location.href = "/superadmin/login.html";
    return;
  }

  return res.json();
}

/* ============================================================
   LOAD TENANTS
============================================================ */
async function loadTenants() {
  const data = await api("/api/tenants");

  if (!data || !data.success) {
    console.error("Failed loading tenants:", data?.error);
    return;
  }

  tenants = data.tenants;
  renderTenantTable();
  updateStats();
}

/* ============================================================
   RENDER TENANT TABLE
============================================================ */
function renderTenantTable() {
  const tbody = document.getElementById("tenantTable");
  tbody.innerHTML = "";

  tenants.forEach(t => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td style="padding:8px 6px;">${t.slug}</td>
      <td style="padding:8px 6px;">${t.funeralHomeName}</td>
      <td style="padding:8px 6px;">${t.email}</td>
      <td style="padding:8px 6px;">${new Date(t.createdAt).toLocaleDateString()}</td>
      <td style="padding:8px 6px;">${t.status}</td>
      <td style="padding:8px 6px;">
        <button class="manage-btn" data-slug="${t.slug}"
                style="padding:6px 12px; border-radius:8px; border:none;
                background:linear-gradient(90deg,var(--blue1),var(--blue2));
                color:white; cursor:pointer;">
          Manage
        </button>
      </td>
    `;

    row.querySelector(".manage-btn").addEventListener("click", () => openDrawer(t.slug));

    tbody.appendChild(row);
  });
}

/* ============================================================
   UPDATE STAT CARDS
============================================================ */
function updateStats() {
  document.getElementById("statTotalTenants").textContent = tenants.length;
  document.getElementById("statActiveTenants").textContent =
    tenants.filter(t => t.status === "active").length;
  document.getElementById("statTrialTenants").textContent =
    tenants.filter(t => t.status === "trial").length;
  document.getElementById("statSuspendedTenants").textContent =
    tenants.filter(t => t.status === "suspended").length;
}

/* ============================================================
   SEARCH FILTER
============================================================ */
function setupSearch() {
  document.getElementById("searchInput").addEventListener("input", e => {
    const term = e.target.value.toLowerCase();
    const filtered = tenants.filter(t =>
      t.funeralHomeName.toLowerCase().includes(term) ||
      t.slug.toLowerCase().includes(term)
    );
    renderFilteredTable(filtered);
  });
}

function renderFilteredTable(list) {
  const tbody = document.getElementById("tenantTable");
  tbody.innerHTML = "";

  list.forEach(t => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="padding:8px 6px;">${t.slug}</td>
      <td style="padding:8px 6px;">${t.funeralHomeName}</td>
      <td style="padding:8px 6px;">${t.email}</td>
      <td style="padding:8px 6px;">${new Date(t.createdAt).toLocaleDateString()}</td>
      <td style="padding:8px 6px;">${t.status}</td>
      <td style="padding:8px 6px;">
        <button class="manage-btn" data-slug="${t.slug}"
                style="padding:6px 12px; border-radius:8px; border:none;
                background:linear-gradient(90deg,var(--blue1),var(--blue2));
                color:white; cursor:pointer;">
          Manage
        </button>
      </td>
    `;
    row.querySelector(".manage-btn").addEventListener("click", () => openDrawer(t.slug));
    tbody.appendChild(row);
  });
}

/* ============================================================
   CREATE TENANT MODAL
============================================================ */
function setupCreateTenantModal() {
  const modal = document.getElementById("createTenantModal");

  document.getElementById("createTenantBtn").onclick = () => {
    modal.style.display = "flex";
    document.getElementById("tenantKeyInput").value =
      "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  document.getElementById("cancelCreateTenant").onclick = () => {
    modal.style.display = "none";
  };

  document.getElementById("tenantNameInput").addEventListener("input", e => {
    const slug = e.target.value.trim().toLowerCase().replace(/\s+/g, "-");
    document.getElementById("tenantSlugInput").value = slug;
  });

  document.getElementById("confirmCreateTenant").onclick = async () => {
    const name = tenantNameInput.value.trim();
    const slug = tenantSlugInput.value.trim();
    const email = tenantEmailInput.value.trim();
    const key = tenantKeyInput.value.trim();

    if (!name || !slug || !email || !key) {
      alert("All fields required.");
      return;
    }

    const data = await api("/api/tenant", {
      method: "POST",
      body: JSON.stringify({ funeralHomeName: name, slug, email, adminKey: key })
    });

    if (data.success) {
      alert("Tenant created!");
      modal.style.display = "none";
      loadTenants();
    } else {
      alert("Error: " + data.error);
    }
  };
}

/* ============================================================
   MANAGE DRAWER
============================================================ */
function setupDrawer() {
  document.getElementById("closeDrawerBtn").onclick = () => closeDrawer();
  document.getElementById("drawerOverlay").onclick = () => closeDrawer();
}

function openDrawer(slug) {
  currentTenant = tenants.find(t => t.slug === slug);
  if (!currentTenant) return;

  drawerOpen = true;
  unsavedChanges = false;

  drawerName.value = currentTenant.funeralHomeName;
  drawerEmail.value = currentTenant.email;
  drawerLogo.value = currentTenant.logo || "";
  drawerColor.value = currentTenant.brandColor || "#306CDE";

  const featureList = document.getElementById("featureList");
  featureList.innerHTML = "";

  FEATURES.forEach(f => {
    const active = currentTenant.features?.[f] === true;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";

    row.innerHTML = `
      <span>${f}</span>
      <div class="toggle-switch ${active ? "active" : ""}" data-feature="${f}"
           style="width:46px; height:24px; border-radius:999px;
                  background:${active ? "var(--blue2)" : "rgba(255,255,255,0.2)"};
                  position:relative; cursor:pointer; transition:0.2s;">
        <div class="knob"
             style="width:18px; height:18px; background:white; border-radius:50%;
                    position:absolute; top:3px; left:${active ? "25px" : "3px"};
                    transition:0.2s;"></div>
      </div>
    `;

    row.querySelector(".toggle-switch").addEventListener("click", e => {
      const sw = e.currentTarget;
      const isActive = sw.classList.toggle("active");
      sw.style.background = isActive ? "var(--blue2)" : "rgba(255,255,255,0.2)";
      sw.querySelector(".knob").style.left = isActive ? "25px" : "3px";
      unsavedChanges = true;
    });

    featureList.appendChild(row);
  });

  document.getElementById("drawerOverlay").style.display = "block";
  document.getElementById("tenantDrawer").style.transform = "translateX(0)";
}

/* ============================================================
   CLOSE DRAWER
============================================================ */
function closeDrawer() {
  if (unsavedChanges && !confirm("You have unsaved changes. Close anyway?")) {
    return;
  }

  drawerOpen = false;
  document.getElementById("tenantDrawer").style.transform = "translateX(420px)";
  setTimeout(() => {
    document.getElementById("drawerOverlay").style.display = "none";
  }, 300);
}

/* ============================================================
   SAVE TENANT CHANGES
============================================================ */
document.getElementById("saveTenantBtn").onclick = async () => {
  if (!currentTenant) return;

  const payload = {
    funeralHomeName: drawerName.value.trim(),
    email: drawerEmail.value.trim(),
    logo: drawerLogo.value.trim(),
    brandColor: drawerColor.value,
    features: {}
  };

  document.querySelectorAll(".toggle-switch").forEach(sw => {
    payload.features[sw.dataset.feature] = sw.classList.contains("active");
  });

  const data = await api(`/api/tenant/${currentTenant.slug}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  if (data.success) {
    alert("Saved!");
    closeDrawer(true);
    loadTenants();
  } else {
    alert("Error: " + data.error);
  }
};

/* ============================================================
   THEME TOGGLE
============================================================ */
function setupThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  const knob = toggle.querySelector(".theme-toggle-knob");

  let theme = localStorage.getItem("we_theme") || "dark";
  document.body.className = "theme-" + theme;
  knob.style.left = theme === "dark" ? "25px" : "3px";

  toggle.onclick = () => {
    theme = theme === "dark" ? "light" : "dark";
    document.body.className = "theme-" + theme;
    knob.style.left = theme === "dark" ? "25px" : "3px";
    localStorage.setItem("we_theme", theme);
  };
}

/* ============================================================
   SIDEBAR AUTO COLLAPSE
============================================================ */
function setupSidebarCollapse() {
  const sidebar = document.getElementById("sidebar");

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      sidebar.classList.remove("open");
    }
  });
}
