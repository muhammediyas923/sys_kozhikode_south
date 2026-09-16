/* Super Admin Dashboard JS */
document.addEventListener('DOMContentLoaded', () => {
  const { showToast, openModal, closeModal, formatDateTime, timeAgo } = window.dsUtils;


  let doughnutChart = null;
  let barChart = null;
  let analyticsRefreshTimer = null;

  async function loadAnalytics() {
    try {
      const resp = await fetch('/api/admin/analytics');
      const data = await resp.json();
      if (!data.success) return;
      const a = data.analytics;

      // Stat cards
      animateCount('stat-zones', a.totalZones);
      animateCount('stat-circles', a.totalCircles);
      animateCount('stat-units', a.totalUnits);
      animateCount('stat-active', a.activeUsers);
      animateCount('stat-inactive', a.inactiveUsers);
      animateCount('stat-programs', a.totalPrograms);
      animateCount('stat-completed', a.completedPrograms);
      document.getElementById('stat-percent').textContent = a.completionPercentage + '%';

      // Doughnut chart
      const completedVal = a.completedPrograms || 0;
      const pendingVal = Math.max(0, (a.pendingPrograms || 0));
      renderDoughnut(completedVal, pendingVal);

      // Bar chart
      renderBar(a.zoneWiseData || []);

      // Recent table
      renderRecentTable(a.recentCompletions || []);
    } catch (err) {
      showToast('Failed to load analytics.', 'danger');
    }
  }

  function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = 0;
    const duration = 800;
    const step = (timestamp) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      el.textContent = Math.round(start + progress * (target - start));
      if (progress < 1) requestAnimationFrame(step);
    };
    let startTime;
    requestAnimationFrame((ts) => { startTime = ts; step(ts); });
  }

  function renderDoughnut(completed, pending) {
    const ctx = document.getElementById('doughnut-chart').getContext('2d');
    if (doughnutChart) doughnutChart.destroy();
    
    const isEmpty = completed === 0 && pending === 0;
    const dataVals = isEmpty ? [0, 1] : [completed, pending];
    const bgColors = isEmpty ? ['#e2e8f0', '#e2e8f0'] : ['#14533e', '#e2e8f0'];
    const hoverBg = isEmpty ? ['#e2e8f0', '#e2e8f0'] : ['#1a6b4f', '#cbd5e1'];

    doughnutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Completed', 'Pending'],
        datasets: [{
          data: dataVals,
          backgroundColor: bgColors,
          hoverBackgroundColor: hoverBg,
          borderWidth: 0,
          hoverOffset: isEmpty ? 0 : 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { 
            position: 'bottom', 
            labels: { 
              padding: 20, 
              font: { family: 'Inter', size: 12 }
            } 
          },
          tooltip: { 
            callbacks: { 
              label: (ctx) => isEmpty ? ' No data yet' : ` ${ctx.label}: ${ctx.raw}` 
            } 
          },
        },
      },
    });
  }

  function renderBar(zoneData) {
    const ctx = document.getElementById('bar-chart').getContext('2d');
    if (barChart) barChart.destroy();
    
    const isEmpty = !zoneData || zoneData.length === 0;
    const labels = isEmpty ? ['No Completions Yet'] : zoneData.map(z => z._id || 'Unknown');
    const values = isEmpty ? [0] : zoneData.map(z => z.count);

    barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Completions',
          data: values,
          backgroundColor: isEmpty ? '#e2e8f0' : 'rgba(20,83,62,0.7)',
          hoverBackgroundColor: isEmpty ? '#e2e8f0' : '#14533e',
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { 
            callbacks: { 
              label: (ctx) => isEmpty ? ' No data yet' : ` ${ctx.raw} completions` 
            } 
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } },
          y: { 
            beginAtZero: true, 
            suggestedMax: isEmpty ? 1 : undefined,
            ticks: { 
              stepSize: 1, 
              font: { family: 'Inter', size: 11 } 
            }, 
            grid: { color: '#f1f5f9' } 
          },
        },
      },
    });
  }

  function renderRecentTable(completions) {
    const tbody = document.getElementById('recent-table');
    if (!completions.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">No completions recorded yet.</td></tr>';
      return;
    }
    tbody.innerHTML = completions.map(c => `
      <tr>
        <td><strong>${c.unitName || '—'}</strong></td>
        <td>${c.zone || '—'}</td>
        <td>${c.circle || '—'}</td>
        <td>${c.programTitle || '—'}</td>
        <td><span style="max-width:140px; display:inline-block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; vertical-align:middle;" title="${(c.notes || '').replace(/"/g, '&quot;')}">${c.notes ? c.notes : '<span class="text-muted">—</span>'}</span></td>
        <td>${c.completedAt ? new Date(c.completedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
      </tr>
    `).join('');
  }

  // Refresh button
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    showToast('Refreshing dashboard...', 'info');
    loadAnalytics();
  });

  function setupAutoRefresh() {
    clearInterval(analyticsRefreshTimer);
    analyticsRefreshTimer = setInterval(loadAnalytics, 10000); // Refresh every 10s
    window.addEventListener('focus', () => loadAnalytics());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadAnalytics();
    });
    window.addEventListener('storage', (event) => {
      if (event.key === 'sys:completion-updated') {
        loadAnalytics();
      }
    });
    window.addEventListener('sys:completion-updated', () => {
      loadAnalytics();
    });
  }

  // Init
  loadAnalytics();
  setupAutoRefresh();
});
