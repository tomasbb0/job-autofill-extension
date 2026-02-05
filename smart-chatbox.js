// Smart AI Chatbox Module
// Intelligent conversational interface for job application autofill
// Uses GPT-4o-mini for efficient token usage

(function () {
  "use strict";

  window.SmartChatbox = {
    // State
    chatHistory: [],
    pendingFields: [],
    gatheredInfo: {},
    isOpen: false,
    panel: null,

    // Model selection - using efficient model for chatbox
    CHAT_MODEL: "gpt-4o-mini",
    ANALYSIS_MODEL: "gpt-4o-mini",

    // Initialize chatbox
    init(panelElement) {
      this.panel = panelElement;
      this.setupEventListeners();
    },

    // Setup event listeners
    setupEventListeners() {
      if (!this.panel) return;

      // Close button
      this.panel
        .querySelector(".jaf-chatbox-close")
        ?.addEventListener("click", () => {
          this.close();
        });

      // Send button
      this.panel
        .querySelector(".jaf-chatbox-send")
        ?.addEventListener("click", () => {
          this.sendMessage();
        });

      // Enter key
      this.panel
        .querySelector(".jaf-chatbox-input")
        ?.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });

      // File attach
      this.panel
        .querySelector(".jaf-chatbox-attach")
        ?.addEventListener("click", () => {
          this.panel.querySelector(".jaf-chatbox-file").click();
        });

      this.panel
        .querySelector(".jaf-chatbox-file")
        ?.addEventListener("change", async (e) => {
          const file = e.target.files[0];
          if (file) {
            await this.processDocument(file);
            e.target.value = "";
          }
        });
    },

    // Perform comprehensive page analysis
    async analyzePageFields() {
      const analysis = {
        totalFields: 0,
        categories: {
          workHistory: [],
          education: [],
          skills: [],
          basicInfo: [],
          questions: [],
          dropdowns: [],
        },
        missing: [],
        canFill: [],
        needsInput: [],
      };

      // Get profile data
      const profileData = await chrome.storage.sync.get(null);
      const learnedResponses = profileData.learnedResponses || {};

      // Analyze all form fields
      const allInputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select',
      );

      allInputs.forEach((input) => {
        // Skip hidden/validation inputs
        if (this.shouldSkipInput(input)) return;

        const label = this.getFieldLabel(input);
        const value = input.value?.trim() || "";
        const hasValue = !!value;

        const fieldInfo = {
          element: input,
          label: label,
          type: input.tagName.toLowerCase(),
          inputType: input.type || "text",
          hasValue: hasValue,
          currentValue: value,
          category: this.categorizeField(label, input),
        };

        analysis.totalFields++;

        // Check if we can auto-fill
        const profileValue = this.findProfileValue(label, profileData);
        const learnedValue = this.findLearnedValue(label, learnedResponses);

        if (hasValue) {
          // Already filled
        } else if (profileValue) {
          fieldInfo.suggestedValue = profileValue;
          fieldInfo.source = "profile";
          analysis.canFill.push(fieldInfo);
        } else if (learnedValue) {
          fieldInfo.suggestedValue = learnedValue;
          fieldInfo.source = "learned";
          analysis.canFill.push(fieldInfo);
        } else {
          analysis.needsInput.push(fieldInfo);
          analysis.missing.push({
            label: label,
            type: fieldInfo.category,
            inputType: fieldInfo.inputType,
          });
        }

        // Categorize
        if (fieldInfo.category === "workHistory") {
          analysis.categories.workHistory.push(fieldInfo);
        } else if (fieldInfo.category === "education") {
          analysis.categories.education.push(fieldInfo);
        } else if (fieldInfo.category === "skills") {
          analysis.categories.skills.push(fieldInfo);
        } else if (fieldInfo.category === "question") {
          analysis.categories.questions.push(fieldInfo);
        } else if (input.tagName === "SELECT") {
          analysis.categories.dropdowns.push(fieldInfo);
        } else {
          analysis.categories.basicInfo.push(fieldInfo);
        }
      });

      // Also check React Select dropdowns
      const reactSelects = document.querySelectorAll(".select__control");
      reactSelects.forEach((select) => {
        const singleValue = select.querySelector(".select__single-value");
        if (!singleValue || !singleValue.textContent.trim()) {
          const label = this.getReactSelectLabel(select);
          analysis.categories.dropdowns.push({
            element: select,
            label: label,
            type: "react-select",
            hasValue: false,
            category: "dropdown",
          });
          analysis.needsInput.push({
            element: select,
            label: label,
            category: "dropdown",
          });
          analysis.missing.push({
            label: label,
            type: "dropdown",
          });
        }
      });

      return analysis;
    },

    // Should skip input
    shouldSkipInput(input) {
      if (input.getAttribute("aria-hidden") === "true") return true;
      if (input.getAttribute("tabindex") === "-1") return true;
      if (input.style.display === "none") return true;
      if (input.classList.contains("requiredInput")) return true;
      if (input.closest(".select-shell") || input.closest(".select__control"))
        return true;
      if (input.classList.contains("select__input")) return true;
      return false;
    },

    // Get field label
    getFieldLabel(input) {
      // Try aria-label
      if (input.getAttribute("aria-label")) {
        return input.getAttribute("aria-label").replace(/[*]/g, "").trim();
      }

      // Try label element
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return label.textContent.replace(/[*]/g, "").trim();
      }

      // Try parent label
      const parentLabel = input.closest("label");
      if (parentLabel)
        return parentLabel.textContent.replace(/[*]/g, "").trim();

      // Try nearby label
      const container = input.closest("div, fieldset, section");
      if (container) {
        const label = container.querySelector("label, .label");
        if (label) return label.textContent.replace(/[*]/g, "").trim();
      }

      // Fallback
      return input.placeholder || input.name || "Unknown Field";
    },

    // Get React Select label
    getReactSelectLabel(select) {
      const container = select.closest(".field, .form-group, .select-shell");
      if (container) {
        const label = container.querySelector("label, .label");
        if (label) return label.textContent.replace(/[*]/g, "").trim();
      }

      const input = select.querySelector("input");
      if (input) {
        const labelId = input.getAttribute("aria-labelledby");
        if (labelId) {
          const labelEl = document.getElementById(labelId);
          if (labelEl) return labelEl.textContent.replace(/[*]/g, "").trim();
        }
      }

      return "Dropdown";
    },

    // Categorize field based on label
    categorizeField(label, input) {
      const labelLower = label.toLowerCase();

      if (
        /job\s*title|company|employer|role\s*description|work\s*history|experience/i.test(
          labelLower,
        )
      ) {
        return "workHistory";
      }
      if (
        /school|university|degree|education|graduation|field\s*of\s*study/i.test(
          labelLower,
        )
      ) {
        return "education";
      }
      if (/skills?|strengths?|abilities|competenc/i.test(labelLower)) {
        return "skills";
      }
      if (
        /why|tell\s*us|describe|cover\s*letter|motivation|challenge|achievement|goals?/i.test(
          labelLower,
        )
      ) {
        return "question";
      }
      if (input.tagName === "TEXTAREA") {
        return "question";
      }

      return "basic";
    },

    // Find profile value for a label
    findProfileValue(label, profileData) {
      const labelLower = label.toLowerCase();

      const mappings = {
        "first name": profileData.firstName,
        "last name": profileData.lastName,
        "full name": profileData.fullName,
        email: profileData.email,
        phone: profileData.phone,
        city: profileData.city,
        country: profileData.country,
        linkedin: profileData.linkedin,
        website: profileData.website,
        github: profileData.github,
        "current company": profileData.currentCompany,
        "current title": profileData.currentTitle,
        "years of experience": profileData.yearsExperience,
        university: profileData.university,
        degree: profileData.degree,
        "graduation year": profileData.gradYear,
      };

      for (const [key, value] of Object.entries(mappings)) {
        if (labelLower.includes(key) && value) {
          return value;
        }
      }

      return null;
    },

    // Find learned value
    findLearnedValue(label, learnedResponses) {
      const labelKey = label
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 50);

      if (learnedResponses[labelKey]) {
        return learnedResponses[labelKey].value;
      }

      // Partial match
      for (const [key, data] of Object.entries(learnedResponses)) {
        if (key.includes(labelKey) || labelKey.includes(key)) {
          return data.value;
        }
      }

      return null;
    },

    // Detect if current page is a job application
    isJobApplicationPage() {
      const url = window.location.href.toLowerCase();
      const pageText = document.body?.innerText?.toLowerCase() || '';
      const pageTitle = document.title?.toLowerCase() || '';

      // URL patterns that indicate job applications
      const applicationUrlPatterns = [
        /workday/i, /greenhouse/i, /lever\.co/i, /ashbymq/i, /breezy\.hr/i,
        /smartrecruiters/i, /jobvite/i, /taleo/i, /icims/i, /ultipro/i,
        /adp\./i, /myworkday/i, /careers\./i, /jobs\./i, /apply/i,
        /application/i, /hiring/i, /recruit/i, /talent/i, /wd\d+\./i
      ];

      // Check URL
      const isApplicationUrl = applicationUrlPatterns.some(pattern => pattern.test(url));
      
      // Page content indicators
      const applicationKeywords = [
        'apply for', 'job application', 'submit application', 'your application',
        'upload resume', 'upload cv', 'cover letter', 'work experience',
        'employment history', 'education history', 'years of experience',
        'attach resume', 'apply now', 'submit your application', 'job posting',
        'position', 'we are hiring', 'join our team', 'career opportunity',
        'how did you hear about', 'willing to relocate', 'work authorization',
        'equal opportunity', 'diversity', 'your resume', 'your cv'
      ];

      const keywordMatches = applicationKeywords.filter(kw => pageText.includes(kw)).length;

      // Form indicators - job applications usually have many text inputs
      const textInputs = document.querySelectorAll('input[type="text"], textarea');
      const fileInputs = document.querySelectorAll('input[type="file"]');
      const selectDropdowns = document.querySelectorAll('select');
      
      // Calculate confidence score
      let score = 0;
      if (isApplicationUrl) score += 40;
      if (keywordMatches >= 3) score += 30;
      if (keywordMatches >= 6) score += 20;
      if (textInputs.length >= 5) score += 15;
      if (fileInputs.length >= 1) score += 15;  // Resume upload field
      if (selectDropdowns.length >= 2) score += 10;
      if (pageTitle.includes('apply') || pageTitle.includes('application') || pageTitle.includes('career')) score += 15;

      console.log(`[SmartChatbox] Application detection score: ${score}/100 (URL: ${isApplicationUrl}, Keywords: ${keywordMatches})`);

      // Return detection result
      return {
        isApplication: score >= 40,
        confidence: score,
        hasFormFields: textInputs.length >= 3
      };
    },

    // Open chatbox with page analysis
    async open() {
      if (!this.panel) return;

      const chatbox = this.panel.querySelector(".jaf-ai-chatbox");
      const messagesEl = this.panel.querySelector(".jaf-chatbox-messages");

      if (!chatbox) return;

      // Detect if this is a job application page
      const pageDetection = this.isJobApplicationPage();
      this.isApplicationPage = pageDetection.isApplication;

      // Store detection result for other functions
      window.jafIsApplicationPage = pageDetection.isApplication;

      if (!pageDetection.isApplication) {
        // Non-application page: collapse chatbox, hide add parameter buttons
        this.isOpen = false;
        chatbox.classList.add("jaf-chatbox-minimized");
        messagesEl.innerHTML = '';
        this.addMessage("ai", `👋 Hi! This doesn't look like a job application.\n\nYour saved data is available if you need it. Click here to expand.`);
        
        // Hide add parameter buttons on non-application pages
        this.hideAddParameterButtons();
        return;
      }

      // It IS an application page - expand and analyze
      this.isOpen = true;
      chatbox.classList.remove("jaf-chatbox-minimized");
      chatbox.style.display = "block";
      messagesEl.innerHTML = "";
      this.chatHistory = [];

      // Show add parameter buttons
      this.showAddParameterButtons();

      // Show analyzing message
      this.addMessage("ai", "🔍 Analyzing the application form...");

      // Analyze the page
      const analysis = await this.analyzePageFields();
      this.pendingFields = analysis.needsInput;

      // Build natural language summary
      const summary = this.buildAnalysisSummary(analysis);

      // Clear and show summary
      messagesEl.innerHTML = "";
      this.addMessage("ai", summary);
    },

    // Hide "Add Parameter" buttons on non-application pages
    hideAddParameterButtons() {
      if (!this.panel) return;
      const addButtons = this.panel.querySelectorAll('.jaf-add-param-btn');
      addButtons.forEach(btn => {
        btn.style.display = 'none';
      });
      // Also hide missing fields section
      const missingSection = this.panel.querySelector('#jaf-missing-section');
      if (missingSection) missingSection.style.display = 'none';
    },

    // Show "Add Parameter" buttons on application pages
    showAddParameterButtons() {
      if (!this.panel) return;
      const addButtons = this.panel.querySelectorAll('.jaf-add-param-btn');
      addButtons.forEach(btn => {
        btn.style.display = '';
      });
      // Show missing fields section
      const missingSection = this.panel.querySelector('#jaf-missing-section');
      if (missingSection) missingSection.style.display = '';
    },

    // Build analysis summary - natural language as described in READTHIS
    buildAnalysisSummary(analysis) {
      const canFillCount = analysis.canFill.length;
      const needsCount = analysis.needsInput.length;
      const totalEmpty = canFillCount + needsCount;

      if (totalEmpty === 0) {
        return `Hey Tomás! 👋\n\nGreat news - this application looks complete! All fields are already filled. You can review and submit when ready.`;
      }

      let summary = `Hi Tomás! 👋\n\n`;

      if (canFillCount > 0 && needsCount === 0) {
        summary += `I found **${canFillCount} empty fields** that I can fill automatically from your saved profile. Just click "Fill All" to complete this application!`;
        return summary;
      }

      if (needsCount > 0) {
        summary += `There's a list of things that I need from you. Would you like to go through them one by one?\n\n`;

        // Store the missing fields for sequential asking
        this.missingFieldsList = analysis.needsInput || analysis.missing || [];
        this.currentFieldIndex = 0;

        if (canFillCount > 0) {
          summary += `I can already fill **${canFillCount} fields** automatically.\n\n`;
        }

        summary += `Here's what I need:\n`;
        const fieldsToShow = (
          analysis.needsInput ||
          analysis.missing ||
          []
        ).slice(0, 6);
        fieldsToShow.forEach((field, i) => {
          summary += `${i + 1}. ${field.label}\n`;
        });

        const remaining =
          (analysis.needsInput || analysis.missing || []).length - 6;
        if (remaining > 0) {
          summary += `...and ${remaining} more\n`;
        }

        summary += `\nJust type "yes" or "let's go" to start, or paste your CV and I'll extract what I need!`;
      }

      return summary;
    },

    // Ask for the next missing field
    askNextField() {
      if (
        !this.missingFieldsList ||
        this.currentFieldIndex >= this.missingFieldsList.length
      ) {
        this.addMessage(
          "ai",
          `That's everything I needed! 🎉\n\nI've saved all your responses. Click "Fill All" to complete the application, or I can help with anything else.`,
        );
        return;
      }

      const field = this.missingFieldsList[this.currentFieldIndex];
      const friendlyPrompts = {
        workHistory: [
          `Could you tell me about your experience with "${field.label}"?`,
          `What would you like me to put for "${field.label}"?`,
        ],
        education: [
          `What's your ${field.label.toLowerCase()}?`,
          `Could you share your ${field.label.toLowerCase()}?`,
        ],
        skills: [
          `What skills would you like to highlight for "${field.label}"?`,
          `Tell me about your ${field.label.toLowerCase()}.`,
        ],
        question: [
          `Here's a question for you: "${field.label}"\n\nWhat would you like to say?`,
          `The application asks: "${field.label}"\n\nHow should I answer this?`,
        ],
        basic: [
          `What's your ${field.label.toLowerCase()}?`,
          `Could you provide your ${field.label.toLowerCase()}?`,
        ],
      };

      const prompts = friendlyPrompts[field.type] || friendlyPrompts.basic;
      const prompt = prompts[Math.floor(Math.random() * prompts.length)];

      this.addMessage("ai", prompt);
      this.currentFieldIndex++;
    },

    // Save field response to storage permanently (as described in READTHIS)
    async saveFieldResponse(field, value) {
      try {
        // Generate a storage key based on field label
        const key = this.generateKey(field.label);

        // Save to sync storage (persists forever)
        await chrome.storage.sync.set({ [key]: value });

        // Also save to learnedResponses with more context
        const learnedResponses =
          (await chrome.storage.sync.get("learnedResponses"))
            .learnedResponses || {};

        learnedResponses[field.label.toLowerCase().replace(/\s+/g, "_")] = {
          value: value,
          fieldLabel: field.label,
          fieldType: field.type,
          learnedAt: Date.now(),
          usageCount: 1,
          source: "chatbox",
        };

        await chrome.storage.sync.set({ learnedResponses });

        console.log(
          `[SmartChatbox] Saved "${field.label}" permanently:`,
          value.substring(0, 50) + "...",
        );
        return true;
      } catch (err) {
        console.error("[SmartChatbox] Failed to save field:", err);
        return false;
      }
    },

    // Close chatbox
    close() {
      if (!this.panel) return;
      this.isOpen = false;
      const chatbox = this.panel.querySelector(".jaf-ai-chatbox");
      if (chatbox) chatbox.style.display = "none";
    },

    // Add message to chat
    addMessage(role, content, actions = null) {
      const messagesEl = this.panel?.querySelector(".jaf-chatbox-messages");
      if (!messagesEl) return;

      const msg = document.createElement("div");
      msg.className = `jaf-chat-msg jaf-chat-${role}`;

      // Parse markdown-like formatting
      let html = content
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");

      msg.innerHTML = html;
      messagesEl.appendChild(msg);

      if (actions) {
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "jaf-chat-actions";
        actionsDiv.innerHTML = actions;
        messagesEl.appendChild(actionsDiv);
      }

      messagesEl.scrollTop = messagesEl.scrollHeight;
      this.chatHistory.push({ role, content });
    },

    // Show typing indicator
    showTyping() {
      const messagesEl = this.panel?.querySelector(".jaf-chatbox-messages");
      if (!messagesEl) return null;

      const typing = document.createElement("div");
      typing.className = "jaf-chat-msg jaf-chat-ai jaf-chat-typing";
      typing.innerHTML = '<span class="jaf-typing-dots">●●●</span>';
      messagesEl.appendChild(typing);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      return typing;
    },

    // Send message
    async sendMessage() {
      const inputEl = this.panel?.querySelector(".jaf-chatbox-input");
      if (!inputEl) return;

      const message = inputEl.value.trim();
      if (!message) return;

      inputEl.value = "";
      this.addMessage("user", message);

      // Check if user wants to go through fields one by one
      const startPhrases =
        /^(yes|yeah|sure|ok|okay|let'?s\s*go|start|go\s*ahead|proceed|yep|yup)$/i;
      if (
        startPhrases.test(message) &&
        this.missingFieldsList &&
        this.missingFieldsList.length > 0
      ) {
        this.addMessage("ai", "Great! Let's go through them one by one. 📝");
        setTimeout(() => this.askNextField(), 500);
        return;
      }

      // Check if user is responding to a field question (we're in field-by-field mode)
      if (
        this.currentFieldIndex > 0 &&
        this.missingFieldsList &&
        this.currentFieldIndex <= this.missingFieldsList.length
      ) {
        const previousField =
          this.missingFieldsList[this.currentFieldIndex - 1];
        if (previousField) {
          // Save this response to storage permanently
          await this.saveFieldResponse(previousField, message);

          // Fill the field if it exists on page
          if (previousField.element) {
            this.fillField(previousField.element, message);
          }

          this.addMessage(
            "ai",
            `Got it! I've saved that for "${previousField.label}". ✓`,
          );

          // Ask next field after short delay
          setTimeout(() => this.askNextField(), 600);
          return;
        }
      }

      const typingEl = this.showTyping();

      try {
        const data = await chrome.storage.sync.get(["openaiKey"]);
        if (!data.openaiKey) {
          typingEl?.remove();
          this.addMessage(
            "ai",
            `⚠️ <strong>OpenAI API Key Required</strong><br><br>
            To use AI features, you need an API key. It's easy to get:<br><br>
            <ol style="margin: 8px 0; padding-left: 20px; line-height: 1.6;">
              <li><a href="https://platform.openai.com/signup" target="_blank" style="color: #8b5cf6;">Create an OpenAI account</a></li>
              <li><a href="https://platform.openai.com/api-keys" target="_blank" style="color: #8b5cf6;"><strong>Open API Keys page</strong></a></li>
              <li>Click "+ Create new secret key"</li>
              <li>Copy the key and paste it in the extension popup → AI tab</li>
            </ol>
            <a href="https://platform.openai.com/api-keys" target="_blank" style="display: inline-block; margin-top: 8px; padding: 8px 16px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; border-radius: 6px; text-decoration: none; font-size: 12px;">🔑 Get API Key Now →</a>`,
          );
          return;
        }

        // Build context-aware prompt
        const prompt = this.buildExtractionPrompt(message);

        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${data.openaiKey}`,
            },
            body: JSON.stringify({
              model: this.CHAT_MODEL,
              messages: [
                {
                  role: "system",
                  content: `You are an AI assistant helping fill job application forms. Extract information from user messages and return structured JSON. Be conversational and helpful. Always respond with valid JSON containing "extracted", "stored", "missing", and "followUp" keys.`,
                },
                ...this.chatHistory.slice(-6).map((m) => ({
                  role: m.role === "ai" ? "assistant" : "user",
                  content: m.content,
                })),
                { role: "user", content: prompt },
              ],
              max_tokens: 1500,
              temperature: 0.7,
            }),
          },
        );

        typingEl?.remove();

        if (!response.ok) {
          this.addMessage("ai", "⚠️ Error connecting to AI. Please try again.");
          return;
        }

        const result = await response.json();
        const aiContent = result.choices[0].message.content;

        await this.processAIResponse(aiContent);
      } catch (err) {
        typingEl?.remove();
        console.error("Chat error:", err);
        this.addMessage("ai", "⚠️ Something went wrong. Please try again.");
      }
    },

    // Build extraction prompt
    buildExtractionPrompt(userMessage) {
      const fieldsList = this.pendingFields.map((f) => f.label).join(", ");

      return `The user is filling a job application. These fields need values: ${fieldsList}

User message: "${userMessage}"

Extract any information that can fill these fields. 
Also identify any new information that should be stored for future use.

Respond with JSON:
{
  "extracted": [
    {"field": "Field Name", "value": "value", "confidence": "high/medium/low"}
  ],
  "stored": [
    {"key": "descriptive_key", "value": "value", "label": "Human Label"}
  ],
  "missing": ["fields still needed"],
  "followUp": "Natural conversational response to user"
}`;
    },

    // Process AI response
    async processAIResponse(aiContent) {
      try {
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          this.addMessage("ai", aiContent);
          return;
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Store extracted values
        if (parsed.extracted && parsed.extracted.length > 0) {
          const profileData = await chrome.storage.sync.get(null);
          let filledCount = 0;

          for (const item of parsed.extracted) {
            // Find matching field
            const field = this.pendingFields.find(
              (f) =>
                f.label.toLowerCase().includes(item.field.toLowerCase()) ||
                item.field.toLowerCase().includes(f.label.toLowerCase()),
            );

            if (field && field.element && item.value) {
              // Fill the field
              this.fillField(field.element, item.value);
              filledCount++;

              // Remove from pending
              this.pendingFields = this.pendingFields.filter(
                (f) => f !== field,
              );

              // Store for future use
              const key = this.generateKey(field.label);
              await chrome.storage.sync.set({ [key]: item.value });
            }
          }

          if (filledCount > 0) {
            this.addMessage(
              "ai",
              `✅ Filled **${filledCount} fields** and saved them for future applications!`,
            );
          }
        }

        // Store new info for future
        if (parsed.stored && parsed.stored.length > 0) {
          const learnedResponses =
            (await chrome.storage.sync.get("learnedResponses"))
              .learnedResponses || {};

          for (const item of parsed.stored) {
            learnedResponses[item.key] = {
              value: item.value,
              fieldLabel: item.label,
              learnedAt: Date.now(),
              usageCount: 1,
            };
          }

          await chrome.storage.sync.set({ learnedResponses });
        }

        // Show follow-up message
        let followUp = parsed.followUp || "Got it! What else can you tell me?";

        if (parsed.missing && parsed.missing.length > 0) {
          followUp += `\n\n📝 **Still need:** ${parsed.missing.slice(0, 5).join(", ")}`;
        }

        if (this.pendingFields.length === 0) {
          followUp += `\n\n🎉 **All fields ready!** Click the button below to fill everything.`;
          this.addMessage(
            "ai",
            followUp,
            `
            <button class="jaf-chat-action-btn jaf-chat-fill-all" style="background: #22c55e;">
              ✓ Fill All Fields Now
            </button>
          `,
          );

          // Add click handler
          setTimeout(() => {
            this.panel
              ?.querySelector(".jaf-chat-fill-all")
              ?.addEventListener("click", async () => {
                await this.fillAllFieldsFromChat();
              });
          }, 100);
        } else {
          this.addMessage("ai", followUp);
        }
      } catch (err) {
        console.error("Parse error:", err);
        this.addMessage("ai", aiContent);
      }
    },

    // Fill field helper
    fillField(element, value) {
      if (!element || !value) return false;

      const isSelect = element.tagName === "SELECT";
      const isReactSelect =
        element.classList.contains("select__control") ||
        element.closest(".select__control");

      if (isReactSelect) {
        // Handle React Select separately
        return false;
      }

      if (isSelect) {
        const options = Array.from(element.options);
        const match = options.find(
          (opt) =>
            opt.value.toLowerCase() === value.toLowerCase() ||
            opt.text.toLowerCase() === value.toLowerCase(),
        );
        if (match) {
          element.value = match.value;
          element.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        return false;
      }

      // Regular input/textarea
      const proto =
        element.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");

      if (desc && desc.set) {
        desc.set.call(element, value);
      } else {
        element.value = value;
      }

      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true }));

      // Highlight
      element.style.border = "2px solid #22c55e";
      element.style.boxShadow = "0 0 8px rgba(34,197,94,0.4)";
      setTimeout(() => {
        element.style.border = "";
        element.style.boxShadow = "";
      }, 2000);

      return true;
    },

    // Generate storage key
    generateKey(label) {
      return (
        "custom_" +
        label
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, "_")
          .substring(0, 30)
      );
    },

    // Process uploaded document
    async processDocument(file) {
      this.addMessage("user", `📎 Uploaded: ${file.name}`);
      this.addMessage("ai", "📄 Processing document...");

      try {
        let text = "";

        if (file.type === "text/plain") {
          text = await file.text();
        } else if (file.type === "application/pdf") {
          text = await this.extractPDFText(file);
        } else {
          this.addMessage("ai", "⚠️ Please upload a PDF or TXT file.");
          return;
        }

        if (text.length < 50) {
          this.addMessage(
            "ai",
            "⚠️ Could not extract text. Please paste the content instead.",
          );
          return;
        }

        // Use AI to extract structured data
        const data = await chrome.storage.sync.get(["openaiKey"]);
        if (!data.openaiKey) {
          this.addMessage(
            "ai",
            `⚠️ <strong>API Key Required</strong><br>
            <a href="https://platform.openai.com/api-keys" target="_blank" style="color: #8b5cf6;">Click here to get your API key</a>, then add it in the extension popup → AI tab.`,
          );
          return;
        }

        const typingEl = this.showTyping();

        const prompt = `Extract structured profile data from this document (CV/resume):

"""
${text.substring(0, 5000)}
"""

The application needs these fields: ${this.pendingFields.map((f) => f.label).join(", ")}

Respond with JSON:
{
  "profile": {
    "fullName": "...",
    "email": "...",
    "phone": "...",
    "location": "...",
    "currentTitle": "...",
    "currentCompany": "...",
    "yearsExperience": "...",
    "summary": "..."
  },
  "workHistory": [
    {
      "title": "...",
      "company": "...",
      "location": "...",
      "startDate": "MM/YYYY",
      "endDate": "MM/YYYY or Present",
      "description": "..."
    }
  ],
  "education": [
    {
      "school": "...",
      "degree": "...",
      "field": "...",
      "year": "..."
    }
  ],
  "skills": ["skill1", "skill2"],
  "extracted": [
    {"field": "Application Field Name", "value": "extracted value"}
  ],
  "summary": "Brief summary of what was extracted"
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
              model: this.ANALYSIS_MODEL,
              messages: [{ role: "user", content: prompt }],
              max_tokens: 2000,
            }),
          },
        );

        typingEl?.remove();

        if (!response.ok) {
          this.addMessage("ai", "⚠️ Error processing document.");
          return;
        }

        const result = await response.json();
        const content = result.choices[0].message.content;

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          // Store all extracted data
          const toStore = {};

          if (parsed.profile) {
            Object.assign(toStore, parsed.profile);
          }

          if (parsed.workHistory && parsed.workHistory.length > 0) {
            toStore.workHistory = parsed.workHistory;
          }

          if (parsed.education && parsed.education.length > 0) {
            toStore.education = parsed.education;
          }

          if (parsed.skills && parsed.skills.length > 0) {
            toStore.skills = parsed.skills;
          }

          // Save extracted documents
          const existingDocs =
            (await chrome.storage.sync.get("extractedDocuments"))
              .extractedDocuments || [];
          existingDocs.push({
            id: `doc_${Date.now()}`,
            name: file.name,
            type: file.type,
            extractedData: parsed,
            uploadedAt: Date.now(),
          });
          toStore.extractedDocuments = existingDocs;

          await chrome.storage.sync.set(toStore);

          // Fill fields that can be filled
          let filledCount = 0;
          if (parsed.extracted) {
            for (const item of parsed.extracted) {
              const field = this.pendingFields.find(
                (f) =>
                  f.label.toLowerCase().includes(item.field.toLowerCase()) ||
                  item.field.toLowerCase().includes(f.label.toLowerCase()),
              );
              if (field && item.value) {
                this.fillField(field.element, item.value);
                filledCount++;
                this.pendingFields = this.pendingFields.filter(
                  (f) => f !== field,
                );
              }
            }
          }

          // Build response
          let msg = `📋 **Document Analyzed!**\n\n`;
          msg += `${parsed.summary || "Successfully extracted your information."}\n\n`;
          msg += `✅ Filled **${filledCount}** fields\n`;
          msg += `💾 Saved profile data for future use\n`;

          if (this.pendingFields.length > 0) {
            msg += `\n📝 Still need: ${this.pendingFields
              .slice(0, 3)
              .map((f) => f.label)
              .join(", ")}`;
            if (this.pendingFields.length > 3) {
              msg += ` and ${this.pendingFields.length - 3} more`;
            }
          }

          this.addMessage("ai", msg);
        } else {
          this.addMessage("ai", "⚠️ Could not parse document data.");
        }
      } catch (err) {
        console.error("Document error:", err);
        this.addMessage(
          "ai",
          "⚠️ Error processing document. Please try again.",
        );
      }
    },

    // Extract PDF text
    async extractPDFText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            if (typeof pdfjsLib === "undefined") {
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
    },

    // Fill all fields from gathered data
    async fillAllFieldsFromChat() {
      this.addMessage("ai", "⚡ Filling all fields...");

      const data = await chrome.storage.sync.get(null);
      let filled = 0;

      // Re-analyze page
      const analysis = await this.analyzePageFields();

      // Fill all canFill fields
      for (const field of analysis.canFill) {
        if (this.fillField(field.element, field.suggestedValue)) {
          filled++;
        }
      }

      this.addMessage(
        "ai",
        `✅ **Done!** Filled ${filled} fields.\n\nReview the application and submit when ready!`,
      );

      // Update panel stats if available
      if (window.updatePanelStats) {
        window.updatePanelStats();
      }
    },
  };
})();
