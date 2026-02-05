// Job Application Tracker Module
// Self-contained job tracking system for the autofill extension
// Data stored per-user in chrome.storage (with cloud sync when logged in)
// CLEAN VERSION - does NOT connect to any external Firebase projects

(function () {
  "use strict";

  window.JobTracker = {
    // State
    positions: [],
    isInitialized: false,
    panel: null,

    // Status pipeline
    STATUSES: [
      { value: "not-started", label: "Not Started", color: "#f5f5f5", icon: "📋" },
      { value: "researching", label: "Researching", color: "#fef3c7", icon: "🔍" },
      { value: "waiting-referral", label: "Waiting Referral", color: "#fef9c3", icon: "⏳" },
      { value: "applied", label: "Applied", color: "#dbeafe", icon: "📨" },
      { value: "interview", label: "Interview", color: "#d1fae5", icon: "🗣️" },
      { value: "offer", label: "Offer", color: "#ecfdf5", icon: "🎉" },
      { value: "rejected", label: "Rejected", color: "#fee2e2", icon: "❌" },
    ],

    // Priority levels
    PRIORITIES: [
      { value: "low", label: "Low", color: "#6b7280" },
      { value: "medium", label: "Medium", color: "#f59e0b" },
      { value: "high", label: "High", color: "#ef4444" },
    ],

    // Initialize tracker
    async init() {
      if (this.isInitialized) return;

      try {
        // Load positions from storage
        await this.loadPositions();
        this.isInitialized = true;
        console.log("[JobTracker] Initialized with", this.positions.length, "positions");
      } catch (err) {
        console.error("[JobTracker] Init failed:", err);
      }
    },

    // Load positions from chrome.storage
    async loadPositions() {
      try {
        const data = await chrome.storage.sync.get(["jobTrackerPositions"]);
        this.positions = data.jobTrackerPositions || [];
      } catch (err) {
        console.error("[JobTracker] Load failed:", err);
        this.positions = [];
      }
    },

    // Save positions to chrome.storage
    async savePositions() {
      try {
        await chrome.storage.sync.set({ jobTrackerPositions: this.positions });
        console.log("[JobTracker] Saved", this.positions.length, "positions");
        
        // Sync to cloud if user is logged in
        if (window.AuthManager && window.AuthManager.isSignedIn()) {
          window.AuthManager.uploadJobTrackerData();
        }
      } catch (err) {
        console.error("[JobTracker] Save failed:", err);
      }
    },

    // Auto-detect and add job from current page
    async addFromCurrentPage() {
      const jobInfo = this.detectJobInfo();
      
      if (!jobInfo.company && !jobInfo.title) {
        this.showNotification("Could not detect job info from this page", "error");
        return null;
      }

      // Check if already exists
      const existing = this.positions.find(
        p => p.company.toLowerCase() === jobInfo.company.toLowerCase() &&
             p.title.toLowerCase() === jobInfo.title.toLowerCase()
      );

      if (existing) {
        this.showNotification(`Already tracking: ${jobInfo.title} at ${jobInfo.company}`, "info");
        return existing;
      }

      // Create new position
      const position = {
        id: Date.now().toString(),
        company: jobInfo.company,
        title: jobInfo.title,
        url: window.location.href,
        status: "applied",
        priority: "medium",
        notes: "",
        dateAdded: new Date().toISOString(),
        dateApplied: new Date().toISOString(),
        dateUpdated: new Date().toISOString(),
        source: "auto-detected",
      };

      this.positions.unshift(position);
      await this.savePositions();

      this.showNotification(`Added: ${position.title} at ${position.company}`, "success");
      return position;
    },

    // Detect job info from current page
    detectJobInfo() {
      const info = {
        company: "",
        title: "",
      };

      // Common job board patterns
      const url = window.location.href.toLowerCase();
      const pageTitle = document.title;

      // Workday
      if (url.includes("workday")) {
        const companyMatch = url.match(/([^/]+)\.wd\d+\.myworkdayjobs/);
        if (companyMatch) info.company = this.formatCompanyName(companyMatch[1]);
        
        const titleEl = document.querySelector('[data-automation-id="jobPostingHeader"] h2, .css-1j389vi');
        if (titleEl) info.title = titleEl.textContent.trim();
      }

      // Greenhouse
      if (url.includes("greenhouse.io") || url.includes("boards.greenhouse")) {
        const companyMatch = url.match(/boards\.greenhouse\.io\/([^/]+)/);
        if (companyMatch) info.company = this.formatCompanyName(companyMatch[1]);
        
        const titleEl = document.querySelector('h1.app-title, .job-title');
        if (titleEl) info.title = titleEl.textContent.trim();
      }

      // Lever
      if (url.includes("lever.co")) {
        const companyMatch = url.match(/jobs\.lever\.co\/([^/]+)/);
        if (companyMatch) info.company = this.formatCompanyName(companyMatch[1]);
        
        const titleEl = document.querySelector('.posting-headline h2');
        if (titleEl) info.title = titleEl.textContent.trim();
      }

      // LinkedIn
      if (url.includes("linkedin.com/jobs")) {
        const companyEl = document.querySelector('.jobs-unified-top-card__company-name, .topcard__org-name-link');
        if (companyEl) info.company = companyEl.textContent.trim();
        
        const titleEl = document.querySelector('.jobs-unified-top-card__job-title, .topcard__title');
        if (titleEl) info.title = titleEl.textContent.trim();
      }

      // Generic fallback - try to extract from page
      if (!info.company || !info.title) {
        // Look for common patterns
        const h1 = document.querySelector('h1');
        if (h1 && !info.title) info.title = h1.textContent.trim().substring(0, 100);

        // Try to get company from meta tags or structured data
        const orgMeta = document.querySelector('meta[property="og:site_name"], meta[name="author"]');
        if (orgMeta && !info.company) info.company = orgMeta.content;

        // Try JSON-LD
        const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
        ldScripts.forEach(script => {
          try {
            const data = JSON.parse(script.textContent);
            if (data["@type"] === "JobPosting") {
              if (!info.title && data.title) info.title = data.title;
              if (!info.company && data.hiringOrganization?.name) {
                info.company = data.hiringOrganization.name;
              }
            }
          } catch (e) {}
        });
      }

      return info;
    },

    // Format company name nicely
    formatCompanyName(name) {
      return name
        .replace(/-/g, " ")
        .replace(/_/g, " ")
        .split(" ")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    },

    // Add position manually
    async addPosition(company, title, url = "", status = "not-started", priority = "medium") {
      const position = {
        id: Date.now().toString(),
        company,
        title,
        url: url || window.location.href,
        status,
        priority,
        notes: "",
        dateAdded: new Date().toISOString(),
        dateApplied: status === "applied" ? new Date().toISOString() : null,
        dateUpdated: new Date().toISOString(),
        source: "manual",
      };

      this.positions.unshift(position);
      await this.savePositions();
      return position;
    },

    // Update position
    async updatePosition(id, updates) {
      const index = this.positions.findIndex(p => p.id === id);
      if (index === -1) return null;

      this.positions[index] = {
        ...this.positions[index],
        ...updates,
        dateUpdated: new Date().toISOString(),
      };

      // If status changed to applied, set dateApplied
      if (updates.status === "applied" && !this.positions[index].dateApplied) {
        this.positions[index].dateApplied = new Date().toISOString();
      }

      await this.savePositions();
      return this.positions[index];
    },

    // Delete position
    async deletePosition(id) {
      this.positions = this.positions.filter(p => p.id !== id);
      await this.savePositions();
    },

    // Get positions by status
    getPositionsByStatus(status) {
      return this.positions.filter(p => p.status === status);
    },

    // Get statistics
    getStats() {
      const stats = {
        total: this.positions.length,
        byStatus: {},
        thisWeek: 0,
        thisMonth: 0,
      };

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      this.STATUSES.forEach(s => stats.byStatus[s.value] = 0);

      this.positions.forEach(p => {
        stats.byStatus[p.status] = (stats.byStatus[p.status] || 0) + 1;
        
        const addedDate = new Date(p.dateAdded);
        if (addedDate >= weekAgo) stats.thisWeek++;
        if (addedDate >= monthAgo) stats.thisMonth++;
      });

      return stats;
    },

    // Create tracker panel UI
    createTrackerPanel() {
      // Remove existing panel
      const existing = document.getElementById("jaf-job-tracker-panel");
      if (existing) {
        existing.remove();
        return;
      }

      const panel = document.createElement("div");
      panel.id = "jaf-job-tracker-panel";
      panel.innerHTML = this.getPanelHTML();
      
      // Add styles
      const style = document.createElement("style");
      style.textContent = this.getPanelStyles();
      panel.appendChild(style);

      document.body.appendChild(panel);
      this.panel = panel;

      // Setup event listeners
      this.setupPanelEvents();

      // Render positions
      this.renderPositions();
    },

    // Get panel HTML
    getPanelHTML() {
      const stats = this.getStats();

      return `
        <div class="jaft-header">
          <div class="jaft-header-left">
            <span class="jaft-logo">📊</span>
            <div>
              <h3>Job Tracker</h3>
              <span class="jaft-subtitle">${stats.total} applications tracked</span>
            </div>
          </div>
          <div class="jaft-header-right">
            <button class="jaft-btn jaft-add-current" title="Add current page">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Add This Job
            </button>
            <button class="jaft-close" title="Close">×</button>
          </div>
        </div>

        <div class="jaft-stats">
          ${this.STATUSES.slice(0, 5).map(s => `
            <div class="jaft-stat" style="background: ${s.color}">
              <span class="jaft-stat-icon">${s.icon}</span>
              <span class="jaft-stat-count">${stats.byStatus[s.value] || 0}</span>
              <span class="jaft-stat-label">${s.label}</span>
            </div>
          `).join("")}
        </div>

        <div class="jaft-filters">
          <select class="jaft-filter-status">
            <option value="">All Statuses</option>
            ${this.STATUSES.map(s => `<option value="${s.value}">${s.icon} ${s.label}</option>`).join("")}
          </select>
          <input type="text" class="jaft-search" placeholder="Search jobs...">
        </div>

        <div class="jaft-list"></div>

        <div class="jaft-footer">
          <button class="jaft-btn jaft-export">Export CSV</button>
          <span class="jaft-footer-text">This week: ${stats.thisWeek} | This month: ${stats.thisMonth}</span>
        </div>
      `;
    },

    // Get panel styles
    getPanelStyles() {
      return `
        #jaf-job-tracker-panel {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 600px;
          max-width: 95vw;
          max-height: 80vh;
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .jaft-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid #eee;
          background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
          color: #fff;
        }
        .jaft-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .jaft-logo {
          font-size: 24px;
        }
        .jaft-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }
        .jaft-subtitle {
          font-size: 11px;
          opacity: 0.8;
        }
        .jaft-header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .jaft-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .jaft-add-current {
          background: rgba(255,255,255,0.2);
          color: #fff;
        }
        .jaft-add-current:hover {
          background: rgba(255,255,255,0.3);
        }
        .jaft-close {
          background: none;
          border: none;
          color: #fff;
          font-size: 24px;
          cursor: pointer;
          opacity: 0.8;
          padding: 0 4px;
        }
        .jaft-close:hover {
          opacity: 1;
        }
        .jaft-stats {
          display: flex;
          gap: 8px;
          padding: 12px 16px;
          overflow-x: auto;
          background: #fafafa;
        }
        .jaft-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 10px 16px;
          border-radius: 10px;
          min-width: 80px;
        }
        .jaft-stat-icon {
          font-size: 18px;
        }
        .jaft-stat-count {
          font-size: 20px;
          font-weight: 700;
          color: #333;
        }
        .jaft-stat-label {
          font-size: 10px;
          color: #666;
          text-align: center;
        }
        .jaft-filters {
          display: flex;
          gap: 10px;
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
        }
        .jaft-filter-status {
          padding: 8px 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 12px;
          min-width: 140px;
        }
        .jaft-search {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          font-size: 12px;
        }
        .jaft-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
          max-height: 300px;
        }
        .jaft-job {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f9f9f9;
          border-radius: 10px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .jaft-job:hover {
          background: #f0f0f0;
        }
        .jaft-job-icon {
          font-size: 20px;
        }
        .jaft-job-info {
          flex: 1;
        }
        .jaft-job-title {
          font-weight: 600;
          font-size: 13px;
          color: #333;
          margin-bottom: 2px;
        }
        .jaft-job-company {
          font-size: 11px;
          color: #666;
        }
        .jaft-job-date {
          font-size: 10px;
          color: #999;
        }
        .jaft-job-status {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 500;
        }
        .jaft-job-actions {
          display: flex;
          gap: 6px;
        }
        .jaft-job-actions button {
          padding: 6px 8px;
          border: none;
          background: #e5e5e5;
          border-radius: 6px;
          cursor: pointer;
          font-size: 10px;
        }
        .jaft-job-actions button:hover {
          background: #d0d0d0;
        }
        .jaft-empty {
          text-align: center;
          padding: 40px 20px;
          color: #888;
        }
        .jaft-empty-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }
        .jaft-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-top: 1px solid #eee;
          background: #fafafa;
        }
        .jaft-export {
          background: #10b981;
          color: #fff;
        }
        .jaft-export:hover {
          background: #059669;
        }
        .jaft-footer-text {
          font-size: 11px;
          color: #888;
        }
      `;
    },

    // Setup panel event listeners
    setupPanelEvents() {
      if (!this.panel) return;

      // Close button
      this.panel.querySelector(".jaft-close")?.addEventListener("click", () => {
        this.panel.remove();
        this.panel = null;
      });

      // Add current job
      this.panel.querySelector(".jaft-add-current")?.addEventListener("click", async () => {
        await this.addFromCurrentPage();
        this.renderPositions();
      });

      // Filter by status
      this.panel.querySelector(".jaft-filter-status")?.addEventListener("change", (e) => {
        this.renderPositions(e.target.value, this.panel.querySelector(".jaft-search").value);
      });

      // Search
      this.panel.querySelector(".jaft-search")?.addEventListener("input", (e) => {
        this.renderPositions(this.panel.querySelector(".jaft-filter-status").value, e.target.value);
      });

      // Export
      this.panel.querySelector(".jaft-export")?.addEventListener("click", () => {
        this.exportToCSV();
      });
    },

    // Render positions list
    renderPositions(statusFilter = "", searchQuery = "") {
      const listEl = this.panel?.querySelector(".jaft-list");
      if (!listEl) return;

      let positions = [...this.positions];

      // Filter by status
      if (statusFilter) {
        positions = positions.filter(p => p.status === statusFilter);
      }

      // Filter by search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        positions = positions.filter(p => 
          p.company.toLowerCase().includes(query) ||
          p.title.toLowerCase().includes(query)
        );
      }

      if (positions.length === 0) {
        listEl.innerHTML = `
          <div class="jaft-empty">
            <div class="jaft-empty-icon">📋</div>
            <p>${this.positions.length === 0 ? "No jobs tracked yet" : "No matching jobs"}</p>
            <p style="font-size: 11px; margin-top: 8px;">
              ${this.positions.length === 0 ? 'Click "Add This Job" on a job posting page' : "Try a different filter"}
            </p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = positions.map(p => {
        const status = this.STATUSES.find(s => s.value === p.status) || this.STATUSES[0];
        const dateStr = new Date(p.dateAdded).toLocaleDateString();

        return `
          <div class="jaft-job" data-id="${p.id}">
            <span class="jaft-job-icon">${status.icon}</span>
            <div class="jaft-job-info">
              <div class="jaft-job-title">${this.escapeHtml(p.title)}</div>
              <div class="jaft-job-company">${this.escapeHtml(p.company)}</div>
              <div class="jaft-job-date">Added ${dateStr}</div>
            </div>
            <span class="jaft-job-status" style="background: ${status.color}; color: #333;">
              ${status.label}
            </span>
            <div class="jaft-job-actions">
              <button class="jaft-job-open" data-url="${p.url}" title="Open job page">🔗</button>
              <button class="jaft-job-delete" data-id="${p.id}" title="Delete">🗑️</button>
            </div>
          </div>
        `;
      }).join("");

      // Add click handlers
      listEl.querySelectorAll(".jaft-job-open").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          window.open(btn.dataset.url, "_blank");
        });
      });

      listEl.querySelectorAll(".jaft-job-delete").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm("Delete this job?")) {
            await this.deletePosition(btn.dataset.id);
            this.renderPositions(statusFilter, searchQuery);
          }
        });
      });

      // Click on job to change status
      listEl.querySelectorAll(".jaft-job").forEach(el => {
        el.addEventListener("click", () => {
          this.showStatusMenu(el.dataset.id);
        });
      });
    },

    // Show status change menu
    showStatusMenu(positionId) {
      const position = this.positions.find(p => p.id === positionId);
      if (!position) return;

      const menu = document.createElement("div");
      menu.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        padding: 16px;
        z-index: 2147483648;
        min-width: 200px;
      `;

      menu.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 12px;">Update Status</div>
        ${this.STATUSES.map(s => `
          <button data-status="${s.value}" style="
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 10px 12px;
            border: none;
            background: ${s.value === position.status ? '#f0f0f0' : 'transparent'};
            border-radius: 8px;
            cursor: pointer;
            text-align: left;
            font-size: 13px;
            margin-bottom: 4px;
          ">
            ${s.icon} ${s.label}
          </button>
        `).join("")}
        <button class="jaft-menu-close" style="
          width: 100%;
          padding: 10px;
          margin-top: 8px;
          border: 1px solid #e0e0e0;
          background: #fff;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
        ">Cancel</button>
      `;

      document.body.appendChild(menu);

      // Status buttons
      menu.querySelectorAll("[data-status]").forEach(btn => {
        btn.addEventListener("click", async () => {
          await this.updatePosition(positionId, { status: btn.dataset.status });
          menu.remove();
          this.renderPositions();
          this.updatePanelStats();
        });
      });

      // Close button
      menu.querySelector(".jaft-menu-close")?.addEventListener("click", () => menu.remove());

      // Click outside to close
      setTimeout(() => {
        document.addEventListener("click", function closeMenu(e) {
          if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener("click", closeMenu);
          }
        });
      }, 100);
    },

    // Update panel stats
    updatePanelStats() {
      if (!this.panel) return;
      
      const stats = this.getStats();
      
      // Update header subtitle
      const subtitle = this.panel.querySelector(".jaft-subtitle");
      if (subtitle) subtitle.textContent = `${stats.total} applications tracked`;
    },

    // Export to CSV
    exportToCSV() {
      const headers = ["Company", "Title", "Status", "Priority", "URL", "Date Added", "Date Applied", "Notes"];
      const rows = this.positions.map(p => [
        p.company,
        p.title,
        p.status,
        p.priority,
        p.url,
        p.dateAdded,
        p.dateApplied || "",
        p.notes
      ]);

      const csv = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `job-tracker-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      this.showNotification("Exported to CSV", "success");
    },

    // Show notification
    showNotification(message, type = "info") {
      const notif = document.createElement("div");
      const colors = {
        success: { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
        error: { bg: "#fee2e2", border: "#ef4444", text: "#991b1b" },
        info: { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
      };
      const c = colors[type] || colors.info;

      notif.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${c.bg};
        border: 1px solid ${c.border};
        color: ${c.text};
        border-radius: 10px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 2147483647;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease-out;
      `;
      notif.textContent = message;
      document.body.appendChild(notif);

      setTimeout(() => {
        notif.style.opacity = "0";
        notif.style.transition = "opacity 0.3s";
        setTimeout(() => notif.remove(), 300);
      }, 3000);
    },

    // Escape HTML
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    },

    // Called when user submits a job application (auto-detect)
    async onApplicationSubmitted(companyName, jobTitle, jobUrl) {
      // Check if already exists
      const existing = this.positions.find(
        p => p.company.toLowerCase() === companyName.toLowerCase() &&
             p.title.toLowerCase() === jobTitle.toLowerCase()
      );

      if (existing) {
        // Update to applied status
        if (existing.status !== "applied") {
          await this.updatePosition(existing.id, { status: "applied" });
        }
        return existing;
      }

      // Create new position
      const position = {
        id: Date.now().toString(),
        company: companyName,
        title: jobTitle,
        url: jobUrl || window.location.href,
        status: "applied",
        priority: "medium",
        notes: "Auto-added by Job Autofill Extension",
        dateAdded: new Date().toISOString(),
        dateApplied: new Date().toISOString(),
        dateUpdated: new Date().toISOString(),
        source: "auto-submit",
      };

      this.positions.unshift(position);
      await this.savePositions();

      this.showNotification(`📨 Tracked: ${position.title} at ${position.company}`, "success");
      return position;
    },
  };

  // Initialize on load
  JobTracker.init();
})();
