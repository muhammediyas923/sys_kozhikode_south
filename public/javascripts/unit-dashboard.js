/* Unit User Dashboard JS */
document.addEventListener('DOMContentLoaded', () => {
  const dsUtils = window.dsUtils || {};
  const showToast = dsUtils.showToast || ((message, type = 'info') => { console.log(type.toUpperCase()+':', message); });
  const formatDate = dsUtils.formatDate || ((dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  });
  const loadNotifications = dsUtils.loadNotifications || (() => {});

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

  function initializePrograms() {
    if (programs.length) {
      renderPrograms();
      updateStats();
    }
  }

  async function fetchPrograms() {
    try {
      const resp = await fetch('/api/unit/programs');
      const data = await resp.json();
      console.debug('unit programs response', data);
      if (data.success) {
        programs = Array.isArray(data.programs) ? data.programs : [];
        console.debug('loaded programs count', programs.length);
        renderPrograms();
        updateStats();
      } else {
        showToast(data.message || 'Failed to load programs.', 'danger');
        if (programs.length) renderPrograms();
      }
    } catch (err) {
      console.error('fetchPrograms error', err);
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
    console.debug('renderPrograms', { total: programs.length, filtered: filtered.length, filterVal, searchVal });

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
      
      const attachmentsSection = p.attachments && p.attachments.length
        ? `<div class="mt-2 border-top pt-2"><strong style="font-size:0.75rem; color:var(--ds-text);">Attachments:</strong>` +
          p.attachments.map(att => `<a href="${att.url}" target="_blank" class="d-inline-flex align-items-center gap-1 p-1 px-2 border rounded bg-light text-decoration-none small text-dark me-1 mt-1" style="font-size:0.75rem;"><i class="ph ph-download-simple"></i> ${att.originalName}</a>`).join('') + `</div>`
        : '';

      const publishBadge = p.published
        ? ''
        : '<span class="ds-badge ds-badge-warning" style="font-size:0.72rem;">Draft</span>';
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
            </div>

            ${attachmentsSection}

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

    // Attach listeners
    grid.querySelectorAll('.prog-checkbox').forEach(cb => {
      cb.addEventListener('change', async () => {
        const id = cb.dataset.id;
        const completed = cb.checked;
        try {
          const resp = await fetch(`/api/unit/programs/${id}/complete`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed }),
          });
          const data = await resp.json();
          if (data.success) {
            showToast(data.completed ? 'Program marked as completed!' : 'Program marked as pending.', 'success');
            fetchPrograms();
          }
        } catch (err) {
          showToast('Failed to update program status.', 'danger');
          cb.checked = !completed;
        }
      });
    });
  }

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

  // Load UI Section notifications
  async function loadSectionNotifications() {
    const listEl = document.getElementById('notif-section-list');
    try {
      const resp = await fetch('/api/notifications');
      const data = await resp.json();
      if (data.success && data.notifications.length) {
        listEl.innerHTML = data.notifications.slice(0, 10).map(n => `
          <div class="ds-notif-item">
            <div class="ds-notif-icon"><i class="ph ph-bell"></i></div>
            <div>
              <div class="ds-notif-msg">${n.message}</div>
              <div class="ds-notif-time">${formatDate(n.createdAt)}</div>
            </div>
          </div>
        `).join('');
      } else {
        listEl.innerHTML = '<div class="ds-empty" style="padding:24px;"><h3>No notifications yet</h3></div>';
      }
    } catch (e) {
      listEl.innerHTML = '<div class="ds-empty"><h3>Failed to load notifications</h3></div>';
    }
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
  loadNotifications();
  loadSectionNotifications();
});
