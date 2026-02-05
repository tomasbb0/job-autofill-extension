// Job Autofill Extension - Background Service Worker

// Set default values on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.sync.set({
      autoDetect: true,
      showBadge: true,
      fillCount: 0,
      pageCount: 0,
    });
  }
});

// Listen for keyboard shortcut (optional)
chrome.commands?.onCommand?.addListener((command) => {
  if (command === "trigger-autofill") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          function: () => {
            window.postMessage({ type: "JOB_AUTOFILL_TRIGGER" }, "*");
          },
        });
      }
    });
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "downloadFile") {
    // Download file from blob URL
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: true,
    });
    sendResponse({ success: true });
  }

  if (request.action === "incrementFillCount") {
    chrome.storage.sync.get(["fillCount"], (data) => {
      const newCount = (data.fillCount || 0) + (request.count || 1);
      chrome.storage.sync.set({ fillCount: newCount });
      sendResponse({ fillCount: newCount });
    });
    return true; // Keep channel open for async response
  }

  return true;
});
