document.addEventListener('DOMContentLoaded', () => {
  const zoneSelect = document.getElementById('project-zone');
  const circleSelect = document.getElementById('project-circle');
  const unitSelect = document.getElementById('project-unit');
  const projectForm = document.getElementById('project-form');
  const projectMessage = document.getElementById('admin-project-message');
  const projectTableBody = document.getElementById('admin-project-table-body');
  const progressTableBody = document.getElementById('admin-progress-table-body');
  const totalZonesValue = document.getElementById('total-zones');
  const totalCirclesValue = document.getElementById('total-circles');
  const totalUnitsValue = document.getElementById('total-units');
  const totalProjectsValue = document.getElementById('total-projects');
  const projectFormTitle = document.getElementById('project-form-title');
  const projectIdInput = document.getElementById('project-id');
  const resetButton = document.getElementById('project-reset-btn');
  const refreshButton = document.getElementById('admin-refresh-btn');
  const lastRefreshLabel = document.getElementById('admin-last-refresh');

  let locations = [];
  let projects = [];
  let currentEditId = null;

  function showMessage(message, type = 'success') {
    projectMessage.innerHTML = `<div class="alert alert-${type} py-2">${message}</div>`;
    setTimeout(() => {
      projectMessage.innerHTML = '';
    }, 5000);
  }

  function renderLocationSelectors() {
    zoneSelect.innerHTML = '<option value="">Select Zone</option>' + locations.map(zone => `<option value="${zone.name}">${zone.name}</option>`).join('');
    circleSelect.innerHTML = '<option value="">Select Circle</option>';
    unitSelect.innerHTML = '<option value="">Select Unit</option>';
  }

  function updateCircles() {
    const selectedZone = locations.find((zone) => zone.name === zoneSelect.value);
    if (!selectedZone) {
      circleSelect.innerHTML = '<option value="">Select Circle</option>';
      unitSelect.innerHTML = '<option value="">Select Unit</option>';
      return;
    }
    circleSelect.innerHTML = '<option value="">Select Circle</option>' + selectedZone.circles.map(circle => `<option value="${circle.name}">${circle.name}</option>`).join('');
    unitSelect.innerHTML = '<option value="">Select Unit</option>';
  }

  function updateUnits() {
    const selectedZone = locations.find((zone) => zone.name === zoneSelect.value);
    const selectedCircle = selectedZone?.circles.find((circle) => circle.name === circleSelect.value);
    if (!selectedCircle) {
      unitSelect.innerHTML = '<option value="">Select Unit</option>';
      return;
    }
    unitSelect.innerHTML = '<option value="">Select Unit</option>' + selectedCircle.units.map(unit => `<option value="${unit}">${unit}</option>`).join('');
  }

  function renderSummary(summary) {
    totalZonesValue.textContent = summary.totalZones || 10;
    totalCirclesValue.textContent = summary.totalCircles || 49;
    totalUnitsValue.textContent = summary.totalUnits || 498;
    totalProjectsValue.textContent = summary.totalProjects || 0;

    progressTableBody.innerHTML = summary.progressSummary.length
      ? summary.progressSummary
          .map((item) => `
            <tr>
              <td>${item.zone}</td>
              <td>${item.circle}</td>
              <td>${item.unit}</td>
              <td>${item.totalProjects}</td>
              <td>${item.completedProjects}</td>
              <td>${item.completionRate}%</td>
            </tr>
          `)
          .join('')
      : '<tr><td colspan="6" class="text-center">No programme progress data yet.</td></tr>';
  }

  function renderProjectTable() {
    projectTableBody.innerHTML = projects.length
      ? projects
          .map((project) => `
            <tr>
              <td>${project.name}</td>
              <td>${project.zone}</td>
              <td>${project.circle}</td>
              <td>${project.unit}</td>
              <td>${project.completed ? 'Completed' : 'Pending'}</td>
              <td>
                <button type="button" class="btn btn-sm btn-outline-primary me-2" data-action="edit" data-id="${project._id}">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${project._id}">Delete</button>
              </td>
            </tr>
          `)
          .join('')
      : '<tr><td colspan="6" class="text-center">No programmes created yet.</td></tr>';
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
    await loadLocations();
    await loadSummary();
    await loadProjects();
    updateLastRefresh();
  }

  function resetForm() {
    currentEditId = null;
    projectIdInput.value = '';
    projectForm.reset();
    projectFormTitle.textContent = 'Add New Programme';
    renderLocationSelectors();
  }

  projectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(projectForm);
    const payload = {
      name: formData.get('name').trim(),
      description: formData.get('description').trim(),
      zone: formData.get('zone'),
      circle: formData.get('circle'),
      unit: formData.get('unit'),
    };

    if (!payload.name || !payload.zone || !payload.circle || !payload.unit) {
      showMessage('Programme name and location are required.', 'danger');
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
      document.getElementById('project-zone').value = project.zone;
      updateCircles();
      document.getElementById('project-circle').value = project.circle;
      updateUnits();
      document.getElementById('project-unit').value = project.unit;
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

  zoneSelect.addEventListener('change', updateCircles);
  circleSelect.addEventListener('change', updateUnits);
  refreshButton.addEventListener('click', refreshDashboard);
  resetButton.addEventListener('click', resetForm);

  async function init() {
    await refreshDashboard();
    setInterval(refreshDashboard, 15000);
  }

  init();
});
