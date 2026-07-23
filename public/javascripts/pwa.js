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

registerServiceWorker();
handleInstallPrompt();
