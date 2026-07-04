chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('maskflow_state', (data) => {
    if (!data.maskflow_state) {
      chrome.storage.local.set({
        maskflow_state: {
          categories: { balances: true, phones: true, emails: true, messages: true, avatars: true },
          hoverReveal: false,
          blurBrush: false,
          autoBlur: {},
        }
      });
    }
  });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  updateIcon(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    updateIcon(tabId);
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) {
      const domain = new URL(tab.url).hostname;
      const data = await chrome.storage.local.get('maskflow_state');
      const state = data.maskflow_state;
      if (state?.autoBlur?.[domain]) {
        try {
          await chrome.tabs.sendMessage(tabId, { action: 'toggleAll', enabled: true });
        } catch {
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tabId, { action: 'toggleAll', enabled: true });
            } catch {}
          }, 500);
        }
      }
    }
  }
});

async function updateIcon(tabId) {
  try {
    const data = await chrome.storage.local.get('maskflow_state');
    const state = data.maskflow_state;
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url) return;

    const domain = new URL(tab.url).hostname;
    const autoBlurred = state?.autoBlur?.[domain];
    const categoriesOn = state?.categories && Object.values(state.categories).some(v => v);

    if (categoriesOn || autoBlurred) {
      chrome.action.setIcon({ path: { 16: 'icons/icon-active_16.png', 48: 'icons/icon-active_48.png', 128: 'icons/icon-active_128.png' }, tabId });
      chrome.action.setTitle({ title: 'MaskFlow — Активен', tabId });
    } else {
      chrome.action.setIcon({ path: { 16: 'icons/icon-inactive_16.png', 48: 'icons/icon-inactive_48.png', 128: 'icons/icon-inactive_128.png' }, tabId });
      chrome.action.setTitle({ title: 'MaskFlow — Неактивен', tabId });
    }
  } catch {}
}
