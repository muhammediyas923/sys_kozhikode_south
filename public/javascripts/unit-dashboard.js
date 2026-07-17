/* Unit User Dashboard JS — Target-Based Progress System */
document.addEventListener('DOMContentLoaded', () => {
  const dsUtils = window.dsUtils || {};
  const showToast = dsUtils.showToast || ((message, type = 'info') => { console.log(type.toUpperCase() + ':', message); });
  const formatDate = dsUtils.formatDate || ((dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  });

  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  });
  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  });

  let programs = window.__INITIAL_PROGRAMS__ || [];

  function normalizePrograms(list) {
    if (!Array.isArray(list)) return [];
    return list.map(p => ({
      ...p,
      _id: p._id && p._id.toString ? p._id.toString() : p._id,
      dueDate: p.dueDate || null,
      completedAt: p.completedAt || null,
      completionCount: parseInt(p.completionCount, 10) || 0,
      completionDate: p.completionDate || null,
      notes: p.notes || '',
      images: Array.isArray(p.images) ? p.images : [],
      requiredCount: parseInt(p.requiredCount, 10) || 1,
      progressPct: parseInt(p.progressPct, 10) || 0,
      // Auto-derive completed from target
      completed: (parseInt(p.completionCount, 10) || 0) >= (parseInt(p.requiredCount, 10) || 1),
    }));
  }

  function initializePrograms() {
    if (programs.length) {
      programs = normalizePrograms(programs);
      renderPrograms();
      updateStats();
    }
  }

  async function fetchPrograms() {
    try {
      const resp = await fetch('/api/unit/programs');
      const data = await resp.json();
      if (data.success) {
        programs = Array.isArray(data.programs) ? normalizePrograms(data.programs) : [];
        renderPrograms();
        updateStats();
      } else {
        showToast(data.message || 'Failed to load programs.', 'danger');
        if (programs.length) renderPrograms();
      }
    } catch (err) {
      showToast('Error loading programs.', 'danger');
      if (programs.length) renderPrograms();
    }
  }

  function renderPrograms() {
    const grid = document.getElementById('programs-grid');
    const countLabel = document.getElementById('program-count-label');
    const searchVal = document.getElementById('prog-search').value.toLowerCase();
    const filterVal = document.getElementById('prog-filter').value;
    if (countLabel) countLabel.textContent = `${programs.length} program${programs.length === 1 ? '' : 's'} available`;

    const filtered = programs.filter(p => {
      const matchesSearch = p.title.toLowerCase().includes(searchVal) ||
        (p.description && p.description.toLowerCase().includes(searchVal));
      const matchesFilter = filterVal === 'all' ||
        (filterVal === 'completed' && p.completed) ||
        (filterVal === 'pending' && !p.completed);
      return matchesSearch && matchesFilter;
    });

    if (!filtered.length) {
      const message = programs.length === 0
        ? 'No programs are available yet. Contact the administrator.'
        : 'No programs match your search or filter.';
      grid.innerHTML = `
        <div class="col-12">
          <div class="ds-empty">
            <i class="ph ph-clipboard-text ds-empty-icon"></i>
            <h3>No programs found</h3>
            <p>${message}</p>
          </div>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const isOverdue = p.dueDate && new Date(p.dueDate) < new Date() && !p.completed;
      const requiredCount = p.requiredCount || 1;
      const completionCount = p.completionCount || 0;
      const pct = p.progressPct || 0;
      const isCompleted = p.completed;

      // Card class
      const cardClass = isCompleted ? 'program-completed' : (isOverdue ? 'overdue' : '');

      // Status badge
      const statusBadge = isCompleted
        ? '<span class="ds-status-badge completed"><i class="ph ph-check-circle"></i> Completed</span>'
        : '<span class="ds-status-badge pending"><i class="ph ph-clock"></i> Pending</span>';

      // Completion ribbon for completed cards
      const ribbon = '';

      const attachmentsSection = p.attachments && p.attachments.length
        ? `<div class="mt-2 border-top pt-2"><strong style="font-size:0.75rem; color:var(--ds-text);">Attachments:</strong>` +
        p.attachments.map(att => `<a href="${att.url}" target="_blank" class="d-inline-flex align-items-center gap-1 p-1 px-2 border rounded bg-light text-decoration-none small text-dark me-1 mt-1" style="font-size:0.75rem;"><i class="ph ph-download-simple"></i> ${att.originalName}</a>`).join('') + `</div>`
        : '';

      const publishBadge = p.published ? '' : '<span class="ds-badge ds-badge-warning" style="font-size:0.72rem;">Draft</span>';

      // Progress bar
      const fillClass = pct >= 100 ? 'fill-complete' : '';

      return `
        <div class="col-md-6 col-lg-4">
          <div class="ds-program-card ${cardClass}" data-id="${p._id}">
            ${ribbon}
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h3 class="ds-program-title mb-0">${p.title}</h3>
              <div class="d-flex align-items-center gap-2">
                ${publishBadge}
                ${statusBadge}
              </div>
            </div>
            <p class="ds-program-desc">${p.description || 'No description provided.'}</p>

            <div class="ds-program-meta">
              <div class="ds-program-meta-item">
                <i class="ph ph-calendar"></i> Due: ${p.dueDate ? formatDate(p.dueDate) : 'No due date'}
              </div>
              ${isOverdue ? `<div class="ds-program-meta-item text-danger"><i class="ph ph-warning"></i> Overdue</div>` : ''}
              <div class="ds-program-meta-item">
                <i class="ph ph-target"></i> Target: ${requiredCount}×
              </div>
            </div>

            ${attachmentsSection}

            <div class="ds-progress-section">
              <div class="ds-progress-track">
                <div class="ds-progress-fill ${fillClass}" style="width:${pct}%;"></div>
              </div>
              <span class="ds-progress-label">${completionCount}/${requiredCount}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach card click → open modal
    grid.querySelectorAll('.ds-program-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't trigger on attachment link clicks
        if (e.target.closest('a')) return;
        const programId = card.dataset.id;
        const program = programs.find(p => p._id === programId);
        if (program) openCompletionModal(program);
      });
    });
  }

  // ── Completion Modal Logic ─────────────────────────────────────────────

  let completionImageFiles = [];

  function openCompletionModal(program) {
    const requiredCount = program.requiredCount || 1;
    const completionCount = program.completionCount || 0;
    const remaining = Math.max(0, requiredCount - completionCount);
    const pct = Math.min(100, Math.round((completionCount / requiredCount) * 100));
    const isCompleted = completionCount >= requiredCount;

    // Set hidden ID
    document.getElementById('completion-program-id').value = program._id;
    document.getElementById('completion-program-name').value = program.title;
    document.getElementById('completion-modal-heading').textContent = program.title;

    // Populate progress info
    document.getElementById('modal-target').textContent = requiredCount;
    document.getElementById('modal-completed').textContent = completionCount;
    document.getElementById('modal-remaining').textContent = remaining;
    document.getElementById('modal-participants').textContent = program.participantsCount || 0;
    document.getElementById('modal-pct-label').textContent = pct + '%';

    // Progress bar (animate after modal opens)
    const progressFill = document.getElementById('modal-progress-fill');
    progressFill.style.width = '0%';
    setTimeout(() => { progressFill.style.width = pct + '%'; }, 100);

    // Status badge
    const statusBadge = document.getElementById('modal-status-badge');
    if (isCompleted) {
      statusBadge.className = 'ds-status-badge completed';
      statusBadge.innerHTML = '<i class="ph ph-check-circle"></i> Completed';
    } else {
      statusBadge.className = 'ds-status-badge pending';
      statusBadge.innerHTML = '<i class="ph ph-clock"></i> Pending';
    }

    // Description
    const descEl = document.getElementById('completion-program-desc');
    descEl.textContent = program.description || 'No description provided.';

    // Previously uploaded images
    const imagesGroup = document.getElementById('modal-existing-images-group');
    const imagesContainer = document.getElementById('modal-existing-images');
    if (program.images && program.images.length) {
      imagesContainer.innerHTML = program.images.map(img =>
        `<a href="${img.url}" target="_blank"><img src="${img.url}" alt="${img.originalName || 'Evidence'}" title="${img.originalName || ''}"></a>`
      ).join('');
      imagesGroup.classList.remove('d-none');
    } else {
      imagesContainer.innerHTML = '';
      imagesGroup.classList.add('d-none');
    }

    // Target achieved banner
    const achievedBanner = document.getElementById('modal-target-achieved');
    const submitBtn = document.getElementById('completion-modal-submit');
    const formFields = document.getElementById('completion-form-fields');
    const uploadGroup = document.getElementById('completion-upload-group');
    const notesGroup = document.getElementById('completion-notes-group');

    if (isCompleted) {
      achievedBanner.classList.remove('d-none');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="ph ph-check-circle"></i> Target Achieved';
      formFields.style.display = 'none';
      uploadGroup.style.display = 'none';
      notesGroup.style.display = 'none';
    } else {
      achievedBanner.classList.add('d-none');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit Completion';
      formFields.style.display = '';
      uploadGroup.style.display = '';
      notesGroup.style.display = '';
    }

    // Reset form fields
    document.getElementById('completion-count').value = 1;
    document.getElementById('completion-participants').value = '';
    document.getElementById('completion-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('completion-notes').value = '';
    document.getElementById('completion-modal-error').classList.add('d-none');
    completionImageFiles = [];
    renderImagePreviews();

    // Fetch and render update history
    fetchAndRenderUpdateHistory(program._id);

    // Limit max completion count to remaining
    const countInput = document.getElementById('completion-count');
    if (!isCompleted) {
      countInput.max = remaining;
    }

    const modal = document.getElementById('completion-modal');
    modal.classList.add('open');
  }

  function closeCompletionModal() {
    document.getElementById('completion-modal').classList.remove('open');
    completionImageFiles = [];
    renderImagePreviews();
    document.getElementById('update-history-container').classList.add('d-none');
  }

  async function fetchAndRenderUpdateHistory(programId) {
    const container = document.getElementById('update-history-container');
    const listEl = document.getElementById('update-history-list');
    listEl.innerHTML = '<div class="text-center py-3"><i class="ph ph-spinner ds-spin"></i> Loading history...</div>';
    container.classList.remove('d-none');

    try {
      const resp = await fetch(`/api/unit/programs/${programId}/updates`);
      const data = await resp.json();
      if (!data.success || !data.updates || data.updates.length === 0) {
        container.classList.add('d-none');
        return;
      }
      
      const updates = data.updates;
      listEl.innerHTML = updates.map(u => {
        const d = new Date(u.completionDate || u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const imgs = (u.images || []).map(img => `<a href="${img.url}" target="_blank" class="d-inline-block me-1"><img src="${img.url}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid #e2e8f0;"></a>`).join('');
        return `
          <div class="mb-2 p-2 border rounded" style="background:#f8fafc; font-size:0.85rem;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <strong><i class="ph ph-calendar-blank"></i> ${d}</strong>
              <span class="ds-badge" style="background:#e0f2fe; color:#0369a1;"><i class="ph ph-users"></i> ${u.participantsCount || 0}</span>
            </div>
            ${u.notes ? `<div class="text-muted mb-1" style="white-space:pre-wrap;">${u.notes}</div>` : ''}
            ${imgs ? `<div class="mt-1">${imgs}</div>` : ''}
          </div>
        `;
      }).join('');
    } catch (err) {
      listEl.innerHTML = '<div class="text-danger small py-2">Failed to load history.</div>';
    }
  }

  document.getElementById('completion-modal-close')?.addEventListener('click', closeCompletionModal);
  document.getElementById('completion-modal-cancel')?.addEventListener('click', closeCompletionModal);

  // Count +/- buttons
  document.getElementById('count-inc')?.addEventListener('click', () => {
    const el = document.getElementById('completion-count');
    const max = parseInt(el.max) || 999;
    el.value = Math.min(max, parseInt(el.value || 0) + 1);
  });
  document.getElementById('count-dec')?.addEventListener('click', () => {
    const el = document.getElementById('completion-count');
    el.value = Math.max(1, parseInt(el.value || 1) - 1);
  });

  // Image upload zone
  const uploadZone = document.getElementById('completion-upload-zone');
  const imagesInput = document.getElementById('completion-images-input');

  uploadZone?.addEventListener('click', () => imagesInput.click());
  uploadZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--ds-primary)';
    uploadZone.style.background = '#f0fdf4';
  });
  uploadZone?.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '#d1d5db';
    uploadZone.style.background = '#f9fafb';
  });
  uploadZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#d1d5db';
    uploadZone.style.background = '#f9fafb';
    addImages(e.dataTransfer.files);
  });
  imagesInput?.addEventListener('change', (e) => addImages(e.target.files));

  function addImages(fileList) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    let added = 0;
    for (const file of fileList) {
      if (completionImageFiles.length >= 5) { showToast('Maximum 5 images allowed.', 'warning'); break; }
      if (!allowed.includes(file.type)) { showToast(`${file.name}: only JPG/PNG/WEBP allowed.`, 'warning'); continue; }
      completionImageFiles.push(file);
      added++;
    }
    if (added) renderImagePreviews();
    // Reset input so same file can be re-selected
    if (imagesInput) imagesInput.value = '';
  }

  function renderImagePreviews() {
    const container = document.getElementById('completion-image-previews');
    if (!container) return;
    if (!completionImageFiles.length) { container.innerHTML = ''; return; }

    container.innerHTML = completionImageFiles.map((f, i) => `
      <div style="position:relative; border-radius:8px; overflow:hidden; aspect-ratio:1; background:#e5e7eb;" data-idx="${i}">
        <img src="${URL.createObjectURL(f)}" style="width:100%; height:100%; object-fit:cover;" alt="${f.name}">
        <button type="button" class="remove-img-btn" data-idx="${i}"
          style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:#fff; border:none; border-radius:50%; width:22px; height:22px; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
          ×
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.remove-img-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        completionImageFiles.splice(idx, 1);
        renderImagePreviews();
      });
    });
  }

  // Submit completion form
  document.getElementById('completion-modal-submit')?.addEventListener('click', async () => {
    const programId = document.getElementById('completion-program-id').value;
    const completionCount = document.getElementById('completion-count').value;
    const participantsCount = document.getElementById('completion-participants').value;
    const completionDate = document.getElementById('completion-date').value;
    const notes = document.getElementById('completion-notes').value;
    const errorEl = document.getElementById('completion-modal-error');
    const submitBtn = document.getElementById('completion-modal-submit');

    if (!completionCount || parseInt(completionCount) < 1) {
      errorEl.textContent = 'Completion count must be at least 1.';
      errorEl.classList.remove('d-none');
      return;
    }
    
    if (!participantsCount || parseInt(participantsCount) < 1) {
      errorEl.textContent = 'Number of participants is required and must be a positive integer.';
      errorEl.classList.remove('d-none');
      return;
    }

    errorEl.classList.add('d-none');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="ph ph-spinner ds-spin"></i> Submitting...';

    const formData = new FormData();
    formData.append('completionCount', completionCount);
    formData.append('participantsCount', participantsCount);
    formData.append('completionDate', completionDate);
    formData.append('notes', notes);
    completionImageFiles.forEach(f => formData.append('images', f));

    try {
      const resp = await fetch(`/api/unit/programs/${programId}/submit-completion`, {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();

      if (!data.success) {
        errorEl.textContent = data.message || 'Submission failed. Please try again.';
        errorEl.classList.remove('d-none');
        return;
      }

      // Update local program state with server response
      const program = programs.find(p => p._id === programId);
      if (program) {
        program.completionCount = data.completionCount || program.completionCount;
        program.participantsCount = data.participantsCount !== undefined ? data.participantsCount : (program.participantsCount || 0);
        program.completed = data.completed || false;
        program.completedAt = program.completed ? new Date().toISOString() : null;
        const req = data.requiredCount || program.requiredCount || 1;
        program.progressPct = data.progressPct || Math.min(100, Math.round((program.completionCount / req) * 100));
      }

      closeCompletionModal();
      renderPrograms();
      updateStats();

      // Signal admin dashboard to refresh
      try {
        localStorage.setItem('sys:completion-updated', JSON.stringify({ ts: Date.now(), programId }));
      } catch (e) { /* ignore */ }
      window.dispatchEvent(new CustomEvent('sys:completion-updated', { detail: { programId } }));

      if (data.completed) {
        showToast('🎉 Target achieved! Program completed successfully!', 'success');
      } else {
        showToast('Program completion submitted successfully! ✓', 'success');
      }
    } catch (err) {
      errorEl.textContent = 'Network error. Please try again.';
      errorEl.classList.remove('d-none');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit Completion';
    }
  });

  // ── Stats ─────────────────────────────────────────────────────────────

  function updateStats() {
    const total = programs.length;
    const completed = programs.filter(p => p.completed).length;
    const pending = total - completed;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    animateCount('stat-total', total);
    animateCount('stat-done', completed);
    animateCount('stat-pending', pending);

    document.getElementById('stat-pct').textContent = pct + '%';
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-text').textContent = `${completed} of ${total} Completed`;
    document.getElementById('pending-badge').textContent = pending;
  }

  function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = 0;
    const duration = 600;
    const step = (timestamp) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      el.textContent = Math.round(start + progress * (target - start));
      if (progress < 1) requestAnimationFrame(step);
    };
    let startTime;
    requestAnimationFrame((ts) => { startTime = ts; step(ts); });
  }

  // Event Listeners
  document.getElementById('prog-search').addEventListener('input', renderPrograms);
  document.getElementById('prog-filter').addEventListener('change', renderPrograms);
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    showToast('Refreshing programs...', 'info');
    fetchPrograms();
  });

  // Init
  initializePrograms();
  fetchPrograms();
});
