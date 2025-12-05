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
   SECURE FETCH WRAPPER
============================================================ */
async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
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
  const data = await api("/superadmin/api/tenants");  // FIXED PATH

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
   CREATE TENANT MODAL
============================================================ */
function setupCreateTenantModal() {
  const modal = document.getElementById("createTenantModal");

  document.getElementById("createTenantBtn").onclick = () => {
    modal.style.display = "flex";
    tenantKeyInput.value = "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  document.getElementById("cancelCreateTenant").onclick = () => {
    modal.style.display = "none";
  };

  tenantNameInput.addEventListener("input", e => {
    tenantSlugInput.value = e.target.value.trim().toLowerCase().replace(/\s+/g, "-");
  });

  document.getElementById("confirmCreateTenant").onclick = async () => {
    const payload = {
      funeralHomeName: tenantNameInput.value.trim(),
      slug: tenantSlugInput.value.trim(),
      email: tenantEmailInput.value.trim(),
      adminKey: tenantKeyInput.value.trim()
    };

    const data = await api("/superadmin/api/tenants", {   // FIXED PATH
      method: "POST",
      body: JSON.stringify(payload)
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
   OPEN DRAWER
============================================================ */
function openDrawer(slug) {
  currentTenant = tenants.find(t => t.slug === slug);
  if (!currentTenant) return;

  drawerName.value = currentTenant.funeralHomeName;
  drawerEmail.value = currentTenant.email;
  drawerLogo.value = currentTenant.logo || "";
  drawerColor.value = currentTenant.brandColor || "#306CDE";

  renderFeatureToggles(currentTenant);

  drawerOverlay.style.display = "block";
  tenantDrawer.style.transform = "translateX(0)";
}

/* ============================================================
   SAVE CHANGES
============================================================ */
saveTenantBtn.onclick = async () => {
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

  const data = await api(`/superadmin/api/tenant/${currentTenant.slug}`, {  // FIXED PATH
    method: "PUT",
    body: JSON.stringify(payload)
  });

  if (data.success) {
    alert("Saved!");
    closeDrawer();
    loadTenants();
  } else {
    alert("Error: " + data.error);
  }
};
