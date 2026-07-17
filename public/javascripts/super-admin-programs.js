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
      tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-muted">No programs created yet.</td></tr>';
      return;
    }
    tbody.innerHTML = programs.map((p, index) => {
      const statusBadge = p.published
        ? '<span class="ds-badge ds-badge-success">Published</span>'
        : '<span class="ds-badge ds-badge-muted">Draft</span>';

      const attachmentsList = p.attachments && p.attachments.length
        ? p.attachments.map(att => `<a href="${att.url}" target="_blank" class="d-block text-truncate" style="max-width:120px;" title="${att.originalName}"><i class="ph ph-file"></i> ${att.originalName}</a>`).join('')
        : '<span class="text-muted">—</span>';

      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${p.title}</strong></td>
          <td><div class="text-truncate" style="max-width:180px;" title="${p.description || ''}">${p.description || '—'}</div></td>
          <td><span class="ds-badge ds-badge-primary">${p.requiredCount || 1}×</span></td>
          <td><span class="ds-badge" style="background:#e0f2fe; color:#0369a1;"><i class="ph ph-users"></i> ${p.totalParticipants || 0}</span></td>
          <td>${p.dueDate ? formatDate(p.dueDate) : '<span class="text-muted">—</span>'}</td>
          <td>${attachmentsList}</td>
          <td>${statusBadge}</td>
          <td>${formatDate(p.createdAt)}</td>
          <td>
            <button class="ds-btn ds-btn-outline ds-btn-sm view-completions-btn" data-id="${p._id}" data-title="${p.title}" title="View user completions"><i class="ph ph-users"></i> Completions</button>
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
    tbody.querySelectorAll('.view-completions-btn').forEach(btn => {
      btn.addEventListener('click', () => openCompletionsModal(btn.dataset.id, btn.dataset.title));
    });

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
            showToast(isPublished ? 'Program unpublished (moved to drafts).' : 'Program published to all units!', 'success');
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

  // Add program button
  document.getElementById('add-program-btn')?.addEventListener('click', () => {
    editingProgramId = null;
    selectedFiles = [];
    document.getElementById('program-form').reset();
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

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    if (dueDate) formData.append('dueDate', dueDate);
    const requiredCount = document.getElementById('prog-required-count')?.value || 1;
    formData.append('requiredCount', requiredCount);

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
      const prog = data.program || {};
      const requiredCount = prog.requiredCount || 1;

      if (!completions.length) {
        document.getElementById('completions-modal-body').innerHTML =
          '<div class="ds-empty" style="padding:40px;"><i class="ph ph-users ds-empty-icon"></i><h3>No completions yet</h3><p>No users have submitted a completion for this program.</p></div>';
        return;
      }

      document.getElementById('completions-modal-body').innerHTML = `
        <p class="text-muted mb-3" style="font-size:0.875rem;">
          <strong>${completions.length}</strong> user${completions.length !== 1 ? 's' : ''} completed · Required: <strong>${requiredCount}×</strong>
        </p>
        <div class="ds-table-wrapper" style="max-height:60vh; overflow-y:auto; border-bottom:1px solid #e2e8f0;">
          <table class="ds-table" style="vertical-align:middle; margin-bottom:0;">
            <thead>
              <tr>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Unit Name</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Zone</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Circle</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Count</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Participants</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Progress</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Date</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Notes</th>
                <th style="vertical-align:middle; position:sticky; top:0; background-color:#f4f6f8; z-index:10; box-shadow:0 1px 2px rgba(0,0,0,0.05);">Images</th>
              </tr>
            </thead>
            <tbody>
              ${completions.map(c => {
        const count = c.completionCount || 1;
        const pct = Math.min(100, Math.round((count / requiredCount) * 100));
        const images = Array.isArray(c.images) ? c.images : [];
        return `
                  <tr style="vertical-align:middle;">
                    <td style="vertical-align:middle;">
                      <strong>${c.unitName || '—'}</strong>
                      ${c.username ? `<span class="text-muted" style="font-size:0.78rem; margin-left:4px;">(${c.username})</span>` : ''}
                    </td>
                    <td style="vertical-align:middle;">${c.zone || '—'}</td>
                    <td style="vertical-align:middle;">${c.circle || '—'}</td>
                    <td style="vertical-align:middle;"><span class="ds-badge ds-badge-success">${count}×</span></td>
                    <td style="vertical-align:middle;"><span class="ds-badge" style="background:#e0f2fe; color:#0369a1;"><i class="ph ph-users"></i> ${c.participantsCount || 0}</span></td>
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
    } catch (err) {
      document.getElementById('completions-modal-body').innerHTML =
        `<div class="text-danger p-3">Failed to load completions: ${err.message}</div>`;
    }
  }

  document.getElementById('completions-modal-close')?.addEventListener('click', () => closeModal('completions-modal'));

  // Init
  fetchPrograms();
});
