// Job Application Autofill - Content Script
// Detects form fields and fills them with saved profile data
// Now with per-field buttons, AI cover letters, and smart CV selection

(function () {
  "use strict";

  // State
  let profileData = {};
  let cvFiles = [];
  let fieldButtons = [];
  let fillAllPanel = null;
  let isInitialized = false;
  let isExtensionDisabled = false;

  // Check if we're in an iframe
  const isInIframe = window.self !== window.top;
  const isGreenhouseIframe =
    isInIframe && window.location.href.includes("greenhouse.io");

  // Log iframe status for debugging
  if (isInIframe) {
    console.log("[Job Autofill] Running in iframe:", window.location.href);
    console.log("[Job Autofill] Is Greenhouse iframe:", isGreenhouseIframe);
  }

  // Check if extension is disabled for this site
  async function checkIfDisabled() {
    try {
      const hostname = window.location.hostname;
      const data = await chrome.storage.sync.get("disabledSites");
      const disabledSites = data.disabledSites || [];
      return disabledSites.includes(hostname);
    } catch (e) {
      return false;
    }
  }

  // Remove all extension UI from the page
  function removeExtensionUI() {
    // Remove all field buttons and wrappers
    document
      .querySelectorAll(
        ".jaf-field-btn, .jaf-btn-wrapper, .jaf-ai-btn, .jaf-dropdown-btn, .jaf-add-param-btn",
      )
      .forEach((el) => el.remove());

    // Also remove old class names for compatibility
    document
      .querySelectorAll(
        ".autofill-btn, .autofill-ai-btn, .autofill-dropdown-badge",
      )
      .forEach((el) => el.remove());

    // Remove fill all panel
    if (fillAllPanel) {
      fillAllPanel.remove();
      fillAllPanel = null;
    }
    document
      .querySelectorAll(".autofill-panel, #jaf-fill-all-panel")
      .forEach((el) => el.remove());

    // Remove any toasts
    document
      .querySelectorAll(".autofill-toast, .jaf-toast")
      .forEach((el) => el.remove());

    // Clear tracked buttons
    fieldButtons = [];
    isInitialized = false;
  }

  // Re-enable extension UI
  function enableExtensionUI() {
    isExtensionDisabled = false;
    init();
  }

  // Hide only buttons but keep panel
  function hideButtons() {
    // Remove buttons
    document
      .querySelectorAll(
        ".jaf-field-btn, .jaf-btn-wrapper, .jaf-ai-btn, .jaf-dropdown-btn, .jaf-add-param-btn",
      )
      .forEach((el) => el.remove());
    document
      .querySelectorAll(
        ".autofill-btn, .autofill-ai-btn, .autofill-dropdown-badge",
      )
      .forEach((el) => el.remove());

    // Clear the data-autofill-button attribute so buttons can be re-added
    document.querySelectorAll("[data-autofill-button]").forEach((el) => {
      delete el.dataset.autofillButton;
    });

    fieldButtons = [];
  }

  // Show buttons again
  function showButtons() {
    if (!isExtensionDisabled) {
      // Re-detect and add buttons
      detectAndAddButtons();
    }
  }

  // Hide panel only
  function hidePanel() {
    if (fillAllPanel) {
      fillAllPanel.style.display = "none";
    }
  }

  // Show panel
  function showPanel() {
    if (fillAllPanel) {
      fillAllPanel.style.display = "block";
      fillAllPanel.classList.remove("jaf-panel-hidden");
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "disableExtension") {
      isExtensionDisabled = true;
      removeExtensionUI();
      sendResponse({ success: true });
    } else if (request.action === "enableExtension") {
      enableExtensionUI();
      sendResponse({ success: true });
    } else if (request.action === "hideButtons") {
      hideButtons();
      // Don't hide panel here - let showPanel toggle control that
      sendResponse({ success: true });
    } else if (request.action === "showButtons") {
      // Make sure we re-detect and add buttons
      fieldButtons = [];
      detectAndAddButtons();
      sendResponse({ success: true });
    } else if (request.action === "hidePanel") {
      hidePanel();
      sendResponse({ success: true });
    } else if (request.action === "showPanel") {
      showPanel();
      sendResponse({ success: true });
    } else if (request.action === "updateSettings") {
      // Handle settings updates
      if (request.settings) {
        profileData = { ...profileData, ...request.settings };
      }
      sendResponse({ success: true });
    } else if (request.action === "fill") {
      // Existing fill action
      if (!isExtensionDisabled) {
        autofillAll(false);
        sendResponse({ success: true });
      }
    }
    return true;
  });

  // Field mapping: common field identifiers → storage keys
  const FIELD_MAPPINGS = {
    firstName: [
      "first_name",
      "firstname",
      "first-name",
      "fname",
      "given_name",
      "givenname",
      "name_first",
      "applicant_first_name",
      "candidate_first_name",
      "legal_first_name",
    ],
    lastName: [
      "last_name",
      "lastname",
      "last-name",
      "lname",
      "surname",
      "family_name",
      "familyname",
      "name_last",
      "applicant_last_name",
      "candidate_last_name",
      "legal_last_name",
    ],
    fullName: [
      "full_name",
      "fullname",
      "full-name",
      "name",
      "your_name",
      "applicant_name",
      "candidate_name",
      "legal_name",
      "display_name",
    ],
    email: [
      "email",
      "e-mail",
      "email_address",
      "emailaddress",
      "user_email",
      "applicant_email",
      "candidate_email",
      "contact_email",
      "primary_email",
    ],
    phone: [
      "phone",
      "telephone",
      "tel",
      "phone_number",
      "phonenumber",
      "mobile",
      "cell",
      "cellphone",
      "mobile_phone",
      "contact_phone",
      "primary_phone",
    ],
    city: [
      "city",
      "location",
      "current_location",
      "address_city",
      "hometown",
      "residence",
      "current_city",
    ],
    country: [
      "country",
      "nation",
      "address_country",
      "country_code",
      "residence_country",
      "countries",
      "work_country",
      "anticipated_country",
      "location_country",
    ],
    workCountries: [
      "work_countries",
      "countries_work",
      "anticipated_work",
      "work_location",
      "preferred_location",
      "preferred_country",
      "desired_location",
      "where_work",
      "location_preference",
    ],
    linkedin: [
      "linkedin",
      "linkedin_url",
      "linkedin_profile",
      "linkedinurl",
      "social_linkedin",
      "linkedin_link",
    ],
    website: [
      "website",
      "portfolio",
      "personal_website",
      "portfolio_url",
      "website_url",
      "personal_site",
      "blog",
      "homepage",
    ],
    github: [
      "github",
      "github_url",
      "github_profile",
      "githuburl",
      "social_github",
    ],
    twitter: ["twitter", "twitter_url", "x_url", "social_twitter"],
    currentCompany: [
      "current_company",
      "company",
      "employer",
      "current_employer",
      "most_recent_employer",
      "organization",
    ],
    currentTitle: [
      "current_title",
      "title",
      "job_title",
      "position",
      "current_position",
      "role",
      "current_role",
      "headline",
    ],
    yearsExperience: [
      "years_experience",
      "experience",
      "years_of_experience",
      "total_experience",
      "work_experience",
    ],
    university: [
      "university",
      "school",
      "college",
      "institution",
      "alma_mater",
      "education_school",
      "school_name",
    ],
    degree: [
      "degree",
      "qualification",
      "education_degree",
      "degree_type",
      "diploma",
    ],
    gradYear: [
      "graduation_year",
      "grad_year",
      "year_graduated",
      "graduation_date",
      "education_end_year",
    ],
    heardAbout: [
      "hear_about",
      "heard_about",
      "how_did_you_hear",
      "source",
      "referral_source",
      "how_heard",
      "found_us",
    ],
    salary: [
      "salary",
      "salary_expectation",
      "expected_salary",
      "compensation",
      "desired_salary",
      "salary_requirements",
    ],
    startDate: [
      "start_date",
      "availability",
      "available_date",
      "earliest_start",
      "when_can_you_start",
      "notice_period",
    ],
  };

  // Label text patterns for matching
  const LABEL_PATTERNS = {
    firstName: /first\s*name|given\s*name|prénom/i,
    lastName: /last\s*name|family\s*name|surname|nom\s*de\s*famille/i,
    fullName: /full\s*name|^name$|your\s*name|legal\s*name/i,
    email: /e-?mail|correo/i,
    phone: /phone|mobile|cell|tel[eé]fono|número/i,
    city: /city|location|cidade|ciudad/i,
    country: /country|país|nation/i,
    workCountries:
      /countries?.*(anticipate|work|prefer)|where.*(work|like.*work)|location.*prefer|preferred.*location/i,
    linkedin: /linkedin/i,
    website: /website|portfolio|personal\s*site/i,
    github: /github/i,
    twitter: /twitter|x\.com/i,
    currentCompany: /current\s*(company|employer)|empresa/i,
    currentTitle: /current\s*(title|position|role)|job\s*title|cargo/i,
    yearsExperience: /years?\s*(of)?\s*experience|experiência/i,
    university: /university|school|college|institution|universidade/i,
    degree: /degree|qualification|diploma/i,
    gradYear: /graduat(ion|ed)\s*(year|date)|año/i,
    heardAbout: /how\s*did\s*you\s*(hear|find|learn)|source|como\s*nos/i,
    salary: /salary|compensation|expectat/i,
    startDate: /start\s*date|availab|when\s*can\s*you|notice/i,
    coverLetter:
      /cover\s*letter|letter\s*of\s*motivation|motivation\s*letter|why\s*(do\s*)?you\s*want/i,
  };

  // Cover letter detection patterns
  const COVER_LETTER_PATTERNS = [
    /cover\s*letter/i,
    /letter\s*of\s*(motivation|interest)/i,
  ];

  // Open-ended question patterns that need AI
  const AI_QUESTION_PATTERNS = [
    {
      pattern: /why\s*(do\s*)?you\s*want\s*(to\s*)?(work|join)/i,
      type: "whyCompany",
    },
    {
      pattern: /why\s*(are\s*)?you\s*(interested|applying)/i,
      type: "whyCompany",
    },
    { pattern: /what\s*attracts\s*you/i, type: "whyCompany" },
    {
      pattern: /why\s*this\s*(company|role|position|job)/i,
      type: "whyCompany",
    },
    { pattern: /what\s*excites\s*you\s*about/i, type: "whyCompany" },
    { pattern: /tell\s*us\s*(about\s*)?(yourself|why)/i, type: "aboutYou" },
    { pattern: /describe\s*(yourself|your\s*background)/i, type: "aboutYou" },
    { pattern: /introduce\s*yourself/i, type: "aboutYou" },
    { pattern: /walk\s*(us|me)\s*through\s*your/i, type: "aboutYou" },
    {
      pattern: /what\s*makes\s*you\s*(a\s*good|the\s*right|qualified)/i,
      type: "whyYou",
    },
    { pattern: /why\s*should\s*we\s*(hire|choose)/i, type: "whyYou" },
    { pattern: /what\s*(can|will)\s*you\s*bring/i, type: "whyYou" },
    { pattern: /how\s*will\s*you\s*contribute/i, type: "whyYou" },
    { pattern: /what\s*are\s*your\s*strengths/i, type: "strengths" },
    { pattern: /greatest\s*strength/i, type: "strengths" },
    { pattern: /what\s*are\s*your\s*weaknesses/i, type: "weaknesses" },
    { pattern: /area.*(improvement|develop)/i, type: "weaknesses" },
    { pattern: /career\s*goals?/i, type: "careerGoals" },
    { pattern: /where\s*do\s*you\s*see\s*yourself/i, type: "careerGoals" },
    { pattern: /professional\s*goals?/i, type: "careerGoals" },
    {
      pattern: /(challenge|difficult|obstacle).*(overcome|faced|handled)/i,
      type: "challenge",
    },
    { pattern: /tell\s*(us|me)\s*about\s*a\s*time/i, type: "challenge" },
    {
      pattern: /describe\s*a\s*(situation|project|achievement)/i,
      type: "achievement",
    },
    {
      pattern: /proud(est)?\s*(accomplishment|achievement)/i,
      type: "achievement",
    },
    { pattern: /additional\s*(information|comments)/i, type: "additional" },
    { pattern: /anything\s*else/i, type: "additional" },
    { pattern: /is\s*there\s*anything/i, type: "additional" },
    { pattern: /cover\s*letter/i, type: "coverLetter" },
    { pattern: /letter\s*of\s*(motivation|interest)/i, type: "coverLetter" },
    { pattern: /motivation/i, type: "coverLetter" },
  ];

  // Detect field type from various attributes
  function detectFieldType(input) {
    const attrs = [
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute("data-field"),
      input.getAttribute("aria-label"),
      input.autocomplete,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    // First check standard field mappings
    for (const [fieldType, patterns] of Object.entries(FIELD_MAPPINGS)) {
      for (const pattern of patterns) {
        if (attrs.includes(pattern.replace(/_/g, "").replace(/-/g, ""))) {
          return fieldType;
        }
        if (attrs.includes(pattern)) {
          return fieldType;
        }
      }
    }

    const label = findLabel(input);
    const labelText = label ? label.textContent || "" : "";

    if (labelText) {
      for (const [fieldType, regex] of Object.entries(LABEL_PATTERNS)) {
        if (regex.test(labelText)) {
          return fieldType;
        }
      }
    }

    // Check custom params (stored in profileData.customParams)
    if (profileData.customParams && Array.isArray(profileData.customParams)) {
      for (const param of profileData.customParams) {
        // Check if label matches custom param
        const customLabel = param.label.toLowerCase();
        if (labelText && labelText.toLowerCase().includes(customLabel)) {
          return param.key;
        }
        // Also check attrs for custom param patterns
        const paramPatterns = customLabel
          .replace(/[^a-z0-9]/g, "_")
          .split("_")
          .filter(Boolean);
        for (const pattern of paramPatterns) {
          if (pattern.length > 2 && attrs.includes(pattern)) {
            return param.key;
          }
        }
      }
    }

    return null;
  }

  // Detect if a textarea is for cover letter
  function isCoverLetterField(input) {
    if (input.tagName !== "TEXTAREA") return false;

    const attrs = [
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ");

    const label = findLabel(input);
    const labelText = label ? label.textContent : "";
    const combinedText = attrs + " " + labelText;

    return COVER_LETTER_PATTERNS.some((pattern) => pattern.test(combinedText));
  }

  // Detect if a field needs AI-generated answer
  function detectAIQuestionType(input) {
    if (input.tagName !== "TEXTAREA" && input.type !== "text") return null;

    const attrs = [
      input.name,
      input.id,
      input.placeholder,
      input.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ");

    const label = findLabel(input);
    const labelText = label ? label.textContent : "";

    // Also check nearby text (previous sibling, parent text)
    const container = input.closest("div, fieldset, section, li, td");
    const containerText = container ? container.textContent : "";

    const combinedText = attrs + " " + labelText + " " + containerText;

    for (const { pattern, type } of AI_QUESTION_PATTERNS) {
      if (pattern.test(combinedText)) {
        return { type, questionText: labelText || attrs };
      }
    }

    return null;
  }

  // Find associated label for an input
  function findLabel(input) {
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label;
    }
    const parentLabel = input.closest("label");
    if (parentLabel) return parentLabel;
    const container = input.closest("div, fieldset, section, li, td");
    if (container) {
      const label = container.querySelector("label");
      if (label) return label;
    }
    return null;
  }

  // Fill a single field with value
  function fillField(input, value) {
    if (!value || input.disabled || input.readOnly) return false;

    // Special handling for SELECT elements - only fill if exact or close match found
    if (input.tagName === "SELECT") {
      const options = Array.from(input.options);
      const valueLower = value.toLowerCase().trim();

      // First try exact match
      let match = options.find(
        (opt) =>
          opt.value.toLowerCase().trim() === valueLower ||
          opt.text.toLowerCase().trim() === valueLower,
      );

      // For yes/no type questions, look for those options
      if (
        !match &&
        (valueLower === "yes" ||
          valueLower === "no" ||
          valueLower === "true" ||
          valueLower === "false")
      ) {
        match = options.find((opt) => {
          const optText = opt.text.toLowerCase().trim();
          const optVal = opt.value.toLowerCase().trim();
          if (valueLower === "yes" || valueLower === "true") {
            return (
              optText === "yes" ||
              optVal === "yes" ||
              optText === "true" ||
              optVal === "true"
            );
          } else {
            return (
              optText === "no" ||
              optVal === "no" ||
              optText === "false" ||
              optVal === "false"
            );
          }
        });
      }

      // Don't fill dropdowns with random text matches - be strict
      if (match && match.value !== "") {
        input.value = match.value;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      // Don't fill if no good match found - avoid putting wrong data in dropdowns
      return false;
    }

    const proto =
      input.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) {
      desc.set.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));

    if (input._valueTracker) {
      input._valueTracker.setValue("");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return true;
  }

  // Learn from user's response - save to storage for future use
  async function learnFromResponse(input, value, fieldLabel) {
    if (!value || value.trim().length < 2) return;

    try {
      const data = await chrome.storage.sync.get(["learnedResponses"]);
      const learned = data.learnedResponses || {};

      // Create a normalized key from the field label
      const key = fieldLabel
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 50);

      // Store the response with metadata
      learned[key] = {
        value: value,
        fieldLabel: fieldLabel,
        learnedAt: Date.now(),
        usageCount: (learned[key]?.usageCount || 0) + 1,
      };

      await chrome.storage.sync.set({ learnedResponses: learned });
      console.log("[Job Autofill] Learned response for:", fieldLabel);
    } catch (e) {
      console.error("Error learning response:", e);
    }
  }

  // Get learned response for a field
  async function getLearnedResponse(fieldLabel) {
    try {
      const data = await chrome.storage.sync.get(["learnedResponses"]);
      const learned = data.learnedResponses || {};

      const key = fieldLabel
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 50);

      if (learned[key]) {
        return learned[key].value;
      }

      // Try partial match
      const labelWords = fieldLabel
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      for (const [storedKey, stored] of Object.entries(learned)) {
        const storedWords = stored.fieldLabel
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const commonWords = labelWords.filter((w) => storedWords.includes(w));
        if (
          commonWords.length >= 2 ||
          (commonWords.length === 1 && labelWords.length <= 2)
        ) {
          return stored.value;
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // Create button for fields that have learned responses
  function createLearnedFillButton(input, fieldLabel, learnedValue) {
    if (input.dataset.autofillButton) return;

    const btn = document.createElement("button");
    btn.className = "jaf-field-btn jaf-learned-btn";
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
      </svg>
      Fill (Learned)
    `;
    btn.title = `Fill with learned value: "${learnedValue.substring(0, 50)}${learnedValue.length > 50 ? "..." : ""}"`;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      fillField(input, learnedValue);
      highlightField(input, true);

      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        Filled!
      `;
      btn.classList.add("jaf-field-btn-success");

      setTimeout(() => {
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
          </svg>
          Fill (Learned)
        `;
        btn.classList.remove("jaf-field-btn-success");
      }, 1500);
    });

    const wrapper = document.createElement("span");
    wrapper.className = "jaf-btn-wrapper";
    wrapper.appendChild(btn);

    insertButtonWrapper(wrapper, input);

    input.dataset.autofillButton = "true";
    fieldButtons.push({ btn, wrapper, input });
  }

  // AI-powered dropdown selection for React Select components
  // Reads page HTML to understand dropdown options, then fills them
  async function fillReactSelectWithAI(selectContainer) {
    const data = await chrome.storage.sync.get(["openaiKey"]);
    if (!data.openaiKey) {
      console.log("No OpenAI key");
      return false;
    }

    // Find the input field
    const input = selectContainer.querySelector('input[role="combobox"]');
    if (!input) {
      console.log("No combobox input found");
      return false;
    }

    // Get the label/question - try multiple methods
    let label = "";

    // Method 1: aria-labelledby
    const labelId = input.getAttribute("aria-labelledby");
    if (labelId) {
      const labelEl = document.getElementById(labelId);
      label = labelEl?.textContent?.trim() || "";
    }

    // Method 2: Look for label in parent containers
    if (!label) {
      const selectShell = selectContainer.closest(
        '.select-shell, .select, .field, [class*="field"]',
      );
      if (selectShell) {
        // Look for any text that looks like a label before the select
        const allText = selectShell.parentElement?.innerText || "";
        const lines = allText.split("\n").filter((l) => l.trim());
        if (lines.length > 0) {
          // First line is usually the label
          label = lines[0].replace(/\*$/, "").trim();
        }
      }
    }

    // Method 3: Get surrounding context
    if (!label) {
      const parent = selectContainer.closest(".field, .form-group, .question");
      if (parent) {
        label =
          parent.querySelector("label, .label, legend")?.textContent?.trim() ||
          "";
      }
    }

    if (!label) {
      console.log("No label found for dropdown");
      return false;
    }

    console.log("Dropdown label:", label);

    // STEP 1: Try to get options from the page HTML directly
    // Look for any element that might contain the options data
    let options = [];

    // First, simulate proper mouse interaction to open the dropdown
    const rect = input.getBoundingClientRect();
    const mousedownEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    input.dispatchEvent(mousedownEvent);

    await new Promise((resolve) => setTimeout(resolve, 100));

    input.focus();

    const mouseupEvent = new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    input.dispatchEvent(mouseupEvent);

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    input.dispatchEvent(clickEvent);

    // Wait for dropdown to open
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Try to find options in the now-open dropdown
    const menuSelectors = [
      ".select__menu .select__option",
      ".select__menu-list .select__option",
      '[class*="menu"] [class*="option"]',
      '[role="listbox"] [role="option"]',
      ".select__menu-list > div",
      '[id*="react-select"][id*="option"]',
    ];

    for (const selector of menuSelectors) {
      const optionEls = document.querySelectorAll(selector);
      if (optionEls.length > 0) {
        options = Array.from(optionEls)
          .map((el) => ({ text: el.textContent.trim(), element: el }))
          .filter(
            (opt) =>
              opt.text &&
              opt.text !== "Select..." &&
              opt.text !== "Select" &&
              opt.text.length < 200,
          );
        if (options.length > 0) {
          console.log("Found options with selector:", selector);
          break;
        }
      }
    }

    console.log(
      "Found options:",
      options.map((o) => o.text),
    );

    if (options.length === 0) {
      console.log("No options found - closing dropdown");
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      input.blur();
      return false;
    }

    // STEP 2: Ask AI to choose from the actual options
    const prompt = `You are helping fill out a job application form.

Question: "${label}"

AVAILABLE OPTIONS (choose ONE of these EXACTLY as written):
${options.map((opt, i) => `${i + 1}. "${opt.text}"`).join("\n")}

Candidate profile:
- Name: ${profileData.fullName || ((profileData.firstName || "") + " " + (profileData.lastName || "")).trim() || "Not specified"}
- Current Role: ${profileData.currentTitle || "Not specified"}
- Current Company: ${profileData.currentCompany || "Not specified"}
- Experience: ${profileData.yearsExperience || "Not specified"} years
- Education: ${profileData.degree || "Not specified"} from ${profileData.university || "Not specified"}
- Location: ${profileData.city || "Not specified"}, ${profileData.country || ""}
- Work Authorization: ${profileData.workAuthorization || "Not specified"}
- Visa Sponsorship Needed: ${profileData.needsVisa || "Not specified"}

Based on the question and profile, select the BEST matching option.
Respond with ONLY the exact option text, nothing else.`;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 100,
          }),
        },
      );

      if (!response.ok) {
        console.log("OpenAI API error:", response.status);
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        return false;
      }

      const result = await response.json();
      const chosenOption = result.choices[0].message.content
        .trim()
        .replace(/^["']|["']$/g, "");

      console.log("AI chose:", chosenOption);

      if (!chosenOption) {
        console.log("AI returned empty response");
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        return false;
      }

      // STEP 3: Find and click the matching option
      let matchedOption = null;

      // Exact match first
      matchedOption = options.find((opt) => opt.text === chosenOption);

      // Case-insensitive match
      if (!matchedOption) {
        matchedOption = options.find(
          (opt) => opt.text.toLowerCase() === chosenOption.toLowerCase(),
        );
      }

      // Partial match
      if (!matchedOption) {
        matchedOption = options.find(
          (opt) =>
            opt.text.toLowerCase().includes(chosenOption.toLowerCase()) ||
            chosenOption.toLowerCase().includes(opt.text.toLowerCase()),
        );
      }

      if (matchedOption && matchedOption.element) {
        console.log("Clicking option:", matchedOption.text);

        // Click with proper mouse events
        const optRect = matchedOption.element.getBoundingClientRect();
        matchedOption.element.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        matchedOption.element.dispatchEvent(
          new MouseEvent("mouseup", {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        );
        matchedOption.element.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        );

        await new Promise((resolve) => setTimeout(resolve, 300));

        // Verify selection
        const singleValue = selectContainer.querySelector(
          ".select__single-value",
        );
        const placeholder = selectContainer.querySelector(
          ".select__placeholder",
        );

        if ((singleValue && singleValue.textContent.trim()) || !placeholder) {
          console.log("Selection confirmed!");
          return true;
        }
      }

      // Fallback: try typing and pressing enter
      console.log("Click failed, trying type + enter");
      input.focus();

      // Clear and type
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      nativeInputValueSetter.call(input, chosenOption);
      input.dispatchEvent(new Event("input", { bubbles: true }));

      await new Promise((resolve) => setTimeout(resolve, 400));

      // Press down arrow then enter to select first filtered option
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          keyCode: 40,
          bubbles: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          keyCode: 13,
          bubbles: true,
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check if it worked
      const finalValue = selectContainer.querySelector(".select__single-value");
      if (finalValue && finalValue.textContent.trim()) {
        console.log("Type+enter worked:", finalValue.textContent.trim());
        return true;
      }

      console.log("All methods failed");
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      return false;
    } catch (err) {
      console.error("AI React Select error:", err);
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      return false;
    }
  }

  // AI-powered dropdown selection
  async function fillDropdownWithAI(selectElement) {
    const data = await chrome.storage.sync.get(["openaiKey"]);
    if (!data.openaiKey) return false;

    // Get all options
    const options = Array.from(selectElement.options)
      .filter((opt) => opt.value && opt.value !== "")
      .map((opt) => ({ value: opt.value, text: opt.text.trim() }));

    if (options.length === 0) return false;

    // Get the question/label
    const label = getFieldLabel(selectElement);
    if (!label) return false;

    // Build prompt for AI to choose
    const prompt = `You are helping fill out a job application form.

Question/Label: "${label}"

Available options:
${options.map((opt, i) => `${i + 1}. "${opt.text}" (value: ${opt.value})`).join("\n")}

Candidate profile:
- Name: ${profileData.fullName || ((profileData.firstName || "") + " " + (profileData.lastName || "")).trim() || "Not specified"}
- Current Role: ${profileData.currentTitle || "Not specified"}
- Current Company: ${profileData.currentCompany || "Not specified"}
- Experience: ${profileData.yearsExperience || "Not specified"} years
- Education: ${profileData.degree || "Not specified"} from ${profileData.university || "Not specified"}
- Location: ${profileData.city || "Not specified"}, ${profileData.country || ""}
- LinkedIn: ${profileData.linkedin || "Not specified"}

Based on the question and the candidate's profile, which option is the BEST match?

Rules:
- For "How did you hear about us" type questions: prefer "LinkedIn", "Company Website", "Job Board", or "Other" in that order
- For experience questions: match the years/level to the candidate's experience
- For location/timezone questions: match to candidate's location
- For yes/no questions: choose based on what's favorable for the application
- For authorization/eligibility questions: only answer positively if you can reasonably infer from profile

Respond with ONLY the exact value (not the text) of the best option. Nothing else.`;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 50,
          }),
        },
      );

      if (!response.ok) return false;

      const result = await response.json();
      const chosenValue = result.choices[0].message.content.trim();

      // Find matching option
      const matchingOption = options.find(
        (opt) =>
          opt.value === chosenValue ||
          opt.value.toLowerCase() === chosenValue.toLowerCase() ||
          opt.text.toLowerCase() === chosenValue.toLowerCase(),
      );

      if (matchingOption) {
        selectElement.value = matchingOption.value;
        selectElement.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      // Try partial match
      const partialMatch = options.find(
        (opt) =>
          opt.value.toLowerCase().includes(chosenValue.toLowerCase()) ||
          opt.text.toLowerCase().includes(chosenValue.toLowerCase()) ||
          chosenValue.toLowerCase().includes(opt.value.toLowerCase()) ||
          chosenValue.toLowerCase().includes(opt.text.toLowerCase()),
      );

      if (partialMatch) {
        selectElement.value = partialMatch.value;
        selectElement.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    } catch (err) {
      console.error("AI dropdown error:", err);
    }

    return false;
  }

  // Visual feedback for filled fields
  function highlightField(input, success = true, showSpinner = false) {
    const origBorder = input.style.border;
    const origShadow = input.style.boxShadow;
    const origBg = input.style.background;
    const origAnimation = input.style.animation;

    if (showSpinner) {
      // Spinning border effect
      input.style.border = "2px solid transparent";
      input.style.background = `linear-gradient(white, white) padding-box, 
        linear-gradient(90deg, #667eea, #764ba2, #667eea) border-box`;
      input.style.animation = "jafSpin 1.5s linear infinite";
    } else if (success) {
      input.style.border = "2px solid #00c853";
      input.style.boxShadow = "0 0 8px rgba(0,200,83,0.4)";
      input.style.background = "#f0fdf4";
      input.style.animation = "none";
    } else {
      input.style.border = "2px solid #ff5252";
      input.style.boxShadow = "0 0 8px rgba(255,82,82,0.4)";
      input.style.animation = "none";
    }

    if (!showSpinner) {
      setTimeout(() => {
        input.style.border = origBorder;
        input.style.boxShadow = origShadow;
        input.style.background = origBg;
        input.style.animation = origAnimation;
      }, 2000);
    }
  }

  // Helper function to insert button wrapper NEXT TO (not inside) input fields
  function insertButtonWrapper(wrapper, input) {
    // First, ensure the wrapper stays outside by styling
    wrapper.style.cssText = `
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 8px !important;
      vertical-align: middle !important;
      position: relative !important;
      z-index: 1000 !important;
    `;

    // Try to find a good insertion point
    const parent = input.parentNode;

    // If parent is a flex/grid container or the input is inline, insert after input
    if (parent) {
      const parentStyle = window.getComputedStyle(parent);
      const isFlexOrGrid =
        parentStyle.display.includes("flex") ||
        parentStyle.display.includes("grid");

      if (
        isFlexOrGrid ||
        parentStyle.display === "inline" ||
        parentStyle.display === "inline-block"
      ) {
        // Insert as sibling
        if (input.nextSibling) {
          parent.insertBefore(wrapper, input.nextSibling);
        } else {
          parent.appendChild(wrapper);
        }
      } else {
        // For block containers, insert after the input
        if (input.nextSibling) {
          parent.insertBefore(wrapper, input.nextSibling);
        } else {
          parent.appendChild(wrapper);
        }
      }
    }
  }

  // Create "Fill this field" button next to input
  function createFieldButton(input, fieldType) {
    if (input.dataset.autofillButton) return;

    const btn = document.createElement("button");
    btn.className = "jaf-field-btn";
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
      Fill
    `;
    btn.title = `Fill ${fieldType}`;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const value = profileData[fieldType];
      if (value) {
        fillField(input, value);
        highlightField(input, true);
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
          Done
        `;
        btn.classList.add("jaf-field-btn-success");
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Fill
          `;
          btn.classList.remove("jaf-field-btn-success");
        }, 1500);
      }
    });

    const wrapper = document.createElement("span");
    wrapper.className = "jaf-btn-wrapper";
    wrapper.appendChild(btn);

    insertButtonWrapper(wrapper, input);

    input.dataset.autofillButton = "true";
    fieldButtons.push({ btn, wrapper, input });

    return btn;
  }

  // Create AI cover letter button for textareas
  function createCoverLetterButton(textarea) {
    if (textarea.dataset.autofillButton) return;

    const btn = document.createElement("button");
    btn.className = "jaf-field-btn jaf-ai-btn";
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
      </svg>
      Fill with AI
    `;
    btn.title = "Fill with AI";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await generateAIResponse(textarea, "coverLetter", btn);
    });

    const wrapper = document.createElement("span");
    wrapper.className = "jaf-btn-wrapper";
    wrapper.appendChild(btn);

    insertButtonWrapper(wrapper, textarea);

    textarea.dataset.autofillButton = "true";
    fieldButtons.push({ btn, wrapper, input: textarea });
  }

  // Create AI button for any open-ended question
  function createAIQuestionButton(input, questionType, questionText) {
    if (input.dataset.autofillButton) return;

    const btn = document.createElement("button");
    btn.className = "jaf-field-btn jaf-ai-btn";
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
      </svg>
      Fill with AI
    `;
    btn.title = `Fill with AI: ${questionText}`;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await generateAIResponse(input, questionType, btn, questionText);
    });

    const wrapper = document.createElement("span");
    wrapper.className = "jaf-btn-wrapper";
    wrapper.appendChild(btn);

    insertButtonWrapper(wrapper, input);

    input.dataset.autofillButton = "true";
    fieldButtons.push({ btn, wrapper, input });
  }

  // Generate AI response for any question type
  async function generateAIResponse(
    input,
    questionType,
    btn,
    questionText = "",
  ) {
    const data = await chrome.storage.sync.get([
      "openaiKey",
      "userContext",
      "cvContent",
    ]);

    if (!data.openaiKey) {
      showNotification(
        0,
        [],
        "🔑 API Key Required! Click extension icon → AI tab for setup guide",
      );
      return;
    }

    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="jaf-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      Thinking...
    `;

    const jobTitle = extractJobTitle();
    const companyName = extractCompanyName();
    const jobDescription = extractJobDescription();

    const prompt = buildPromptForQuestion(questionType, questionText, {
      jobTitle,
      companyName,
      jobDescription,
      profileData,
      userContext: data.userContext,
      cvContent: data.cvContent,
    });

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.openaiKey}`,
          },
          body: JSON.stringify({
            model: "o3-mini",
            messages: [{ role: "user", content: prompt }],
            max_completion_tokens: 2000,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const result = await response.json();
      const answer = result.choices[0].message.content.trim();

      fillField(input, answer);
      highlightField(input, true);
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        Done
      `;
    } catch (err) {
      console.error("AI generation error:", err);
      showNotification(
        0,
        [],
        "Failed to generate response. Check your API key.",
      );
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
        Error
      `;
    }

    btn.disabled = false;
    setTimeout(() => {
      btn.innerHTML = originalBtnText;
    }, 2000);
  }

  // Build prompt based on question type - SMART PROMPTING STRATEGY
  function buildPromptForQuestion(questionType, questionText, context) {
    const {
      jobTitle,
      companyName,
      jobDescription,
      profileData,
      userContext,
      cvContent,
    } = context;

    // Extract more context from the page for better company understanding
    const pageContext = extractPageContext();

    const baseContext = `
CRITICAL INSTRUCTIONS:
- Write in FIRST PERSON (I, my, me) - you ARE the candidate
- Be specific to THIS company: "${companyName || "the company"}" and role: "${jobTitle || "this position"}"
- DO NOT mention job boards (LinkedIn, Indeed, Greenhouse, Lever, etc.) as the company
- DO NOT use generic phrases without backing them up
- If company name isn't clear, focus on the ROLE and JOB REQUIREMENTS instead
- Use specific details from the job description when possible

JOB APPLICATION CONTEXT:
- Position: ${jobTitle || "Not specified"}
- Company: ${companyName || "Not specified"}
- Job Description: ${jobDescription ? jobDescription.substring(0, 2500) : "Not available"}

PAGE CONTEXT:
${pageContext}

CANDIDATE PROFILE:
- Name: ${profileData.fullName || ((profileData.firstName || "") + " " + (profileData.lastName || "")).trim() || "Not specified"}
- Current Role: ${profileData.currentTitle || "Not specified"} at ${profileData.currentCompany || "Not specified"}
- Experience: ${profileData.yearsExperience || "Not specified"} years
- Education: ${profileData.degree || "Not specified"} from ${profileData.university || "Not specified"}
- Location: ${profileData.city || "Not specified"}

${userContext ? `CANDIDATE'S OWN NOTES:\n${userContext}\n` : ""}
${cvContent ? `CANDIDATE'S CV:\n${cvContent.substring(0, 3000)}\n` : ""}`;

    const prompts = {
      coverLetter: `Write a professional cover letter for this application.
${baseContext}

REQUIREMENTS:
1. Opening: Enthusiasm for "${jobTitle || "this role"}" at "${companyName || "this company"}"
2. Body: 2-3 relevant experiences with specific achievements/numbers
3. Connection: Why THIS company specifically (based on job description)
4. Closing: Eagerness and availability

RULES:
- 3-4 paragraphs, professional but warm
- NO headers (date, address) - just the letter body
- NO placeholders - use real data or omit
- DO NOT mention where you found the job
- First person, present yourself confidently`,

      whyCompany: `Answer: "${questionText || "Why do you want to work at this company?"}"
${baseContext}

Write 2-3 paragraphs that:
1. Reference specific things about "${companyName || "this company"}" from the job posting
2. Connect YOUR background to THEIR mission/work
3. Avoid clichés - be genuine and specific

First person. Conversational but professional.`,

      aboutYou: `Answer: "${questionText || "Tell us about yourself"}"
${baseContext}

Write 2-3 paragraphs covering:
1. Current role and expertise
2. 2-3 specific achievements with numbers
3. Why THIS role fits your goals

First person. Relevant to the position.`,

      whyYou: `Answer: "${questionText || "What makes you a good fit?"}"
${baseContext}

Write 2-3 paragraphs:
1. Address 2-3 requirements from the job description
2. Give specific examples proving you meet them
3. Quantify achievements where possible

First person. Confident but not arrogant.`,

      strengths: `Answer: "${questionText || "What are your strengths?"}"
${baseContext}

Write 1-2 paragraphs:
1. 2-3 strengths relevant to "${jobTitle || "this role"}"
2. Brief specific example for each
3. How you'd apply them here

First person. Evidence-based.`,

      weaknesses: `Answer: "${questionText || "What are your weaknesses?"}"
${baseContext}

Write 1-2 paragraphs:
1. ONE genuine improvement area (not a humble-brag)
2. What you're doing to improve
3. Frame constructively

First person. Authentic.`,

      careerGoals: `Answer: "${questionText || "What are your career goals?"}"
${baseContext}

Write 1-2 paragraphs:
1. Genuine professional aspirations
2. How "${jobTitle || "this role"}" fits your path
3. Show commitment

First person. Realistic but ambitious.`,

      challenge: `Answer: "${questionText || "Describe a challenge you overcame"}"
${baseContext}

Use STAR method in 2-3 paragraphs:
- Situation: Brief context
- Task: Your responsibility
- Action: Steps YOU took
- Result: Outcome with numbers if possible

First person. Specific example.`,

      achievement: `Answer: "${questionText || "Describe your greatest achievement"}"
${baseContext}

Write 2-3 paragraphs:
1. Achievement relevant to "${jobTitle || "this role"}"
2. The challenge/context
3. YOUR specific contribution
4. Quantified impact

First person.`,

      additional: `Answer: "${questionText || "Anything else to share?"}"
${baseContext}

Write 1-2 brief paragraphs:
1. Add value not covered elsewhere
2. Unique perspective, relevant interests, or passion
3. Reinforce enthusiasm for this opportunity

First person. Don't repeat other answers.`,
    };

    return prompts[questionType] || prompts.additional;
  }

  // Extract additional context from the page for better AI responses
  function extractPageContext() {
    const context = [];

    // Get all visible text headings
    const headings = document.querySelectorAll("h1, h2, h3");
    const headingTexts = Array.from(headings)
      .map((h) => h.textContent.trim())
      .filter((t) => t.length > 5 && t.length < 100)
      .slice(0, 5);
    if (headingTexts.length > 0) {
      context.push("Page headings: " + headingTexts.join(" | "));
    }

    // Look for company-related text
    const bodyText = document.body?.innerText || "";

    // Look for "About" or "Company" sections
    const aboutMatch = bodyText.match(
      /(?:about\s+(?:us|the\s+company)|who\s+we\s+are|our\s+mission)[:\s]*([^.]*\.)/i,
    );
    if (aboutMatch) {
      context.push("About: " + aboutMatch[1].trim().substring(0, 200));
    }

    // Look for requirements/qualifications
    const reqMatch = bodyText.match(
      /(?:requirements?|qualifications?)[:\s]*([^]*?)(?=\n\n|\bresponsibilities\b|\bbenefits\b|$)/i,
    );
    if (reqMatch) {
      context.push("Key Requirements: " + reqMatch[1].trim().substring(0, 300));
    }

    return context.join("\n") || "No additional page context extracted.";
  }

  // Extract job title from page
  function extractJobTitle() {
    const selectors = [
      "h1",
      ".job-title",
      ".posting-headline h2",
      '[data-qa="job-title"]',
      ".job-header h1",
      ".position-title",
      ".job-name",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length < 100) {
        return el.textContent.trim();
      }
    }
    const title = document.title;
    if (title && !title.includes("|")) return title;
    return title.split("|")[0].trim();
  }

  // Extract company name from page - improved detection
  function extractCompanyName() {
    // Priority 1: Explicit company name elements
    const selectors = [
      ".company-name",
      '[data-qa="company-name"]',
      ".employer-name",
      ".posting-categories .company",
      ".job-company",
      "[data-company]",
      ".company",
      ".employer",
      '[itemprop="hiringOrganization"]',
      ".job-header .company",
      ".posting-headline .company",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length < 60) {
        return el.textContent.trim();
      }
    }

    // Priority 2: Look for company name in page title or headings
    const pageTitle = document.title;
    const titleMatch = pageTitle.match(
      /(?:at|@|\|)\s*([A-Z][A-Za-z0-9\s&.]+?)(?:\s*[-|]|$)/i,
    );
    if (titleMatch && titleMatch[1].length < 40) {
      const company = titleMatch[1].trim();
      // Filter out job board names
      const jobBoards = [
        "linkedin",
        "indeed",
        "glassdoor",
        "ziprecruiter",
        "monster",
        "jobboard",
        "jobs",
        "careers",
        "greenhouse",
        "lever",
        "workday",
      ];
      if (!jobBoards.some((jb) => company.toLowerCase().includes(jb))) {
        return company;
      }
    }

    // Priority 3: Look for "About [Company]" or "Join [Company]" patterns in page text
    const bodyText = document.body?.innerText || "";
    const aboutMatch = bodyText.match(
      /(?:About|Join|Work at|Careers at)\s+([A-Z][A-Za-z0-9\s&.]{2,30})(?:\s|\n|$)/i,
    );
    if (aboutMatch && aboutMatch[1].length < 40) {
      const company = aboutMatch[1].trim();
      const jobBoards = [
        "linkedin",
        "indeed",
        "glassdoor",
        "ziprecruiter",
        "monster",
        "jobboard",
      ];
      if (!jobBoards.some((jb) => company.toLowerCase().includes(jb))) {
        return company;
      }
    }

    // Priority 4: Check meta tags
    const ogSiteName = document.querySelector(
      'meta[property="og:site_name"]',
    )?.content;
    if (ogSiteName && ogSiteName.length < 40) {
      const jobBoards = [
        "linkedin",
        "indeed",
        "glassdoor",
        "ziprecruiter",
        "monster",
        "jobboard",
        "greenhouse",
        "lever",
      ];
      if (!jobBoards.some((jb) => ogSiteName.toLowerCase().includes(jb))) {
        return ogSiteName;
      }
    }

    // Priority 5: Only as last resort - extract from subdomain (but filter job boards)
    const url = window.location.hostname;
    const jobBoardDomains = [
      "greenhouse",
      "lever",
      "workday",
      "taleo",
      "icims",
      "smartrecruiters",
      "jobvite",
      "ashbyhq",
      "recruitee",
      "jobs",
      "careers",
      "linkedin",
      "indeed",
      "glassdoor",
    ];
    const match = url.match(/(?:jobs\.|careers\.)?([a-z0-9-]+)\./i);
    if (match && !jobBoardDomains.includes(match[1].toLowerCase())) {
      return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }

    return null;
  }

  // Extract job description from page
  function extractJobDescription() {
    const selectors = [
      ".job-description",
      '[data-qa="job-description"]',
      ".posting-body",
      ".description",
      "#job-description",
      ".job-details",
      ".content-wrapper",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el.innerText.trim();
    }
    return null;
  }

  // Create "Fill All Fields" panel in top-left
  function createFillAllPanel() {
    // Don't create panel in iframes - only in top window
    if (isInIframe) return;

    if (fillAllPanel) return;

    const panel = document.createElement("div");
    panel.id = "jaf-fill-all-panel";
    panel.innerHTML = `
      <div class="jaf-panel-header">
        <div class="jaf-panel-logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="none">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <span class="jaf-panel-title">Job Autofill</span>
        <button class="jaf-panel-minimize" title="Minimize">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
            <path stroke-linecap="square" d="M5 5v14M5 5h14"/>
          </svg>
        </button>
        <button class="jaf-panel-close" title="Close">×</button>
      </div>
      
      <!-- AI Assistant Chatbox - AT THE TOP, expanded by default on job pages -->
      <div class="jaf-ai-chatbox jaf-chatbox-minimized" style="display: block;">
        <div class="jaf-chatbox-header">
          <span>🤖 AI Assistant</span>
          <button class="jaf-chatbox-close">×</button>
        </div>
        <div class="jaf-chatbox-messages">
          <div class="jaf-chat-msg jaf-chat-ai jaf-chat-loading">
            <span class="jaf-typing-dots">Detecting page type...</span>
          </div>
        </div>
        <div class="jaf-chatbox-input-area">
          <textarea class="jaf-chatbox-input" placeholder="Type your response..."></textarea>
          <div class="jaf-chatbox-actions">
            <button class="jaf-chatbox-attach" title="Attach document">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
              </svg>
            </button>
            <input type="file" class="jaf-chatbox-file" accept=".pdf,.doc,.docx,.txt" style="display: none;">
            <button class="jaf-chatbox-send">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
              Send
            </button>
          </div>
        </div>
      </div>
      
      <!-- Panel Content - Tools and Fill -->
      <div class="jaf-panel-body">
        <!-- Missing Parameters Section - Collapsible -->
        <details class="jaf-missing-section" style="display: none;">
          <summary class="jaf-missing-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <span class="jaf-missing-count">0</span> fields need data
          </summary>
          <div class="jaf-missing-list"></div>
        </details>
        
        <!-- Tools Section - All buttons grouped together -->
        <div class="jaf-tools-compact">
          <button class="jaf-panel-btn jaf-fill-all-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Fill All Fields
          </button>
          <div class="jaf-panel-stats">
            <span class="jaf-stat-count">0 fields</span><span class="jaf-ai-count"></span>
          </div>
          <label class="jaf-ai-toggle">
            <input type="checkbox" id="jaf-include-ai" />
            <span>Include AI fields</span>
          </label>
          
          <div class="jaf-tools-row">
            <button class="jaf-panel-btn jaf-fill-ai-btn jaf-btn-sm" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              Fill AI Fields
            </button>
            <button class="jaf-panel-btn jaf-cover-letter-btn jaf-btn-sm" style="background: linear-gradient(135deg, #1a1a1a 0%, #333333 100%);">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Cover Letter
            </button>
          </div>
          
          <div class="jaf-tools-row">
            <button class="jaf-panel-btn jaf-job-tracker-btn jaf-btn-sm" style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
              Job Tracker
            </button>
            <button class="jaf-panel-btn jaf-hide-all-btn jaf-btn-sm" style="background: #f5f5f5; color: #666;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
              Hide
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    fillAllPanel = panel;

    panel.querySelector(".jaf-panel-close").addEventListener("click", () => {
      panel.classList.add("jaf-panel-hidden");
    });

    // Minimize button - collapse to just logo
    panel.querySelector(".jaf-panel-minimize").addEventListener("click", () => {
      panel.classList.add("jaf-panel-minimized");
    });

    // Click on logo to expand when minimized
    panel.querySelector(".jaf-panel-logo").addEventListener("click", () => {
      if (panel.classList.contains("jaf-panel-minimized")) {
        panel.classList.remove("jaf-panel-minimized");
      }
    });

    panel
      .querySelector(".jaf-fill-all-btn")
      .addEventListener("click", async () => {
        const includeAI =
          panel.querySelector("#jaf-include-ai")?.checked || false;
        await autofillAll(includeAI);
      });

    // Load AI toggle state - always enabled, checked if API key exists
    chrome.storage.sync
      .get(["openaiKey", "includeAIByDefault"])
      .then((data) => {
        const toggle = panel.querySelector("#jaf-include-ai");
        const label = panel.querySelector(".jaf-ai-toggle");

        // Always enable the toggle
        toggle.disabled = false;

        if (data.openaiKey) {
          // If API key exists, check by default
          toggle.checked = data.includeAIByDefault !== false;
          label.classList.add("jaf-ai-enabled");
          label.title = "Include AI-generated responses";
        } else {
          // No API key - still allow toggle but show warning on click
          toggle.checked = false;
          label.title = "Click extension icon → AI tab for API key setup";
          toggle.addEventListener("change", () => {
            if (toggle.checked && !data.openaiKey) {
              showNotification(
                0,
                [],
                "🔑 Click extension icon → AI tab for setup guide",
              );
              toggle.checked = false;
            }
          });
        }
      });

    // AI Analyze is now done automatically on page load
    // Auto-analyze page in background
    setTimeout(() => {
      analyzePageWithAI();
    }, 1000);

    // Auto-open and analyze with SmartChatbox (as described in READTHIS)
    setTimeout(() => {
      if (window.SmartChatbox) {
        window.SmartChatbox.init(fillAllPanel);
        window.SmartChatbox.open();
      }
    }, 500);

    // Fill AI Fields button - fills only AI-requiring fields
    panel
      .querySelector(".jaf-fill-ai-btn")
      ?.addEventListener("click", async () => {
        await autofillAll(true); // Force include AI
      });

    // Cover Letter button
    panel
      .querySelector(".jaf-cover-letter-btn")
      ?.addEventListener("click", async () => {
        if (window.CoverLetterGenerator) {
          await window.CoverLetterGenerator.generateAndShow();
        } else {
          showNotification(
            0,
            [],
            "Cover letter generator not loaded. Please refresh the page.",
          );
        }
      });

    // Job Tracker button
    panel
      .querySelector(".jaf-job-tracker-btn")
      ?.addEventListener("click", () => {
        if (window.JobTracker) {
          window.JobTracker.createTrackerPanel();
        } else {
          showNotification(
            0,
            [],
            "Job tracker not loaded. Please refresh the page.",
          );
        }
      });

    // Hide all buttons on this page
    panel.querySelector(".jaf-hide-all-btn").addEventListener("click", () => {
      removeExtensionUI();
      showNotification(
        0,
        [],
        "Extension hidden on this page. Reload to show again.",
      );
    });

    // Chatbox close button - minimizes to header only
    panel.querySelector(".jaf-chatbox-close")?.addEventListener("click", () => {
      const chatbox = panel.querySelector(".jaf-ai-chatbox");
      chatbox.classList.add("jaf-chatbox-minimized");
    });

    // Chatbox header click - toggle open/closed
    panel
      .querySelector(".jaf-chatbox-header")
      ?.addEventListener("click", (e) => {
        // Don't toggle if clicking the close button
        if (e.target.closest(".jaf-chatbox-close")) return;

        const chatbox = panel.querySelector(".jaf-ai-chatbox");
        if (chatbox.classList.contains("jaf-chatbox-minimized")) {
          chatbox.classList.remove("jaf-chatbox-minimized");
        }
      });

    // Chatbox send button
    panel.querySelector(".jaf-chatbox-send")?.addEventListener("click", () => {
      sendChatMessage();
    });

    // Chatbox enter key
    panel
      .querySelector(".jaf-chatbox-input")
      ?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });

    // Chatbox file attach
    panel
      .querySelector(".jaf-chatbox-attach")
      ?.addEventListener("click", () => {
        panel.querySelector(".jaf-chatbox-file").click();
      });

    panel
      .querySelector(".jaf-chatbox-file")
      ?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) {
          // Route to SmartChatbox if available
          if (window.SmartChatbox && window.SmartChatbox.isOpen) {
            await window.SmartChatbox.processDocument(file);
          } else {
            await processAttachedDocument(file);
          }
        }
      });

    updatePanelStats();
    suggestCV();
    detectMissingParameters();
  }

  // Database view state
  let databaseItems = [];

  // Export profile backup
  async function exportProfileBackup() {
    try {
      const data = await chrome.storage.sync.get(null);

      // Remove sensitive/temporary data
      const exportData = { ...data };
      delete exportData.openaiKey; // Don't export API key

      // Add metadata
      exportData._exportMeta = {
        exportedAt: new Date().toISOString(),
        extensionVersion: "1.0.0",
        exportVersion: 1,
      };

      // Create JSON blob
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // Generate filename with date
      const date = new Date().toISOString().split("T")[0];
      const filename = `job-autofill-backup-${date}.json`;

      // Download
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      showNotification(0, [], `✅ Profile exported to ${filename}`);
    } catch (err) {
      console.error("Export error:", err);
      showNotification(0, [], "⚠️ Failed to export profile");
    }
  }

  // Load database view with all stored data
  async function loadDatabaseView() {
    if (!fillAllPanel) return;

    const listEl = fillAllPanel.querySelector(".jaf-db-list");
    const countEl = fillAllPanel.querySelector(".jaf-db-count");

    if (!listEl) return;

    // Get all stored data
    const data = await chrome.storage.sync.get(null);
    databaseItems = [];

    // Standard profile fields
    const standardFields = [
      "firstName",
      "lastName",
      "fullName",
      "email",
      "phone",
      "city",
      "country",
      "workCountries",
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
      "userContext",
      "cvContent",
    ];

    // Add standard fields
    standardFields.forEach((key) => {
      if (data[key] && typeof data[key] === "string" && data[key].trim()) {
        databaseItems.push({
          type: "profile",
          key,
          label: formatFieldLabel(key),
          value: data[key],
          icon: "👤",
        });
      }
    });

    // Add learned responses
    const learned = data.learnedResponses || {};
    Object.entries(learned).forEach(([key, item]) => {
      databaseItems.push({
        type: "learned",
        key,
        label: item.fieldLabel || key,
        value: item.value,
        usageCount: item.usageCount || 1,
        icon: "🧠",
      });
    });

    // Add custom params
    const customParams = data.customParams || [];
    customParams.forEach((param) => {
      if (data[param.key] && !standardFields.includes(param.key)) {
        databaseItems.push({
          type: "custom",
          key: param.key,
          label: param.label,
          value: data[param.key],
          icon: "📝",
        });
      }
    });

    // Add extracted documents info
    const extractedDocs = data.extractedDocuments || [];
    extractedDocs.forEach((doc) => {
      databaseItems.push({
        type: "document",
        key: doc.id,
        label: doc.name,
        value: doc.extractedText?.substring(0, 200) + "...",
        fullText: doc.extractedText,
        uploadedAt: doc.uploadedAt,
        icon: "📄",
      });
    });

    // Update count
    countEl.textContent = `${databaseItems.length} items stored`;

    // Render list
    renderDatabaseList(listEl, databaseItems);
  }

  // Format field key to readable label
  function formatFieldLabel(key) {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  // Render database list
  function renderDatabaseList(listEl, items) {
    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="jaf-db-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
          </svg>
          <p>No data stored yet</p>
          <p style="font-size: 10px; color: #999;">Upload documents or fill forms to build your database</p>
        </div>
      `;
      return;
    }

    // Group by type
    const grouped = {
      profile: items.filter((i) => i.type === "profile"),
      learned: items.filter((i) => i.type === "learned"),
      custom: items.filter((i) => i.type === "custom"),
      document: items.filter((i) => i.type === "document"),
    };

    let html = "";

    if (grouped.profile.length > 0) {
      html += `<div class="jaf-db-group">
        <div class="jaf-db-group-title">👤 Profile Data (${grouped.profile.length})</div>
        ${grouped.profile.map((item) => renderDatabaseItem(item)).join("")}
      </div>`;
    }

    if (grouped.learned.length > 0) {
      html += `<div class="jaf-db-group">
        <div class="jaf-db-group-title">🧠 Learned Responses (${grouped.learned.length})</div>
        ${grouped.learned.map((item) => renderDatabaseItem(item)).join("")}
      </div>`;
    }

    if (grouped.custom.length > 0) {
      html += `<div class="jaf-db-group">
        <div class="jaf-db-group-title">📝 Custom Fields (${grouped.custom.length})</div>
        ${grouped.custom.map((item) => renderDatabaseItem(item)).join("")}
      </div>`;
    }

    if (grouped.document.length > 0) {
      html += `<div class="jaf-db-group">
        <div class="jaf-db-group-title">📄 Uploaded Documents (${grouped.document.length})</div>
        ${grouped.document.map((item) => renderDatabaseItem(item)).join("")}
      </div>`;
    }

    listEl.innerHTML = html;

    // Add delete handlers
    listEl.querySelectorAll(".jaf-db-item-delete").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const key = btn.dataset.key;
        const type = btn.dataset.type;
        await deleteFromDatabase(type, key);
      });
    });

    // Add expand handlers for documents
    listEl
      .querySelectorAll('.jaf-db-item[data-type="document"]')
      .forEach((item) => {
        item.addEventListener("click", () => {
          item.classList.toggle("jaf-db-item-expanded");
        });
      });
  }

  // Render single database item
  function renderDatabaseItem(item) {
    const valuePreview =
      item.value.length > 60 ? item.value.substring(0, 60) + "..." : item.value;
    const usageInfo = item.usageCount
      ? `<span class="jaf-db-usage">Used ${item.usageCount}x</span>`
      : "";

    return `
      <div class="jaf-db-item" data-key="${item.key}" data-type="${item.type}">
        <div class="jaf-db-item-header">
          <span class="jaf-db-item-label">${item.label}</span>
          ${usageInfo}
          <button class="jaf-db-item-delete" data-key="${item.key}" data-type="${item.type}" title="Delete">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="jaf-db-item-value" title="${item.value.replace(/"/g, "&quot;")}">${valuePreview}</div>
        ${item.type === "document" && item.fullText ? `<div class="jaf-db-item-full">${item.fullText.substring(0, 500)}...</div>` : ""}
      </div>
    `;
  }

  // Filter database view
  function filterDatabaseView(query) {
    if (!fillAllPanel) return;

    const listEl = fillAllPanel.querySelector(".jaf-db-list");
    if (!listEl || !databaseItems.length) return;

    const filtered = query.trim()
      ? databaseItems.filter(
          (item) =>
            item.label.toLowerCase().includes(query.toLowerCase()) ||
            item.value.toLowerCase().includes(query.toLowerCase()),
        )
      : databaseItems;

    renderDatabaseList(listEl, filtered);
  }

  // Delete item from database
  async function deleteFromDatabase(type, key) {
    const data = await chrome.storage.sync.get(null);

    if (type === "profile" || type === "custom") {
      await chrome.storage.sync.remove(key);
      // Also remove from customParams if it's there
      const customParams = (data.customParams || []).filter(
        (p) => p.key !== key,
      );
      await chrome.storage.sync.set({ customParams });
    } else if (type === "learned") {
      const learned = data.learnedResponses || {};
      delete learned[key];
      await chrome.storage.sync.set({ learnedResponses: learned });
    } else if (type === "document") {
      const docs = (data.extractedDocuments || []).filter((d) => d.id !== key);
      await chrome.storage.sync.set({ extractedDocuments: docs });
    }

    loadDatabaseView();
    showNotification(0, [], "Item deleted from database");
  }

  // Upload document to database
  async function uploadDocumentToDatabase(file) {
    showNotification(0, [], `Processing "${file.name}"...`);

    try {
      let textContent = "";

      if (file.type === "text/plain") {
        textContent = await file.text();
      } else if (file.type === "application/pdf") {
        textContent = await extractPDFText(file);
      } else {
        showNotification(
          0,
          [],
          "Unsupported file type. Please use PDF or TXT files.",
        );
        return;
      }

      if (!textContent || textContent.length < 20) {
        showNotification(0, [], "Could not extract text from document.");
        return;
      }

      // Store the document
      const data = await chrome.storage.sync.get(["extractedDocuments"]);
      const docs = data.extractedDocuments || [];

      // Generate unique ID
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      docs.push({
        id: docId,
        name: file.name,
        type: file.type,
        size: file.size,
        extractedText: textContent.substring(0, 5000), // Limit storage
        uploadedAt: Date.now(),
      });

      await chrome.storage.sync.set({ extractedDocuments: docs });

      // Now use AI to extract structured data
      const apiData = await chrome.storage.sync.get(["openaiKey"]);
      if (apiData.openaiKey) {
        showNotification(0, [], "Extracting data with AI...");
        await extractDataFromDocument(textContent, apiData.openaiKey);
      }

      loadDatabaseView();
      showNotification(0, [], `Document "${file.name}" added to database!`);
    } catch (err) {
      console.error("Upload error:", err);
      showNotification(0, [], "Error processing document. Please try again.");
    }
  }

  // Extract structured data from document using AI
  async function extractDataFromDocument(text, apiKey) {
    const prompt = `Extract structured data from this document (likely a CV/resume).

Document text:
"""
${text.substring(0, 3000)}
"""

Extract any of these fields if present:
- Full Name, Email, Phone, City, Country
- Current Company, Current Title, Years of Experience
- University, Degree, Graduation Year
- LinkedIn URL, Website, GitHub
- Skills, Languages, Certifications

Respond with JSON:
{
  "extracted": [
    {"field": "fieldName", "value": "extracted value"}
  ]
}

Only include fields you can confidently extract.`;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1000,
          }),
        },
      );

      if (!response.ok) return;

      const result = await response.json();
      const content = result.choices[0].message.content;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.extracted && parsed.extracted.length > 0) {
          // Map to storage keys
          const fieldMap = {
            "full name": "fullName",
            name: "fullName",
            email: "email",
            phone: "phone",
            city: "city",
            country: "country",
            "current company": "currentCompany",
            company: "currentCompany",
            "current title": "currentTitle",
            title: "currentTitle",
            position: "currentTitle",
            "years of experience": "yearsExperience",
            experience: "yearsExperience",
            university: "university",
            school: "university",
            college: "university",
            degree: "degree",
            "graduation year": "gradYear",
            linkedin: "linkedin",
            "linkedin url": "linkedin",
            website: "website",
            github: "github",
          };

          const toSave = {};
          parsed.extracted.forEach((item) => {
            const key = fieldMap[item.field.toLowerCase()];
            if (key && item.value) {
              toSave[key] = item.value;
            }
          });

          if (Object.keys(toSave).length > 0) {
            await chrome.storage.sync.set(toSave);
            showNotification(
              Object.keys(toSave).length,
              Object.keys(toSave),
              `Extracted ${Object.keys(toSave).length} fields from document`,
            );
          }
        }
      }
    } catch (err) {
      console.error("AI extraction error:", err);
    }
  }

  // Detect fields that have no saved value
  function detectMissingParameters() {
    if (!fillAllPanel) return;

    const missingSection = fillAllPanel.querySelector(".jaf-missing-section");
    const missingList = fillAllPanel.querySelector(".jaf-missing-list");
    const missingCount = fillAllPanel.querySelector(".jaf-missing-count");

    if (!missingSection || !missingList) return;

    // Find all "Add Parameter" buttons - these are fields without saved values
    const addParamButtons = document.querySelectorAll(".jaf-add-param-btn");
    const missingFields = [];

    addParamButtons.forEach((btn) => {
      const wrapper = btn.closest(".jaf-btn-wrapper");
      if (!wrapper) return;

      // Find the associated input
      const input = wrapper.previousElementSibling;
      if (
        input &&
        (input.tagName === "INPUT" || input.tagName === "TEXTAREA")
      ) {
        const label = getFieldLabel(input);
        missingFields.push({ label, input });
      }
    });

    if (missingFields.length > 0) {
      missingSection.style.display = "block";
      missingCount.textContent = missingFields.length;
      missingList.innerHTML =
        missingFields
          .slice(0, 5)
          .map(
            (f) =>
              `<div class="jaf-missing-item" style="font-size: 10px; color: #666; padding: 2px 0;">• ${f.label}</div>`,
          )
          .join("") +
        (missingFields.length > 5
          ? `<div style="font-size: 10px; color: #888;">...and ${missingFields.length - 5} more</div>`
          : "");
    } else {
      missingSection.style.display = "none";
    }
  }

  // AI Chatbox state
  let chatHistory = [];
  let pendingFields = [];

  // Open AI Chatbox - Uses SmartChatbox module if available
  function openAIChatbox() {
    if (!fillAllPanel) return;

    // Use SmartChatbox module if available (enhanced version)
    if (window.SmartChatbox) {
      window.SmartChatbox.init(fillAllPanel);
      window.SmartChatbox.open();
      return;
    }

    // Fallback to basic chatbox
    const chatbox = fillAllPanel.querySelector(".jaf-ai-chatbox");
    const messagesEl = fillAllPanel.querySelector(".jaf-chatbox-messages");

    chatbox.style.display = "block";
    chatHistory = [];
    pendingFields = [];

    // Collect missing fields
    const addParamButtons = document.querySelectorAll(".jaf-add-param-btn");
    addParamButtons.forEach((btn) => {
      const wrapper = btn.closest(".jaf-btn-wrapper");
      if (!wrapper) return;
      const input = wrapper.previousElementSibling;
      if (input) {
        const label = getFieldLabel(input);
        pendingFields.push({
          label,
          input,
          key: generateFieldKey(input, label),
        });
      }
    });

    // Initial AI message
    const fieldsList = pendingFields.map((f) => `• ${f.label}`).join("\n");
    const initialMessage = `Hello! I'm your AI assistant powered by GPT-4o-mini. 🤖

I found **${pendingFields.length} fields** that need your information:

${fieldsList}

**How can you help me fill these?**
1. **Type your answers** directly - I'll extract the relevant info
2. **Attach a document** (CV, resume, etc.) - I'll parse it
3. **Describe yourself** - I'll infer what I can

What would you like to share?`;

    messagesEl.innerHTML = "";
    addChatMessage("ai", initialMessage);
  }

  // Add message to chatbox
  function addChatMessage(role, content) {
    const messagesEl = fillAllPanel?.querySelector(".jaf-chatbox-messages");
    if (!messagesEl) return;

    const msg = document.createElement("div");
    msg.className = `jaf-chat-msg jaf-chat-${role}`;
    msg.innerHTML = content
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    chatHistory.push({ role, content });
  }

  // Send chat message
  async function sendChatMessage() {
    // Use SmartChatbox if available (preferred)
    if (window.SmartChatbox && window.SmartChatbox.isOpen) {
      window.SmartChatbox.sendMessage();
      return;
    }

    const inputEl = fillAllPanel?.querySelector(".jaf-chatbox-input");
    if (!inputEl) return;

    const message = inputEl.value.trim();
    if (!message) return;

    inputEl.value = "";
    addChatMessage("user", message);

    // Show typing indicator
    const typingEl = document.createElement("div");
    typingEl.className = "jaf-chat-msg jaf-chat-ai jaf-chat-typing";
    typingEl.innerHTML = '<span class="jaf-typing-dots">...</span>';
    fillAllPanel.querySelector(".jaf-chatbox-messages").appendChild(typingEl);

    try {
      const data = await chrome.storage.sync.get(["openaiKey"]);
      if (!data.openaiKey) {
        typingEl.remove();
        addChatMessage(
          "ai",
          `⚠️ <strong>API Key Required</strong><br><br>
          To use AI features:<br>
          1. Click the extension icon (top right of browser)<br>
          2. Go to the <strong>AI tab</strong><br>
          3. Follow the step-by-step guide<br><br>
          <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #8b5cf6;">→ Get your API key here</a>`,
        );
        return;
      }

      // Build prompt for AI to extract parameters
      const fieldsInfo = pendingFields.map((f) => f.label).join(", ");
      const prompt = `You are an AI assistant helping a user fill out a job application. 
      
The form has these fields that need values: ${fieldsInfo}

The user provided this information:
"${message}"

Based on this information, extract any values that can fill the form fields.
Respond in this JSON format:
{
  "extracted": [
    {"field": "Field Name", "value": "extracted value", "confidence": "high/medium/low"}
  ],
  "missing": ["Field Name 1", "Field Name 2"],
  "followUp": "Your natural language response to the user"
}

Be conversational in followUp. If you extracted values, confirm them. If fields are still missing, ask about them specifically.`;

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful AI assistant that extracts structured information from user messages to fill job application forms.",
              },
              ...chatHistory.slice(-6).map((m) => ({
                role: m.role === "ai" ? "assistant" : "user",
                content: m.content,
              })),
              { role: "user", content: prompt },
            ],
            max_tokens: 1000,
          }),
        },
      );

      typingEl.remove();

      if (!response.ok) {
        addChatMessage(
          "ai",
          "⚠️ Sorry, there was an error connecting to the AI. Please try again.",
        );
        return;
      }

      const result = await response.json();
      const aiResponse = result.choices[0].message.content;

      // Try to parse JSON response
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          // Apply extracted values and learn from them
          if (parsed.extracted && parsed.extracted.length > 0) {
            let savedCount = 0;
            for (const item of parsed.extracted) {
              const field = pendingFields.find(
                (f) =>
                  f.label.toLowerCase().includes(item.field.toLowerCase()) ||
                  item.field.toLowerCase().includes(f.label.toLowerCase()),
              );
              if (field && item.value) {
                // Save to storage and learn
                await chrome.storage.sync.set({ [field.key]: item.value });
                profileData[field.key] = item.value;

                // Fill the field
                fillField(field.input, item.value);
                highlightField(field.input, true);
                savedCount++;

                // Remove from pending
                pendingFields = pendingFields.filter(
                  (f) => f.key !== field.key,
                );
              }
            }

            // Update custom params list
            const storedData = await chrome.storage.sync.get(["customParams"]);
            const customParams = storedData.customParams || [];
            for (const item of parsed.extracted) {
              const field = pendingFields.find((f) =>
                f.label.toLowerCase().includes(item.field.toLowerCase()),
              );
              if (field && !customParams.find((p) => p.key === field.key)) {
                customParams.push({
                  key: field.key,
                  label: field.label,
                  section: "custom",
                });
              }
            }
            await chrome.storage.sync.set({ customParams });
          }

          // Show response with action buttons if values were extracted
          let responseHTML = parsed.followUp || "I processed your information.";

          if (parsed.extracted && parsed.extracted.length > 0) {
            responseHTML += `\n\n✅ **Filled ${parsed.extracted.length} field(s):**\n`;
            responseHTML += parsed.extracted
              .map((e) => `• ${e.field}: "${e.value}"`)
              .join("\n");
          }

          if (parsed.missing && parsed.missing.length > 0) {
            responseHTML += `\n\n❓ **Still need:**\n`;
            responseHTML += parsed.missing.map((m) => `• ${m}`).join("\n");
          }

          addChatMessage("ai", responseHTML);

          // Update panel stats
          updatePanelStats();
          detectMissingParameters();
        } else {
          addChatMessage("ai", aiResponse);
        }
      } catch (e) {
        addChatMessage("ai", aiResponse);
      }
    } catch (err) {
      typingEl?.remove();
      console.error("Chat error:", err);
      addChatMessage("ai", "⚠️ Sorry, there was an error. Please try again.");
    }
  }

  // Process attached document
  async function processAttachedDocument(file) {
    addChatMessage("user", `📎 Attached: ${file.name}`);

    // Show processing message
    addChatMessage(
      "ai",
      `📄 Processing "${file.name}"... This may take a moment.`,
    );

    try {
      let textContent = "";

      if (file.type === "text/plain") {
        textContent = await file.text();
      } else if (file.type === "application/pdf") {
        // Use PDF.js to extract text
        textContent = await extractPDFText(file);
      } else {
        addChatMessage(
          "ai",
          "⚠️ Sorry, I can only process PDF and TXT files directly. Please paste the content instead.",
        );
        return;
      }

      if (!textContent || textContent.length < 50) {
        addChatMessage(
          "ai",
          "⚠️ Could not extract enough text from the document. Please paste the content manually.",
        );
        return;
      }

      const data = await chrome.storage.sync.get(["openaiKey"]);
      if (!data.openaiKey) {
        addChatMessage(
          "ai",
          "⚠️ <strong>API Key Required</strong> - Click extension icon → AI tab for setup guide. <a href='https://platform.openai.com/api-keys' target='_blank' style='color: #8b5cf6;'>Get key here</a>",
        );
        return;
      }

      // Ask AI to extract info from document
      const fieldsInfo = pendingFields.map((f) => f.label).join(", ");
      const prompt = `I have a document (likely a CV/resume) with this content:

"""
${textContent.substring(0, 4000)}
"""

The job application needs these fields: ${fieldsInfo}

Extract any matching values. Respond with JSON:
{
  "extracted": [{"field": "Field Name", "value": "value from doc", "confidence": "high/medium/low"}],
  "missing": ["fields still needed"],
  "summary": "Brief summary of what you found"
}`;

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1500,
          }),
        },
      );

      if (!response.ok) throw new Error("API failed");

      const result = await response.json();
      const aiResponse = result.choices[0].message.content;

      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.extracted && parsed.extracted.length > 0) {
          const total = pendingFields.length;
          const found = parsed.extracted.length;
          const missing = parsed.missing?.length || total - found;

          let responseMsg = `📋 **Document Analysis Complete!**\n\n`;
          responseMsg += `This document allows me to fill **${found}/${total}** fields.\n\n`;
          responseMsg += `**Found values:**\n`;
          responseMsg += parsed.extracted
            .map(
              (e) =>
                `• ${e.field}: "${e.value.substring(0, 50)}${e.value.length > 50 ? "..." : ""}"`,
            )
            .join("\n");

          if (missing > 0) {
            responseMsg += `\n\n**Still need ${missing} more:**\n`;
            responseMsg += (parsed.missing || [])
              .map((m) => `• ${m}`)
              .join("\n");
          }

          responseMsg += `\n\n**Would you like me to fill these ${found} fields now?**`;

          addChatMessage("ai", responseMsg);

          // Add action buttons
          const actionsDiv = document.createElement("div");
          actionsDiv.className = "jaf-chat-actions";
          actionsDiv.innerHTML = `
            <button class="jaf-chat-action-btn jaf-chat-fill-btn" style="background: #22c55e;">
              ✓ Yes, fill all ${found} fields
            </button>
            <button class="jaf-chat-action-btn jaf-chat-skip-btn" style="background: #6b7280;">
              Not now
            </button>
          `;
          fillAllPanel
            .querySelector(".jaf-chatbox-messages")
            .appendChild(actionsDiv);

          // Handle fill button
          actionsDiv
            .querySelector(".jaf-chat-fill-btn")
            .addEventListener("click", async () => {
              actionsDiv.remove();
              let filledCount = 0;

              for (const item of parsed.extracted) {
                const field = pendingFields.find(
                  (f) =>
                    f.label.toLowerCase().includes(item.field.toLowerCase()) ||
                    item.field.toLowerCase().includes(f.label.toLowerCase()),
                );
                if (field && item.value) {
                  await chrome.storage.sync.set({ [field.key]: item.value });
                  profileData[field.key] = item.value;
                  fillField(field.input, item.value);
                  highlightField(field.input, true);
                  filledCount++;
                  pendingFields = pendingFields.filter(
                    (f) => f.key !== field.key,
                  );
                }
              }

              addChatMessage(
                "ai",
                `✅ Done! Filled **${filledCount} fields** and saved them for future applications.\n\n${missing > 0 ? `You still have ${missing} fields to fill. Tell me more about yourself to complete them!` : "🎉 All fields are now complete!"}`,
              );
              updatePanelStats();
              detectMissingParameters();
            });

          actionsDiv
            .querySelector(".jaf-chat-skip-btn")
            .addEventListener("click", () => {
              actionsDiv.remove();
              addChatMessage(
                "ai",
                "No problem! Let me know when you're ready, or share more information about yourself.",
              );
            });
        } else {
          addChatMessage(
            "ai",
            `📋 I analyzed the document but couldn't find values for the required fields. ${parsed.summary || ""}\n\nCould you tell me more specifically about: ${pendingFields.map((f) => f.label).join(", ")}?`,
          );
        }
      }
    } catch (err) {
      console.error("Document processing error:", err);
      addChatMessage(
        "ai",
        "⚠️ Sorry, there was an error processing the document. Please try pasting the content instead.",
      );
    }
  }

  // Extract text from PDF using PDF.js
  async function extractPDFText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // Load PDF.js dynamically if not available
          if (typeof pdfjsLib === "undefined") {
            // Try to use the bundled pdf.js
            const script = document.createElement("script");
            script.src = chrome.runtime.getURL("pdf.min.js");
            document.head.appendChild(script);
            await new Promise((r) => (script.onload = r));
          }

          const typedArray = new Uint8Array(e.target.result);
          const pdf = await pdfjsLib.getDocument(typedArray).promise;
          let text = "";

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item) => item.str).join(" ") + "\n";
          }

          resolve(text);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Analyze page with AI to detect best fields for AI filling
  async function analyzePageWithAI() {
    const data = await chrome.storage.sync.get(["openaiKey"]);

    if (!data.openaiKey) {
      // Silently skip if no API key (runs automatically now)
      return;
    }

    const btn = fillAllPanel.querySelector(".jaf-ai-analyze-btn");
    const originalText = btn?.innerHTML || "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
      <svg class="jaf-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      Analyzing...
    `;
    }

    // Helper to check if input should be skipped
    const shouldSkipInput = (input) => {
      if (
        input.type === "hidden" ||
        input.type === "submit" ||
        input.type === "button" ||
        input.type === "file" ||
        input.type === "checkbox" ||
        input.type === "radio"
      )
        return true;
      if (input.getAttribute("aria-hidden") === "true") return true;
      if (input.getAttribute("tabindex") === "-1") return true;
      if (input.style.display === "none") return true;
      if (
        input.classList.contains("requiredInput") ||
        input.className.includes("requiredInput")
      )
        return true;
      if (input.closest(".select-shell") || input.closest(".select__control"))
        return true;
      if (input.classList.contains("select__input")) return true;
      if (input.getAttribute("role") === "combobox" && input.closest(".select"))
        return true;
      return false;
    };

    // Gather only valid form fields
    const allInputs = document.querySelectorAll("input, textarea, select");
    const validInputs = [];

    let fieldsHTML = "";
    allInputs.forEach((input) => {
      if (shouldSkipInput(input)) return;

      const label = getFieldLabel(input);
      const attrs = {
        tag: input.tagName,
        type: input.type || "text",
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        label: label,
        required: input.required,
        hasButton: input.dataset.autofillButton === "true",
      };
      fieldsHTML += `Field ${validInputs.length}: ${JSON.stringify(attrs)}\n`;
      validInputs.push(input);
    });

    const prompt = `Analyze these form fields from a job application page and categorize each field.

FIELDS:
${fieldsHTML}

For each field, determine if it should be:
1. "profile" - Basic info that should come from saved profile (name, email, phone, address, LinkedIn, etc.)
2. "ai" - Open-ended questions that need AI-generated personalized responses (why this company, tell about yourself, cover letter, etc.)
3. "skip" - Fields that should be left alone (file uploads, passwords, dropdowns with predefined options, etc.)

Respond ONLY with a JSON array like this:
[
  {"index": 0, "type": "profile", "reason": "email field"},
  {"index": 1, "type": "ai", "reason": "open-ended question about motivation"},
  ...
]`;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 2000,
          }),
        },
      );

      if (!response.ok) throw new Error("API failed");

      const result = await response.json();
      const content = result.choices[0].message.content.trim();

      // Parse JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);

        // Count AI fields found
        const aiFields = analysis.filter((f) => f.type === "ai");

        showNotification(
          aiFields.length,
          [],
          `AI found ${aiFields.length} fields that need AI responses`,
        );

        // Highlight AI fields with special styling
        analysis.forEach((field) => {
          if (field.type === "ai" && validInputs[field.index]) {
            const input = validInputs[field.index];
            // Only add button if not already present
            if (!input.dataset.autofillButton) {
              createAIQuestionButton(
                input,
                "additional",
                field.reason || "AI detected",
              );
            }
            input.style.outline = "2px solid #667eea";
            input.style.outlineOffset = "2px";
          }
        });

        updatePanelStats();
      }
    } catch (err) {
      console.error("AI analysis error:", err);
      // Don't show notification for auto-analysis
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  // Update panel statistics (exposed to window for SmartChatbox)
  function updatePanelStats() {
    if (!fillAllPanel) return;

    // Count by looking at actual buttons we created
    let basicCount = 0;
    let aiCount = 0;
    let dropdownCount = 0;

    // Count buttons that we've added to the page
    const allButtons = document.querySelectorAll(".jaf-field-btn");
    allButtons.forEach((btn) => {
      if (btn.classList.contains("jaf-ai-btn")) {
        aiCount++;
      } else if (btn.classList.contains("jaf-add-param-btn")) {
        // Don't count "Add Parameter" buttons as basic fields
      } else {
        basicCount++;
      }
    });

    // Count React Select dropdowns (Greenhouse uses these instead of standard <select>)
    const reactSelects = document.querySelectorAll(
      ".select-shell, .select__control",
    );
    reactSelects.forEach((selectContainer) => {
      // Check if it's a real dropdown (has options) and not already filled
      const input = selectContainer.querySelector('input[role="combobox"]');
      if (input && input.value.trim() === "") {
        // Only count if it doesn't have a value yet
        const placeholder = selectContainer.querySelector(
          ".select__placeholder",
        );
        if (placeholder && placeholder.textContent.includes("Select")) {
          dropdownCount++;
        }
      }
    });

    // Also count standard HTML selects (if any)
    const standardSelects = document.querySelectorAll("select");
    standardSelects.forEach((select) => {
      // Skip if already filled (not on default option)
      if (select.selectedIndex > 0) return;
      // Skip React Select (shouldn't happen but just in case)
      if (select.closest(".select-shell") || select.closest(".select__control"))
        return;
      // Skip if has only one or no options
      if (select.options.length <= 1) return;
      dropdownCount++;
    });

    const countEl = fillAllPanel.querySelector(".jaf-stat-count");
    const aiCountEl = fillAllPanel.querySelector(".jaf-ai-count");

    // Format: "5 basic, 2 dropdowns, 3 AI"
    const parts = [];
    if (basicCount > 0) parts.push(`${basicCount} basic`);
    if (dropdownCount > 0)
      parts.push(`${dropdownCount} dropdown${dropdownCount !== 1 ? "s" : ""}`);
    if (aiCount > 0) parts.push(`${aiCount} AI`);

    if (countEl) countEl.textContent = parts.join(", ") || "0 fields";
    if (aiCountEl) aiCountEl.textContent = "";

    // Update quick stats dashboard
    updateQuickStats();
  }

  // Update quick stats dashboard
  async function updateQuickStats() {
    if (!fillAllPanel) return;

    const data = await chrome.storage.sync.get([
      "fillCount",
      "pageCount",
      "learnedResponses",
      "customParams",
    ]);

    const totalFilled = fillAllPanel.querySelector(".jaf-total-filled");
    const totalApps = fillAllPanel.querySelector(".jaf-total-apps");
    const totalSaved = fillAllPanel.querySelector(".jaf-total-saved");

    if (totalFilled) totalFilled.textContent = data.fillCount || 0;
    if (totalApps) totalApps.textContent = data.pageCount || 0;

    // Count saved items
    let savedCount = 0;
    if (data.learnedResponses)
      savedCount += Object.keys(data.learnedResponses).length;
    if (data.customParams) savedCount += data.customParams.length;
    if (totalSaved) totalSaved.textContent = savedCount;
  }

  // Suggest which CV to use based on job (no UI element now, just returns suggestion)
  async function suggestCV() {
    if (!fillAllPanel) return null;

    const suggestionEl = fillAllPanel.querySelector(".jaf-cv-suggestion");
    if (!suggestionEl) return null; // UI element removed

    const data = await chrome.storage.sync.get(["cvFiles"]);

    if (!data.cvFiles || data.cvFiles.length === 0) {
      suggestionEl.textContent = "No CVs saved";
      suggestionEl.className = "jaf-cv-suggestion jaf-cv-none";
      return;
    }

    const jobTitle = extractJobTitle()?.toLowerCase() || "";
    const jobDesc = extractJobDescription()?.toLowerCase() || "";
    const combinedText = jobTitle + " " + jobDesc;

    const keywords = {
      sales: ["sales", "account", "business development", "revenue", "client"],
      tech: [
        "engineer",
        "developer",
        "software",
        "technical",
        "programming",
        "data",
      ],
      marketing: ["marketing", "brand", "content", "social media", "digital"],
      finance: ["finance", "accounting", "analyst", "investment", "banking"],
      design: ["design", "creative", "ux", "ui", "graphic"],
      management: ["manager", "director", "lead", "head", "vp", "chief"],
    };

    let bestMatch = null;
    let bestScore = 0;

    for (const cv of data.cvFiles) {
      const cvName = cv.name.toLowerCase();
      let score = 0;

      for (const [category, words] of Object.entries(keywords)) {
        const categoryMatch = words.some(
          (w) => cvName.includes(w) || combinedText.includes(w),
        );
        const cvCategoryMatch = words.some((w) => cvName.includes(w));
        if (categoryMatch && cvCategoryMatch) {
          score += 10;
        }
      }

      const nameParts = cvName.replace(/[^a-z\s]/g, "").split(/\s+/);
      for (const part of nameParts) {
        if (part.length > 3 && combinedText.includes(part)) {
          score += 5;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = cv;
      }
    }

    if (bestMatch && bestScore > 0) {
      suggestionEl.innerHTML = `<strong>${bestMatch.name}</strong>`;
      suggestionEl.className = "jaf-cv-suggestion jaf-cv-matched";
    } else if (data.cvFiles.length > 0) {
      suggestionEl.innerHTML = `<strong>${data.cvFiles[0].name}</strong> (default)`;
      suggestionEl.className = "jaf-cv-suggestion";
    }
  }

  // Fill Workday-specific forms using specialized detection
  async function fillWorkdayForm(data, includeAI) {
    if (!window.WorkdayDetector) return 0;

    let filledCount = 0;
    const sections = window.WorkdayDetector.detectWorkdaySections();

    // Fill Work History sections
    if (
      sections.workHistory.length > 0 &&
      data.workHistory &&
      data.workHistory.length > 0
    ) {
      for (
        let i = 0;
        i < Math.min(sections.workHistory.length, data.workHistory.length);
        i++
      ) {
        const section = sections.workHistory[i];
        const job = data.workHistory[i];

        const fields = window.WorkdayDetector.extractWorkHistoryFields(section);

        if (fields.jobTitle && job.title) {
          if (fillWorkdayField(fields.jobTitle, job.title)) filledCount++;
        }
        if (fields.company && job.company) {
          if (fillWorkdayField(fields.company, job.company)) filledCount++;
        }
        if (fields.location && job.location) {
          if (fillWorkdayField(fields.location, job.location)) filledCount++;
        }
        if (fields.description && job.description) {
          if (fillWorkdayField(fields.description, job.description))
            filledCount++;
        }

        // Handle date fields
        if (fields.startMonth && job.startDate) {
          const [month] = job.startDate.split("/");
          if (fillWorkdayField(fields.startMonth, month)) filledCount++;
        }
        if (fields.startYear && job.startDate) {
          const parts = job.startDate.split("/");
          const year = parts[1] || parts[0];
          if (fillWorkdayField(fields.startYear, year)) filledCount++;
        }
        if (fields.endMonth && job.endDate && job.endDate !== "Present") {
          const [month] = job.endDate.split("/");
          if (fillWorkdayField(fields.endMonth, month)) filledCount++;
        }
        if (fields.endYear && job.endDate && job.endDate !== "Present") {
          const parts = job.endDate.split("/");
          const year = parts[1] || parts[0];
          if (fillWorkdayField(fields.endYear, year)) filledCount++;
        }
      }
    }

    // Fill Education sections
    if (
      sections.education.length > 0 &&
      data.education &&
      data.education.length > 0
    ) {
      for (
        let i = 0;
        i < Math.min(sections.education.length, data.education.length);
        i++
      ) {
        const section = sections.education[i];
        const edu = data.education[i];

        const fields = window.WorkdayDetector.extractEducationFields(section);

        if (fields.school && edu.school) {
          if (fillWorkdayField(fields.school, edu.school)) filledCount++;
        }
        if (fields.degree && edu.degree) {
          if (fillWorkdayField(fields.degree, edu.degree)) filledCount++;
        }
        if (fields.fieldOfStudy && edu.field) {
          if (fillWorkdayField(fields.fieldOfStudy, edu.field)) filledCount++;
        }
        if (fields.gradYear && edu.year) {
          if (fillWorkdayField(fields.gradYear, edu.year)) filledCount++;
        }
      }
    }

    // Fill Skills
    if (sections.skills.length > 0 && data.skills && data.skills.length > 0) {
      for (const section of sections.skills) {
        const fields = window.WorkdayDetector.extractSkillsFields(section);
        if (fields.skillsInput) {
          const skillsText = data.skills.slice(0, 10).join(", ");
          if (fillWorkdayField(fields.skillsInput, skillsText)) filledCount++;
        }
      }
    }

    return filledCount;
  }

  // Helper function to fill Workday field
  function fillWorkdayField(element, value) {
    if (!element || !value) return false;

    if (element.tagName === "SELECT") {
      // Try to find matching option
      const options = Array.from(element.options);
      const match = options.find(
        (opt) =>
          opt.value.toLowerCase() === String(value).toLowerCase() ||
          opt.text.toLowerCase().includes(String(value).toLowerCase()) ||
          String(value).toLowerCase().includes(opt.text.toLowerCase()),
      );
      if (match) {
        element.value = match.value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        highlightField(element);
        return true;
      }
      return false;
    }

    // Standard input/textarea
    return fillField(element, value);
  }

  // Main autofill function
  async function autofillAll(includeAI = false) {
    const data = await chrome.storage.sync.get(null);
    profileData = data;
    const learnedResponses = data.learnedResponses || {};

    // Check for Workday forms and fill them using specialized module
    if (window.WorkdayDetector && window.WorkdayDetector.isWorkdayPage()) {
      console.log("[JAF] Workday page detected, using specialized detection");
      const workdayFilled = await fillWorkdayForm(data, includeAI);
      if (workdayFilled > 0) {
        showNotification(
          workdayFilled,
          ["Workday fields"],
          `Filled ${workdayFilled} Workday form fields`,
        );
      }
    }

    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
    );

    let filledCount = 0;
    const filledFields = [];
    const aiFieldsToFill = [];
    const aiDropdownsToFill = [];
    const learnedFieldsToFill = [];

    // First pass: collect all fields to fill
    for (const input of inputs) {
      // Skip already filled inputs (except dropdowns on placeholder/empty)
      if (input.tagName !== "SELECT" && input.value && input.value.trim())
        continue;

      // Handle SELECT dropdowns specially - ALWAYS use AI for dropdowns
      if (input.tagName === "SELECT") {
        // Skip React Select or custom dropdowns (they're handled separately)
        if (input.closest(".select-shell") || input.closest(".select__control"))
          return;

        // Check if already filled (value is not empty and not a placeholder)
        const currentValue = input.value?.trim();
        const hasRealValue =
          currentValue &&
          currentValue !== "" &&
          currentValue !== "null" &&
          currentValue !== "undefined";
        if (hasRealValue) return;

        // Skip dropdowns with only one option
        if (input.options.length <= 1) continue;

        // ALWAYS use AI for dropdowns - profile data matching causes mistakes
        // (e.g., matching "country" to visa sponsorship questions)
        if (includeAI && data.openaiKey) {
          aiDropdownsToFill.push(input);
        }
        continue;
      }

      // For non-dropdown fields, check basic profile fields
      const fieldType = detectFieldType(input);
      if (fieldType && data[fieldType]) {
        const success = fillField(input, data[fieldType]);
        if (success) {
          filledCount++;
          filledFields.push(fieldType);
          highlightField(input);
        }
        continue;
      }

      // Check for learned responses (before resorting to AI)
      const fieldLabel = getFieldLabel(input);
      const learnedValue = await getLearnedResponse(fieldLabel);
      if (learnedValue) {
        const success = fillField(input, learnedValue);
        if (success) {
          filledCount++;
          filledFields.push(`Learned: ${fieldLabel}`);
          highlightField(input);
        }
        continue;
      }

      // Collect AI fields if enabled
      if (includeAI && data.openaiKey) {
        // Skip hidden/validation inputs and React Select inputs
        if (
          input.getAttribute("aria-hidden") === "true" ||
          input.getAttribute("tabindex") === "-1" ||
          input.style.display === "none" ||
          input.classList.contains("requiredInput") ||
          input.className.includes("requiredInput") ||
          input.closest(".select-shell") ||
          input.closest(".select__control") ||
          input.classList.contains("select__input") ||
          (input.getAttribute("role") === "combobox" &&
            input.closest(".select"))
        ) {
          continue;
        }

        if (isCoverLetterField(input)) {
          aiFieldsToFill.push({
            input,
            type: "coverLetter",
            question: "Cover Letter",
          });
        } else if (input.tagName === "TEXTAREA") {
          // All textareas get AI fill
          const aiQuestion = detectAIQuestionType(input);
          if (aiQuestion) {
            aiFieldsToFill.push({
              input,
              type: aiQuestion.type,
              question: aiQuestion.questionText,
            });
          } else {
            // Fallback for textareas without specific pattern
            aiFieldsToFill.push({
              input,
              type: "additional",
              question: fieldLabel,
            });
          }
        } else if (
          input.tagName === "INPUT" &&
          input.type === "text" &&
          (input.maxLength > 100 || !input.maxLength || input.maxLength === -1)
        ) {
          const aiQuestion = detectAIQuestionType(input);
          if (aiQuestion) {
            aiFieldsToFill.push({
              input,
              type: aiQuestion.type,
              question: aiQuestion.questionText,
            });
          }
        }
      }
    }

    // Also collect React Select dropdowns for AI filling
    if (includeAI && data.openaiKey) {
      const reactSelects = document.querySelectorAll(".select__control");
      reactSelects.forEach((selectControl) => {
        // Check if already filled by looking for a selected value
        const singleValue = selectControl.querySelector(
          ".select__single-value",
        );
        if (singleValue && singleValue.textContent.trim()) return; // Already has selection

        // Check if it has a placeholder (not yet selected)
        const placeholder = selectControl.querySelector(".select__placeholder");
        if (!placeholder) return; // No placeholder means it's filled or not a valid select

        // Add to dropdowns list (will be detected as React Select in fill loop)
        aiDropdownsToFill.push(selectControl);
      });
    }

    // Fill AI dropdowns first (faster)
    if (aiDropdownsToFill.length > 0) {
      showNotification(
        filledCount,
        filledFields,
        `Filled ${filledCount} basic fields. AI selecting ${aiDropdownsToFill.length} dropdowns...`,
      );

      for (const dropdown of aiDropdownsToFill) {
        try {
          highlightField(
            dropdown.tagName === "SELECT"
              ? dropdown
              : dropdown.querySelector("input"),
            true,
            true,
          ); // Show spinner

          let success = false;
          // Check if it's a React Select or standard select
          if (dropdown.tagName === "SELECT") {
            success = await fillDropdownWithAI(dropdown);
          } else {
            // It's a React Select component
            success = await fillReactSelectWithAI(dropdown);
          }

          if (success) {
            filledCount++;
            filledFields.push("AI: dropdown");
            highlightField(
              dropdown.tagName === "SELECT"
                ? dropdown
                : dropdown.querySelector("input"),
              true,
            );
          } else {
            highlightField(
              dropdown.tagName === "SELECT"
                ? dropdown
                : dropdown.querySelector("input"),
              false,
            );
          }
        } catch (err) {
          console.error("AI dropdown fill error:", err);
          highlightField(
            dropdown.tagName === "SELECT"
              ? dropdown
              : dropdown.querySelector("input"),
            false,
          );
        }
      }
    }

    // Fill AI fields sequentially
    if (aiFieldsToFill.length > 0) {
      showNotification(
        filledCount,
        filledFields,
        `Filled ${filledCount} fields. Generating ${aiFieldsToFill.length} AI responses...`,
      );

      for (const { input, type, question } of aiFieldsToFill) {
        try {
          highlightField(input, true, true); // Show spinner
          const answer = await generateAIResponseText(type, question);
          if (answer) {
            fillField(input, answer);
            highlightField(input, true);
            filledCount++;
            filledFields.push(`AI: ${type}`);
          } else {
            highlightField(input, false);
          }
        } catch (err) {
          console.error("AI fill error:", err);
          highlightField(input, false);
        }
      }
    }

    const currentFillCount = data.fillCount || 0;
    const currentPageCount = data.pageCount || 0;
    chrome.storage.sync.set({
      fillCount: currentFillCount + filledCount,
      pageCount: currentPageCount + (filledCount > 0 ? 1 : 0),
    });

    showNotification(filledCount, filledFields);
    updatePanelStats();
  }

  // Generate AI response text only (no button handling)
  async function generateAIResponseText(questionType, questionText) {
    const data = await chrome.storage.sync.get([
      "openaiKey",
      "userContext",
      "cvContent",
    ]);
    if (!data.openaiKey) return null;

    const jobTitle = extractJobTitle();
    const companyName = extractCompanyName();
    const jobDescription = extractJobDescription();

    const prompt = buildPromptForQuestion(questionType, questionText, {
      jobTitle,
      companyName,
      jobDescription,
      profileData,
      userContext: data.userContext,
      cvContent: data.cvContent,
    });

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.openaiKey}`,
          },
          body: JSON.stringify({
            model: "o3-mini",
            messages: [{ role: "user", content: prompt }],
            max_completion_tokens: 2000,
          }),
        },
      );

      if (!response.ok) throw new Error("API failed");
      const result = await response.json();
      return result.choices[0].message.content.trim();
    } catch (err) {
      console.error("AI generation error:", err);
      return null;
    }
  }

  // Show toast notification with dark theme and close button
  function showNotification(count, fields, customMessage = null) {
    const existing = document.getElementById("jaf-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "jaf-toast";

    const closeBtn = `<button class="jaf-toast-close" onclick="this.parentElement.parentElement.remove()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>`;

    if (customMessage) {
      toast.innerHTML = `
        <div class="jaf-toast-content">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div class="jaf-toast-text">
            <strong>${customMessage}</strong>
          </div>
          ${closeBtn}
        </div>
      `;
    } else {
      toast.innerHTML = `
        <div class="jaf-toast-content">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00c853" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
          <div class="jaf-toast-text">
            <strong>${count} fields filled</strong>
            <span class="jaf-toast-fields">${fields.slice(0, 3).join(", ")}${fields.length > 3 ? "..." : ""}</span>
          </div>
          ${closeBtn}
        </div>
      `;
    }

    document.body.appendChild(toast);

    // Auto-hide after 5 seconds (increased from 3)
    const autoHide = setTimeout(() => {
      toast.classList.add("jaf-toast-hide");
      setTimeout(() => toast.remove(), 300);
    }, 5000);

    // Cancel auto-hide if manually closed
    toast.querySelector(".jaf-toast-close").addEventListener("click", () => {
      clearTimeout(autoHide);
    });
  }

  // Detect if current page is likely a job application
  function detectJobPage() {
    // Always return true for Greenhouse iframes
    if (isGreenhouseIframe) return true;

    const url = window.location.href.toLowerCase();
    const pageText = document.body?.innerText?.toLowerCase() || "";

    const urlPatterns = [
      "greenhouse.io",
      "lever.co",
      "workday.com",
      "careers",
      "jobs",
      "apply",
      "application",
      "taleo",
      "icims",
      "smartrecruiters",
      "jobvite",
      "myworkdayjobs",
      "ultipro",
      "brassring",
      "ashbyhq",
      "recruitee",
    ];

    const textPatterns = [
      "apply for this job",
      "submit application",
      "resume",
      "cover letter",
      "work experience",
      "upload your cv",
      "apply now",
      "job application",
    ];

    const urlMatch = urlPatterns.some((p) => url.includes(p));
    const textMatch = textPatterns.some((p) => pageText.includes(p));

    return urlMatch || textMatch;
  }

  // Detect forms and add UI elements
  function detectAndAddButtons() {
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
    );

    let hasDetectedFields = false;

    inputs.forEach((input) => {
      if (input.dataset.autofillButton) return;

      // Skip hidden/validation inputs (React Select hidden required inputs)
      if (
        input.getAttribute("aria-hidden") === "true" ||
        input.getAttribute("tabindex") === "-1" ||
        input.style.display === "none" ||
        input.classList.contains("requiredInput") ||
        input.className.includes("requiredInput")
      ) {
        return;
      }

      // Skip inputs that are part of React Select dropdowns (they look like text inputs but are actually dropdown search boxes)
      const isReactSelectInput =
        input.closest(".select-shell") ||
        input.closest(".select__control") ||
        input.classList.contains("select__input") ||
        (input.getAttribute("role") === "combobox" && input.closest(".select"));

      if (isReactSelectInput) {
        // Don't add buttons to React Select search inputs - they're dropdowns, not text fields
        return;
      }

      // Check for cover letter fields first
      if (isCoverLetterField(input)) {
        createCoverLetterButton(input);
        hasDetectedFields = true;
        return;
      }

      // Check for known profile fields
      const fieldType = detectFieldType(input);
      if (fieldType && profileData[fieldType]) {
        createFieldButton(input, fieldType);
        hasDetectedFields = true;
        return;
      }

      // Check for open-ended AI questions (textareas and large text inputs)
      if (
        input.tagName === "TEXTAREA" ||
        (input.tagName === "INPUT" &&
          input.type === "text" &&
          (input.maxLength > 100 || !input.maxLength || input.maxLength === -1))
      ) {
        const aiQuestion = detectAIQuestionType(input);
        if (aiQuestion) {
          createAIQuestionButton(
            input,
            aiQuestion.type,
            aiQuestion.questionText,
          );
          hasDetectedFields = true;
          return;
        }

        // For textareas without specific pattern match, still offer AI fill
        // if they appear to be for longer responses (not detected as a simple profile field)
        if (input.tagName === "TEXTAREA") {
          const fieldLabel = getFieldLabel(input);
          createAIQuestionButton(input, "additional", fieldLabel);
          hasDetectedFields = true;
          return;
        }
      }

      // For unrecognized INPUT fields only (not select/dropdowns), show "Add Parameter" button
      if (
        input.tagName === "INPUT" &&
        ["text", "email", "tel", "url", "number"].includes(input.type)
      ) {
        createAddParameterButton(input);
        hasDetectedFields = true;
        return;
      }

      // For SELECT dropdowns, add a small badge indicator
      if (input.tagName === "SELECT") {
        // Skip React Select
        if (input.closest(".select-shell") || input.closest(".select__control"))
          return;
        // Skip if only one or no options
        if (input.options.length <= 1) return;
        createDropdownBadge(input);
        hasDetectedFields = true;
        return;
      }
    });

    // Also detect React Select dropdowns (Greenhouse uses these)
    const reactSelects = document.querySelectorAll(".select__control");
    reactSelects.forEach((selectControl) => {
      // Check if we haven't already added a button
      if (selectControl.dataset.autofillButton) return;

      const input = selectControl.querySelector('input[role="combobox"]');
      if (!input) return;

      // Mark as detected
      selectControl.dataset.autofillButton = "true";

      // Create actual clickable button - exactly like Fill with AI button
      const btn = document.createElement("button");
      btn.className = "jaf-field-btn jaf-ai-btn jaf-dropdown-btn";
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
        </svg>
        Fill with AI
      `;
      btn.title = "Fill this dropdown with AI";

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        btn.classList.add("loading");
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
          </svg>
          Filling...
        `;

        try {
          const success = await fillReactSelectWithAI(selectControl);
          if (success) {
            btn.innerHTML = `
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
              Filled!
            `;
            setTimeout(() => {
              btn.innerHTML = originalText;
              btn.classList.remove("loading");
              btn.disabled = false;
            }, 2000);
          } else {
            btn.innerHTML = originalText;
            btn.classList.remove("loading");
            btn.disabled = false;
            showNotification(0, [], "Could not fill dropdown - try manually");
          }
        } catch (err) {
          console.error("React Select fill error:", err);
          btn.innerHTML = originalText;
          btn.classList.remove("loading");
          btn.disabled = false;
        }
      });

      const wrapper = document.createElement("span");
      wrapper.className = "jaf-btn-wrapper";
      wrapper.appendChild(btn);

      // Insert after the select container
      const container = selectControl.closest(".select-shell");
      if (container && container.parentElement) {
        container.parentElement.insertBefore(wrapper, container.nextSibling);
      }

      fieldButtons.push({ btn, wrapper, input: selectControl });
      hasDetectedFields = true;
    });

    if (hasDetectedFields || detectJobPage()) {
      createFillAllPanel();

      // Check if panel should be hidden by default
      chrome.storage.sync.get(["showPanel"]).then((data) => {
        if (data.showPanel === false && fillAllPanel) {
          fillAllPanel.style.display = "none";
        }
      });
    }
  }

  // Create dropdown AI button - exactly like Fill with AI button
  function createDropdownBadge(select) {
    if (select.dataset.autofillButton) return;

    const btn = document.createElement("button");
    btn.className = "jaf-field-btn jaf-ai-btn jaf-dropdown-btn";
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
      </svg>
      Fill with AI
    `;
    btn.title = "Fill this dropdown with AI";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.classList.add("loading");
      btn.disabled = true;
      const originalText = btn.innerHTML;
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
        </svg>
        Filling...
      `;

      try {
        const success = await fillDropdownWithAI(select);
        if (success) {
          btn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
            Filled!
          `;
          highlightField(select, true);
          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove("loading");
            btn.disabled = false;
          }, 2000);
        } else {
          btn.innerHTML = originalText;
          btn.classList.remove("loading");
          btn.disabled = false;
          showNotification(0, [], "Could not fill dropdown - try manually");
        }
      } catch (err) {
        console.error("Dropdown fill error:", err);
        btn.innerHTML = originalText;
        btn.classList.remove("loading");
        btn.disabled = false;
      }
    });

    const wrapper = document.createElement("span");
    wrapper.className = "jaf-btn-wrapper";
    wrapper.appendChild(btn);

    insertButtonWrapper(wrapper, select);

    select.dataset.autofillButton = "true";
    fieldButtons.push({ btn, wrapper, input: select });
  }

  // Create "Add Parameter" button for unknown fields
  // Only shown on job application pages
  async function createAddParameterButton(input) {
    if (input.dataset.autofillButton) return;

    // Don't create Add Parameter buttons on non-application pages
    // Wait for page detection if not yet available
    if (window.jafIsApplicationPage === false) {
      // Not an application page - skip add parameter button
      return;
    }

    const fieldLabel = getFieldLabel(input);

    // Check if we have a learned response for this field
    const learnedValue = await getLearnedResponse(fieldLabel);

    if (learnedValue) {
      // Create "Fill with learned" button instead
      createLearnedFillButton(input, fieldLabel, learnedValue);
      return;
    }

    const btn = document.createElement("button");
    btn.className = "jaf-field-btn jaf-add-param-btn";
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
      </svg>
      Add Parameter
    `;
    btn.title = `Save "${fieldLabel}" as a new parameter`;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const currentValue = input.value.trim();
      if (!currentValue) {
        showNotification(
          0,
          [],
          "Please enter a value first, then click to save",
        );
        return;
      }

      // Generate a safe key name from the field label
      const keyName = generateFieldKey(input, fieldLabel);

      // Save to storage
      await chrome.storage.sync.set({ [keyName]: currentValue });
      profileData[keyName] = currentValue;

      // Save to customParams list for tracking (used by popup)
      const data = await chrome.storage.sync.get(["customParams"]);
      const customParams = data.customParams || [];
      if (!customParams.find((f) => f.key === keyName)) {
        customParams.push({
          key: keyName,
          label: fieldLabel,
          section: "custom",
        });
        await chrome.storage.sync.set({ customParams });
      }

      // Learn from this response for future use
      await learnFromResponse(input, currentValue, fieldLabel);

      // Update button to show "Fill" instead
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        Saved!
      `;
      btn.classList.add("jaf-field-btn-success");

      showNotification(
        1,
        [fieldLabel],
        `Saved "${fieldLabel}" = "${currentValue.substring(0, 30)}${currentValue.length > 30 ? "..." : ""}"`,
      );

      setTimeout(() => {
        // Convert to regular fill button
        btn.className = "jaf-field-btn";
        btn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          Fill
        `;
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          fillField(input, profileData[keyName]);
          highlightField(input, true);
        };
      }, 1500);
    });

    const wrapper = document.createElement("span");
    wrapper.className = "jaf-btn-wrapper";
    wrapper.appendChild(btn);

    insertButtonWrapper(wrapper, input);

    input.dataset.autofillButton = "true";
    fieldButtons.push({ btn, wrapper, input });
  }

  // Get label text for a field
  function getFieldLabel(input) {
    const label = findLabel(input);
    if (label) {
      return label.textContent.trim().replace(/[*:]/g, "").trim();
    }

    // Try placeholder or name
    if (input.placeholder) return input.placeholder;
    if (input.name) return input.name.replace(/[-_]/g, " ");
    if (input.id) return input.id.replace(/[-_]/g, " ");

    return "Unknown Field";
  }

  // Generate a safe storage key from field info
  function generateFieldKey(input, label) {
    // Use a combination of attributes to create unique key
    const sanitized = label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 30);

    // Add prefix to identify custom fields
    return `custom_${sanitized}`;
  }

  // Initialize
  async function init() {
    // In iframes, skip the panel but still add field buttons
    if (isInIframe && !isGreenhouseIframe) {
      // For non-Greenhouse iframes, we might want to skip entirely
      // unless they contain form fields
      const hasFormFields = document.querySelector("input, textarea, select");
      if (!hasFormFields) return;
    }

    // Check if extension is disabled for this site
    // For iframes, check the parent domain
    const disabled = await checkIfDisabled();
    if (disabled) {
      isExtensionDisabled = true;
      return;
    }

    // Check for session-based hiding
    try {
      const sessionData = await chrome.storage.session.get("hiddenSession");
      if (sessionData.hiddenSession) {
        return; // Don't show anything this session
      }
    } catch (e) {
      // Session storage may not be available
    }

    if (isInitialized) return;
    isInitialized = true;

    const data = await chrome.storage.sync.get(null);
    profileData = data;

    if (data.showBadge === false) return;

    // Delay button detection until after SmartChatbox has analyzed the page type
    // This ensures Add Parameter buttons only appear on job application pages
    setTimeout(() => {
      if (detectJobPage() || data.autoDetect !== false || isGreenhouseIframe) {
        detectAndAddButtons();
      }
    }, 1200); // After SmartChatbox detection (500ms) + analysis

    const observer = new MutationObserver((mutations) => {
      if (isExtensionDisabled) return; // Don't process if disabled

      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (
              node.nodeType === 1 &&
              (node.tagName === "FORM" ||
                node.querySelector?.("input, textarea, select"))
            ) {
              shouldCheck = true;
              break;
            }
          }
        }
        if (shouldCheck) break;
      }
      if (shouldCheck) {
        setTimeout(detectAndAddButtons, 500);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Setup job submission detection
    setupSubmitDetection();
  }

  // Detect when user submits a job application
  function setupSubmitDetection() {
    // Common submit button selectors for job application sites
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button[data-automation-id="bottom-navigation-next-button"]', // Workday
      'button[data-automation-id="submit"]',
      "button.submit-btn",
      "button.submit",
      'button:contains("Submit Application")',
      'button:contains("Submit")',
      'button:contains("Apply")',
      "#submit_app",
      ".jobs-apply-button",
      '[data-control-name="apply"]',
    ];

    // Track if we've already registered this application
    let applicationRegistered = false;

    // Listen for clicks on submit buttons
    document.addEventListener(
      "click",
      async (e) => {
        if (applicationRegistered) return;

        const target = e.target;
        const button = target.closest("button, input[type='submit'], a");

        if (!button) return;

        // Check if this looks like a submit button
        const buttonText = (
          button.textContent ||
          button.value ||
          ""
        ).toLowerCase();
        const isSubmitButton =
          button.type === "submit" ||
          submitSelectors.some((sel) => {
            try {
              return button.matches(sel);
            } catch {
              return false;
            }
          }) ||
          /submit|apply\s*(now)?|send\s*application|confirm/i.test(buttonText);

        if (!isSubmitButton) return;

        // Only track on job application pages
        if (!detectJobPage()) return;

        // Get job info from the page
        const jobInfo = extractJobInfoFromPage();

        if (!jobInfo.company && !jobInfo.title) return;

        // Wait a moment to see if submission succeeds
        setTimeout(async () => {
          // Check if we navigated or got a success message
          const hasSuccessIndicators = checkForSubmissionSuccess();

          if (hasSuccessIndicators) {
            applicationRegistered = true;

            // Register with JobTracker if available
            if (window.JobTracker) {
              await window.JobTracker.onApplicationSubmitted(
                jobInfo.company,
                jobInfo.title,
                window.location.href,
              );
            }
          }
        }, 2000);
      },
      true,
    );

    // Also listen for form submissions
    document.addEventListener(
      "submit",
      async (e) => {
        if (applicationRegistered) return;
        if (!detectJobPage()) return;

        const jobInfo = extractJobInfoFromPage();
        if (!jobInfo.company && !jobInfo.title) return;

        setTimeout(async () => {
          const hasSuccessIndicators = checkForSubmissionSuccess();

          if (hasSuccessIndicators) {
            applicationRegistered = true;

            if (window.JobTracker) {
              await window.JobTracker.onApplicationSubmitted(
                jobInfo.company,
                jobInfo.title,
                window.location.href,
              );
            }
          }
        }, 2000);
      },
      true,
    );
  }

  // Extract job info from current page
  function extractJobInfoFromPage() {
    const info = { company: "", title: "" };
    const url = window.location.href.toLowerCase();

    // Workday
    if (url.includes("workday")) {
      const companyMatch = url.match(/([^/]+)\.wd\d+\.myworkdayjobs/);
      if (companyMatch) info.company = formatCompanyName(companyMatch[1]);

      const titleEl = document.querySelector(
        '[data-automation-id="jobPostingHeader"] h2, .css-1j389vi, h1',
      );
      if (titleEl) info.title = titleEl.textContent.trim();
    }

    // Greenhouse
    if (url.includes("greenhouse.io") || url.includes("boards.greenhouse")) {
      const companyMatch = url.match(/boards\.greenhouse\.io\/([^/]+)/);
      if (companyMatch) info.company = formatCompanyName(companyMatch[1]);

      const titleEl = document.querySelector("h1.app-title, .job-title, h1");
      if (titleEl) info.title = titleEl.textContent.trim();
    }

    // Lever
    if (url.includes("lever.co")) {
      const companyMatch = url.match(/jobs\.lever\.co\/([^/]+)/);
      if (companyMatch) info.company = formatCompanyName(companyMatch[1]);

      const titleEl = document.querySelector(".posting-headline h2, h1");
      if (titleEl) info.title = titleEl.textContent.trim();
    }

    // LinkedIn
    if (url.includes("linkedin.com")) {
      const companyEl = document.querySelector(
        ".jobs-unified-top-card__company-name, .topcard__org-name-link, .company-name",
      );
      if (companyEl) info.company = companyEl.textContent.trim();

      const titleEl = document.querySelector(
        ".jobs-unified-top-card__job-title, .topcard__title, h1",
      );
      if (titleEl) info.title = titleEl.textContent.trim();
    }

    // Generic fallback
    if (!info.title) {
      const h1 = document.querySelector("h1");
      if (h1) info.title = h1.textContent.trim().substring(0, 100);
    }

    if (!info.company) {
      // Try meta tags
      const orgMeta = document.querySelector(
        'meta[property="og:site_name"], meta[name="author"]',
      );
      if (orgMeta) info.company = orgMeta.content;

      // Try JSON-LD
      document
        .querySelectorAll('script[type="application/ld+json"]')
        .forEach((script) => {
          try {
            const data = JSON.parse(script.textContent);
            if (
              data["@type"] === "JobPosting" &&
              data.hiringOrganization?.name
            ) {
              info.company = data.hiringOrganization.name;
            }
          } catch {}
        });
    }

    return info;
  }

  // Format company name
  function formatCompanyName(name) {
    return name
      .replace(/-/g, " ")
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  // Check for submission success indicators
  function checkForSubmissionSuccess() {
    const successPatterns = [
      /thank\s*you/i,
      /application\s*(submitted|received|complete)/i,
      /successfully\s*(submitted|applied)/i,
      /we('ve)?\s*received\s*your/i,
      /confirmation/i,
    ];

    const pageText = document.body.innerText;
    const hasTextIndicator = successPatterns.some((p) => p.test(pageText));

    // Check for success elements
    const successElements = document.querySelectorAll(
      '.success, .confirmation, [class*="success"], [class*="confirm"], [class*="thank"]',
    );
    const hasSuccessElement = successElements.length > 0;

    return hasTextIndicator || hasSuccessElement;
  }

  // Listen for trigger from popup or parent window
  window.addEventListener("message", (event) => {
    if (event.data.type === "JOB_AUTOFILL_TRIGGER") {
      autofillAll(event.data.includeAI || false);

      // If we're in the top window and there are iframes, forward the message to them
      if (!isInIframe) {
        const iframes = document.querySelectorAll("iframe");
        iframes.forEach((iframe) => {
          try {
            iframe.contentWindow.postMessage(event.data, "*");
          } catch (e) {
            // Cross-origin iframe, can't access
            console.log(
              "[Job Autofill] Cannot access iframe (cross-origin):",
              e,
            );
          }
        });
      }
    }
  });

  // Inject styles
  const style = document.createElement("style");
  style.textContent = `
    /* Fill All Panel */
    #jaf-fill-all-panel {
      position: fixed;
      top: 20px;
      left: 20px;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      z-index: 2147483647;
      width: 240px;
      overflow: hidden;
      animation: jafSlideIn 0.3s ease;
    }
    #jaf-fill-all-panel.jaf-panel-hidden {
      display: none;
    }
    .jaf-panel-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 12px;
      background: #000;
      color: #fff;
      font-weight: 600;
      font-size: 12px;
    }
    .jaf-panel-logo {
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: default;
    }
    .jaf-panel-title {
      flex: 1;
    }
    .jaf-panel-minimize {
      background: none;
      border: none;
      color: #fff;
      cursor: pointer;
      opacity: 0.8;
      padding: 4px;
      margin-left: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
    }
    .jaf-panel-minimize:hover { opacity: 1; background: rgba(255,255,255,0.1); border-radius: 4px; }
    .jaf-panel-close {
      background: none;
      border: none;
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      opacity: 0.7;
      line-height: 1;
    }
    .jaf-panel-close:hover { opacity: 1; }
    
    /* Minimized state - just the logo */
    #jaf-fill-all-panel.jaf-panel-minimized {
      width: auto !important;
      min-width: auto !important;
    }
    #jaf-fill-all-panel.jaf-panel-minimized .jaf-panel-header {
      padding: 12px 14px !important;
      border-radius: 12px !important;
      height: 42px !important;
      box-sizing: border-box !important;
    }
    #jaf-fill-all-panel.jaf-panel-minimized .jaf-panel-logo {
      cursor: pointer;
    }
    #jaf-fill-all-panel.jaf-panel-minimized .jaf-panel-logo svg {
      width: 18px !important;
      height: 18px !important;
    }
    #jaf-fill-all-panel.jaf-panel-minimized .jaf-panel-title,
    #jaf-fill-all-panel.jaf-panel-minimized .jaf-panel-minimize,
    #jaf-fill-all-panel.jaf-panel-minimized .jaf-panel-close,
    #jaf-fill-all-panel.jaf-panel-minimized .jaf-panel-body,
    #jaf-fill-all-panel.jaf-panel-minimized .jaf-panel-tabs {
      display: none !important;
    }
    
    /* Panel Tabs */
    .jaf-panel-tabs {
      display: flex;
      border-bottom: 1px solid #eee;
      background: #fafafa;
    }
    .jaf-panel-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 12px;
      background: none;
      border: none;
      font-size: 12px;
      font-weight: 500;
      color: #666;
      cursor: pointer;
      transition: all 0.2s;
      border-bottom: 2px solid transparent;
    }
    .jaf-panel-tab:hover {
      background: #f0f0f0;
      color: #333;
    }
    .jaf-panel-tab.jaf-tab-active {
      color: #000;
      border-bottom-color: #000;
      background: #fff;
    }
    .jaf-tab-content {
      display: block;
    }
    .jaf-tab-content.jaf-tab-hidden {
      display: none !important;
    }
    
    /* Database Tab */
    .jaf-db-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .jaf-db-count {
      font-size: 11px;
      color: #666;
    }
    .jaf-db-refresh {
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: #666;
      border-radius: 4px;
    }
    .jaf-db-refresh:hover {
      background: #f0f0f0;
      color: #333;
    }
    .jaf-db-search {
      margin-bottom: 10px;
    }
    .jaf-db-search-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      font-size: 12px;
      box-sizing: border-box;
    }
    .jaf-db-search-input:focus {
      outline: none;
      border-color: #667eea;
    }
    .jaf-db-list {
      max-height: 220px;
      overflow-y: auto;
      margin-bottom: 10px;
    }
    .jaf-db-empty {
      text-align: center;
      padding: 20px;
      color: #999;
    }
    .jaf-db-empty p {
      margin: 8px 0 0;
      font-size: 11px;
    }
    .jaf-db-group {
      margin-bottom: 12px;
    }
    .jaf-db-group-title {
      font-size: 10px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px solid #eee;
    }
    .jaf-db-item {
      background: #f9f9f9;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 4px;
      cursor: default;
    }
    .jaf-db-item[data-type="document"] {
      cursor: pointer;
    }
    .jaf-db-item:hover {
      background: #f0f0f0;
    }
    .jaf-db-item-header {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .jaf-db-item-label {
      flex: 1;
      font-size: 11px;
      font-weight: 500;
      color: #333;
    }
    .jaf-db-usage {
      font-size: 9px;
      color: #10b981;
      background: #ecfdf5;
      padding: 2px 6px;
      border-radius: 10px;
    }
    .jaf-db-item-delete {
      background: none;
      border: none;
      color: #999;
      padding: 2px;
      cursor: pointer;
      border-radius: 3px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .jaf-db-item:hover .jaf-db-item-delete {
      opacity: 1;
    }
    .jaf-db-item-delete:hover {
      color: #dc2626;
      background: #fee2e2;
    }
    .jaf-db-item-value {
      font-size: 10px;
      color: #666;
      margin-top: 4px;
      word-break: break-word;
    }
    .jaf-db-item-full {
      display: none;
      font-size: 10px;
      color: #555;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #ddd;
      max-height: 100px;
      overflow-y: auto;
    }
    .jaf-db-item-expanded .jaf-db-item-full {
      display: block;
    }
    .jaf-db-actions {
      margin-top: 8px;
    }
    
    .jaf-panel-body {
      padding: 8px 10px;
    }
    
    /* Compact Tools Layout */
    .jaf-tools-compact {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .jaf-tools-row {
      display: flex;
      gap: 6px;
    }
    .jaf-tools-row .jaf-panel-btn {
      flex: 1;
    }
    .jaf-btn-sm {
      padding: 6px 8px !important;
      font-size: 10px !important;
    }
    
    .jaf-panel-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px;
      background: #000;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .jaf-panel-btn:hover {
      background: #333;
    }
    .jaf-panel-stats {
      text-align: center;
      font-size: 10px;
      color: #666;
      margin-top: 4px;
      margin-bottom: 4px;
    }
    .jaf-stat-count {
      font-weight: 600;
      color: #000;
    }
    .jaf-cv-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #eee;
    }
    .jaf-cv-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #666;
      margin-bottom: 6px;
    }
    .jaf-cv-suggestion {
      font-size: 12px;
      color: #333;
      padding: 8px;
      background: #f5f5f5;
      border-radius: 6px;
    }
    .jaf-cv-suggestion.jaf-cv-matched {
      background: #f0fdf4;
      border: 1px solid #86efac;
    }
    .jaf-cv-suggestion.jaf-cv-none {
      color: #999;
      font-style: italic;
    }

    /* Field Buttons - Positioned outside input fields */
    .jaf-btn-wrapper {
      display: inline-flex;
      vertical-align: middle;
      margin-left: 10px;
      position: relative;
      z-index: 100;
    }
    .jaf-field-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      background: #000;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .jaf-field-btn:hover {
      background: #333;
      transform: scale(1.05);
    }
    .jaf-field-btn-success {
      background: #00c853 !important;
    }
    .jaf-learned-btn {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
    .jaf-learned-btn:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
    }
    .jaf-ai-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .jaf-ai-btn:hover {
      background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
    }
    .jaf-add-param-btn {
      background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
    }
    .jaf-add-param-btn:hover {
      background: linear-gradient(135deg, #6d28d9 0%, #5b21b6 100%);
    }

    /* AI Toggle in panel */
    .jaf-ai-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #666;
      margin-top: 8px;
      padding: 6px 8px;
      background: #f5f5f5;
      border-radius: 6px;
      cursor: pointer;
    }
    .jaf-ai-toggle input[type="checkbox"] {
      width: 14px;
      height: 14px;
      cursor: pointer;
    }
    .jaf-ai-toggle.jaf-ai-enabled {
      background: linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%);
      color: #667eea;
    }
    .jaf-ai-toggle input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Small buttons */
    .jaf-btn-sm {
      padding: 6px 10px !important;
      font-size: 10px !important;
      margin-top: 4px !important;
    }
    .jaf-btn-sm svg {
      width: 10px !important;
      height: 10px !important;
    }

    /* Collapsible Tools Section */
    .jaf-tools-section {
      margin-top: 8px;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      overflow: hidden;
    }
    .jaf-tools-label {
      display: block;
      padding: 8px 10px;
      background: #f9f9f9;
      font-size: 11px;
      font-weight: 500;
      color: #666;
      cursor: pointer;
      list-style: none;
    }
    .jaf-tools-label::-webkit-details-marker {
      display: none;
    }
    .jaf-tools-section[open] .jaf-tools-label {
      border-bottom: 1px solid #e5e5e5;
    }
    .jaf-tools-content {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* Missing section as details/summary */
    .jaf-missing-section {
      margin-top: 8px;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      overflow: hidden;
    }
    .jaf-missing-section .jaf-missing-label {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      background: #fef3cd;
      font-size: 11px;
      color: #856404;
      cursor: pointer;
      list-style: none;
    }
    .jaf-missing-section .jaf-missing-label::-webkit-details-marker {
      display: none;
    }
    .jaf-missing-section[open] .jaf-missing-label {
      border-bottom: 1px solid #e5e5e5;
    }
    .jaf-missing-section .jaf-missing-list {
      padding: 8px;
      max-height: 100px;
      overflow-y: auto;
    }

    /* Toast - Dark Theme */
    #jaf-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #1a1a1a;
      color: #fff;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      z-index: 2147483647;
      animation: jafSlideIn 0.3s ease;
      max-width: 360px;
    }
    #jaf-toast.jaf-toast-hide {
      animation: jafSlideOut 0.3s ease forwards;
    }
    .jaf-toast-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .jaf-toast-content svg:first-child {
      flex-shrink: 0;
      margin-top: 2px;
    }
    .jaf-toast-text {
      flex: 1;
    }
    .jaf-toast-content strong {
      display: block;
      font-size: 14px;
      color: #fff;
    }
    .jaf-toast-fields {
      display: block;
      font-size: 11px;
      color: #aaa;
      margin-top: 4px;
    }
    .jaf-toast-close {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 4px;
      margin: -4px -8px -4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .jaf-toast-close:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }

    /* Animations */
    @keyframes jafSlideIn {
      from { transform: translateY(-20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes jafSlideOut {
      from { transform: translateY(0); opacity: 1; }
      to { transform: translateY(20px); opacity: 0; }
    }
    @keyframes jafSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .jaf-spin {
      animation: jafSpin 1s linear infinite;
    }
    
    /* Missing Parameters Section */
    .jaf-missing-section {
      margin-top: 10px;
      padding: 10px;
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 8px;
    }
    .jaf-missing-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #92400e;
      margin-bottom: 6px;
    }
    .jaf-missing-list {
      max-height: 80px;
      overflow-y: auto;
    }
    .jaf-missing-item {
      font-size: 10px;
      color: #666;
      padding: 2px 0;
    }
    
    /* AI Chatbox - NOW AT TOP with more height */
    .jaf-ai-chatbox {
      border-bottom: 1px solid #eee;
      max-height: 280px;
      display: flex;
      flex-direction: column;
      width: 100%;
      box-sizing: border-box;
    }
    .jaf-chatbox-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
    }
    .jaf-chatbox-close {
      background: none;
      border: none;
      color: #fff;
      font-size: 18px;
      cursor: pointer;
      opacity: 0.8;
    }
    .jaf-chatbox-close:hover { opacity: 1; }
    .jaf-chatbox-messages {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      min-height: 100px;
      max-height: 140px;
      background: #f9fafb;
    }
    .jaf-chat-msg {
      padding: 8px 12px;
      border-radius: 12px;
      margin-bottom: 8px;
      font-size: 12px;
      line-height: 1.4;
      max-width: 90%;
    }
    .jaf-chat-ai {
      background: #fff;
      border: 1px solid #e5e7eb;
      margin-right: auto;
    }
    .jaf-chat-user {
      background: #000;
      color: #fff;
      margin-left: auto;
    }
    .jaf-chat-typing .jaf-typing-dots,
    .jaf-chat-loading .jaf-typing-dots {
      display: inline-block;
      animation: jafTyping 1s infinite;
    }
    @keyframes jafTyping {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }
    .jaf-chatbox-input-area {
      padding: 8px;
      border-top: 1px solid #eee;
      background: #fff;
      box-sizing: border-box;
      width: 100%;
    }
    .jaf-chatbox-input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      font-size: 11px;
      font-family: inherit;
      resize: none;
      min-height: 32px;
      max-height: 60px;
      box-sizing: border-box;
    }
    .jaf-chatbox-input:focus {
      outline: none;
      border-color: #10b981;
    }
    .jaf-chatbox-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .jaf-chatbox-attach {
      padding: 4px 8px;
      background: #f5f5f5;
      border: 1px solid #e5e5e5;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
    }
    .jaf-chatbox-attach:hover {
      background: #eee;
    }
    .jaf-chatbox-send {
      flex: 1;
      padding: 8px;
      background: #10b981;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .jaf-chatbox-send:hover {
      background: #059669;
    }
    .jaf-chat-actions {
      display: flex;
      gap: 8px;
      margin: 8px 0;
    }
    .jaf-chat-action-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
    }
    .jaf-chat-action-btn:hover {
      opacity: 0.9;
    }
    
    /* Chatbox minimized state */
    .jaf-chatbox-minimized .jaf-chatbox-messages,
    .jaf-chatbox-minimized .jaf-chatbox-input-area {
      display: none !important;
    }
    .jaf-chatbox-minimized .jaf-chatbox-header {
      cursor: pointer;
      border-radius: 8px;
    }
    .jaf-chatbox-minimized .jaf-chatbox-header span::after {
      content: " (click to expand)";
      font-size: 9px;
      opacity: 0.7;
      font-weight: normal;
    }
  `;
  document.head.appendChild(style);

  // Expose functions to window for module integration
  window.updatePanelStats = updatePanelStats;
  window.detectMissingParameters = detectMissingParameters;

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
