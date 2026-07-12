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
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">No programs created yet.</td></tr>';
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
          <td>${p.dueDate ? formatDate(p.dueDate) : '<span class="text-muted">—</span>'}</td>
          <td>${attachmentsList}</td>
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

  // Init
  fetchPrograms();
});
