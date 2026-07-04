(function () {
  'use strict';

  const BLUR_CLASS = 'mf-blur';
  const HOVER_CLASS = 'mf-hover-reveal';
  const BRUSH_CLASS = 'mf-brush-active';
  const DATA_ATTR = 'mf-blurred';

  let state = {
    categories: { balances: true, phones: true, emails: true, messages: true, avatars: true },
    hoverReveal: false,
    blurBrush: false,
  };

  function anyCategoryEnabled() {
    return Object.values(state.categories).some(v => v);
  }

  let blurredElements = new Set();
  let blurSpans = new Set();
  let brushListener = null;
  let observer = null;
  let stateFromMessage = false;

  // ─── Patterns ────────────────────────────────────────────
  const PATTERNS = {
    balances: [
      /(?:\$|€|£|₽|₴|₸|¥|₹)\s*\d[\d\s,.']*/g,
      /\b\d[\d\s,.']*\s*(?:руб|₽|\$|€|£|USD|EUR|RUB)\b/gi,
      /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    ],
    phones: [
      /(?:\+7|8)\s*[(-]?\s*\d{3}\s*[-)]?\s*\d{3}\s*-?\s*\d{2}\s*-?\s*\d{2}/g,
    ],
    emails: [
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    ],
    messages: [],
    avatars: [],
  };

  // ─── Text-node-level blurring ──────────────────────────
  function blurTextNode(textNode, patterns) {
    const text = textNode.textContent;
    const matches = [];

    for (const re of patterns) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(text)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
      }
    }

    if (matches.length === 0) return null;

    matches.sort((a, b) => a.start - b.start);

    const merged = [matches[0]];
    for (let i = 1; i < matches.length; i++) {
      const last = merged[merged.length - 1];
      if (matches[i].start <= last.end) {
        last.end = Math.max(last.end, matches[i].end);
        last.text = text.slice(last.start, last.end);
      } else {
        merged.push(matches[i]);
      }
    }

    const fragment = document.createDocumentFragment();
    let lastIdx = 0;

    for (const m of merged) {
      if (m.start > lastIdx) {
        fragment.appendChild(document.createTextNode(text.slice(lastIdx, m.start)));
      }
      const span = document.createElement('span');
      span.className = BLUR_CLASS;
      span.setAttribute(DATA_ATTR, '');
      span.textContent = m.text;
      fragment.appendChild(span);
      blurSpans.add(span);
      lastIdx = m.end;
    }

    if (lastIdx < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIdx)));
    }

    return fragment;
  }

  function scanAndBlurText(category) {
    const patterns = PATTERNS[category];
    if (!patterns || patterns.length === 0) return;

    const textNodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement?.closest(`.${BLUR_CLASS}, script, style, noscript, svg, canvas`)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const textNode of textNodes) {
      const fragment = blurTextNode(textNode, patterns);
      if (fragment) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    }
  }

  // ─── Element-level blurring (messages, avatars) ────────
  function shouldBlurElement(el, category) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'NOSCRIPT') return false;
    if (el.closest(`.${BLUR_CLASS}`)) return false;
    if (el.hasAttribute(DATA_ATTR)) return false;

    if (category === 'avatars') {
      if (el.tagName === 'IMG') {
        const w = el.naturalWidth || el.width || 0;
        const h = el.naturalHeight || el.height || 0;
        if (w > 0 && h > 0 && w < 300 && h < 300) return true;
        const attr = (el.className + ' ' + el.id + ' ' + el.alt + ' ' + el.src).toLowerCase();
        if (/avatar|profile|photo|userpic|face|portrait|pfp/i.test(attr)) return true;
      }
      if (el.tagName === 'IMG' || el.tagName === 'VIDEO') return true;
      return false;
    }

    if (category === 'messages') {
      const tag = el.tagName.toLowerCase();
      if (['input', 'textarea'].includes(tag)) {
        if (el.type === 'hidden') return false;
        return true;
      }
      const role = el.getAttribute('role') || '';
      if (/chat|message|conversation|comment|thread/i.test(role)) return true;
      const cls = (el.className + ' ' + el.id).toLowerCase();
      if (/message|chat|conversation|comment|thread|tweet|post-body/i.test(cls)) return true;
      if (el.isContentEditable) return true;
      return false;
    }

    return false;
  }

  function findAvatarImages() {
    const images = document.querySelectorAll('img');
    const result = [];
    for (const img of images) {
      if (img.closest(`.${BLUR_CLASS}`)) continue;
      if (img.hasAttribute(DATA_ATTR)) continue;

      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const src = (img.src || '').toLowerCase();
      const cls = (img.className + ' ' + img.id + ' ' + (img.alt || '')).toLowerCase();

      const isSmall = (w > 0 && h > 0 && w <= 300 && h <= 300);
      const isAvatar = /avatar|profile|photo|userpic|face|pfp|thumbnail/i.test(cls + ' ' + src);

      if (isSmall || isAvatar) {
        result.push(img);
      }
    }
    return result;
  }

  function findMessageElements() {
    const selectors = [
      '[role="chat"]', '[role="message"]', '[role="comment"]',
      '[role="conversation"]', '[role="thread"]',
      '[data-testid*="message"]', '[data-testid*="chat"]',
      '[data-testid*="tweet"]',
      'article', '.message', '.chat-message', '.conversation',
      '.comment', '.post-body', '.tweet-text',
      '[contenteditable="true"]',
    ];
    let elements = [];
    for (const sel of selectors) {
      try {
        const found = document.querySelectorAll(sel);
        elements.push(...found);
      } catch {}
    }

    document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], textarea').forEach(el => {
      if (el.value && el.offsetParent !== null) {
        elements.push(el);
      }
    });

    return [...new Set(elements)];
  }

  // ─── Apply / Remove blur ──────────────────────────────
  function applyBlur() {
    const cats = state.categories;

    if (cats.balances) scanAndBlurText('balances');
    if (cats.phones) scanAndBlurText('phones');
    if (cats.emails) scanAndBlurText('emails');

    if (cats.messages) {
      findMessageElements().forEach(el => blurElement(el));
    }

    if (cats.avatars) {
      findAvatarImages().forEach(img => blurElement(img));
    }
  }

  function blurElement(el) {
    if (el.classList.contains(BLUR_CLASS)) return;
    el.classList.add(BLUR_CLASS);
    el.setAttribute(DATA_ATTR, '');
    blurredElements.add(el);
  }

  function removeBlur() {
    for (const span of blurSpans) {
      if (span.parentNode) {
        span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
      }
    }
    blurSpans.clear();

    blurredElements.forEach(el => {
      el.classList.remove(BLUR_CLASS);
      el.removeAttribute(DATA_ATTR);
    });
    blurredElements.clear();

    document.querySelectorAll(`.${BLUR_CLASS}`).forEach(el => {
      el.classList.remove(BLUR_CLASS);
      el.removeAttribute(DATA_ATTR);
    });
  }

  function refreshBlur() {
    removeBlur();
    if (anyCategoryEnabled()) {
      applyBlur();
    }
  }

  // ─── Hover reveal ─────────────────────────────────────
  function updateHoverReveal(enabled) {
    state.hoverReveal = enabled;
    document.documentElement.classList.toggle(HOVER_CLASS, enabled);
  }

  // ─── Blur brush ────────────────────────────────────────
  function updateBlurBrush(enabled) {
    state.blurBrush = enabled;
    document.documentElement.classList.toggle(BRUSH_CLASS, enabled);

    if (brushListener) {
      document.removeEventListener('click', brushListener, true);
      brushListener = null;
    }

    if (enabled) {
      brushListener = function (e) {
        if (!state.blurBrush) return;
        e.preventDefault();
        e.stopPropagation();
        blurElement(e.target);
      };
      document.addEventListener('click', brushListener, true);
    }
  }

  // ─── MutationObserver ──────────────────────────────────
  function startObserver() {
    if (observer) observer.disconnect();
    if (!anyCategoryEnabled()) return;

    observer = new MutationObserver(() => {
      if (state.masterEnabled) {
        applyBlur();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: true,
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ─── Message handler ───────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case 'ping':
        sendResponse({ ok: true });
        break;

      case 'toggleAll':
        stateFromMessage = true;
        for (const cat of Object.keys(state.categories)) {
          state.categories[cat] = msg.enabled;
        }
        if (msg.enabled) {
          applyBlur();
          startObserver();
        } else {
          removeBlur();
          updateBlurBrush(false);
          stopObserver();
        }
        sendResponse({ ok: true });
        break;

      case 'toggleCategory':
        stateFromMessage = true;
        state.categories[msg.category] = msg.enabled;
        refreshBlur();
        sendResponse({ ok: true });
        break;

      case 'toggleHoverReveal':
        updateHoverReveal(msg.enabled);
        sendResponse({ ok: true });
        break;

      case 'toggleBlurBrush':
        updateBlurBrush(msg.enabled);
        sendResponse({ ok: true });
        break;

      case 'getState':
        sendResponse(state);
        break;
    }
    return true;
  });

  // ─── Initialize from stored state ─────────────────────
  (async function init() {
    if (stateFromMessage) return;

    const data = await chrome.storage.local.get('maskflow_state');
    const saved = data.maskflow_state;
    if (saved) {
      state.categories = { ...state.categories, ...saved.categories };
      state.hoverReveal = saved.hoverReveal || false;
      state.blurBrush = saved.blurBrush || false;
    }

    const domain = window.location.hostname;
    if (saved?.autoBlur?.[domain]) {
      for (const cat of Object.keys(state.categories)) {
        state.categories[cat] = true;
      }
    }

    if (state.hoverReveal) updateHoverReveal(true);
    if (state.blurBrush) updateBlurBrush(true);
    if (anyCategoryEnabled()) {
      applyBlur();
      startObserver();
    }
  })();

})();
