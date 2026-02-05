// Job Tracker Integration Module
// Syncs with Firebase job tracker and provides todo/calendar features
// Integrates with the job-tracker-collab app

(function () {
  "use strict";

  // Firebase configuration (from job-tracker-collab)
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAF36Th9wAoWMAvj0mVAw4GDdpkcx9sPVc",
    authDomain: "job-tracker-tomas.firebaseapp.com",
    databaseURL:
      "https://job-tracker-tomas-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "job-tracker-tomas",
    storageBucket: "job-tracker-tomas.firebasestorage.app",
    messagingSenderId: "360707138428",
    appId: "1:360707138428:web:543adb9605d2fbd702faf9",
  };

  window.JobTracker = {
    // State
    db: null,
    positions: [],
    currentUser: null,
    isInitialized: false,
    panel: null,

    // Status options (matching job-tracker-collab)
    STATUSES: [
      { value: "not-started", label: "Not Started", color: "#fff", icon: "📋" },
      {
        value: "waiting-referral",
        label: "Waiting Referral",
        color: "#fffbeb",
        icon: "⏳",
      },
      { value: "applied", label: "Applied", color: "#f0f9ff", icon: "📨" },
      { value: "interview", label: "Interview", color: "#f0fdf4", icon: "🗣️" },
      { value: "rejected", label: "Rejected", color: "#fef2f2", icon: "❌" },
      { value: "offer", label: "Offer", color: "#ecfdf5", icon: "🎉" },
    ],

    // Initialize Firebase connection
    async init() {
      if (this.isInitialized) return;

      try {
        // Load Firebase scripts dynamically
        await this.loadFirebaseScripts();

        // Initialize Firebase
        if (!firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }
        this.db = firebase.database();

        // Get user from extension storage
        const data = await chrome.storage.sync.get(["trackerUsername"]);
        this.currentUser = data.trackerUsername || "Extension User";

        // Start listening for positions
        this.startPositionsListener();

        this.isInitialized = true;
        console.log("[JobTracker] Initialized successfully");
      } catch (err) {
        console.error("[JobTracker] Init failed:", err);
      }
    },

    // Load Firebase scripts
    async loadFirebaseScripts() {
      if (typeof firebase !== "undefined") return;

      // Load Firebase App
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      // Load Firebase Database
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src =
          "https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    },

    // Start listening for positions updates
    startPositionsListener() {
      if (!this.db) return;

      this.db.ref("positions").on("value", (snap) => {
        const data = snap.val() || {};
        const keys = Object.keys(data);
        this.positions = keys.map((k) => ({ ...data[k], _key: k }));

        // Update UI if panel is open
        if (this.panel) {
          this.renderPositionsList();
        }

        console.log(`[JobTracker] Synced ${this.positions.length} positions`);
      });
    },

    // Add current job to tracker
    async addCurrentJob() {
      if (!this.db) {
        await this.init();
      }

      // Extract job details from current page
      const company = this.extractCompanyName();
      const role = this.extractJobTitle();
      const location = this.extractLocation();
      const link = window.location.href;

      // Check for duplicates
      const duplicate = this.positions.find(
        (p) =>
          p.company?.toLowerCase() === company?.toLowerCase() &&
          p.role?.toLowerCase() === role?.toLowerCase(),
      );

      if (duplicate) {
        return {
          success: false,
          message: "This job is already in your tracker!",
        };
      }

      const newPos = {
        company: company || "",
        role: role || "",
        location: location || "",
        yearsExp: "",
        link: link,
        status: "not-started",
        notes: "",
        priority: false,
        createdAt: Date.now(),
        addedBy: this.currentUser,
        addedFrom: "extension",
      };

      try {
        await this.db.ref("positions").push(newPos);
        await this.logHistory(`added "${role}" at "${company}" via extension`);
        return { success: true, message: "Job added to tracker!" };
      } catch (err) {
        console.error("[JobTracker] Add failed:", err);
        return { success: false, message: "Failed to add job: " + err.message };
      }
    },

    // Update position status
    async updateStatus(posKey, newStatus) {
      if (!this.db) return;

      try {
        await this.db.ref("positions/" + posKey + "/status").set(newStatus);
        const pos = this.positions.find((p) => p._key === posKey);
        await this.logHistory(`changed "${pos?.role}" status to ${newStatus}`);
        return true;
      } catch (err) {
        console.error("[JobTracker] Update failed:", err);
        return false;
      }
    },

    // Delete position
    async deletePosition(posKey) {
      if (!this.db) return;

      try {
        const pos = this.positions.find((p) => p._key === posKey);
        await this.db.ref("positions/" + posKey).remove();
        await this.logHistory(`deleted "${pos?.role}" at "${pos?.company}"`);
        return true;
      } catch (err) {
        console.error("[JobTracker] Delete failed:", err);
        return false;
      }
    },

    // Log history
    async logHistory(action) {
      if (!this.db) return;

      try {
        await this.db.ref("history").push({
          user: this.currentUser,
          action: action,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("[JobTracker] Log history failed:", err);
      }
    },

    // Extract job details from page
    extractCompanyName() {
      const selectors = [
        '[data-automation-id="company"]',
        ".company-name",
        '[itemprop="hiringOrganization"]',
        ".employer-name",
        'meta[property="og:site_name"]',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.content || el.textContent;
          if (text?.trim()) return text.trim();
        }
      }

      // Try from page title
      const title = document.title;
      const match = title.match(/(?:at|@|\||-)\s*([^|–-]+?)(?:\s*\||\s*-|$)/i);
      if (match) return match[1].trim();

      // Try from URL
      const hostname = window.location.hostname;
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        return (
          parts[parts.length - 2].charAt(0).toUpperCase() +
          parts[parts.length - 2].slice(1)
        );
      }

      return "";
    },

    extractJobTitle() {
      const selectors = [
        '[data-automation-id="jobPostingTitle"]',
        ".job-title",
        '[itemprop="title"]',
        "h1",
        ".posting-headline h2",
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim()) {
          return el.textContent.trim().substring(0, 100);
        }
      }

      return "";
    },

    extractLocation() {
      const selectors = [
        '[data-automation-id="location"]',
        ".job-location",
        '[itemprop="jobLocation"]',
        ".location",
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim()) {
          return el.textContent.trim();
        }
      }

      return "";
    },

    // Create and show the job tracker panel
    createTrackerPanel() {
      if (this.panel) {
        this.panel.remove();
      }

      const panel = document.createElement("div");
      panel.className = "jaf-tracker-panel";
      panel.innerHTML = `
        <div class="jaf-tracker-header">
          <span>📋 Job Tracker</span>
          <div class="jaf-tracker-header-actions">
            <button class="jaf-tracker-refresh" title="Refresh">🔄</button>
            <button class="jaf-tracker-close">×</button>
          </div>
        </div>
        <div class="jaf-tracker-body">
          <div class="jaf-tracker-actions">
            <button class="jaf-tracker-add-btn">
              ➕ Add This Job
            </button>
            <button class="jaf-tracker-open-btn">
              📊 Open Full Tracker
            </button>
          </div>
          <div class="jaf-tracker-tabs">
            <button class="jaf-tracker-tab active" data-tab="todo">📝 To Apply</button>
            <button class="jaf-tracker-tab" data-tab="applied">📨 Applied</button>
            <button class="jaf-tracker-tab" data-tab="calendar">📅 Calendar</button>
          </div>
          <div class="jaf-tracker-content">
            <div class="jaf-tracker-list" data-content="todo"></div>
            <div class="jaf-tracker-list jaf-hidden" data-content="applied"></div>
            <div class="jaf-tracker-calendar jaf-hidden" data-content="calendar"></div>
          </div>
        </div>
      `;

      // Add styles
      this.addStyles();

      document.body.appendChild(panel);
      this.panel = panel;

      // Event listeners
      panel
        .querySelector(".jaf-tracker-close")
        .addEventListener("click", () => {
          this.closePanel();
        });

      panel
        .querySelector(".jaf-tracker-refresh")
        .addEventListener("click", async () => {
          await this.init();
          this.renderPositionsList();
        });

      panel
        .querySelector(".jaf-tracker-add-btn")
        .addEventListener("click", async () => {
          const btn = panel.querySelector(".jaf-tracker-add-btn");
          btn.disabled = true;
          btn.textContent = "⏳ Adding...";

          const result = await this.addCurrentJob();

          btn.disabled = false;
          btn.textContent = "➕ Add This Job";

          this.showNotification(
            result.message,
            result.success ? "success" : "error",
          );
        });

      panel
        .querySelector(".jaf-tracker-open-btn")
        .addEventListener("click", () => {
          window.open("https://job-tracker-tomas.netlify.app/", "_blank");
        });

      // Tab switching
      panel.querySelectorAll(".jaf-tracker-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          panel
            .querySelectorAll(".jaf-tracker-tab")
            .forEach((t) => t.classList.remove("active"));
          tab.classList.add("active");

          const tabName = tab.dataset.tab;
          panel.querySelectorAll("[data-content]").forEach((content) => {
            content.classList.toggle(
              "jaf-hidden",
              content.dataset.content !== tabName,
            );
          });

          if (tabName === "calendar") {
            this.renderCalendar();
          }
        });
      });

      // Initialize
      this.init().then(() => {
        this.renderPositionsList();
      });

      return panel;
    },

    // Render positions list
    renderPositionsList() {
      if (!this.panel) return;

      const todoList = this.panel.querySelector('[data-content="todo"]');
      const appliedList = this.panel.querySelector('[data-content="applied"]');

      // Filter positions
      const toApply = this.positions
        .filter(
          (p) => p.status === "not-started" || p.status === "waiting-referral",
        )
        .sort(
          (a, b) =>
            (b.priority ? 1 : 0) - (a.priority ? 1 : 0) ||
            (b.createdAt || 0) - (a.createdAt || 0),
        );

      const applied = this.positions
        .filter(
          (p) =>
            p.status === "applied" ||
            p.status === "interview" ||
            p.status === "offer",
        )
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      // Render To Apply
      if (toApply.length === 0) {
        todoList.innerHTML =
          '<div class="jaf-tracker-empty">No jobs to apply yet. Add some!</div>';
      } else {
        todoList.innerHTML = toApply
          .map((pos) => this.renderPositionCard(pos))
          .join("");
      }

      // Render Applied
      if (applied.length === 0) {
        appliedList.innerHTML =
          '<div class="jaf-tracker-empty">No applications yet.</div>';
      } else {
        appliedList.innerHTML = applied
          .map((pos) => this.renderPositionCard(pos))
          .join("");
      }

      // Add event listeners
      this.panel.querySelectorAll(".jaf-tracker-card").forEach((card) => {
        const key = card.dataset.key;

        card
          .querySelector(".jaf-tracker-status")
          .addEventListener("change", async (e) => {
            await this.updateStatus(key, e.target.value);
          });

        card
          .querySelector(".jaf-tracker-delete")
          ?.addEventListener("click", async () => {
            if (confirm("Delete this position?")) {
              await this.deletePosition(key);
            }
          });

        card
          .querySelector(".jaf-tracker-open-link")
          ?.addEventListener("click", () => {
            const pos = this.positions.find((p) => p._key === key);
            if (pos?.link) {
              window.open(pos.link, "_blank");
            }
          });
      });
    },

    // Render single position card
    renderPositionCard(pos) {
      const status =
        this.STATUSES.find((s) => s.value === pos.status) || this.STATUSES[0];

      return `
        <div class="jaf-tracker-card" data-key="${pos._key}" style="background: ${status.color}">
          <div class="jaf-tracker-card-header">
            <div class="jaf-tracker-company">${pos.company || "Unknown Company"}</div>
            ${pos.priority ? '<span class="jaf-tracker-priority">⭐</span>' : ""}
          </div>
          <div class="jaf-tracker-role">${pos.role || "Unknown Role"}</div>
          ${pos.location ? `<div class="jaf-tracker-location">📍 ${pos.location}</div>` : ""}
          <div class="jaf-tracker-card-footer">
            <select class="jaf-tracker-status" value="${pos.status}">
              ${this.STATUSES.map(
                (s) => `
                <option value="${s.value}" ${s.value === pos.status ? "selected" : ""}>
                  ${s.icon} ${s.label}
                </option>
              `,
              ).join("")}
            </select>
            <div class="jaf-tracker-card-actions">
              ${pos.link ? '<button class="jaf-tracker-open-link" title="Open">🔗</button>' : ""}
              <button class="jaf-tracker-delete" title="Delete">🗑️</button>
            </div>
          </div>
        </div>
      `;
    },

    // Render calendar view
    renderCalendar() {
      const calendarEl = this.panel?.querySelector('[data-content="calendar"]');
      if (!calendarEl) return;

      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();

      // Get applications with dates
      const applications = this.positions
        .filter((p) => p.status === "applied" || p.status === "interview")
        .map((p) => ({
          ...p,
          date: new Date(p.createdAt || Date.now()),
        }));

      // Build calendar grid
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startDay = firstDay.getDay();
      const totalDays = lastDay.getDate();

      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];

      let html = `
        <div class="jaf-calendar-header">
          <strong>${monthNames[month]} ${year}</strong>
        </div>
        <div class="jaf-calendar-grid">
          <div class="jaf-calendar-day-header">Sun</div>
          <div class="jaf-calendar-day-header">Mon</div>
          <div class="jaf-calendar-day-header">Tue</div>
          <div class="jaf-calendar-day-header">Wed</div>
          <div class="jaf-calendar-day-header">Thu</div>
          <div class="jaf-calendar-day-header">Fri</div>
          <div class="jaf-calendar-day-header">Sat</div>
      `;

      // Empty cells before first day
      for (let i = 0; i < startDay; i++) {
        html += '<div class="jaf-calendar-day empty"></div>';
      }

      // Days of month
      for (let day = 1; day <= totalDays; day++) {
        const isToday = day === today.getDate() && month === today.getMonth();
        const dayApps = applications.filter(
          (a) =>
            a.date.getDate() === day &&
            a.date.getMonth() === month &&
            a.date.getFullYear() === year,
        );

        html += `
          <div class="jaf-calendar-day ${isToday ? "today" : ""} ${dayApps.length > 0 ? "has-events" : ""}">
            <span class="jaf-calendar-day-num">${day}</span>
            ${dayApps.length > 0 ? `<span class="jaf-calendar-events">${dayApps.length}</span>` : ""}
          </div>
        `;
      }

      html += "</div>";

      // Upcoming interviews
      const upcoming = applications
        .filter((a) => a.status === "interview" && a.date >= today)
        .slice(0, 5);

      if (upcoming.length > 0) {
        html += `
          <div class="jaf-calendar-upcoming">
            <strong>🗣️ Upcoming Interviews</strong>
            ${upcoming
              .map(
                (a) => `
              <div class="jaf-calendar-event">
                <span>${a.company} - ${a.role}</span>
              </div>
            `,
              )
              .join("")}
          </div>
        `;
      }

      calendarEl.innerHTML = html;
    },

    // Close panel
    closePanel() {
      if (this.panel) {
        this.panel.remove();
        this.panel = null;
      }
    },

    // Show notification
    showNotification(message, type = "success") {
      const notif = document.createElement("div");
      notif.className = "jaf-tracker-notification";
      notif.style.background = type === "success" ? "#22c55e" : "#ef4444";
      notif.textContent = message;
      document.body.appendChild(notif);

      setTimeout(() => {
        notif.style.opacity = "0";
        setTimeout(() => notif.remove(), 300);
      }, 3000);
    },

    // Add styles
    addStyles() {
      if (document.getElementById("jaf-tracker-styles")) return;

      const style = document.createElement("style");
      style.id = "jaf-tracker-styles";
      style.textContent = `
        .jaf-tracker-panel {
          position: fixed;
          top: 80px;
          right: 20px;
          width: 380px;
          max-height: 600px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          z-index: 999998;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
          font-size: 13px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .jaf-tracker-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
          color: white;
          font-weight: 600;
          font-size: 15px;
        }
        
        .jaf-tracker-header-actions {
          display: flex;
          gap: 8px;
        }
        
        .jaf-tracker-header-actions button {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }
        
        .jaf-tracker-header-actions button:hover {
          background: rgba(255,255,255,0.3);
        }
        
        .jaf-tracker-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }
        
        .jaf-tracker-actions {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        
        .jaf-tracker-add-btn,
        .jaf-tracker-open-btn {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .jaf-tracker-add-btn {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: white;
        }
        
        .jaf-tracker-open-btn {
          background: #f5f5f5;
          color: #333;
        }
        
        .jaf-tracker-add-btn:hover,
        .jaf-tracker-open-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .jaf-tracker-tabs {
          display: flex;
          gap: 0;
          margin-bottom: 16px;
          border-bottom: 1px solid #e5e5e5;
        }
        
        .jaf-tracker-tab {
          flex: 1;
          padding: 10px;
          border: none;
          background: none;
          font-size: 12px;
          font-weight: 500;
          color: #888;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all 0.2s;
        }
        
        .jaf-tracker-tab.active {
          color: #8b5cf6;
          border-bottom-color: #8b5cf6;
        }
        
        .jaf-tracker-tab:hover {
          color: #333;
        }
        
        .jaf-tracker-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .jaf-tracker-empty {
          text-align: center;
          color: #888;
          padding: 40px 20px;
        }
        
        .jaf-tracker-card {
          padding: 12px;
          border-radius: 10px;
          border: 1px solid #e5e5e5;
        }
        
        .jaf-tracker-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        
        .jaf-tracker-company {
          font-weight: 600;
          font-size: 14px;
        }
        
        .jaf-tracker-priority {
          font-size: 12px;
        }
        
        .jaf-tracker-role {
          color: #666;
          margin-bottom: 4px;
        }
        
        .jaf-tracker-location {
          font-size: 11px;
          color: #888;
          margin-bottom: 8px;
        }
        
        .jaf-tracker-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }
        
        .jaf-tracker-status {
          flex: 1;
          padding: 6px 10px;
          border: 1px solid #e5e5e5;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
        }
        
        .jaf-tracker-card-actions {
          display: flex;
          gap: 4px;
        }
        
        .jaf-tracker-card-actions button {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
          border-radius: 4px;
        }
        
        .jaf-tracker-card-actions button:hover {
          background: rgba(0,0,0,0.05);
        }
        
        .jaf-calendar-header {
          text-align: center;
          margin-bottom: 12px;
        }
        
        .jaf-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        
        .jaf-calendar-day-header {
          text-align: center;
          font-size: 10px;
          font-weight: 600;
          color: #888;
          padding: 4px;
        }
        
        .jaf-calendar-day {
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          border-radius: 6px;
          position: relative;
        }
        
        .jaf-calendar-day.empty {
          background: none;
        }
        
        .jaf-calendar-day.today {
          background: #8b5cf6;
          color: white;
        }
        
        .jaf-calendar-day.has-events {
          background: #ede9fe;
        }
        
        .jaf-calendar-events {
          position: absolute;
          bottom: 2px;
          right: 2px;
          background: #8b5cf6;
          color: white;
          font-size: 8px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .jaf-calendar-upcoming {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #e5e5e5;
        }
        
        .jaf-calendar-event {
          padding: 8px 12px;
          background: #f0fdf4;
          border-radius: 6px;
          margin-top: 8px;
          font-size: 12px;
        }
        
        .jaf-hidden {
          display: none !important;
        }
        
        .jaf-tracker-notification {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 24px;
          color: white;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          z-index: 999999;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
          transition: opacity 0.3s;
        }
      `;
      document.head.appendChild(style);
    },

    // Quick add button for the main panel
    createQuickAddButton() {
      const btn = document.createElement("button");
      btn.className = "jaf-panel-btn jaf-tracker-quick-btn";
      btn.style.cssText =
        "background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); margin-top: 8px;";
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
        </svg>
        Job Tracker
      `;

      btn.addEventListener("click", () => {
        if (this.panel) {
          this.closePanel();
        } else {
          this.createTrackerPanel();
        }
      });

      return btn;
    },
  };
})();
