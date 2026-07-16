/* Unit User Dashboard JS */
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
      completed: p.completed === true || p.completed === 'true' || p.completed === 1,
      dueDate: p.dueDate || null,
      completedAt: p.completedAt || null,
      completionCount: p.completionCount || 0,
      completionDate: p.completionDate || null,
      notes: p.notes || '',
      images: Array.isArray(p.images) ? p.images : [],
      requiredCount: p.requiredCount || 1,
      progressPct: p.progressPct || 0,
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
      const cardClass = p.completed ? 'completed' : (isOverdue ? 'overdue' : '');
      const requiredCount = p.requiredCount || 1;

      const attachmentsSection = p.attachments && p.attachments.length
        ? `<div class="mt-2 border-top pt-2"><strong style="font-size:0.75rem; color:var(--ds-text);">Attachments:</strong>` +
        p.attachments.map(att => `<a href="${att.url}" target="_blank" class="d-inline-flex align-items-center gap-1 p-1 px-2 border rounded bg-light text-decoration-none small text-dark me-1 mt-1" style="font-size:0.75rem;"><i class="ph ph-download-simple"></i> ${att.originalName}</a>`).join('') + `</div>`
        : '';

      const publishBadge = p.published ? '' : '<span class="ds-badge ds-badge-warning" style="font-size:0.72rem;">Draft</span>';

      // Progress bar for multi-completion programs
      const progressSection = requiredCount > 1 ? (() => {
        const pct = p.progressPct || 0;
        const count = p.completionCount || 0;
        return `
          <div class="mt-2" style="font-size:0.78rem; color:var(--ds-text-muted);">
            Progress: <strong>${count}/${requiredCount}</strong>
            <div style="height:6px; background:#e2e8f0; border-radius:999px; margin-top:4px;">
              <div style="height:100%; width:${pct}%; background:var(--ds-primary); border-radius:999px; transition:width 0.4s;"></div>
            </div>
          </div>`;
      })() : '';

      // Completion badge (shows count/date if completed)
      const completionBadge = p.completed && p.completionCount
        ? `<div class="mt-1" style="font-size:0.75rem; color:#16a34a;"><i class="ph ph-check-circle"></i> Completed ${p.completionCount}x · ${formatDate(p.completionDate || p.completedAt)}</div>`
        : '';

      return `
        <div class="col-md-6 col-lg-4">
          <div class="ds-program-card ${cardClass}" data-id="${p._id}">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h3 class="ds-program-title mb-0">${p.title}</h3>
              ${publishBadge}
            </div>
            <p class="ds-program-desc">${p.description || 'No description provided.'}</p>

            <div class="ds-program-meta">
              <div class="ds-program-meta-item">
                <i class="ph ph-calendar"></i> Due: ${p.dueDate ? formatDate(p.dueDate) : 'No due date'}
              </div>
              ${isOverdue ? `<div class="ds-program-meta-item text-danger"><i class="ph ph-warning"></i> Overdue</div>` : ''}
              ${requiredCount > 1 ? `<div class="ds-program-meta-item"><i class="ph ph-repeat"></i> Required: ${requiredCount}×</div>` : ''}
            </div>

            ${progressSection}
            ${attachmentsSection}
            ${completionBadge}

            <div class="ds-completion-toggle">
              <input class="ds-checkbox prog-checkbox" type="checkbox" id="check-${p._id}" data-id="${p._id}" ${p.completed ? 'checked' : ''}>
              <label class="ds-checkbox-label" for="check-${p._id}">
                ${p.completed ? 'Marked as Completed' : 'Mark as Completed'}
              </label>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach checkbox listeners → open modal instead of toggling directly
    grid.querySelectorAll('.prog-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          // Uncheck visually — modal will handle the actual check on submit
          cb.checked = false;
          const program = programs.find(p => p._id === cb.dataset.id);
          openCompletionModal(cb.dataset.id, program ? program.title : '');
        } else {
          // Allow unchecking directly (toggle off)
          handleUncomplete(cb.dataset.id, cb);
        }
      });
    });

    // Already-completed: clicking checkbox allows re-submitting (update)
    grid.querySelectorAll('.prog-checkbox:checked').forEach(cb => {
      // Override: clicking an already-checked box opens modal to update
      cb.addEventListener('change', (e) => {
        if (!cb.checked) {
          handleUncomplete(cb.dataset.id, cb);
        }
      });
    });
  }

  // ── Completion Modal Logic ─────────────────────────────────────────────

  let completionImageFiles = [];

  function openCompletionModal(programId, programTitle) {
    document.getElementById('completion-program-id').value = programId;
    document.getElementById('completion-program-name').value = programTitle;
    document.getElementById('completion-count').value = 1;
    document.getElementById('completion-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('completion-notes').value = '';
    document.getElementById('completion-modal-error').classList.add('d-none');
    completionImageFiles = [];
    renderImagePreviews();

    const modal = document.getElementById('completion-modal');
    modal.classList.add('open');
  }

  function closeCompletionModal() {
    document.getElementById('completion-modal').classList.remove('open');
    completionImageFiles = [];
    renderImagePreviews();
  }

  document.getElementById('completion-modal-close')?.addEventListener('click', closeCompletionModal);
  document.getElementById('completion-modal-cancel')?.addEventListener('click', closeCompletionModal);

  // Count +/- buttons
  document.getElementById('count-inc')?.addEventListener('click', () => {
    const el = document.getElementById('completion-count');
    el.value = Math.min(999, parseInt(el.value || 0) + 1);
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
    const completionDate = document.getElementById('completion-date').value;
    const notes = document.getElementById('completion-notes').value;
    const errorEl = document.getElementById('completion-modal-error');
    const submitBtn = document.getElementById('completion-modal-submit');

    if (!completionCount || parseInt(completionCount) < 1) {
      errorEl.textContent = 'Completion count must be at least 1.';
      errorEl.classList.remove('d-none');
      return;
    }

    errorEl.classList.add('d-none');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="ph ph-spinner"></i> Submitting...';

    const formData = new FormData();
    formData.append('completionCount', completionCount);
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

      // Update local program state
      const program = programs.find(p => p._id === programId);
      if (program) {
        program.completed = true;
        program.completionCount = parseInt(completionCount);
        program.completionDate = completionDate;
        program.notes = notes;
        program.completedAt = new Date().toISOString();
        // Recalculate progress
        const req = program.requiredCount || 1;
        program.progressPct = Math.min(100, Math.round((program.completionCount / req) * 100));
      }

      closeCompletionModal();
      renderPrograms();
      updateStats();

      // Signal admin dashboard to refresh
      try {
        localStorage.setItem('sys:completion-updated', JSON.stringify({ ts: Date.now(), programId }));
      } catch (e) { /* ignore */ }
      window.dispatchEvent(new CustomEvent('sys:completion-updated', { detail: { programId } }));

      showToast('Program completion submitted successfully! ✓', 'success');
    } catch (err) {
      errorEl.textContent = 'Network error. Please try again.';
      errorEl.classList.remove('d-none');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i> Submit Completion';
    }
  });

  // ── Uncomplete (uncheck) handler ──────────────────────────────────────

  async function handleUncomplete(programId, cb) {
    const program = programs.find(p => p._id === programId);
    if (!program) return;

    const prev = { completed: program.completed, completionCount: program.completionCount };
    program.completed = false;
    program.completionCount = 0;
    program.progressPct = 0;
    renderPrograms();
    updateStats();

    try {
      const resp = await fetch(`/api/unit/programs/${programId}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: false }),
      });
      const data = await resp.json();
      if (!data.success) throw new Error('Update failed');
      showToast('Program marked as pending.', 'info');
    } catch (err) {
      program.completed = prev.completed;
      program.completionCount = prev.completionCount;
      renderPrograms();
      updateStats();
      showToast('Failed to update program status.', 'danger');
    }
  }

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
