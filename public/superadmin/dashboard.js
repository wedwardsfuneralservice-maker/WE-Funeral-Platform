/* ---------------------------------------------------------
   SUPERADMIN DASHBOARD — JS CONTROLLER
------------------------------------------------------------*/

// Elements
const searchInput = document.getElementById("searchInput");
const tenantTable = document.getElementById("tenantTable");

const modal = document.getElementById("createTenantModal");
const openCreateModalBtn = document.getElementById("openCreateModal");
const closeCreateModalBtn = document.getElementById("closeCreateModal");
const createTenantBtn = document.getElementById("createTenantBtn");

const themeToggle = document.getElementById("themeToggle");
const body = document.body;

const yearSpan = document.getElementById("yearSpan");

// Inputs inside modal
const tenantNameInput = document.getElementById("tenantNameInput");
const tenantSlugInput = document.getElementById("tenantSlugInput");
const tenantEmailInput = document.getElementById("tenantEmailInput");
const tenantKeyInput = document.getElementById("tenantKeyInput");
const tenantLogoInput = document.getElementById("tenantLogoInput");
const tenantStatusInput = document.getElementById("tenantStatusInput");

// Stat cards
const statTotalTenants = document.getElementById("statTotalTenants");
const statActiveTenants = document.getElementById("statActiveTenants");
const statTrialTenants = document.getElementById("statTrialTenants");
const statSuspendedTenants = document.getElementById("statSuspendedTenants");

const tenantCountBadge = document.getElementById("tenantCountBadge");


// Current tenant cache
let tenants = [];

yearSpan.textContent = new Date().getFullYear();


/* ---------------------------------------------------------
   1. LOAD TENANTS
------------------------------------------------------------*/
async function loadTenants() {
    try {
        const res = await fetch("/superadmin/api/tenants");
        const data = await res.json();

        if (!data.success) {
            console.error("Tenant load error:", data.error);
            return;
        }

        tenants = data.tenants || [];

        renderTenantTable();
        updateStats();

    } catch (err) {
        console.error("Error fetching tenants:", err);
    }
}


/* ---------------------------------------------------------
   2. RENDER TABLE
------------------------------------------------------------*/
function renderTenantTable() {
    tenantTable.innerHTML = "";

    tenants.forEach(t => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${t.slug}</td>
            <td>${t.funeralHomeName}</td>
            <td>${t.email}</td>
            <td>${new Date(t.createdAt).toLocaleDateString()}</td>
            <td><span class="status-pill status-${t.status}">${t.status}</span></td>
            <td>
                <button class="manage-btn" onclick="openManageDrawer('${t._id}')">
                    Manage
                </button>
            </td>
        `;

        tenantTable.appendChild(tr);
    });

    tenantCountBadge.textContent = tenants.length;
}


/* ---------------------------------------------------------
   3. UPDATE STAT CARDS
------------------------------------------------------------*/
function updateStats() {
    statTotalTenants.textContent = tenants.length;

    statActiveTenants.textContent = tenants.filter(t => t.status === "active").length;
    statTrialTenants.textContent = tenants.filter(t => t.status === "trial").length;
    statSuspendedTenants.textContent = tenants.filter(t => t.status === "suspended").length;
}


/* ---------------------------------------------------------
   4. SEARCH FILTER
------------------------------------------------------------*/
searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();

    const filtered = tenants.filter(t =>
        t.slug.toLowerCase().includes(q) ||
        t.funeralHomeName.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q)
    );

    tenantTable.innerHTML = "";

    filtered.forEach(t => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${t.slug}</td>
            <td>${t.funeralHomeName}</td>
            <td>${t.email}</td>
            <td>${new Date(t.createdAt).toLocaleDateString()}</td>
            <td><span class="status-pill status-${t.status}">${t.status}</span></td>
            <td><button class="manage-btn">Manage</button></td>
        `;

        tenantTable.appendChild(tr);
    });
});


/* ---------------------------------------------------------
   5. OPEN / CLOSE MODAL
------------------------------------------------------------*/
openCreateModalBtn.addEventListener("click", () => {
    modal.classList.add("visible");
});

closeCreateModalBtn.addEventListener("click", () => {
    modal.classList.remove("visible");
});


/* ---------------------------------------------------------
   6. CREATE TENANT
------------------------------------------------------------*/
createTenantBtn.addEventListener("click", async () => {
    const slug = tenantSlugInput.value.trim();
    const funeralHomeName = tenantNameInput.value.trim();
    const email = tenantEmailInput.value.trim();
    const adminKey = tenantKeyInput.value.trim();
    const logo = tenantLogoInput.value.trim();
    const status = tenantStatusInput.value.trim();

    if (!slug || !funeralHomeName || !email || !adminKey) {
        alert("All required fields must be filled.");
        return;
    }

    try {
        const res = await fetch("/superadmin/api/tenants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                slug,
                funeralHomeName,
                email,
                adminKey,
                logo,
                status
            })
        });

        const data = await res.json();

        if (!data.success) {
            alert("Error: " + data.error);
            return;
        }

        modal.classList.remove("visible");
        await loadTenants();

    } catch (err) {
        console.error("Create tenant error:", err);
    }
});


/* ---------------------------------------------------------
   7. DARK / LIGHT MODE TOGGLE
------------------------------------------------------------*/
themeToggle.addEventListener("click", () => {
    body.classList.toggle("theme-light");
    body.classList.toggle("theme-dark");
});


/* ---------------------------------------------------------
   8. MANAGE DRAWER (placeholder)
------------------------------------------------------------*/
function openManageDrawer(tenantId) {
    alert("Manage drawer coming soon for tenant ID: " + tenantId);
}

window.openManageDrawer = openManageDrawer;


/* ---------------------------------------------------------
   INITIALIZE
------------------------------------------------------------*/
loadTenants();
