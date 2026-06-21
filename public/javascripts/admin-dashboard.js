document.addEventListener('DOMContentLoaded', () => {
  const projectForm = document.getElementById('project-form');
  const projectMessage = document.getElementById('admin-project-message');
  const projectTableBody = document.getElementById('admin-project-table-body');
  const programMonitoringContainer = document.getElementById('admin-program-monitoring');
  const totalZonesValue = document.getElementById('total-zones');
  const totalCirclesValue = document.getElementById('total-circles');
  const totalUnitsValue = document.getElementById('total-units');
  const totalProjectsValue = document.getElementById('total-projects');
  const projectFormTitle = document.getElementById('project-form-title');
  const projectIdInput = document.getElementById('project-id');
  const resetButton = document.getElementById('project-reset-btn');
  const refreshButton = document.getElementById('admin-refresh-btn');
  const lastRefreshLabel = document.getElementById('admin-last-refresh');

  let projects = [];
  let currentEditId = null;

  function showMessage(message, type = 'success') {
    projectMessage.innerHTML = `<div class="alert alert-${type} py-2">${message}</div>`;
    setTimeout(() => {
      projectMessage.innerHTML = '';
    }, 5000);
  }


  function renderProgramMonitoring(monitoring) {
    if (!monitoring || !monitoring.length) {
      programMonitoringContainer.innerHTML = '<div class="text-center text-muted">No programme monitoring data yet.</div>';
      return;
    }

    programMonitoringContainer.innerHTML = monitoring
      .map((p) => {
        const pid = p.projectId;
        function listHtml(arr, type) {
          const preview = arr.slice(0, 20).map((u) => `<div class="monitor-item">${u}</div>`).join('');
          const full = arr.map((u) => `<div class="monitor-item">${u}</div>`).join('');
          const moreButton = arr.length > 20 ? `<div><button class="btn btn-link btn-sm more-toggle" data-project-id="${pid}" data-type="${type}">...more</button></div>` : '';
          return `
            <div class="monitor-preview">${preview}${moreButton}</div>
            <div class="monitor-full d-none" data-project-id="${pid}" data-type="${type}">${full}</div>
          `;
        }

        return `
        <div class="card mb-3 program-monitoring-card" data-project-id="${pid}">
          <div class="card-body">
            <h5 class="card-title mb-2">${p.name}</h5>
            <div class="row">
              <div class="col-md-6 col-12 mb-2">
                <h6 class="mb-1">Completed <span class="badge bg-success ms-1">${p.completeUnits.length}</span></h6>
                <div class="small text-muted">${listHtml(p.completeUnits, 'complete')}</div>
              </div>
              <div class="col-md-6 col-12 mb-2">
                <h6 class="mb-1">Not Complete <span class="badge bg-secondary ms-1">${p.notCompleteCount}</span></h6>
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  // delegate click for more/less toggles
  programMonitoringContainer.addEventListener('click', (event) => {
    const btn = event.target.closest('.more-toggle');
    if (!btn) return;
    const pid = btn.dataset.projectId;
    const type = btn.dataset.type;
    const fullSelector = `.monitor-full[data-project-id="${pid}"][data-type="${type}"]`;
    const fullDiv = programMonitoringContainer.querySelector(fullSelector);
    if (!fullDiv) return;
    if (fullDiv.classList.contains('d-none')) {
      fullDiv.classList.remove('d-none');
      btn.textContent = 'less';
    } else {
      fullDiv.classList.add('d-none');
      btn.textContent = '...more';
    }
  });

  function renderSummary(summary) {
    totalZonesValue.textContent = summary.totalZones || 10;
    totalCirclesValue.textContent = summary.totalCircles || 49;
    totalUnitsValue.textContent = summary.totalUnits || 498;
    totalProjectsValue.textContent = summary.totalProjects || 0;
    // render vertical programme monitoring
    renderProgramMonitoring(summary.programMonitoring || []);
  }

  function renderProjectTable() {
    projectTableBody.innerHTML = projects.length
      ? projects
          .map((project) => `
            <tr>
              <td>${project.name}</td>
              <td>
                <button type="button" class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-id="${project._id}">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${project._id}">Delete</button>
              </td>
            </tr>
          `)
          .join('')
      : '<tr><td colspan="2" class="text-center">No programmes created yet.</td></tr>';
  }

  async function loadLocations() {
    const response = await fetch('/api/locations');
    const result = await response.json();
    if (result.success) {
      locations = result.locations.zones || [];
      renderLocationSelectors();
      return true;
    }
    showMessage('Unable to load locations.', 'danger');
    return false;
  }

  async function loadSummary() {
    const response = await fetch('/api/admin/summary');
    const result = await response.json();
    if (result.success) {
      renderSummary(result.summary);
    }
  }

  async function loadProjects() {
    const response = await fetch('/api/admin/projects');
    const result = await response.json();
    if (result.success) {
      projects = result.projects;
      renderProjectTable();
    }
  }

  function updateLastRefresh() {
    const now = new Date();
    lastRefreshLabel.textContent = `Last updated ${now.toLocaleTimeString()}`;
  }

  async function refreshDashboard() {
    await loadSummary();
    await loadProjects();
    updateLastRefresh();
  }

  function resetForm() {
    currentEditId = null;
    projectIdInput.value = '';
    projectForm.reset();
    projectFormTitle.textContent = 'Add New Programme';
  }

  projectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(projectForm);
    const payload = {
      name: formData.get('name').trim(),
      description: formData.get('description').trim(),
    };

    if (!payload.name) {
      showMessage('Programme name is required.', 'danger');
      return;
    }

    try {
      const url = currentEditId ? `/api/admin/projects/${currentEditId}` : '/api/admin/projects';
      const method = currentEditId ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!result.success) {
        showMessage(result.message || 'Unable to save programme.', 'danger');
        return;
      }
      showMessage(currentEditId ? 'Programme updated successfully.' : 'Programme created successfully.');
      resetForm();
      await loadSummary();
      await loadProjects();
    } catch (error) {
      showMessage('Failed to save programme. Please try again.', 'danger');
    }
  });

  projectTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'edit') {
      const project = projects.find((projectItem) => projectItem._id === id);
      if (!project) return;
      currentEditId = id;
      projectIdInput.value = id;
      projectFormTitle.textContent = 'Edit Programme';
      document.getElementById('project-name').value = project.name;
      document.getElementById('project-description').value = project.description || '';
      window.scrollTo({ top: projectForm.offsetTop - 20, behavior: 'smooth' });
      return;
    }

    if (action === 'delete') {
      const confirmed = window.confirm('Delete this programme permanently?');
      if (!confirmed) return;
      try {
        const response = await fetch(`/api/admin/projects/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (!result.success) {
          showMessage(result.message || 'Unable to delete programme.', 'danger');
          return;
        }
        showMessage('Programme deleted successfully.');
        await loadSummary();
        await loadProjects();
      } catch (error) {
        showMessage('Programme deletion failed. Please try again.', 'danger');
      }
    }
  });

  refreshButton.addEventListener('click', refreshDashboard);
  resetButton.addEventListener('click', resetForm);

  async function init() {
    await refreshDashboard();
    setInterval(refreshDashboard, 15000);
  }

  init();
});
