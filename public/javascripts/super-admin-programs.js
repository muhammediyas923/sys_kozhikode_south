/* Super Admin Programs JS */
document.addEventListener('DOMContentLoaded', () => {
  const { showToast, openModal, closeModal, formatDate } = window.dsUtils;

  let programs = [];
  let editingProgramId = null;
  let selectedFiles = [];

  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const fileList = document.getElementById('file-list');

  async function fetchPrograms() {
    try {
      const resp = await fetch('/api/admin/programs');
      const data = await resp.json();
      if (data.success) {
        programs = data.programs;
        renderProgramsTable();
        updateProgramCount();
      } else {
        showToast(data.message || 'Failed to load programs.', 'danger');
      }
    } catch (err) {
      showToast('Error loading programs.', 'danger');
    }
  }

  function renderProgramsTable() {
    const tbody = document.getElementById('programs-table-body');
    if (!programs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No programs created yet.</td></tr>';
      return;
    }
    tbody.innerHTML = programs.map((p, index) => {
      const statusBadge = p.published
        ? '<span class="ds-badge ds-badge-success">Published</span>'
        : '<span class="ds-badge ds-badge-muted">Draft</span>';

      const roleVal = Array.isArray(p.assignTo) && p.assignTo.length ? p.assignTo[0] : (typeof p.assignTo === 'string' ? p.assignTo : 'UnitUser');
      let assignBadge = '<span class="ds-badge ds-badge-info"><i class="ph ph-users me-1"></i> Unit Users</span>';
      if (roleVal === 'CircleUser' || roleVal === 'CIRCLE') {
        assignBadge = '<span class="ds-badge ds-badge-warning"><i class="ph ph-circles-three me-1"></i> Circle Users</span>';
      } else if (roleVal === 'ZoneUser' || roleVal === 'ZONE') {
        assignBadge = '<span class="ds-badge" style="background:#f3e8ff; color:#6b21a8; font-weight:600;"><i class="ph ph-map-pin me-1"></i> Zone Users</span>';
      }

      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${p.title}</strong></td>
          <td>${assignBadge}</td>
          <td>${statusBadge}</td>
          <td>${formatDate(p.createdAt)}</td>
          <td>
            <button class="ds-btn ds-btn-outline ds-btn-sm edit-btn" data-id="${p._id}"><i class="ph ph-pencil-simple"></i> Edit</button>
            <button class="ds-btn ds-btn-outline ds-btn-sm toggle-publish-btn" data-id="${p._id}" data-published="${p.published}">
              <i class="ph ${p.published ? 'ph-eye-closed' : 'ph-eye'}"></i> ${p.published ? 'Unpublish' : 'Publish'}
            </button>
            <button class="ds-btn ds-btn-danger ds-btn-sm delete-btn" data-id="${p._id}" data-title="${p.title}"><i class="ph ph-trash"></i> Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    // Table actions event delegation
    tbody.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        editingProgramId = id;
        try {
          const resp = await fetch(`/api/admin/programs`);
          const data = await resp.json();
          if (data.success) {
            const p = data.programs.find(item => item._id === id);
            if (p) {
              document.getElementById('prog-title').value = p.title;
              document.getElementById('prog-desc').value = p.description || '';
              document.getElementById('prog-due').value = p.dueDate ? p.dueDate.substring(0, 10) : '';
              document.getElementById('prog-required-count').value = p.requiredCount || 1;

              const roleVal = Array.isArray(p.assignTo) && p.assignTo.length ? p.assignTo[0] : (typeof p.assignTo === 'string' ? p.assignTo : 'UnitUser');
              document.querySelectorAll('input[name="assignTo"]').forEach(cb => cb.checked = false);
              const radio = document.querySelector(`input[name="assignTo"][value="${roleVal}"]`);
              if (radio) radio.checked = true;

              // Check if completions exist to lock assignTo selection
              try {
                const compResp = await fetch(`/api/admin/programs/${id}/completions`);
                const compData = await compResp.json();
                const hasCompletions = compData.completions && compData.completions.length > 0;
                const radios = document.querySelectorAll('input[name="assignTo"]');
                const lockNote = document.getElementById('assign-lock-note');
                radios.forEach(r => r.disabled = hasCompletions);
                if (lockNote) {
                  if (hasCompletions) lockNote.classList.remove('d-none');
                  else lockNote.classList.add('d-none');
                }
              } catch (cErr) {
                /* ignore lock check error */
              }

              selectedFiles = [];
              renderSelectedFiles();

              if (p.attachments && p.attachments.length) {
                fileList.innerHTML = '<label class="ds-form-label mt-2">Current Attachments:</label>' +
                  p.attachments.map(att => `<div class="d-flex align-items-center justify-content-between p-2 border rounded mb-1 bg-light"><span><i class="ph ph-file"></i> ${att.originalName}</span></div>`).join('');
              }

              document.getElementById('program-modal-title').textContent = 'Edit Program';
              document.getElementById('program-modal-error').classList.add('d-none');
              openModal('program-modal');
            }
          }
        } catch (err) {
          showToast('Failed to load program details.', 'danger');
        }
      });
    });

    tbody.querySelectorAll('.toggle-publish-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const isPublished = btn.dataset.published === 'true';
        const endpoint = isPublished ? 'unpublish' : 'publish';
        try {
          const resp = await fetch(`/api/admin/programs/${id}/${endpoint}`, { method: 'POST' });
          const data = await resp.json();
          if (data.success) {
            showToast(isPublished ? 'Program unpublished (moved to drafts).' : 'Program published to assigned user type!', 'success');
            fetchPrograms();
          }
        } catch (err) {
          showToast('Action failed.', 'danger');
        }
      });
    });

    tbody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editingProgramId = btn.dataset.id;
        document.getElementById('delete-prog-title').textContent = btn.dataset.title;
        openModal('delete-modal');
      });
    });
  }

  function updateProgramCount() {
    const badge = document.getElementById('program-count-badge');
    if (badge) badge.textContent = programs.length;
  }

  // Upload drag & drop handles
  uploadZone?.addEventListener('click', () => fileInput.click());
  uploadZone?.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length) {
      addFiles(e.target.files);
    }
  });

  function addFiles(filesList) {
    for (let i = 0; i < filesList.length; i++) {
      selectedFiles.push(filesList[i]);
    }
    renderSelectedFiles();
  }

  function renderSelectedFiles() {
    if (!selectedFiles.length) {
      fileList.innerHTML = '';
      return;
    }
    fileList.innerHTML = '<label class="ds-form-label mt-2">New Files to Upload:</label>' +
      selectedFiles.map((f, i) => `
        <div class="d-flex align-items-center justify-content-between p-2 border rounded mb-1 bg-white">
          <span class="text-truncate" style="max-width:300px;"><i class="ph ph-file"></i> ${f.name} <small class="text-muted">(${(f.size / 1024 / 1024).toFixed(2)} MB)</small></span>
          <button type="button" class="btn-close remove-file-btn" data-index="${i}"></button>
        </div>
      `).join('');

    fileList.querySelectorAll('.remove-file-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        selectedFiles.splice(idx, 1);
        renderSelectedFiles();
      });
    });
  }

  document.getElementById('add-program-btn')?.addEventListener('click', () => {
    editingProgramId = null;
    selectedFiles = [];
    document.getElementById('program-form').reset();
    document.getElementById('assign-error').classList.add('d-none');
    document.getElementById('assign-lock-note')?.classList.add('d-none');
    document.querySelectorAll('input[name="assignTo"]').forEach(cb => { cb.checked = false; cb.disabled = false; });
    const defaultRadio = document.querySelector('input[name="assignTo"][value="UnitUser"]');
    if (defaultRadio) defaultRadio.checked = true;
    renderSelectedFiles();
    document.getElementById('program-modal-title').textContent = 'Create Program';
    document.getElementById('program-modal-error').classList.add('d-none');
    openModal('program-modal');
  });

  const closeProgramModal = () => closeModal('program-modal');
  document.getElementById('program-modal-close')?.addEventListener('click', closeProgramModal);
  document.getElementById('program-modal-cancel')?.addEventListener('click', closeProgramModal);

  // Save Program
  document.getElementById('program-modal-save')?.addEventListener('click', async () => {
    const title = document.getElementById('prog-title').value.trim();
    const description = document.getElementById('prog-desc').value.trim();
    const dueDate = document.getElementById('prog-due').value;
    const errorEl = document.getElementById('program-modal-error');

    if (!title) {
      errorEl.textContent = 'Program title is required.';
      errorEl.classList.remove('d-none');
      return;
    }

    const requiredCount = document.getElementById('prog-required-count')?.value || 1;

    const selectedRadio = document.querySelector('input[name="assignTo"]:checked');
    if (!selectedRadio) {
      document.getElementById('assign-error').classList.remove('d-none');
      return;
    }
    document.getElementById('assign-error').classList.add('d-none');
    const assignTo = [selectedRadio.value];

    if (assignTo.length === 0) {
      document.getElementById('assign-error').classList.remove('d-none');
      return;
    } else {
      document.getElementById('assign-error').classList.add('d-none');
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    if (dueDate) formData.append('dueDate', dueDate);
    formData.append('requiredCount', requiredCount);

    assignTo.forEach(role => formData.append('assignTo', role));

    selectedFiles.forEach(file => {
      formData.append('attachments', file);
    });

    try {
      const url = editingProgramId ? `/api/admin/programs/${editingProgramId}` : '/api/admin/programs';
      const method = editingProgramId ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        body: formData // Multer handles multipart upload
      });
      const data = await resp.json();
      if (data.success) {
        showToast(editingProgramId ? 'Program updated.' : 'Program created successfully as draft.', 'success');
        closeProgramModal();
        fetchPrograms();
      } else {
        errorEl.textContent = data.message || 'Failed to save program.';
        errorEl.classList.remove('d-none');
      }
    } catch (err) {
      errorEl.textContent = 'Error saving program file.';
      errorEl.classList.remove('d-none');
    }
  });

  // Delete Modals
  const closeDeleteModal = () => closeModal('delete-modal');
  document.getElementById('delete-modal-close')?.addEventListener('click', closeDeleteModal);
  document.getElementById('delete-cancel')?.addEventListener('click', closeDeleteModal);

  document.getElementById('delete-confirm')?.addEventListener('click', async () => {
    if (!editingProgramId) return;
    try {
      const resp = await fetch(`/api/admin/programs/${editingProgramId}`, { method: 'DELETE' });
      const data = await resp.json();
      if (data.success) {
        showToast('Program deleted successfully.', 'success');
        closeDeleteModal();
        fetchPrograms();
      } else {
        showToast(data.message || 'Failed to delete program.', 'danger');
      }
    } catch (err) {
      showToast('Error deleting program.', 'danger');
    }
  });

  // ── Completions Modal ────────────────────────────────────────────────
  async function openCompletionsModal(programId, programTitle) {
    document.getElementById('completions-modal-title').innerHTML =
      `<i class="ph ph-users"></i> Completions — ${programTitle}`;
    document.getElementById('completions-modal-body').innerHTML =
      '<div class="ds-loading-overlay"><div class="ds-spinner"></div></div>';
    openModal('completions-modal');

    try {
      const resp = await fetch(`/api/admin/programs/${programId}/completions`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.message || 'Failed to load');

      const completions = data.completions || [];
      const groupedStats = data.groupedStats || {};
      const prog = data.program || {};
      const assignTo = prog.assignTo || ['UnitUser'];

      let html = '';

      const roleMap = {
        'UnitUser': 'Unit Users',
        'CircleUser': 'Circle Users',
        'ZoneUser': 'Zone Users'
      };

      for (const role of assignTo) {
        const stats = groupedStats[role] || { target: 0, completed: 0, remaining: 0, progress: 0, status: 'Pending' };

        html += `
          <div class="ds-card mb-4" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: none;">
            <div class="ds-card-header bg-light d-flex justify-content-between align-items-center p-3">
              <h5 class="mb-0 fw-bold" style="color: #1e293b;"><i class="ph ph-users"></i> ${roleMap[role] || role}</h5>
              <span class="ds-badge ds-badge-${stats.status === 'Completed' ? 'success' : 'primary'}">${stats.status}</span>
            </div>
            <div class="ds-card-body p-3">
              <div class="d-flex justify-content-between mb-2">
                <span class="ds-text-sm fw-medium">Progress</span>
                <span class="ds-text-sm fw-bold">${stats.progress}%</span>
              </div>
              <div class="ds-progress-bar mb-3" style="height: 10px; background: #e2e8f0; border-radius: 999px; overflow: hidden;">
                <div class="ds-progress-fill" style="width: ${stats.progress}%; height: 100%; background: var(--color-primary);"></div>
              </div>
              
              <div class="row text-center" style="font-size: 0.85rem;">
                <div class="col-4">
                  <div class="text-muted mb-1">Target</div>
                  <div class="fw-bold" style="font-size: 1.1rem; color: #334155;">${stats.target}</div>
                </div>
                <div class="col-4 border-start border-end">
                  <div class="text-muted mb-1">Completed</div>
                  <div class="fw-bold text-success" style="font-size: 1.1rem;">${stats.completed}</div>
                </div>
                <div class="col-4">
                  <div class="text-muted mb-1">Remaining</div>
                  <div class="fw-bold text-danger" style="font-size: 1.1rem;">${stats.remaining}</div>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      if (!completions.length) {
        html += '<div class="ds-empty mt-4" style="padding:40px;"><i class="ph ph-users ds-empty-icon"></i><h3>No completions yet</h3><p>No users have submitted a completion for this program.</p></div>';
        document.getElementById('completions-modal-body').innerHTML = html;
        return;
      }

      html += `
        <hr class="my-4">
        <h5 class="mb-3 fw-bold text-dark">Detailed Completions</h5>
        <div class="ds-table-wrapper" style="max-height:40vh; overflow-y:auto; border-bottom:1px solid #e2e8f0;">
          <table class="ds-table" style="vertical-align:middle; margin-bottom:0;">
            <thead>
              <tr>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">User Role</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">User Info</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Progress</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Date</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Notes</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Images</th>
              </tr>
            </thead>
            <tbody>
              ${completions.map(c => {
        const requiredCount = prog.requiredCount || 1;
        const count = c.completionCount || 1;
        const pct = Math.min(100, Math.round((count / requiredCount) * 100));
        const images = Array.isArray(c.images) ? c.images : [];

        // Determine role display logic based on available data
        let roleDisplay = '<span class="ds-badge ds-badge-muted">Unit</span>';
        if (!c.unitName && c.circle) roleDisplay = '<span class="ds-badge ds-badge-primary">Circle</span>';
        if (!c.unitName && !c.circle && c.zone) roleDisplay = '<span class="ds-badge ds-badge-success">Zone</span>';

        return `
                  <tr style="vertical-align:middle;">
                    <td style="vertical-align:middle;">${roleDisplay}</td>
                    <td style="vertical-align:middle;">
                      <strong>${c.unitName || c.circle || c.zone || c.username}</strong>
                      ${c.username ? `<br><span class="text-muted" style="font-size:0.78rem;">(${c.username})</span>` : ''}
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="display:flex; align-items:center; gap:8px;">
                        <div style="flex:1; height:8px; background:#e2e8f0; border-radius:999px; min-width:60px;">
                          <div style="height:100%; width:${pct}%; background:#14533e; border-radius:999px;"></div>
                        </div>
                        <span style="font-size:0.78rem; font-weight:600; color:#14533e; white-space:nowrap;">${pct}%</span>
                      </div>
                    </td>
                    <td style="vertical-align:middle; white-space:nowrap;">${c.completedAt ? new Date(c.completedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td style="vertical-align:middle;"><span style="max-width:150px; display:inline-block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${(c.notes || '').replace(/"/g, '&quot;')}">${c.notes || '<span class="text-muted">—</span>'}</span></td>
                    <td style="vertical-align:middle;">
                      ${images.length
            ? images.map(img => `<a href="${img.url}" target="_blank"><img src="${img.url}" style="width:40px; height:40px; object-fit:cover; border-radius:6px; margin:2px; border:1px solid #e2e8f0;" title="${img.originalName || ''}"></a>`).join('')
            : '<span class="text-muted">—</span>'}
                    </td>
                  </tr>
                `;
      }).join('')}
            </tbody>
          </table>
        </div>
      `;

      document.getElementById('completions-modal-body').innerHTML = html;
    } catch (err) {
      document.getElementById('completions-modal-body').innerHTML =
        `<div class="text-danger p-3">Failed to load completions: ${err.message}</div>`;
    }
  }

  document.getElementById('completions-modal-close')?.addEventListener('click', () => closeModal('completions-modal'));

  // Init
  fetchPrograms();
});
