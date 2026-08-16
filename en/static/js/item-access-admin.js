// =====================================================
// item-access-admin.js — Admin UI for item-level access
// Uses the tenant admin layout CSS classes
// =====================================================

const ITEM_ACCESS_RESOURCES = [
  { key: 'casinos',          label: 'Casinos' },
  { key: 'reviews',          label: 'Reviews' },
  { key: 'news',             label: 'News' },
  { key: 'pages',            label: 'Pages' },
  { key: 'platform-updates', label: 'Platform Updates' },
  { key: 'media',            label: 'Media' }
];

const ITEM_ACCESS_ACTIONS = [
  { key: 'read',   label: 'Read' },
  { key: 'create', label: 'Create' },
  { key: 'update', label: 'Update' },
  { key: 'delete', label: 'Delete' }
];

const SCOPE_OPTIONS = [
  { value: 'all',      label: 'All' },
  { value: 'own',      label: 'Own' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'none',     label: 'None' }
];

let itemAccessUsers = [];
let itemAccessCurrentUser = null;
let itemAccessMatrix = {};
let itemAccessDefaultScope = 'all';

// ── Init ───────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('itemAccessContent')) return;
  initItemAccess();
});

async function initItemAccess() {
  await loadDefaultScope();
  await loadItemAccessUsers();
  setupUserSelector();
}

// ── Default Scope ──────────────────────

async function loadDefaultScope() {
  try {
    const res = await fetch('/en/api/v1/admin/item-access/default-scope');
    const data = await res.json();
    if (data.success) {
      itemAccessDefaultScope = data.scope;
      const select = document.getElementById('defaultScopeSelect');
      if (select) select.value = itemAccessDefaultScope;
    }
  } catch (e) {
    console.error('Failed to load default scope:', e);
  }
}

async function saveDefaultScope() {
  const select = document.getElementById('defaultScopeSelect');
  const status = document.getElementById('defaultScopeStatus');
  if (!select || !status) return;

  const scope = select.value;
  status.textContent = 'Saving…';

  try {
    const res = await fetch('/en/api/v1/admin/item-access/default-scope', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope })
    });
    const data = await res.json();
    if (data.success) {
      itemAccessDefaultScope = scope;
      status.textContent = '✓ Saved';
      status.style.color = '#27ae60';
      setTimeout(() => { status.textContent = ''; }, 2000);
    } else {
      status.textContent = '✗ ' + (data.error || 'Failed');
      status.style.color = '#e74c3c';
    }
  } catch (e) {
    status.textContent = '✗ Error';
    status.style.color = '#e74c3c';
  }
}

// ── User Loading ───────────────────────

async function loadItemAccessUsers() {
  try {
    const res = await fetch('/en/api/v1/admin/users');
    const data = await res.json();
    itemAccessUsers = data.users || [];
  } catch (e) {
    console.error('Failed to load users:', e);
    showAlert('Failed to load users.', 'error');
  }
}

function setupUserSelector() {
  const select = document.getElementById('itemAccessUserSelect');
  if (!select) return;

  select.innerHTML = '<option value="">Select a user…</option>' +
    itemAccessUsers
      .filter(u => u.role !== 'admin')
      .map(u => `<option value="${u.id}">${u.email} (${u.role})</option>`)
      .join('');
}

// ── Load User Access Rules ─────────────

async function loadUserItemAccess() {
  const select = document.getElementById('itemAccessUserSelect');
  const userId = parseInt(select?.value, 10);
  if (!userId) {
    document.getElementById('itemAccessContent').innerHTML = '';
    return;
  }

  itemAccessCurrentUser = userId;

  try {
    const res = await fetch(`/en/api/v1/admin/item-access/user?user_id=${userId}`);
    const data = await res.json();

    if (!data.success) {
      showAlert(data.error || 'Failed to load access rules.', 'error');
      return;
    }

    itemAccessMatrix = {};
    for (const rule of (data.access || [])) {
      const key = `${rule.resource}|${rule.action}`;
      itemAccessMatrix[key] = rule.scope;
    }

    renderItemAccessMatrix();
    renderAssignmentPanel();
  } catch (e) {
    showAlert('Failed to load access rules: ' + e.message, 'error');
  }
}

// ── Render Access Matrix ───────────────

function renderItemAccessMatrix() {
  const container = document.getElementById('itemAccessContent');
  if (!container) return;

  const userLabel = itemAccessUsers.find(u => u.id === itemAccessCurrentUser)?.email || '';

  let html = `
    <div class="admin-section">
      <h2>Access Matrix — ${userLabel}</h2>
      <p class="muted" style="margin-bottom:16px">
        Controls <strong>which records</strong> this user can access for each resource and action.
        "All" = all records, "Own" = only records they created, "Assigned" = only explicitly assigned records, "None" = no records.
      </p>
      <div style="overflow-x:auto">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Resource</th>
              ${ITEM_ACCESS_ACTIONS.map(a => `<th style="text-align:center">${a.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
  `;

  for (const resource of ITEM_ACCESS_RESOURCES) {
    html += `<tr><td><strong>${resource.label}</strong></td>`;
    for (const action of ITEM_ACCESS_ACTIONS) {
      const key = `${resource.key}|${action.key}`;
      const currentScope = itemAccessMatrix[key] || itemAccessDefaultScope;
      html += `<td style="text-align:center">
        <select
          data-resource="${resource.key}"
          data-action="${action.key}"
          onchange="saveItemAccessScope(this)"
          style="min-width:90px"
        >
          ${SCOPE_OPTIONS.map(opt =>
            `<option value="${opt.value}" ${currentScope === opt.value ? 'selected' : ''}>${opt.label}</option>`
          ).join('')}
        </select>
      </td>`;
    }
    html += '</tr>';
  }

  html += `
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ── Render Assignment Panel ────────────

function renderAssignmentPanel() {
  const container = document.getElementById('itemAccessContent');
  if (!container) return;

  let html = container.innerHTML;

  html += `
    <div class="admin-section" style="margin-top:40px">
      <h2>Item Assignments</h2>
      <p class="muted" style="margin-bottom:16px">
        Assign specific records to this user. Used when scope is set to <strong>Assigned</strong>.
      </p>
      <div class="form-row" style="margin-bottom:16px">
        <div class="form-group">
          <label>Select Resource</label>
          <select id="assignResourceSelect" onchange="loadAssignmentList()">
            <option value="">Select a resource…</option>
            ${ITEM_ACCESS_RESOURCES.map(r => `<option value="${r.key}">${r.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="assignmentList"></div>
    </div>
  `;

  container.innerHTML = html;
}

// ── Save Scope ─────────────────────────

async function saveItemAccessScope(selectEl) {
  const resource = selectEl.dataset.resource;
  const action = selectEl.dataset.action;
  const scope = selectEl.value;

  try {
    const res = await fetch('/en/api/v1/admin/item-access/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: itemAccessCurrentUser,
        resource,
        action,
        scope
      })
    });
    const data = await res.json();
    if (data.success) {
      // Brief visual feedback
      const originalBg = selectEl.style.backgroundColor;
      selectEl.style.backgroundColor = '#d4edda';
      setTimeout(() => { selectEl.style.backgroundColor = originalBg; }, 800);
    } else {
      showAlert(data.error || 'Failed to save scope.', 'error');
      loadUserItemAccess();
    }
  } catch (e) {
    showAlert('Failed to save: ' + e.message, 'error');
  }
}

// ── Assignment List ─────────────────────

async function loadAssignmentList() {
  const resource = document.getElementById('assignResourceSelect')?.value;
  const listEl = document.getElementById('assignmentList');
  if (!resource || !listEl) return;

  listEl.innerHTML = '<p class="muted">Loading…</p>';

  try {
    // Get user's assigned items
    const assignRes = await fetch(
      `/en/api/v1/admin/item-access/assignments?user_id=${itemAccessCurrentUser}&resource=${resource}`
    );
    const assignData = await assignRes.json();
    const assignedIds = new Set(assignData.item_ids || []);

    // Get all items for this resource
    const endpointMap = {
      'casinos': '/en/api/v1/casinos/list',
      'reviews': '/en/api/v1/reviews/list',
      'news': '/en/api/v1/news/list',
      'pages': '/en/api/v1/pages/list',
      'platform-updates': '/en/api/v1/platform-updates/list',
      'media': '/en/api/v1/media/browse'
    };

    const listRes = await fetch(endpointMap[resource] || '');
    const listData = await listRes.json();

    let items = [];
    let idKey = 'id';
    let labelKey = 'name';

    if (resource === 'casinos') {
      items = listData.casinos || [];
    } else if (resource === 'reviews') {
      items = listData.reviews || [];
      labelKey = 'title';
    } else if (resource === 'news') {
      items = listData.news || [];
      labelKey = 'title';
    } else if (resource === 'pages') {
      items = listData.pages || [];
      labelKey = 'title';
    } else if (resource === 'platform-updates') {
      items = listData.updates || [];
      labelKey = 'title';
    } else if (resource === 'media') {
      items = listData.items || [];
      labelKey = 'filename';
    }

    if (items.length === 0) {
      listEl.innerHTML = '<p class="muted">No items found.</p>';
      return;
    }

    let html = `
      <div style="overflow-x:auto">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Item</th>
              <th style="text-align:center;width:100px">Assigned</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const item of items) {
      const itemId = item[idKey];
      const isAssigned = assignedIds.has(itemId);
      const label = item[labelKey] || item.slug || itemId;
      html += `<tr>
        <td>${label}</td>
        <td style="text-align:center">
          <input type="checkbox"
            ${isAssigned ? 'checked' : ''}
            onchange="toggleItemAccessAssignment(${itemId}, this.checked, '${resource}')"
          />
        </td>
      </tr>`;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = `<p class="alert">Failed to load: ${e.message}</p>`;
  }
}

// ── Toggle Assignment ──────────────────

async function toggleItemAccessAssignment(itemId, checked, resource) {
  const endpoint = checked ? 'assign' : 'unassign';
  try {
    const res = await fetch(`/en/api/v1/admin/item-access/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: itemAccessCurrentUser,
        resource,
        item_id: itemId
      })
    });
    const data = await res.json();
    if (!data.success) {
      showAlert(data.error || 'Failed to update assignment.', 'error');
      loadAssignmentList();
    }
  } catch (e) {
    showAlert('Failed: ' + e.message, 'error');
    loadAssignmentList();
  }
}

// ── Alert Helper ───────────────────────

function showAlert(message, type) {
  const alert = document.getElementById('itemAccessAlert');
  if (!alert) return;
  alert.textContent = message;
  alert.style.display = 'block';
  alert.className = 'alert' + (type === 'error' ? ' alert--error' : '');
  setTimeout(() => { alert.style.display = 'none'; }, 4000);
}

// ── Expose for inline handlers ────────

window.saveDefaultScope = saveDefaultScope;
window.loadUserItemAccess = loadUserItemAccess;
window.saveItemAccessScope = saveItemAccessScope;
window.loadAssignmentList = loadAssignmentList;
window.toggleItemAccessAssignment = toggleItemAccessAssignment;
