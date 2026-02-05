// Field IDs that map to storage keys
const FIELDS = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "city",
  "country",
  "workCountries", // Countries where user anticipates working
  "currentCompany",
  "currentTitle",
  "yearsExperience",
  "university",
  "degree",
  "gradYear",
  "workAuth",
  "sponsorship",
  "linkedin",
  "website",
  "github",
  "twitter",
  "heardAbout",
  "salary",
  "startDate",
  "autoDetect",
  "showBadge",
  "showPanel",
  "openaiKey",
  "userContext",
  "cvContent",
  "includeAIByDefault",
  "learnedResponses", // Learning from responses
];

let draggedItem = null;
let customSections = [];
let customParams = [];
let currentHostname = "";

// Load saved data
document.addEventListener("DOMContentLoaded", async () => {
  const data = await chrome.storage.sync.get(null);

  // Get current tab URL and check if site is enabled
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      currentHostname = url.hostname;
      document.getElementById("currentSite").textContent = currentHostname;

      // Check if site is disabled
      const disabledSites = data.disabledSites || [];
      const isEnabled = !disabledSites.includes(currentHostname);
      document.getElementById("siteEnabled").checked = isEnabled;

      if (!isEnabled) {
        document.body.classList.add("site-disabled");
      }
    }
  } catch (e) {
    document.getElementById("currentSite").textContent = "Unknown";
  }

  // Load standard fields
  FIELDS.forEach((field) => {
    const el = document.getElementById(field);
    if (el && data[field] !== undefined) {
      if (el.type === "checkbox") {
        el.checked = data[field];
      } else {
        el.value = data[field];
      }
    }
  });

  // Also load values for param-items by data-key
  document.querySelectorAll(".param-item").forEach((item) => {
    const key = item.dataset.key;
    const input = item.querySelector(".param-item-input");
    if (key && input && data[key] !== undefined) {
      input.value = data[key];
    }
  });

  // Load stats
  document.getElementById("fillCount").textContent = data.fillCount || 0;
  document.getElementById("pageCount").textContent = data.pageCount || 0;

  // Auto-populate full name if empty
  if (!data.fullName && data.firstName && data.lastName) {
    const fullNameInput = document.getElementById("fullName");
    if (fullNameInput) {
      fullNameInput.value = `${data.firstName} ${data.lastName}`;
    }
  }

  // Load custom sections and custom params
  customSections = data.customSections || [];
  customParams = data.customParams || [];

  // Render custom sections (async - optimized)
  await renderCustomSections();

  // Render custom params in the "New Parameters" section
  await renderCustomParams();

  // Load CV list
  loadCvList(data.cvFiles || []);
  loadCoverLetterList(data.coverLetterFiles || []);

  // Initialize drag-and-drop
  initDragAndDrop();

  // Initialize section collapsing
  initSectionCollapse();

  // Initialize section add buttons
  initAddParamButtons();

  // Initialize site toggle
  initSiteToggle();

  // Initialize learned responses display
  displayLearnedResponses(data);
});

// Display learned responses in Settings tab
function displayLearnedResponses(data) {
  const listEl = document.getElementById("learnedResponsesList");
  const learned = data.learnedResponses || {};
  const entries = Object.entries(learned);

  if (entries.length === 0) {
    listEl.innerHTML =
      '<div style="font-size: 11px; color: #999; text-align: center; padding: 12px;">No learned responses yet</div>';
    return;
  }

  // Sort by usage count (most used first)
  entries.sort((a, b) => (b[1].usageCount || 0) - (a[1].usageCount || 0));

  listEl.innerHTML = entries
    .map(
      ([key, item]) => `
    <div class="learned-item" style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; background: #f9f9f9; border-radius: 6px; margin-bottom: 4px; font-size: 11px;">
      <div style="flex: 1; overflow: hidden;">
        <div style="font-weight: 500; color: #333; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${item.fieldLabel || key}</div>
        <div style="color: #888; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${item.value}">${item.value.substring(0, 50)}${item.value.length > 50 ? "..." : ""}</div>
      </div>
      <button class="delete-learned" data-key="${key}" style="background: none; border: none; color: #ff4444; cursor: pointer; padding: 2px;" title="Delete">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `,
    )
    .join("");

  // Add delete handlers
  listEl.querySelectorAll(".delete-learned").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.key;
      const stored = await chrome.storage.sync.get(["learnedResponses"]);
      const responses = stored.learnedResponses || {};
      delete responses[key];
      await chrome.storage.sync.set({ learnedResponses: responses });
      displayLearnedResponses({ learnedResponses: responses });
    });
  });
}

// Clear all learned responses button
document
  .getElementById("clearLearnedBtn")
  ?.addEventListener("click", async () => {
    if (confirm("Are you sure you want to clear all learned responses?")) {
      await chrome.storage.sync.set({ learnedResponses: {} });
      displayLearnedResponses({ learnedResponses: {} });
    }
  });

// Site enable/disable toggle
function initSiteToggle() {
  const toggle = document.getElementById("siteEnabled");
  toggle.addEventListener("change", async () => {
    const data = await chrome.storage.sync.get("disabledSites");
    let disabledSites = data.disabledSites || [];

    if (toggle.checked) {
      // Enable - remove from disabled list
      disabledSites = disabledSites.filter((site) => site !== currentHostname);
      document.body.classList.remove("site-disabled");
    } else {
      // Disable - add to disabled list
      if (!disabledSites.includes(currentHostname)) {
        disabledSites.push(currentHostname);
      }
      document.body.classList.add("site-disabled");
    }

    await chrome.storage.sync.set({ disabledSites });

    // Send message to content script to enable/disable
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: toggle.checked ? "enableExtension" : "disableExtension",
      });
    }
  });
}

// Settings checkboxes - auto-detect and show buttons
document.getElementById("autoDetect")?.addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ autoDetect: e.target.checked });
  // Notify all tabs
  const tabs = await chrome.tabs.query({});
  tabs.forEach((tab) => {
    if (tab.id) {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "updateSettings",
          settings: { autoDetect: e.target.checked },
        })
        .catch(() => {});
    }
  });
});

document.getElementById("showBadge")?.addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ showBadge: e.target.checked });
  // Notify all tabs
  const tabs = await chrome.tabs.query({});
  tabs.forEach((tab) => {
    if (tab.id) {
      chrome.tabs
        .sendMessage(tab.id, {
          action: e.target.checked ? "showButtons" : "hideButtons",
        })
        .catch(() => {});
    }
  });
});

document.getElementById("showPanel")?.addEventListener("change", async (e) => {
  await chrome.storage.sync.set({ showPanel: e.target.checked });
  // Notify all tabs
  const tabs = await chrome.tabs.query({});
  tabs.forEach((tab) => {
    if (tab.id) {
      chrome.tabs
        .sendMessage(tab.id, {
          action: e.target.checked ? "showPanel" : "hidePanel",
        })
        .catch(() => {});
    }
  });
});

// Quick action buttons - hide/show on all tabs
document
  .getElementById("hideWindowBtn")
  ?.addEventListener("click", async () => {
    // Store session state
    await chrome.storage.session.set({ hiddenSession: true });

    // Notify all tabs to hide
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, { action: "hideButtons" })
          .catch(() => {});
      }
    });

    // Update UI
    document.getElementById("siteEnabled").checked = false;
    document.body.classList.add("site-disabled");
  });

document
  .getElementById("showWindowBtn")
  ?.addEventListener("click", async () => {
    // Clear session state
    await chrome.storage.session.remove("hiddenSession");

    // Notify all tabs to show
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs
          .sendMessage(tab.id, { action: "showButtons" })
          .catch(() => {});
      }
    });

    // Update UI
    document.getElementById("siteEnabled").checked = true;
    document.body.classList.remove("site-disabled");
  });

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll(".tab-content")
      .forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
  });
});

// Auto-save on input change for param-items
function setupAutoSave() {
  document.querySelectorAll(".param-item-input").forEach((input) => {
    input.addEventListener("change", () => {
      const item = input.closest(".param-item");
      const key = item?.dataset.key;
      if (key) {
        chrome.storage.sync.set({ [key]: input.value });

        // Auto-update full name
        if (key === "firstName" || key === "lastName") {
          updateFullName();
        }
      }
    });
  });
}

function updateFullName() {
  const first =
    document.querySelector('[data-key="firstName"] .param-item-input')?.value ||
    "";
  const last =
    document.querySelector('[data-key="lastName"] .param-item-input')?.value ||
    "";
  const fullNameInput = document.querySelector(
    '[data-key="fullName"] .param-item-input',
  );
  if (first && last && fullNameInput) {
    fullNameInput.value = `${first} ${last}`;
    chrome.storage.sync.set({ fullName: `${first} ${last}` });
  }
}

// Save all parameters button
document.getElementById("saveParamsBtn").addEventListener("click", async () => {
  const data = {};

  // Save all param-item values
  document.querySelectorAll(".param-item").forEach((item) => {
    const key = item.dataset.key;
    const input = item.querySelector(".param-item-input");
    if (key && input) {
      data[key] = input.value;
    }
  });

  // Save checkbox fields
  ["autoDetect", "showBadge", "showPanel"].forEach((field) => {
    const el = document.getElementById(field);
    if (el) {
      data[field] = el.checked;
    }
  });

  // Save custom params and sections
  data.customParams = customParams;
  data.customSections = customSections;

  await chrome.storage.sync.set(data);
  showStatus("statusParams", "All parameters saved!", "success");
});

// Fill button - inject autofill directly into the page
document.getElementById("fillBtn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const profileData = await chrome.storage.sync.get(null);

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: runAutofillOnPage,
    args: [profileData],
  });

  window.close();
});

// This entire function gets injected into the page
function runAutofillOnPage(data) {
  const MAPPINGS = {
    firstName: [
      "first_name",
      "firstname",
      "fname",
      "given_name",
      "givenname",
      "first-name",
    ],
    lastName: [
      "last_name",
      "lastname",
      "lname",
      "surname",
      "family_name",
      "last-name",
    ],
    fullName: [
      "full_name",
      "fullname",
      "name",
      "your_name",
      "candidate_name",
      "legal_name",
    ],
    email: [
      "email",
      "e-mail",
      "email_address",
      "emailaddress",
      "candidate_email",
    ],
    phone: [
      "phone",
      "telephone",
      "tel",
      "phone_number",
      "mobile",
      "cell",
      "cellphone",
    ],
    city: ["city", "location", "current_location", "address_city", "hometown"],
    country: ["country", "nation", "address_country"],
    linkedin: ["linkedin", "linkedin_url", "linkedin_profile", "linkedinurl"],
    website: ["website", "portfolio", "personal_website", "portfolio_url"],
    github: ["github", "github_url", "github_profile"],
    twitter: ["twitter", "twitter_url", "x_url"],
    currentCompany: ["current_company", "company", "employer", "organization"],
    currentTitle: [
      "current_title",
      "title",
      "job_title",
      "position",
      "role",
      "headline",
    ],
    yearsExperience: ["years_experience", "experience", "years_of_experience"],
    university: ["university", "school", "college", "institution"],
    degree: ["degree", "qualification", "education_degree"],
    gradYear: ["graduation_year", "grad_year", "year_graduated"],
    heardAbout: [
      "hear_about",
      "heard_about",
      "how_did_you_hear",
      "source",
      "referral",
    ],
    salary: ["salary", "salary_expectation", "expected_salary", "compensation"],
    startDate: [
      "start_date",
      "availability",
      "available_date",
      "earliest_start",
      "notice",
    ],
  };

  // Add custom params to mappings
  if (data.customParams) {
    data.customParams.forEach((param) => {
      const key = param.key;
      const patterns = param.label
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .split("_")
        .filter(Boolean);
      MAPPINGS[key] = patterns;
    });
  }

  const LABELS = {
    firstName: /first\s*name|given\s*name/i,
    lastName: /last\s*name|family\s*name|surname/i,
    fullName: /full\s*name|^name$|your\s*name|legal\s*name/i,
    email: /e-?mail/i,
    phone: /phone|mobile|cell|tele/i,
    city: /city|location/i,
    country: /country/i,
    linkedin: /linkedin/i,
    website: /website|portfolio/i,
    github: /github/i,
    twitter: /twitter/i,
    currentCompany: /company|employer/i,
    currentTitle: /title|position|role/i,
    yearsExperience: /experience/i,
    university: /university|school|college/i,
    degree: /degree/i,
    gradYear: /graduat/i,
    heardAbout: /how.*hear|source|referr/i,
    salary: /salary|compensation/i,
    startDate: /start.*date|availab|notice/i,
  };

  // Add custom params to labels
  if (data.customParams) {
    data.customParams.forEach((param) => {
      const key = param.key;
      const escapedLabel = param.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      LABELS[key] = new RegExp(escapedLabel, "i");
    });
  }

  function findLabel(inp) {
    if (inp.id) {
      const l = document.querySelector('label[for="' + inp.id + '"]');
      if (l) return l;
    }
    const p = inp.closest("label");
    if (p) return p;
    const c = inp.closest("div, fieldset, section, li, td");
    if (c) {
      const l = c.querySelector("label");
      if (l) return l;
    }
    return null;
  }

  function detect(inp) {
    const attrs = [
      inp.name || "",
      inp.id || "",
      inp.placeholder || "",
      inp.getAttribute("aria-label") || "",
      inp.autocomplete || "",
    ]
      .join(" ")
      .toLowerCase();

    for (const [key, patterns] of Object.entries(MAPPINGS)) {
      for (const p of patterns) {
        if (attrs.includes(p.replace(/_/g, "")) || attrs.includes(p))
          return key;
      }
    }

    const lbl = findLabel(inp);
    if (lbl) {
      const txt = lbl.textContent || "";
      for (const [key, rx] of Object.entries(LABELS)) {
        if (rx.test(txt)) return key;
      }
    }
    return null;
  }

  function fill(inp, val) {
    if (!val || inp.disabled || inp.readOnly) return false;

    if (inp.tagName === "SELECT") {
      const opt = Array.from(inp.options).find(
        (o) =>
          o.value.toLowerCase().includes(val.toLowerCase()) ||
          o.text.toLowerCase().includes(val.toLowerCase()),
      );
      if (opt) {
        inp.value = opt.value;
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      return false;
    }

    // Use native setter for React compatibility
    const proto =
      inp.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) {
      desc.set.call(inp, val);
    } else {
      inp.value = val;
    }

    // Dispatch events
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    inp.dispatchEvent(new Event("blur", { bubbles: true }));

    // React 16+ compatibility
    if (inp._valueTracker) {
      inp._valueTracker.setValue("");
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return true;
  }

  function highlight(inp) {
    const origBorder = inp.style.border;
    const origShadow = inp.style.boxShadow;
    inp.style.border = "2px solid #00c853";
    inp.style.boxShadow = "0 0 8px rgba(0,200,83,0.5)";
    setTimeout(() => {
      inp.style.border = origBorder;
      inp.style.boxShadow = origShadow;
    }, 2000);
  }

  // Find all inputs
  const inputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
  );

  let count = 0;
  const filled = [];

  inputs.forEach((inp) => {
    if (inp.value && inp.value.trim()) return; // skip filled
    const fieldType = detect(inp);
    if (fieldType && data[fieldType]) {
      if (fill(inp, data[fieldType])) {
        count++;
        filled.push(fieldType);
        highlight(inp);
      }
    }
  });

  // Show toast notification
  const toast = document.createElement("div");
  toast.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px">' +
    '<svg style="width:24px;height:24px" viewBox="0 0 24 24" fill="none" stroke="#00c853" stroke-width="2.5">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>' +
    '<div><strong style="display:block;font-size:14px">' +
    count +
    " fields filled</strong>" +
    '<span style="font-size:12px;color:#666">' +
    filled.slice(0, 3).join(", ") +
    "</span></div></div>";
  toast.style.cssText =
    "position:fixed;bottom:24px;right:24px;background:#fff;padding:16px 24px;" +
    "border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15);font-family:-apple-system,sans-serif;z-index:2147483647";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);

  console.log("Job Autofill:", count, "fields filled -", filled.join(", "));
}

// Initialize drag and drop
function initDragAndDrop() {
  setupDragListeners();
  setupAutoSave();
}

function setupDragListeners() {
  document.querySelectorAll(".param-item").forEach((item) => {
    item.addEventListener("dragstart", handleDragStart);
    item.addEventListener("dragend", handleDragEnd);
    item.addEventListener("dragover", handleDragOver);
    item.addEventListener("drop", handleDrop);
    item.addEventListener("dragleave", handleDragLeave);
  });

  // Allow dropping on section content areas
  document.querySelectorAll(".param-section-content").forEach((content) => {
    content.addEventListener("dragover", handleContentDragOver);
    content.addEventListener("drop", handleContentDrop);
    content.addEventListener("dragleave", handleContentDragLeave);
  });
}

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/html", this.innerHTML);
}

function handleDragEnd(e) {
  this.classList.remove("dragging");
  document.querySelectorAll(".param-item").forEach((item) => {
    item.classList.remove("drag-over");
  });
  document.querySelectorAll(".param-section-content").forEach((content) => {
    content.classList.remove("drag-over");
  });
  draggedItem = null;
}

function handleDragOver(e) {
  e.preventDefault();
  if (draggedItem && draggedItem !== this) {
    this.classList.add("drag-over");
  }
}

function handleDragLeave(e) {
  this.classList.remove("drag-over");
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove("drag-over");

  if (draggedItem && draggedItem !== this) {
    const container = this.parentNode;
    const items = Array.from(container.querySelectorAll(".param-item"));
    const draggedIndex = items.indexOf(draggedItem);
    const targetIndex = items.indexOf(this);

    if (draggedIndex < targetIndex) {
      container.insertBefore(draggedItem, this.nextSibling);
    } else {
      container.insertBefore(draggedItem, this);
    }
  }
}

function handleContentDragOver(e) {
  e.preventDefault();
  if (draggedItem) {
    this.style.background = "rgba(102, 126, 234, 0.1)";
  }
}

function handleContentDragLeave(e) {
  this.style.background = "";
}

function handleContentDrop(e) {
  e.preventDefault();
  this.style.background = "";

  if (draggedItem && !this.contains(draggedItem)) {
    // Move to new section - insert before empty state or at end
    const emptyState = this.querySelector(".empty-state");
    if (emptyState) {
      emptyState.style.display = "none";
    }
    this.appendChild(draggedItem);

    // Re-setup drag listeners
    setupDragListeners();
  }
}

// Initialize section collapsing
function initSectionCollapse() {
  document.querySelectorAll(".param-section-header").forEach((header) => {
    header.addEventListener("click", (e) => {
      // Don't collapse if clicking on action buttons
      if (e.target.closest(".param-section-actions")) return;

      const section = header.closest(".param-section");
      section.classList.toggle("collapsed");
    });
  });
}

// Initialize add param buttons
function initAddParamButtons() {
  document.querySelectorAll(".add-param-to-section").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const section = btn.closest(".param-section");
      const sectionName = section.dataset.section;
      currentAddParamSection = sectionName;
      document.getElementById("addParamModal").classList.add("active");
      document.getElementById("newParamLabel").focus();
    });
  });
}

let currentAddParamSection = null;

// Add Section Modal
document.getElementById("addSectionBtn").addEventListener("click", () => {
  document.getElementById("addSectionModal").classList.add("active");
  document.getElementById("newSectionName").focus();
});

document.getElementById("cancelSectionBtn").addEventListener("click", () => {
  document.getElementById("addSectionModal").classList.remove("active");
  document.getElementById("newSectionName").value = "";
});

document
  .getElementById("confirmSectionBtn")
  .addEventListener("click", async () => {
    const name = document.getElementById("newSectionName").value.trim();
    if (!name) return;

    const sectionId = "section_" + Date.now();
    customSections.push({ id: sectionId, name });

    // Save to storage
    await chrome.storage.sync.set({ customSections });

    // Render new section
    renderCustomSections();

    // Close modal
    document.getElementById("addSectionModal").classList.remove("active");
    document.getElementById("newSectionName").value = "";
  });

// Add Param Modal
document.getElementById("cancelParamBtn").addEventListener("click", () => {
  document.getElementById("addParamModal").classList.remove("active");
  document.getElementById("newParamLabel").value = "";
  document.getElementById("newParamValue").value = "";
  currentAddParamSection = null;
});

document
  .getElementById("confirmParamBtn")
  .addEventListener("click", async () => {
    const label = document.getElementById("newParamLabel").value.trim();
    const value = document.getElementById("newParamValue").value.trim();
    if (!label) return;

    const key =
      "custom_" +
      label.toLowerCase().replace(/[^a-z0-9]/g, "_") +
      "_" +
      Date.now();

    const param = {
      key,
      label,
      section: currentAddParamSection || "custom",
    };

    customParams.push(param);

    // Save param definition and value
    const saveData = { customParams };
    if (value) {
      saveData[key] = value;
    }
    await chrome.storage.sync.set(saveData);

    // If adding to "custom" section, render it there
    if (currentAddParamSection === "custom") {
      renderCustomParams();
    } else {
      // Add to specific section
      addParamToSection(currentAddParamSection, param, value);
    }

    // Close modal
    document.getElementById("addParamModal").classList.remove("active");
    document.getElementById("newParamLabel").value = "";
    document.getElementById("newParamValue").value = "";
    currentAddParamSection = null;
  });

function addParamToSection(sectionName, param, value = "") {
  const section = document.querySelector(`[data-section="${sectionName}"]`);
  if (!section) return;

  const content = section.querySelector(".param-section-content");
  const emptyState = content.querySelector(".empty-state");
  if (emptyState) {
    emptyState.style.display = "none";
  }

  const item = createParamItem(param.key, param.label, value);
  content.appendChild(item);

  // Re-setup drag listeners
  setupDragListeners();
  setupAutoSave();
}

function createParamItem(key, label, value = "") {
  const item = document.createElement("div");
  item.className = "param-item";
  item.draggable = true;
  item.dataset.key = key;
  item.innerHTML = `
    <div class="param-item-drag">⋮⋮</div>
    <div class="param-item-content">
      <div class="param-item-label">${escapeHtml(label)}</div>
      <input type="text" class="param-item-input" value="${escapeHtml(value)}" placeholder="Enter value">
    </div>
    <button class="param-item-delete" title="Delete">
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>
  `;

  // Add delete handler
  item
    .querySelector(".param-item-delete")
    .addEventListener("click", async () => {
      await deleteParam(key);
      item.remove();
    });

  return item;
}

async function deleteParam(key) {
  // Remove from customParams
  customParams = customParams.filter((p) => p.key !== key);

  // Remove from storage
  await chrome.storage.sync.remove(key);
  await chrome.storage.sync.set({ customParams });
}

// Render custom sections - optimized to batch storage reads
async function renderCustomSections() {
  const container = document.getElementById("paramSectionsContainer");
  const addSectionBtn = document.getElementById("addSectionBtn");

  // Remove existing custom sections
  container
    .querySelectorAll(".param-section.custom-section")
    .forEach((el) => el.remove());

  // Pre-fetch all custom param values in ONE storage call
  const allParamKeys = customParams.map((p) => p.key);
  const allParamData =
    allParamKeys.length > 0 ? await chrome.storage.sync.get(allParamKeys) : {};

  customSections.forEach((section) => {
    const sectionEl = document.createElement("div");
    sectionEl.className = "param-section custom-section";
    sectionEl.dataset.section = section.id;
    sectionEl.innerHTML = `
      <div class="param-section-header" style="background: linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%);">
        <div class="param-section-toggle">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
        <div class="param-section-title" style="color: #667eea;">${escapeHtml(section.name)}</div>
        <div class="param-section-actions">
          <button class="add-param-to-section" title="Add parameter">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
          </button>
          <button class="delete-section-btn" title="Delete section">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="param-section-content">
        <div class="empty-state" style="padding: 12px;">
          <p style="margin: 0; font-size: 11px;">No parameters in this section yet</p>
        </div>
      </div>
    `;

    // Insert before add section button
    container.insertBefore(sectionEl, addSectionBtn);

    // Add delete handler
    sectionEl
      .querySelector(".delete-section-btn")
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Delete section "${section.name}"?`)) {
          customSections = customSections.filter((s) => s.id !== section.id);
          await chrome.storage.sync.set({ customSections });
          sectionEl.remove();
        }
      });

    // Add params in this section (using pre-fetched data - no await needed)
    const sectionParams = customParams.filter((p) => p.section === section.id);
    sectionParams.forEach((param) => {
      const value = allParamData[param.key] || "";
      addParamToSection(section.id, param, value);
    });
  });

  // Re-init collapse and add param buttons for new sections
  initSectionCollapse();
  initAddParamButtons();
}

// Render custom params in the "New Parameters" section
async function renderCustomParams() {
  const content = document.getElementById("customParamsContent");
  const emptyState = document.getElementById("customParamsEmpty");

  // Get params that belong to "custom" section
  const customSectionParams = customParams.filter(
    (p) => p.section === "custom",
  );

  // Clear existing items (except empty state)
  content.querySelectorAll(".param-item").forEach((el) => el.remove());

  if (customSectionParams.length === 0) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  const data = await chrome.storage.sync.get(
    customSectionParams.map((p) => p.key),
  );

  customSectionParams.forEach((param) => {
    const value = data[param.key] || "";
    const item = createParamItem(param.key, param.label, value);
    content.appendChild(item);
  });

  // Re-setup drag listeners
  setupDragListeners();
  setupAutoSave();
}

// Delete param item (standard params)
document.querySelectorAll(".param-item-delete").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const item = btn.closest(".param-item");
    const key = item.dataset.key;

    // Check if it's a custom param
    const isCustom = customParams.some((p) => p.key === key);

    if (isCustom) {
      await deleteParam(key);
    } else {
      // For standard params, just clear the value
      const input = item.querySelector(".param-item-input");
      input.value = "";
      await chrome.storage.sync.remove(key);
    }

    // Don't remove standard param items, just clear them
    if (isCustom) {
      item.remove();
    }
  });
});

// Export
document.getElementById("exportBtn").addEventListener("click", async () => {
  const data = await chrome.storage.sync.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "job-autofill-profile.json";
  a.click();
  URL.revokeObjectURL(url);
});

// Import
document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});

document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const text = await file.text();
  try {
    const data = JSON.parse(text);
    await chrome.storage.sync.set(data);

    // Reload fields
    FIELDS.forEach((field) => {
      const el = document.getElementById(field);
      if (el && data[field] !== undefined) {
        if (el.type === "checkbox") {
          el.checked = data[field];
        } else {
          el.value = data[field];
        }
      }
    });

    // Reload param items
    document.querySelectorAll(".param-item").forEach((item) => {
      const key = item.dataset.key;
      const input = item.querySelector(".param-item-input");
      if (key && input && data[key] !== undefined) {
        input.value = data[key];
      }
    });

    // Reload custom sections and params
    customSections = data.customSections || [];
    customParams = data.customParams || [];
    renderCustomSections();
    renderCustomParams();

    showStatus("statusParams", "Profile imported!", "success");
  } catch (err) {
    showStatus("statusParams", "Invalid file format", "error");
  }
});

function showStatus(id, message, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = "status " + type;
  setTimeout(() => {
    el.className = "status";
  }, 3000);
}

// CV List Management
function loadCvList(cvFiles) {
  const container = document.getElementById("cvList");
  const emptyState = document.getElementById("cvEmptyState");

  if (!cvFiles || cvFiles.length === 0) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  // Clear existing items (except empty state)
  container.querySelectorAll(".cv-item").forEach((el) => el.remove());

  cvFiles.forEach((cv, index) => {
    const item = document.createElement("div");
    item.className = "cv-item" + (cv.isDefault ? " cv-default" : "");
    item.innerHTML = `
      <div class="cv-icon">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
      </div>
      <div class="cv-info">
        <div class="cv-name">${escapeHtml(cv.name)}</div>
        <div class="cv-meta">${cv.isDefault ? "⭐ Default" : "Added " + new Date(cv.addedAt).toLocaleDateString()}</div>
      </div>
      <div class="cv-actions">
        <button title="Set as default" data-action="default" data-index="${index}">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
          </svg>
        </button>
        <button title="Delete" data-action="delete" data-index="${index}">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    `;
    container.appendChild(item);
  });

  // Add event listeners for actions
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const action = e.currentTarget.dataset.action;
      const index = parseInt(e.currentTarget.dataset.index);
      const data = await chrome.storage.sync.get(["cvFiles"]);
      const files = data.cvFiles || [];

      if (action === "delete") {
        files.splice(index, 1);
      } else if (action === "default") {
        files.forEach((f, i) => (f.isDefault = i === index));
      }

      await chrome.storage.sync.set({ cvFiles: files });
      loadCvList(files);
    });
  });
}

function loadCoverLetterList(clFiles) {
  const container = document.getElementById("coverLetterList");
  const emptyState = document.getElementById("clEmptyState");

  if (!clFiles || clFiles.length === 0) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  container.querySelectorAll(".cv-item").forEach((el) => el.remove());

  clFiles.forEach((cl, index) => {
    const item = document.createElement("div");
    item.className = "cv-item";
    item.innerHTML = `
      <div class="cv-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
      </div>
      <div class="cv-info">
        <div class="cv-name">${escapeHtml(cl.name)}</div>
        <div class="cv-meta">Added ${new Date(cl.addedAt).toLocaleDateString()}</div>
      </div>
      <div class="cv-actions">
        <button title="Delete" data-action="delete-cl" data-index="${index}">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('[data-action="delete-cl"]').forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const index = parseInt(e.currentTarget.dataset.index);
      const data = await chrome.storage.sync.get(["coverLetterFiles"]);
      const files = data.coverLetterFiles || [];
      files.splice(index, 1);
      await chrome.storage.sync.set({ coverLetterFiles: files });
      loadCoverLetterList(files);
    });
  });
}

// Add CV button
document.getElementById("addCvBtn").addEventListener("click", () => {
  document.getElementById("cvFileInput").click();
});

document.getElementById("cvFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const data = await chrome.storage.sync.get(["cvFiles"]);
  const cvFiles = data.cvFiles || [];

  cvFiles.push({
    name: file.name,
    addedAt: Date.now(),
    isDefault: cvFiles.length === 0,
  });

  await chrome.storage.sync.set({ cvFiles });
  loadCvList(cvFiles);
  e.target.value = "";
});

// Add Cover Letter button
document.getElementById("addClBtn").addEventListener("click", () => {
  document.getElementById("clFileInput").click();
});

document.getElementById("clFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const data = await chrome.storage.sync.get(["coverLetterFiles"]);
  const clFiles = data.coverLetterFiles || [];

  clFiles.push({
    name: file.name,
    addedAt: Date.now(),
  });

  await chrome.storage.sync.set({ coverLetterFiles: clFiles });
  loadCoverLetterList(clFiles);
  e.target.value = "";
});

// AI Settings
document.getElementById("toggleApiKey").addEventListener("click", () => {
  const input = document.getElementById("openaiKey");
  input.type = input.type === "password" ? "text" : "password";
});

document.getElementById("saveAiBtn").addEventListener("click", async () => {
  const openaiKey = document.getElementById("openaiKey").value.trim();
  const userContext = document.getElementById("userContext").value;
  const cvContent = document.getElementById("cvContent").value;

  const btn = document.getElementById("saveAiBtn");
  const originalText = btn.innerHTML;

  // If there's an API key, test it first
  if (openaiKey) {
    btn.innerHTML = `
      <svg class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      Testing API Key...
    `;
    btn.disabled = true;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: 'Say "ok" and nothing else.' }],
            max_tokens: 10,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Invalid API key");
      }

      // Key works! Save everything
      await chrome.storage.sync.set({ openaiKey, userContext, cvContent });
      showStatus(
        "statusAi",
        "✓ Success! API key works. Settings saved.",
        "success",
      );
    } catch (err) {
      console.error("API key test failed:", err);
      let errorMsg = "Problem with key: ";
      if (
        err.message.includes("Invalid API key") ||
        err.message.includes("Incorrect API key")
      ) {
        errorMsg += "Invalid API key. Check and try again.";
      } else if (err.message.includes("quota")) {
        errorMsg += "API quota exceeded. Check your OpenAI billing.";
      } else if (err.message.includes("rate")) {
        errorMsg += "Rate limited. Wait a moment and try again.";
      } else {
        errorMsg += err.message || "Could not connect to OpenAI.";
      }
      showStatus("statusAi", errorMsg, "error");
      btn.innerHTML = originalText;
      btn.disabled = false;
      return; // Don't save if key doesn't work
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
  } else {
    // No API key, just save the other settings
    await chrome.storage.sync.set({ openaiKey: "", userContext, cvContent });
    showStatus("statusAi", "Settings saved (no API key set).", "success");
  }
});

document.getElementById("extractCvBtn").addEventListener("click", () => {
  document.getElementById("pdfFileInput").click();
});

document
  .getElementById("pdfFileInput")
  .addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const btn = document.getElementById("extractCvBtn");
    const originalText = btn.innerHTML;
    btn.innerHTML = `
    <svg class="spin" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="animation: spin 1s linear infinite;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
    </svg>
    Extracting ${files.length} file${files.length > 1 ? "s" : ""}...
  `;
    btn.disabled = true;

    try {
      let allText = "";
      let totalPages = 0;

      for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();

        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          useWorkerFetch: false,
          isEvalSupported: false,
          useSystemFonts: true,
        });

        const pdf = await loadingTask.promise;
        totalPages += pdf.numPages;

        allText += `\n\n=== ${file.name} ===\n\n`;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(" ");
          allText += pageText + "\n";
        }
      }

      // Clean up the text
      allText = allText
        .replace(/\s+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim();

      if (allText.length < 50) {
        throw new Error("PDFs appear to be image-based or empty");
      }

      // Fill CV Content field
      document.getElementById("cvContent").value = allText;

      // Auto-generate context from CV content
      const context = generateContextFromCV(allText);
      document.getElementById("userContext").value = context;

      // Save both
      await chrome.storage.sync.set({
        cvContent: allText,
        userContext: context,
      });

      showStatus(
        "statusAi",
        `✓ Extracted ${allText.length} chars from ${files.length} file${files.length > 1 ? "s" : ""} (${totalPages} pages). Both fields updated!`,
        "success",
      );
    } catch (err) {
      console.error("PDF extraction error:", err);
      let errorMsg = "Failed to extract PDF text. ";
      if (err.message.includes("image-based")) {
        errorMsg += "PDFs might be scanned/image-based. Try text-based PDFs.";
      } else if (err.message.includes("password")) {
        errorMsg += "A PDF is password protected.";
      } else {
        errorMsg += "Try copying text manually from your PDFs.";
      }
      showStatus("statusAi", errorMsg, "error");
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
    e.target.value = "";
  });

// Generate context summary from CV text
function generateContextFromCV(cvText) {
  const lines = cvText.split("\n").filter((l) => l.trim());
  const context = [];

  // Extract key sections
  const text = cvText.toLowerCase();

  // Look for achievements/numbers
  const achievements =
    cvText.match(/\d+%|\$[\d,]+|\d+\+|\d+ years?|\d+ months?/gi) || [];
  if (achievements.length > 0) {
    context.push(
      `Key metrics from CV: ${[...new Set(achievements)].slice(0, 5).join(", ")}`,
    );
  }

  // Look for skills
  const skillsMatch = cvText.match(/skills?[:\s]+([^\n]+)/i);
  if (skillsMatch) {
    context.push(`Skills: ${skillsMatch[1].substring(0, 200)}`);
  }

  // Look for education
  const eduMatch = cvText.match(
    /(bachelor|master|mba|phd|degree|university|college)[^\n]*/gi,
  );
  if (eduMatch) {
    context.push(`Education: ${eduMatch[0].substring(0, 150)}`);
  }

  // Look for job titles
  const titles = cvText.match(
    /(manager|director|engineer|developer|analyst|consultant|specialist|lead|head|vp|ceo|cto|founder)[^\n]*/gi,
  );
  if (titles) {
    context.push(
      `Roles: ${[...new Set(titles)].slice(0, 3).join("; ").substring(0, 200)}`,
    );
  }

  // Add instruction for user
  context.push(
    "\n[Edit above to add: key achievements, what makes you unique, preferred communication style, specific strengths to highlight]",
  );

  return context.join("\n\n");
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ==================== USER AUTHENTICATION ====================

// Initialize auth UI
async function initAuthUI() {
  const userBanner = document.getElementById("userBanner");
  const userNotSignedIn = document.getElementById("userNotSignedIn");
  const userSignedIn = document.getElementById("userSignedIn");
  const googleSignInBtn = document.getElementById("googleSignIn");
  const appleSignInBtn = document.getElementById("appleSignIn");
  const signOutBtn = document.getElementById("signOutBtn");

  // Check if we have a stored user session
  try {
    const data = await chrome.storage.sync.get(["userSession"]);
    if (data.userSession) {
      showSignedInState(data.userSession);
    }
  } catch (err) {
    console.error("Error checking auth state:", err);
  }

  // Google Sign In
  googleSignInBtn?.addEventListener("click", async () => {
    googleSignInBtn.disabled = true;
    googleSignInBtn.innerHTML = `<span class="spin">⏳</span> Signing in...`;

    try {
      // Use chrome.identity for Google auth
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(token);
          }
        });
      });

      // Get user info from Google
      const response = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) throw new Error("Failed to get user info");

      const userInfo = await response.json();

      const userSession = {
        uid: userInfo.id,
        email: userInfo.email,
        displayName: userInfo.name,
        photoURL: userInfo.picture,
        provider: "google",
        signedInAt: Date.now(),
      };

      // Save session
      await chrome.storage.sync.set({ userSession });

      // Show signed in state
      showSignedInState(userSession);

      // Sync data to cloud
      await syncToCloud(userSession);
    } catch (err) {
      console.error("Google sign-in error:", err);
      
      // Check for OAuth configuration issues
      if (err.message && (err.message.includes("bad client id") || err.message.includes("OAuth2"))) {
        showOAuthSetupInstructions();
      } else {
        alert("Sign-in failed: " + err.message);
      }
      
      googleSignInBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Google
      `;
    }
    googleSignInBtn.disabled = false;
  });

  // Apple Sign In (more complex, requires proper setup)
  appleSignInBtn?.addEventListener("click", () => {
    alert(
      "Apple Sign-In requires additional setup. Please use Google Sign-In for now.",
    );
  });

  // Sign Out
  signOutBtn?.addEventListener("click", async () => {
    try {
      // Revoke Google token
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
          // Revoke the token
          fetch(
            `https://accounts.google.com/o/oauth2/revoke?token=${token}`,
          ).catch(() => {});

          // Remove from cache
          chrome.identity.removeCachedAuthToken({ token }, () => {});
        }
      });

      // Clear session
      await chrome.storage.sync.remove(["userSession"]);

      // Show not signed in state
      showNotSignedInState();
    } catch (err) {
      console.error("Sign out error:", err);
    }
  });
}

// Show signed in state
function showSignedInState(userSession) {
  const userNotSignedIn = document.getElementById("userNotSignedIn");
  const userSignedIn = document.getElementById("userSignedIn");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  const userEmail = document.getElementById("userEmail");

  userNotSignedIn.style.display = "none";
  userSignedIn.style.display = "flex";

  userName.textContent = userSession.displayName || "User";
  userEmail.textContent = userSession.email || "";

  if (userSession.photoURL) {
    userAvatar.src = userSession.photoURL;
  } else {
    // Default avatar
    userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userSession.displayName || "U")}&background=10b981&color=fff`;
  }
}

// Show not signed in state
function showNotSignedInState() {
  const userNotSignedIn = document.getElementById("userNotSignedIn");
  const userSignedIn = document.getElementById("userSignedIn");

  userNotSignedIn.style.display = "block";
  userSignedIn.style.display = "none";
}

// Sync data to cloud (using Firebase or a simple backend)
async function syncToCloud(userSession) {
  const syncStatus = document.getElementById("syncStatus");

  try {
    syncStatus.innerHTML = `
      <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      Syncing...
    `;
    syncStatus.className = "sync-status syncing";

    // Get all local data
    const localData = await chrome.storage.sync.get(null);

    // For now, we'll store the cloud sync timestamp
    // Full Firebase integration would go here
    await chrome.storage.sync.set({
      lastSyncAt: Date.now(),
      syncedWith: userSession.email,
    });

    syncStatus.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
      Synced
    `;
    syncStatus.className = "sync-status";
  } catch (err) {
    console.error("Sync error:", err);
    syncStatus.innerHTML = `⚠️ Sync failed`;
    syncStatus.className = "sync-status";
  }
}

// Show OAuth setup instructions
function showOAuthSetupInstructions() {
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.8);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `;
  modal.innerHTML = `
    <div style="
      background: #fff;
      border-radius: 12px;
      max-width: 400px;
      max-height: 80vh;
      overflow-y: auto;
      padding: 20px;
    ">
      <h3 style="margin: 0 0 12px; color: #dc2626;">⚠️ Google Sign-In Setup Required</h3>
      <p style="font-size: 13px; color: #666; margin-bottom: 16px;">
        To enable Google Sign-In, you need to configure OAuth credentials.
      </p>
      
      <div style="font-size: 12px; color: #333;">
        <p><strong>For Developers:</strong></p>
        <ol style="padding-left: 20px; line-height: 1.6;">
          <li>Go to <a href="https://console.cloud.google.com" target="_blank" style="color: #4285F4;">Google Cloud Console</a></li>
          <li>Create a new project or select existing</li>
          <li>Go to APIs & Services → Credentials</li>
          <li>Create OAuth 2.0 Client ID (Chrome App type)</li>
          <li>Copy the Client ID</li>
          <li>Update manifest.json with the client ID</li>
          <li>Reload the extension</li>
        </ol>
        
        <p style="margin-top: 16px; padding: 10px; background: #f0fdf4; border-radius: 8px;">
          <strong>💡 Tip:</strong> For personal use, your data is already saved locally. 
          Cloud sync is optional for multi-device access.
        </p>
      </div>
      
      <button id="closeOAuthModal" style="
        margin-top: 16px;
        width: 100%;
        padding: 10px;
        background: #000;
        color: #fff;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
      ">Got it</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector("#closeOAuthModal").addEventListener("click", () => {
    modal.remove();
  });
  
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Initialize auth on load
initAuthUI();
