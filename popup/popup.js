const STORAGE_KEY = 'maskflow_state';

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js'],
      });
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['content/blur.css'],
      });
      return true;
    } catch (e) {
      console.warn('Cannot inject content script. For file:// URLs, enable "Allow access to file URLs" in chrome://extensions.', e);
      return false;
    }
  }
}

async function sendMessageToTab(tabId, message) {
  if (!await ensureContentScript(tabId)) return;
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    console.warn('Failed to send message to tab.');
  }
}

async function loadState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || {
    categories: { balances: true, phones: true, emails: true, messages: true, avatars: true },
    hoverReveal: false,
    blurBrush: false,
    autoBlur: {},
  };
}

function allCategoriesEnabled(state) {
  return Object.values(state.categories).every(v => v);
}

function anyCategoryEnabled(state) {
  return Object.values(state.categories).some(v => v);
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function updateMasterButton(enabled) {
  const btn = document.getElementById('masterToggle');
  const text = document.getElementById('masterText');
  const icon = document.getElementById('masterIcon');

  btn.classList.toggle('off', !enabled);
  text.textContent = enabled ? 'Показать всё' : 'Скрыть всё на странице';

  if (enabled) {
    icon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`;
  } else {
    icon.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>`;
  }
}

function updateToggle(selector, enabled) {
  const row = document.querySelector(selector);
  if (row) {
    const input = row.querySelector('input[type="checkbox"]');
    if (input) input.checked = enabled;
  }
}

function updateCategoryToggles(state) {
  document.querySelectorAll('[data-category]').forEach(row => {
    const cat = row.dataset.category;
    const input = row.querySelector('input[type="checkbox"]');
    if (input && state.categories[cat] !== undefined) {
      input.checked = state.categories[cat];
    }
  });
}

async function init() {
  const tab = await getCurrentTab();
  const state = await loadState();

  document.getElementById('domainName').textContent = tab?.url ? new URL(tab.url).hostname : '';

  updateMasterButton(anyCategoryEnabled(state));
  updateCategoryToggles(state);
  updateToggle('#hoverRevealRow', state.hoverReveal);
  updateToggle('#blurBrushRow', state.blurBrush);

  const domain = tab?.url ? new URL(tab.url).hostname : '';
  const autoBlur = state.autoBlur?.[domain] || false;
  document.getElementById('autoBlurToggle').checked = autoBlur;

  document.getElementById('masterToggle').addEventListener('click', async () => {
    const newState = !anyCategoryEnabled(state);
    for (const cat of Object.keys(state.categories)) {
      state.categories[cat] = newState;
    }
    updateMasterButton(newState);
    updateCategoryToggles(state);
    await saveState(state);
    await sendMessageToTab(tab.id, { action: 'toggleAll', enabled: newState });
  });

  document.querySelectorAll('[data-category]').forEach(row => {
    const input = row.querySelector('input[type="checkbox"]');
    input.addEventListener('change', async () => {
      const cat = row.dataset.category;
      state.categories[cat] = input.checked;
      updateMasterButton(anyCategoryEnabled(state));
      await saveState(state);
      await sendMessageToTab(tab.id, { action: 'toggleCategory', category: cat, enabled: input.checked });
    });
  });

  document.getElementById('hoverRevealToggle').addEventListener('change', async () => {
    state.hoverReveal = document.getElementById('hoverRevealToggle').checked;
    await saveState(state);
    await sendMessageToTab(tab.id, { action: 'toggleHoverReveal', enabled: state.hoverReveal });
  });

  document.getElementById('blurBrushToggle').addEventListener('change', async () => {
    state.blurBrush = document.getElementById('blurBrushToggle').checked;
    await saveState(state);
    await sendMessageToTab(tab.id, { action: 'toggleBlurBrush', enabled: state.blurBrush });
  });

  document.getElementById('autoBlurToggle').addEventListener('change', async () => {
    if (!state.autoBlur) state.autoBlur = {};
    const en = document.getElementById('autoBlurToggle').checked;
    state.autoBlur[domain] = en;
    if (en) {
      for (const cat of Object.keys(state.categories)) {
        state.categories[cat] = true;
      }
    }
    await saveState(state);
    await sendMessageToTab(tab.id, { action: 'toggleAll', enabled: en });
    updateMasterButton(anyCategoryEnabled(state));
    updateCategoryToggles(state);
  });
}

document.addEventListener('DOMContentLoaded', init);
