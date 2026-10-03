/* Super Admin Reports JS */
document.addEventListener('DOMContentLoaded', () => {
  const { showToast, formatDate } = window.dsUtils;

  let reportData = [];
  let zones = [];
  let programs = [];

  async function loadFilters() {
    try {
      // Load Zones
      const zResp = await fetch('/api/zones');
      const zData = await zResp.json();
      if (zData.success) {
        zones = zData.zones;
        document.getElementById('rpt-zone').innerHTML = '<option value="">All Zones</option>' +
          zones.map(z => `<option value="${z.name}">${z.name}</option>`).join('');
      }

      // Load Programs
      const pResp = await fetch('/api/admin/programs');
      const pData = await pResp.json();
      if (pData.success) {
        programs = pData.programs;
        document.getElementById('rpt-program').innerHTML = '<option value="">All Programs</option>' +
          programs.map(p => `<option value="${p._id}">${p.title}</option>`).join('');
      }
    } catch (err) {
      showToast('Error loading filters.', 'danger');
    }
  }

  async function loadCirclesForZone(zoneName) {
    const circleSelect = document.getElementById('rpt-circle');
    if (!zoneName) {
      circleSelect.innerHTML = '<option value="">All Circles</option>';
      return;
    }
    try {
      const resp = await fetch(`/api/circles?zoneName=${encodeURIComponent(zoneName)}`);
      const data = await resp.json();
      if (data.success) {
        circleSelect.innerHTML = '<option value="">All Circles</option>' +
          data.circles.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
      }
    } catch (err) {
      showToast('Error loading circles.', 'danger');
    }
  }

  document.getElementById('rpt-zone').addEventListener('change', (e) => {
    loadCirclesForZone(e.target.value);
  });

  async function runReport() {
    const zone = document.getElementById('rpt-zone').value;
    const circle = document.getElementById('rpt-circle').value;
    const unitName = document.getElementById('rpt-unit').value.trim();
    const programId = document.getElementById('rpt-program').value;
    const status = document.getElementById('rpt-status').value;

    const params = new URLSearchParams();
    if (zone) params.append('zone', zone);
    if (circle) params.append('circle', circle);
    if (unitName) params.append('unitName', unitName);
    if (programId) params.append('programId', programId);
    if (status) params.append('status', status);

    const tbody = document.getElementById('report-table-body');
    tbody.innerHTML = '<tr><td colspan="8"><div class="ds-loading-overlay"><div class="ds-spinner"></div><span>Running report...</span></div></td></tr>';

    try {
      const resp = await fetch(`/api/admin/reports?${params.toString()}`);
      const data = await resp.json();
      if (data.success) {
        reportData = data.data;
        renderReportTable();
      } else {
        showToast(data.message || 'Failed to generate report.', 'danger');
      }
    } catch (err) {
      showToast('Error running report.', 'danger');
    }
  }

  function renderReportTable() {
    const tbody = document.getElementById('report-table-body');
    const badge = document.getElementById('result-count');
    badge.textContent = reportData.length;

    if (!reportData.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="ds-empty">
              <i class="ph ph-warning-circle ds-empty-icon"></i>
              <h3>No records found</h3>
              <p>Try adjusting your filter criteria.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = reportData.map((row, index) => {
      const statusBadge = row.completed
        ? '<span class="ds-badge ds-badge-success">Completed</span>'
        : '<span class="ds-badge ds-badge-warning">Pending</span>';

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.zone || '—')}</td>
          <td>${escapeHtml(row.circle || '—')}</td>
          <td><strong>${escapeHtml(row.unitName || '—')}</strong></td>
          <td><code>${escapeHtml(row.username || '—')}</code></td>
          <td>${escapeHtml(row.programTitle || '—')}</td>
          <td>${statusBadge}</td>
          <td>${row.completedAt ? formatDate(row.completedAt) : '—'}</td>
        </tr>
      `;
    }).join('');
  }

  // Clear Filters
  document.getElementById('clear-filters-btn')?.addEventListener('click', () => {
    document.getElementById('rpt-zone').value = '';
    document.getElementById('rpt-circle').innerHTML = '<option value="">All Circles</option>';
    document.getElementById('rpt-unit').value = '';
    document.getElementById('rpt-program').value = '';
    document.getElementById('rpt-status').value = '';
    reportData = [];
    renderReportTable();
  });

  // Run Report Trigger
  document.getElementById('run-report-btn')?.addEventListener('click', runReport);

  // Export handlers
  function getQueryString() {
    const zone = document.getElementById('rpt-zone').value;
    const circle = document.getElementById('rpt-circle').value;
    const unitName = document.getElementById('rpt-unit').value.trim();
    const programId = document.getElementById('rpt-program').value;
    const status = document.getElementById('rpt-status').value;

    const params = new URLSearchParams();
    if (zone) params.append('zone', zone);
    if (circle) params.append('circle', circle);
    if (unitName) params.append('unitName', unitName);
    if (programId) params.append('programId', programId);
    if (status) params.append('status', status);
    return params.toString();
  }

  document.getElementById('export-excel-btn')?.addEventListener('click', () => {
    window.location.href = `/api/admin/reports/export/excel?${getQueryString()}`;
  });

  document.getElementById('export-pdf-btn')?.addEventListener('click', () => {
    window.location.href = `/api/admin/reports/export/pdf?${getQueryString()}`;
  });

  document.getElementById('print-btn')?.addEventListener('click', () => {
    window.print();
  });

  // Init
  loadFilters();
});
