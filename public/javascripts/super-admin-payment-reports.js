/**
 * Super Admin Payment Reports & Audit
 * Dynamic filtering, KPI summaries, pagination, sorting, detail modal & exports
 */
document.addEventListener('DOMContentLoaded', () => {
  // State
  let currentPage = 1;
  let pageSize = 25;
  let sortField = 'createdAt';
  let sortOrder = 'desc';
  let totalPages = 1;

  // DOM elements
  const tbody = document.getElementById('payments-table-body');
  const reportTotalBadge = document.getElementById('report-total-badge');
  const kpiTotalAmount = document.getElementById('kpi-total-amount');
  const kpiPaidCount = document.getElementById('kpi-paid-count');
  const kpiPendingCount = document.getElementById('kpi-pending-count');
  const kpiFailedCount = document.getElementById('kpi-failed-count');
  const kpiTotalCount = document.getElementById('kpi-total-count');

  // Filters
  const quickDateSelect = document.getElementById('filter-quick-date');
  const startDateInput = document.getElementById('filter-start-date');
  const endDateInput = document.getElementById('filter-end-date');
  const customDateGroups = document.querySelectorAll('.custom-date-group');
  const roleSelect = document.getElementById('filter-role');
  const statusSelect = document.getElementById('filter-status');
  const zoneSelect = document.getElementById('filter-zone');
  const circleSelect = document.getElementById('filter-circle');
  const purposeSelect = document.getElementById('filter-purpose');
  const searchInput = document.getElementById('filter-search');
  const applyFiltersBtn = document.getElementById('apply-filters-btn');
  const resetFiltersBtn = document.getElementById('reset-filters-btn');
  const pageSizeSelect = document.getElementById('page-size-select');

  // Pagination
  const prevPageBtn = document.getElementById('prev-page-btn');
  const nextPageBtn = document.getElementById('next-page-btn');
  const currentPageDisplay = document.getElementById('current-page-display');
  const paginationInfo = document.getElementById('pagination-info');

  // Exports
  const exportExcelBtn = document.getElementById('export-excel-btn');
  const exportPdfBtn = document.getElementById('export-pdf-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');

  // Modal
  const detailModalBackdrop = document.getElementById('detail-modal-backdrop');
  const closeDetailModalBtn = document.getElementById('close-detail-modal');
  const closeDetailModalFooterBtn = document.getElementById('close-detail-modal-btn');
  const detailModalBody = document.getElementById('detail-modal-body');

  // Load Zones for dropdown
  async function loadZones() {
    try {
      const resp = await fetch('/api/zones');
      const data = await resp.json();
      if (data.success && Array.isArray(data.zones)) {
        zoneSelect.innerHTML = '<option value="">All Zones</option>' +
          data.zones.map((z) => `<option value="${z.name}">${z.name}</option>`).join('');
      }
    } catch (err) {
      console.error('Failed to load zones:', err);
    }
  }

  // Load Circles for chosen Zone
  async function loadCircles(zoneName) {
    if (!zoneName) {
      circleSelect.innerHTML = '<option value="">All Circles</option>';
      return;
    }
    try {
      const resp = await fetch(`/api/circles?zoneName=${encodeURIComponent(zoneName)}`);
      const data = await resp.json();
      if (data.success && Array.isArray(data.circles)) {
        circleSelect.innerHTML = '<option value="">All Circles</option>' +
          data.circles.map((c) => `<option value="${c.name}">${c.name}</option>`).join('');
      }
    } catch (err) {
      console.error('Failed to load circles:', err);
    }
  }

  zoneSelect.addEventListener('change', (e) => {
    loadCircles(e.target.value);
  });

  // Toggle custom date range inputs
  quickDateSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      customDateGroups.forEach((el) => el.classList.remove('d-none'));
    } else {
      customDateGroups.forEach((el) => el.classList.add('d-none'));
      startDateInput.value = '';
      endDateInput.value = '';
    }
  });

  // Build query string from active filters
  function buildFilterQuery() {
    const params = new URLSearchParams();

    if (quickDateSelect.value && quickDateSelect.value !== 'custom') {
      params.append('quickDate', quickDateSelect.value);
    }
    if (quickDateSelect.value === 'custom') {
      if (startDateInput.value) params.append('startDate', startDateInput.value);
      if (endDateInput.value) params.append('endDate', endDateInput.value);
    }
    if (roleSelect.value) params.append('role', roleSelect.value);
    if (statusSelect.value) params.append('status', statusSelect.value);
    if (zoneSelect.value) params.append('zone', zoneSelect.value);
    if (circleSelect.value) params.append('circle', circleSelect.value);
    if (purposeSelect.value) params.append('purpose', purposeSelect.value);
    if (searchInput.value.trim()) params.append('search', searchInput.value.trim());

    return params;
  }

  // Fetch report data
  async function fetchReports() {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="text-center py-5">
            <div class="spinner-border text-success" role="status"></div>
            <div class="mt-2 text-muted">Fetching transactions...</div>
          </div>
        </td>
      </tr>`;

    const params = buildFilterQuery();
    params.append('page', currentPage);
    params.append('limit', pageSize);
    params.append('sortField', sortField);
    params.append('sortOrder', sortOrder);

    try {
      const resp = await fetch(`/api/admin/payments?${params.toString()}`);
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        throw new Error(data.message || 'Failed to fetch payment reports.');
      }

      // Update KPI Cards
      const totals = data.totals || {};
      kpiTotalAmount.textContent = `₹${Number(totals.totalPaidAmount || 0).toLocaleString('en-IN')}`;
      kpiPaidCount.textContent = totals.paidCount || 0;
      kpiPendingCount.textContent = totals.pendingCount || 0;
      kpiFailedCount.textContent = totals.failedCount || 0;
      kpiTotalCount.textContent = totals.totalTransactions || 0;

      // Update Pagination & Table
      const pagination = data.pagination || {};
      totalPages = pagination.totalPages || 1;
      currentPage = pagination.page || 1;
      reportTotalBadge.textContent = pagination.total || 0;

      renderTable(data.payments || []);
      updatePaginationControls(pagination);
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="alert alert-danger m-3">${err.message || 'Error loading transactions.'}</div>
          </td>
        </tr>`;
    }
  }

  function renderTable(payments) {
    if (!payments.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="ds-empty">
              <i class="ph ph-receipt ds-empty-icon"></i>
              <h3>No matching transactions found</h3>
              <p>Try resetting or broadening your filter criteria.</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = payments
      .map((p) => {
        const dateStr = p.createdAt
          ? new Date(p.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '-';

        let roleBadge = '<span class="badge bg-light text-dark border">User</span>';
        if (p.role === 'UnitUser') {
          roleBadge = '<span class="badge bg-info-subtle text-info border border-info-subtle">Unit</span>';
        } else if (p.role === 'CircleUser') {
          roleBadge = '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Circle</span>';
        } else if (p.role === 'ZoneUser') {
          roleBadge = '<span class="badge bg-purple-subtle text-primary border border-primary-subtle">Zone</span>';
        }

        let statusBadge = '';
        if (p.status === 'paid') {
          statusBadge = '<span class="ds-badge ds-badge-success"><i class="ph ph-check-circle"></i> Paid</span>';
        } else if (p.status === 'failed') {
          statusBadge = '<span class="ds-badge ds-badge-danger"><i class="ph ph-x-circle"></i> Failed</span>';
        } else {
          statusBadge = `<span class="ds-badge ds-badge-warning"><i class="ph ph-clock"></i> ${p.status}</span>`;
        }

        const hierarchy = [p.zone, p.circle].filter(Boolean).join(' · ') || '-';

        return `
          <tr>
            <td><span class="small">${dateStr}</span></td>
            <td>
              <div class="fw-bold text-dark">${p.displayName || p.username}</div>
              <div class="text-muted small">${p.username}</div>
            </td>
            <td>${roleBadge}</td>
            <td><span class="small text-muted">${hierarchy}</span></td>
            <td class="fw-bold text-dark">₹${Number(p.amount || 0).toLocaleString('en-IN')}</td>
            <td><span class="small">${p.purpose || '-'}</span></td>
            <td>${statusBadge}</td>
            <td>
              ${p.paymentId ? `<code class="text-success small">${p.paymentId}</code>` : '<span class="text-muted small">—</span>'}
            </td>
            <td>
              <button type="button" class="ds-btn ds-btn-outline ds-btn-sm view-detail-btn" data-id="${p._id}">
                <i class="ph ph-eye"></i> Details
              </button>
            </td>
          </tr>`;
      })
      .join('');

    // Attach click listeners to Details buttons via delegation on tbody
  }

  // Delegated click on tbody for Details button (works reliably with nested icons & re-renders)
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-detail-btn');
    if (btn) {
      const id = btn.getAttribute('data-id');
      if (id) openDetailModal(id);
    }
  });

  function updatePaginationControls(pagination) {
    const total = pagination.total || 0;
    const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);

    paginationInfo.textContent = `Showing ${start} - ${end} of ${total} records`;
    currentPageDisplay.textContent = `Page ${currentPage} of ${totalPages}`;

    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
  }

  // Pagination clicks
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      fetchReports();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      fetchReports();
    }
  });

  pageSizeSelect.addEventListener('change', (e) => {
    pageSize = parseInt(e.target.value, 10);
    currentPage = 1;
    fetchReports();
  });

  // Sorting
  document.querySelectorAll('.th-sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      if (sortField === field) {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        sortField = field;
        sortOrder = 'desc';
      }
      currentPage = 1;
      fetchReports();
    });
  });

  // Filter actions
  applyFiltersBtn.addEventListener('click', () => {
    currentPage = 1;
    fetchReports();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      currentPage = 1;
      fetchReports();
    }
  });

  resetFiltersBtn.addEventListener('click', () => {
    quickDateSelect.value = '';
    customDateGroups.forEach((el) => el.classList.add('d-none'));
    startDateInput.value = '';
    endDateInput.value = '';
    roleSelect.value = '';
    statusSelect.value = '';
    zoneSelect.value = '';
    circleSelect.innerHTML = '<option value="">All Circles</option>';
    purposeSelect.value = '';
    searchInput.value = '';
    currentPage = 1;
    fetchReports();
  });

  // Details Modal
  async function openDetailModal(id) {
    detailModalBackdrop.classList.add('open');
    detailModalBody.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-success" role="status"></div>
        <div class="mt-2 text-muted">Loading transaction audit details...</div>
      </div>`;

    try {
      const resp = await fetch(`/api/admin/payments/${id}`);
      const data = await resp.json();

      if (!data.success || !data.payment) {
        detailModalBody.innerHTML = '<div class="alert alert-danger">Transaction details not found.</div>';
        return;
      }

      const p = data.payment;
      const isPaid = p.status === 'paid';

      detailModalBody.innerHTML = `
        <div class="p-3 bg-light rounded-3 mb-3 border">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <h6 class="mb-0 fw-bold text-dark"><i class="ph ph-user"></i> Payer Information</h6>
            <span class="badge bg-success-subtle text-success border border-success-subtle">${p.role}</span>
          </div>
          <div class="row g-2 small">
            <div class="col-sm-6"><span class="text-muted">Display Name:</span> <strong>${p.displayName || '—'}</strong></div>
            <div class="col-sm-6"><span class="text-muted">Username:</span> <strong>${p.username || '—'}</strong></div>
            <div class="col-sm-6"><span class="text-muted">User ID:</span> <code>${p.userId || '—'}</code></div>
            ${p.unit ? `<div class="col-sm-6"><span class="text-muted">Unit:</span> <strong>${p.unit}</strong></div>` : ''}
            ${p.circle ? `<div class="col-sm-6"><span class="text-muted">Circle:</span> <strong>${p.circle}</strong></div>` : ''}
            ${p.zone ? `<div class="col-sm-6"><span class="text-muted">Zone:</span> <strong>${p.zone}</strong></div>` : ''}
          </div>
        </div>

        <div class="p-3 bg-light rounded-3 mb-3 border">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <h6 class="mb-0 fw-bold text-dark"><i class="ph ph-currency-inr"></i> Financial Details</h6>
            <span class="fs-5 fw-bold text-success">₹${Number(p.amount || 0).toLocaleString('en-IN')}</span>
          </div>
          <div class="row g-2 small">
            <div class="col-sm-6"><span class="text-muted">Currency:</span> <strong>${p.currency || 'INR'}</strong></div>
            <div class="col-sm-6"><span class="text-muted">Purpose:</span> <strong>${p.purpose || '—'}</strong></div>
            <div class="col-12"><span class="text-muted">Remarks / Note:</span> <strong>${p.description || 'None'}</strong></div>
            <div class="col-sm-6"><span class="text-muted">Status:</span> 
              <span class="badge ${isPaid ? 'bg-success' : (p.status === 'failed' ? 'bg-danger' : 'bg-warning text-dark')}">${p.status.toUpperCase()}</span>
            </div>
            ${p.failureReason ? `<div class="col-12 text-danger"><span class="text-muted">Failure Reason:</span> ${p.failureReason}</div>` : ''}
          </div>
        </div>

        <div class="p-3 bg-light rounded-3 mb-3 border">
          <h6 class="mb-2 fw-bold text-dark"><i class="ph ph-shield-check"></i> Razorpay Audit Information</h6>
          <div class="row g-2 small">
            <div class="col-12"><span class="text-muted">Razorpay Order ID:</span> <code>${p.orderId}</code></div>
            <div class="col-12"><span class="text-muted">Razorpay Payment ID:</span> <code>${p.paymentId || 'Not Captured'}</code></div>
            <div class="col-sm-6"><span class="text-muted">Signature Verified:</span> 
              <span class="badge ${p.signature ? 'bg-success' : 'bg-secondary'}">${p.signature ? 'VERIFIED' : 'UNVERIFIED'}</span>
            </div>
            <div class="col-sm-6"><span class="text-muted">Created Date:</span> ${p.createdAt ? new Date(p.createdAt).toLocaleString('en-IN') : '—'}</div>
            <div class="col-sm-6"><span class="text-muted">Paid Date:</span> ${p.paidAt ? new Date(p.paidAt).toLocaleString('en-IN') : '—'}</div>
            <div class="col-sm-6"><span class="text-muted">Verified Date:</span> ${p.verifiedAt ? new Date(p.verifiedAt).toLocaleString('en-IN') : '—'}</div>
          </div>
        </div>
      `;
    } catch (err) {
      detailModalBody.innerHTML = '<div class="alert alert-danger">Error loading transaction audit.</div>';
    }
  }

  function closeDetailModal() {
    detailModalBackdrop.classList.remove('open');
  }

  closeDetailModalBtn.addEventListener('click', closeDetailModal);
  closeDetailModalFooterBtn.addEventListener('click', closeDetailModal);
  detailModalBackdrop.addEventListener('click', (e) => {
    if (e.target === detailModalBackdrop) closeDetailModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailModalBackdrop.classList.contains('open')) {
      closeDetailModal();
    }
  });

  // Mobile sidebar toggle
  const sidebarEl = document.getElementById('sidebar');
  const overlayEl = document.getElementById('sidebar-overlay');
  const toggleBtn = document.getElementById('sidebar-toggle');

  let _sbBusy = false;
  window.toggleSidebar = (e) => {
    if (e) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }
    if (_sbBusy) return;
    _sbBusy = true;
    setTimeout(() => { _sbBusy = false; }, 250);
    sidebarEl?.classList.toggle('open');
    overlayEl?.classList.toggle('open');
  };

  if (toggleBtn) {
    toggleBtn.addEventListener('click', window.toggleSidebar);
    toggleBtn.addEventListener('touchend', (e) => {
      window.toggleSidebar(e);
    }, { passive: false });
  }

  if (overlayEl) {
    const closeSb = (e) => {
      if (e) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
      }
      sidebarEl?.classList.remove('open');
      overlayEl?.classList.remove('open');
    };
    overlayEl.addEventListener('click', closeSb);
    overlayEl.addEventListener('touchend', closeSb, { passive: false });
  }

  sidebarEl?.querySelectorAll('.ds-nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 991) {
        sidebarEl?.classList.remove('open');
        overlayEl?.classList.remove('open');
      }
    });
  });

  // Exports
  exportExcelBtn.addEventListener('click', () => {
    const params = buildFilterQuery();
    window.location.href = `/api/admin/payments/export/excel?${params.toString()}`;
  });

  exportPdfBtn.addEventListener('click', () => {
    const params = buildFilterQuery();
    window.location.href = `/api/admin/payments/export/pdf?${params.toString()}`;
  });

  exportCsvBtn.addEventListener('click', () => {
    const params = buildFilterQuery();
    window.location.href = `/api/admin/payments/export/csv?${params.toString()}`;
  });

  // Initial loads
  loadZones();
  fetchReports();
});
