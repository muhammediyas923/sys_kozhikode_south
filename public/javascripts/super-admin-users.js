/* Super Admin Users JS */
document.addEventListener('DOMContentLoaded', () => {
  const { showToast, openModal, closeModal, formatDate } = window.dsUtils;

  let users = [];
  let zones = [];
  let circles = [];
  let editingUserId = null;

  async function fetchLocations() {
    try {
      const zResp = await fetch('/api/zones');
      const zData = await zResp.json();
      if (zData.success) {
        zones = zData.zones;
        populateZoneSelects();
      }
    } catch (err) {
      showToast('Error loading locations.', 'danger');
    }
  }

  function populateZoneSelects() {
    const filterZone = document.getElementById('filter-zone');
    const formZone = document.getElementById('user-zone');

    filterZone.innerHTML = '<option value="">All Zones</option>' +
      zones.map(z => `<option value="${z.name}">${z.name}</option>`).join('');
    
    formZone.innerHTML = '<option value="">Select zone...</option>' +
      zones.map(z => `<option value="${z.name}" data-id="${z._id}">${z.name}</option>`).join('');
  }

  async function loadCirclesForZone(zoneName, selectElId) {
    const selectEl = document.getElementById(selectElId);
    if (!zoneName) {
      selectEl.innerHTML = '<option value="">Select circle...</option>';
      return;
    }
    try {
      const resp = await fetch(`/api/circles?zoneName=${encodeURIComponent(zoneName)}`);
      const data = await resp.json();
      if (data.success) {
        selectEl.innerHTML = (selectElId === 'filter-circle' ? '<option value="">All Circles</option>' : '<option value="">Select circle...</option>') +
          data.circles.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
      }
    } catch (err) {
      showToast('Error loading circles.', 'danger');
    }
  }

  // Handle Zone Select Change in filters & form
  document.getElementById('filter-zone').addEventListener('change', (e) => {
    loadCirclesForZone(e.target.value, 'filter-circle');
  });
  document.getElementById('user-zone').addEventListener('change', (e) => {
    loadCirclesForZone(e.target.value, 'user-circle');
  });

  async function fetchUsers() {
    try {
      const search = document.getElementById('user-search').value.trim();
      const zone = document.getElementById('filter-zone').value;
      const circle = document.getElementById('filter-circle').value;
      const status = document.getElementById('filter-status').value;

      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (zone) params.append('zone', zone);
      if (circle) params.append('circle', circle);
      if (status) params.append('status', status);

      const resp = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await resp.json();
      if (data.success) {
        users = data.users;
        renderUsersTable();
        updateUserCount();
      } else {
        showToast(data.message || 'Failed to load users.', 'danger');
      }
    } catch (err) {
      showToast('Error loading users.', 'danger');
    }
  }

  function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No users found.</td></tr>';
      return;
    }
    tbody.innerHTML = users.map((u, index) => `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(u.unitName)}</strong></td>
        <td>${escapeHtml(u.code || '—')}</td>
        <td><code>${escapeHtml(u.username)}</code></td>
        <td>${escapeHtml(u.zone || '—')}</td>
        <td>${escapeHtml(u.circle || '—')}</td>
        <td>
          <span class="ds-badge ${u.status === 'Active' ? 'ds-badge-success' : 'ds-badge-danger'}">
            ${escapeHtml(u.status)}
          </span>
        </td>
        <td>${formatDate(u.createdAt)}</td>
        <td>
          <button class="ds-btn ds-btn-outline ds-btn-sm edit-btn" data-id="${u._id}">
            <i class="ph ph-pencil-simple"></i> Edit
          </button>
          <button class="ds-btn ds-btn-outline ds-btn-sm toggle-status-btn" data-id="${u._id}" data-status="${escapeHtml(u.status)}">
            <i class="ph ${u.status === 'Active' ? 'ph-user-minus' : 'ph-user-check'}"></i> ${u.status === 'Active' ? 'Deactivate' : 'Activate'}
          </button>
          <button class="ds-btn ds-btn-warning ds-btn-sm reset-pw-btn" data-id="${u._id}" data-username="${escapeHtml(u.username)}">
            <i class="ph ph-key"></i> Password
          </button>
          <button class="ds-btn ds-btn-danger ds-btn-sm delete-btn" data-id="${u._id}" data-unitname="${escapeHtml(u.unitName)}">
            <i class="ph ph-trash"></i> Delete
          </button>
        </td>
      </tr>
    `).join('');

    // Attach Event Listeners
    tbody.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        editingUserId = id;
        try {
          const resp = await fetch(`/api/admin/users/${id}`);
          const data = await resp.json();
          if (data.success) {
            const u = data.user;
            document.getElementById('user-unitname').value = u.unitName;
            document.getElementById('user-code').value = u.code || '';
            document.getElementById('user-username').value = u.username;
            document.getElementById('user-zone').value = u.zone || '';
            
            // Wait to load circles, then set value
            await loadCirclesForZone(u.zone, 'user-circle');
            document.getElementById('user-circle').value = u.circle || '';

            // Password is not editable in edit modal (has separate reset flow)
            document.getElementById('password-field-group').classList.add('d-none');
            document.getElementById('user-modal-title').textContent = 'Edit Unit User';
            document.getElementById('user-modal-error').classList.add('d-none');
            openModal('user-modal');
          }
        } catch (err) {
          showToast('Failed to load user details.', 'danger');
        }
      });
    });

    tbody.querySelectorAll('.toggle-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const currentStatus = btn.dataset.status;
        const action = currentStatus === 'Active' ? 'deactivate' : 'activate';
        try {
          const resp = await fetch(`/api/admin/users/${id}/${action}`, { method: 'POST' });
          const data = await resp.json();
          if (data.success) {
            showToast(`User account ${currentStatus === 'Active' ? 'deactivated' : 'activated'} successfully.`, 'success');
            fetchUsers();
          }
        } catch (err) {
          showToast('Failed to change status.', 'danger');
        }
      });
    });

    tbody.querySelectorAll('.reset-pw-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editingUserId = btn.dataset.id;
        document.getElementById('reset-pw-username').textContent = btn.dataset.username;
        document.getElementById('new-pw').value = '';
        openModal('reset-pw-modal');
      });
    });

    tbody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editingUserId = btn.dataset.id;
        document.getElementById('delete-user-name').textContent = btn.dataset.unitname;
        openModal('delete-modal');
      });
    });
  }

  function updateUserCount() {
    const badge = document.getElementById('user-count-badge');
    if (badge) badge.textContent = users.length;
  }

  // Filters Button
  document.getElementById('filter-btn')?.addEventListener('click', fetchUsers);

  // Add User Trigger
  document.getElementById('add-user-btn')?.addEventListener('click', () => {
    editingUserId = null;
    document.getElementById('user-unitname').value = '';
    document.getElementById('user-code').value = '';
    document.getElementById('user-username').value = '';
    document.getElementById('user-zone').value = '';
    document.getElementById('user-circle').innerHTML = '<option value="">Select circle...</option>';
    document.getElementById('user-password').value = '';
    
    document.getElementById('password-field-group').classList.remove('d-none');
    document.getElementById('user-modal-title').textContent = 'Add Unit User';
    document.getElementById('user-modal-error').classList.add('d-none');
    openModal('user-modal');
  });

  // Modal Cancel/Close
  const closeUserModal = () => closeModal('user-modal');
  document.getElementById('user-modal-close')?.addEventListener('click', closeUserModal);
  document.getElementById('user-modal-cancel')?.addEventListener('click', closeUserModal);

  // User Save
  document.getElementById('user-modal-save')?.addEventListener('click', async () => {
    const unitName = document.getElementById('user-unitname').value.trim();
    const code = document.getElementById('user-code').value.trim();
    const username = document.getElementById('user-username').value.trim();
    const zone = document.getElementById('user-zone').value;
    const circle = document.getElementById('user-circle').value;
    const password = document.getElementById('user-password').value.trim();
    const errorEl = document.getElementById('user-modal-error');

    if (!unitName || !username || !zone || !circle || (!editingUserId && !password)) {
      errorEl.textContent = 'All fields marked with * are required.';
      errorEl.classList.remove('d-none');
      return;
    }

    const payload = { unitName, code, username, zone, circle };
    if (!editingUserId) payload.password = password;

    try {
      const url = editingUserId ? `/api/admin/users/${editingUserId}` : '/api/admin/users';
      const method = editingUserId ? 'PUT' : 'POST';
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data.success) {
        showToast(editingUserId ? 'User updated successfully.' : 'User created successfully.', 'success');
        closeUserModal();
        fetchUsers();
      } else {
        errorEl.textContent = data.message || 'Failed to save user.';
        errorEl.classList.remove('d-none');
      }
    } catch (err) {
      errorEl.textContent = 'Error connecting to server.';
      errorEl.classList.remove('d-none');
    }
  });

  // Reset Password Modal Actions
  const closeResetPwModal = () => closeModal('reset-pw-modal');
  document.getElementById('reset-pw-close')?.addEventListener('click', closeResetPwModal);
  document.getElementById('reset-pw-cancel')?.addEventListener('click', closeResetPwModal);

  document.getElementById('reset-pw-confirm')?.addEventListener('click', async () => {
    const newPassword = document.getElementById('new-pw').value.trim();
    if (!newPassword) {
      showToast('Please enter a new password.', 'warning');
      return;
    }
    try {
      const resp = await fetch(`/api/admin/users/${editingUserId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await resp.json();
      if (data.success) {
        showToast('Password reset successfully.', 'success');
        closeResetPwModal();
      } else {
        showToast(data.message || 'Failed to reset password.', 'danger');
      }
    } catch (err) {
      showToast('Error connecting to server.', 'danger');
    }
  });

  // Delete User Modal Actions
  const closeDeleteModal = () => closeModal('delete-modal');
  document.getElementById('delete-modal-close')?.addEventListener('click', closeDeleteModal);
  document.getElementById('delete-cancel')?.addEventListener('click', closeDeleteModal);

  document.getElementById('delete-confirm')?.addEventListener('click', async () => {
    if (!editingUserId) return;
    try {
      const resp = await fetch(`/api/admin/users/${editingUserId}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.success) {
        showToast('User deleted successfully.', 'success');
        closeDeleteModal();
        fetchUsers();
      } else {
        showToast(data.message || 'Failed to delete user.', 'danger');
      }
    } catch (err) {
      showToast('Error connecting to server.', 'danger');
    }
  });

  // Init
  async function init() {
    await fetchLocations();
    await fetchUsers();
  }
  init();
});
