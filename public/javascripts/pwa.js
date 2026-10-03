const SYS_PWA_STATE = {
  deferredInstallPrompt: null,
  isInstallReady: false
};

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SYS PWA Service Worker registered.', registration);
      registration.update();
      if (registration.waiting) {
        console.log('A new service worker is waiting to activate.');
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }).catch(error => {
      console.warn('SYS PWA Service Worker registration failed:', error);
    });
  });
}

function handleInstallPrompt() {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    SYS_PWA_STATE.deferredInstallPrompt = event;
    SYS_PWA_STATE.isInstallReady = true;
    console.log('SYS PWA install prompt is ready. Call window.promptPwaInstall() to show it.');
  });

  window.addEventListener('appinstalled', () => {
    console.log('SYS PWA installed.');
  });
}

window.promptPwaInstall = async () => {
  if (!SYS_PWA_STATE.deferredInstallPrompt) {
    console.log('Install prompt is not available yet.');
    return null;
  }

  SYS_PWA_STATE.deferredInstallPrompt.prompt();
  const choiceResult = await SYS_PWA_STATE.deferredInstallPrompt.userChoice;
  SYS_PWA_STATE.deferredInstallPrompt = null;
  SYS_PWA_STATE.isInstallReady = false;
  return choiceResult;
};

// Global CSRF Token Fetch Interceptor & Form Handler
(function setupCsrfProtection() {
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    return getCookie('sys.csrf');
  }

  // Intercept window.fetch to automatically include CSRF token on mutating requests
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      init = init || {};
      const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

      if (mutatingMethods.includes(method)) {
        const token = getCsrfToken();
        if (token) {
          if (init.headers instanceof Headers) {
            if (!init.headers.has('x-csrf-token')) {
              init.headers.set('x-csrf-token', token);
            }
          } else if (Array.isArray(init.headers)) {
            const hasHeader = init.headers.some(([k]) => k.toLowerCase() === 'x-csrf-token');
            if (!hasHeader) init.headers.push(['x-csrf-token', token]);
          } else {
            init.headers = init.headers || {};
            const keys = Object.keys(init.headers);
            const hasHeader = keys.some(k => k.toLowerCase() === 'x-csrf-token');
            if (!hasHeader) {
              init.headers['x-csrf-token'] = token;
            }
          }
        }
      }
      return originalFetch.call(this, input, init);
    };
  }

  // Auto-inject hidden _csrf inputs into any POST form
  function injectCsrfIntoForms() {
    const token = getCsrfToken();
    if (!token) return;
    document.querySelectorAll('form[method="POST" i], form[method="post" i]').forEach(form => {
      let input = form.querySelector('input[name="_csrf"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = '_csrf';
        form.appendChild(input);
      }
      if (!input.value) {
        input.value = token;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCsrfIntoForms);
  } else {
    injectCsrfIntoForms();
  }
})();

// Global XSS Sanitizer
if (typeof window.escapeHtml !== 'function') {
  window.escapeHtml = function(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
}

registerServiceWorker();
handleInstallPrompt();
