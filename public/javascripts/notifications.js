/* ── Shared Dashboard Utilities ─────────────────────────────────────── */

// Sidebar toggle
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const toggleBtn = document.getElementById('sidebar-toggle');

let _sbToggleBusy = false;
window.toggleSidebar = (e) => {
  if (e && e.preventDefault) e.preventDefault();
  if (_sbToggleBusy) return;
  _sbToggleBusy = true;
  setTimeout(() => { _sbToggleBusy = false; }, 150);

  const sb = sidebar || document.getElementById('sidebar');
  const ov = overlay || document.getElementById('sidebar-overlay');
  if (!sb || !ov) return;
  sb.classList.toggle('open');
  ov.classList.toggle('open');
};

if (toggleBtn) {
  toggleBtn.addEventListener('click', window.toggleSidebar);
}

if (overlay) {
  overlay.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('open');
  });
}

// Auto-close sidebar when clicking links on mobile
if (sidebar) {
  sidebar.querySelectorAll('.ds-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 991) {
        sidebar.classList.remove('open');
        overlay?.classList.remove('open');
      }
    });
  });
}

// Toast notifications
function showToast(message, type = 'success') {
  const icons = { success: 'ph-check-circle', danger: 'ph-x-circle', warning: 'ph-warning', info: 'ph-info' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `ds-toast ds-toast-${type}`;
  toast.innerHTML = `
    <i class="ph ${icons[type] || icons.success} ds-toast-icon"></i>
    <span class="ds-toast-msg">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Modal utilities
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Time ago
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
// Export
window.dsUtils = {
  showToast,
  openModal,
  closeModal,
  formatDate,
  formatDateTime,
  timeAgo,
  loadNotifications: () => {}
};
