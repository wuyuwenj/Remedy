// Remedy — Chrome Extension Service Worker

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Active fix state — persists across navigations until cleared
let activeFixes = null; // { url, initScripts, postLoadScripts }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_URL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      sendResponse({ url: tab?.url || '', title: tab?.title || '' });
    });
    return true;
  }

  if (message.type === 'APPLY_FIXES') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      try {
        activeFixes = {
          tabId: tab.id,
          url: new URL(tab.url).origin + new URL(tab.url).pathname,
          initScripts: (message.initScripts || []).filter(Boolean),
          postLoadScripts: (message.postLoadScripts || message.scripts || []).filter(Boolean),
        };

        // Apply postLoadScripts immediately to the current page
        await injectScripts(tab.id, activeFixes.postLoadScripts);

        // If there are initScripts, reload so they run before page scripts
        if (activeFixes.initScripts.length > 0) {
          chrome.tabs.reload(tab.id);
          sendResponse({ success: true, reloading: true });
        } else {
          sendResponse({ success: true });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    });
    return true;
  }

  if (message.type === 'CLEAR_FIXES') {
    activeFixes = null;
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'GET_FIX_STATUS') {
    sendResponse({ active: !!activeFixes, url: activeFixes?.url || null });
    return true;
  }
});

// Inject initScripts as early as possible on navigation commit
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0 || !activeFixes) return;
  if (details.tabId !== activeFixes.tabId) return;

  const navUrl = new URL(details.url).origin + new URL(details.url).pathname;
  if (navUrl !== activeFixes.url) return;

  for (const script of activeFixes.initScripts) {
    chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: (code) => {
        try {
          const s = document.createElement('script');
          s.textContent = code;
          (document.head || document.documentElement).appendChild(s);
          s.remove();
        } catch (e) {
          console.error('[Remedy initScript]', e);
        }
      },
      args: [script],
      world: 'MAIN',
      injectImmediately: true,
    }).catch(() => {});
  }
});

// Inject postLoadScripts after page finishes loading
chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0 || !activeFixes) return;
  if (details.tabId !== activeFixes.tabId) return;

  const navUrl = new URL(details.url).origin + new URL(details.url).pathname;
  if (navUrl !== activeFixes.url) return;

  injectScripts(details.tabId, activeFixes.postLoadScripts);
});

async function injectScripts(tabId, scripts) {
  for (const script of scripts) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (code) => {
        try {
          const s = document.createElement('script');
          s.textContent = code;
          (document.head || document.documentElement).appendChild(s);
          s.remove();
        } catch (e) {
          console.error('[Remedy postLoadScript]', e);
        }
      },
      args: [script],
      world: 'MAIN',
    });
  }
}
