// Remedy — Chrome Extension Service Worker

// Open the side panel when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for messages from the side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_TAB_URL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      sendResponse({ url: tab?.url || '', title: tab?.title || '' });
    });
    return true; // keep the message channel open for async response
  }

  if (message.type === 'APPLY_FIXES') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      try {
        await applyFixes(tab.id, message.scripts);
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    });
    return true;
  }
});

/**
 * Inject fix scripts into the active tab one by one.
 */
async function applyFixes(tabId, scripts) {
  for (const script of scripts) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (code) => {
        try {
          new Function(code)();
        } catch (e) {
          console.error('Remedy fix error:', e);
        }
      },
      args: [script],
      world: 'MAIN'
    });
  }
}
