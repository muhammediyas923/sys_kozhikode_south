document.addEventListener('DOMContentLoaded', () => {
  const zoneList = document.getElementById('user-zone-list');
  const circleList = document.getElementById('user-circle-list');
  const unitList = document.getElementById('user-unit-list');
  const projectList = document.getElementById('user-project-list');
  const selectedLocation = document.getElementById('selected-location');
  const projectSummary = document.getElementById('user-project-summary');
  const refreshButton = document.getElementById('user-refresh-btn');
  const lastRefreshLabel = document.getElementById('user-last-refresh');

  let locations = [];
  let selectedZone = null;
  let selectedCircle = null;
  let selectedUnit = null;
  let projects = [];

  function renderZones() {
    if (!locations.length) {
      zoneList.innerHTML = '<div class="text-muted">No zones available.</div>';
      return;
    }
    zoneList.innerHTML = locations
      .map((zone) => `
        <button type="button" class="btn btn-light w-100 text-start mb-2 ${selectedZone === zone.name ? 'active' : ''}" data-zone="${zone.name}">
          ${zone.name}
        </button>
      `)
      .join('');
  }

  function renderCircles() {
    if (!selectedZone) {
      circleList.innerHTML = '<div class="text-muted">Select a Zone first.</div>';
      return;
    }
    const zone = locations.find((item) => item.name === selectedZone);
    circleList.innerHTML = zone.circles
      .map((circle) => `
        <button type="button" class="btn btn-light w-100 text-start mb-2 ${selectedCircle === circle.name ? 'active' : ''}" data-circle="${circle.name}">
          ${circle.name}
        </button>
      `)
      .join('');
  }

  function renderUnits() {
    if (!selectedCircle) {
      unitList.innerHTML = '<div class="text-muted">Select a Circle first.</div>';
      return;
    }
    const zone = locations.find((item) => item.name === selectedZone);
    const circle = zone?.circles.find((item) => item.name === selectedCircle);
    unitList.innerHTML = circle.units
      .map((unit) => `
        <button type="button" class="btn btn-light w-100 text-start mb-2 ${selectedUnit === unit ? 'active' : ''}" data-unit="${unit}">
          ${unit}
        </button>
      `)
      .join('');
  }

  function renderProjectsTable() {
    if (!selectedUnit) {
      projectList.innerHTML = '<div class="text-muted">Select a Unit to view assigned programmes.</div>';
      projectSummary.innerHTML = '';
      selectedLocation.textContent = 'No Unit selected';
      return;
    }

    selectedLocation.textContent = `${selectedZone} > ${selectedCircle} > ${selectedUnit}`;

    if (!projects.length) {
      projectList.innerHTML = '<div class="text-muted">No programmes assigned to this unit yet.</div>';
      projectSummary.innerHTML = '<p class="mb-0">0 programmes found.</p>';
      return;
    }

    const completedCount = projects.filter((project) => project.completed).length;
    const percentage = projects.length ? Math.round((completedCount / projects.length) * 100) : 0;
    projectSummary.innerHTML = `
      <p class="mb-1"><strong>${completedCount}</strong> of <strong>${projects.length}</strong> programmes completed.</p>
      <div class="progress" style="height: 18px;">
        <div class="progress-bar" role="progressbar" style="width: ${percentage}%" aria-valuenow="${percentage}" aria-valuemin="0" aria-valuemax="100">${percentage}%</div>
      </div>
    `;

    projectList.innerHTML = `
      <div class="table-responsive">
        <table class="table table-bordered table-sm mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col">Programme</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            ${projects
              .map(
                (project) => `
                  <tr>
                    <td>${project.name}</td>
                    <td>
                      <div class="form-check">
                        <input class="form-check-input project-complete-checkbox" type="checkbox" data-id="${project._id}" id="project-${project._id}" ${project.completed ? 'checked' : ''}>
                        <label class="form-check-label" for="project-${project._id}">${project.completed ? 'Completed' : 'Mark complete'}</label>
                      </div>
                    </td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async function loadLocations() {
    const response = await fetch('/api/locations');
    const data = await response.json();
    if (data.success) {
      locations = data.locations.zones || [];
      renderZones();
      return true;
    }
    zoneList.innerHTML = '<div class="text-danger">Unable to load zones.</div>';
    return false;
  }

  async function loadProjects() {
    if (!selectedZone || !selectedCircle || !selectedUnit) {
      projects = [];
      renderProjectsTable();
      return;
    }
    const query = new URLSearchParams({ zone: selectedZone, circle: selectedCircle, unit: selectedUnit });
    const response = await fetch(`/api/user/projects?${query.toString()}`);
    const data = await response.json();
    if (data.success) {
      projects = data.projects;
      renderProjectsTable();
      updateLastRefresh();
      return;
    }
    projectList.innerHTML = '<div class="text-danger">Unable to load programmes.</div>';
  }

  function updateLastRefresh() {
    const now = new Date();
    lastRefreshLabel.textContent = `Last updated ${now.toLocaleTimeString()}`;
  }

  async function setProjectStatus(projectId, completed) {
    await fetch(`/api/projects/${projectId}/completion`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    await loadProjects();
  }

  zoneList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-zone]');
    if (!button) return;
    selectedZone = button.dataset.zone;
    selectedCircle = null;
    selectedUnit = null;
    renderZones();
    renderCircles();
    renderUnits();
    loadProjects();
  });

  circleList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-circle]');
    if (!button) return;
    selectedCircle = button.dataset.circle;
    selectedUnit = null;
    renderCircles();
    renderUnits();
    loadProjects();
  });

  unitList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-unit]');
    if (!button) return;
    selectedUnit = button.dataset.unit;
    renderUnits();
    loadProjects();
  });

  projectList.addEventListener('change', async (event) => {
    const checkbox = event.target.closest('.project-complete-checkbox');
    if (!checkbox) return;
    const projectId = checkbox.dataset.id;
    const completed = checkbox.checked;
    await setProjectStatus(projectId, completed);
  });

  refreshButton.addEventListener('click', async () => {
    await refreshSelectedData();
  });

  function refreshSelectedData() {
    if (selectedUnit) {
      loadProjects();
    }
  }

  async function init() {
    await loadLocations();
    setInterval(refreshSelectedData, 10000);
  }

  init();
});
