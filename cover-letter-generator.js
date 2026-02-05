// PDF Cover Letter Generator Module
// Generates cover letters and creates downloadable PDFs

(function () {
  "use strict";

  window.CoverLetterGenerator = {
    // Model for content generation
    MODEL: "gpt-4o-mini",

    // Generate cover letter content
    async generateCoverLetter(jobDetails, profileData) {
      const apiKey = (await chrome.storage.sync.get("openaiKey")).openaiKey;
      if (!apiKey) {
        throw new Error("API key required! Click the extension icon → AI tab → follow the setup guide to get your OpenAI key");
      }

      const prompt = this.buildPrompt(jobDetails, profileData);

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: this.MODEL,
            messages: [
              {
                role: "system",
                content: `You are a professional cover letter writer. Write compelling, personalized cover letters that:
- Match the candidate's experience to the job requirements
- Are concise (300-400 words)
- Sound natural and professional, not generic
- Highlight specific achievements and skills
- Show genuine interest in the company and role
- Include a strong opening and call to action`,
              },
              { role: "user", content: prompt },
            ],
            max_tokens: 1000,
            temperature: 0.7,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to generate cover letter");
      }

      const result = await response.json();
      return result.choices[0].message.content;
    },

    // Build prompt for cover letter generation
    buildPrompt(jobDetails, profileData) {
      const parts = [];

      parts.push(
        "Generate a professional cover letter for the following job application:",
      );
      parts.push("");

      // Job details
      parts.push("=== JOB DETAILS ===");
      if (jobDetails.company) parts.push(`Company: ${jobDetails.company}`);
      if (jobDetails.title) parts.push(`Position: ${jobDetails.title}`);
      if (jobDetails.location) parts.push(`Location: ${jobDetails.location}`);
      if (jobDetails.description) {
        parts.push(`Job Description:`);
        parts.push(jobDetails.description.substring(0, 2000));
      }
      parts.push("");

      // Candidate profile
      parts.push("=== CANDIDATE PROFILE ===");
      if (profileData.fullName) parts.push(`Name: ${profileData.fullName}`);
      if (profileData.currentTitle)
        parts.push(`Current Title: ${profileData.currentTitle}`);
      if (profileData.currentCompany)
        parts.push(`Current Company: ${profileData.currentCompany}`);
      if (profileData.yearsExperience)
        parts.push(`Years of Experience: ${profileData.yearsExperience}`);

      // Work history
      if (profileData.workHistory && profileData.workHistory.length > 0) {
        parts.push(`\nWork History:`);
        profileData.workHistory.slice(0, 3).forEach((job, i) => {
          parts.push(`${i + 1}. ${job.title} at ${job.company}`);
          if (job.description)
            parts.push(`   ${job.description.substring(0, 200)}`);
        });
      }

      // Education
      if (profileData.education && profileData.education.length > 0) {
        parts.push(`\nEducation:`);
        profileData.education.forEach((edu) => {
          parts.push(
            `- ${edu.degree} in ${edu.field || "N/A"} from ${edu.school}`,
          );
        });
      }

      // Skills
      if (profileData.skills && profileData.skills.length > 0) {
        parts.push(
          `\nKey Skills: ${profileData.skills.slice(0, 10).join(", ")}`,
        );
      }

      // CV text if available
      if (profileData.cvText) {
        parts.push(`\nAdditional CV Content:`);
        parts.push(profileData.cvText.substring(0, 1500));
      }

      parts.push("");
      parts.push(
        "Write a compelling cover letter that matches this candidate to this role. Use specific examples from their experience.",
      );

      return parts.join("\n");
    },

    // Extract job details from page
    extractJobDetails() {
      const details = {
        company: "",
        title: "",
        location: "",
        description: "",
      };

      // Try to find company name
      const companySelectors = [
        '[data-automation-id="company"]',
        ".company-name",
        '[itemprop="hiringOrganization"]',
        "h1 + p",
        "[data-company]",
      ];

      for (const sel of companySelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          details.company = el.textContent.trim();
          break;
        }
      }

      // Try page title
      if (!details.company) {
        const pageTitle = document.title;
        const companyMatch = pageTitle.match(/at\s+([^|–-]+)/i);
        if (companyMatch) {
          details.company = companyMatch[1].trim();
        }
      }

      // Try to find job title
      const titleSelectors = [
        '[data-automation-id="jobPostingTitle"]',
        ".job-title",
        '[itemprop="title"]',
        "h1",
        ".posting-headline h2",
      ];

      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          details.title = el.textContent.trim();
          break;
        }
      }

      // Try to find location
      const locationSelectors = [
        '[data-automation-id="location"]',
        ".job-location",
        '[itemprop="jobLocation"]',
        ".location",
      ];

      for (const sel of locationSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          details.location = el.textContent.trim();
          break;
        }
      }

      // Try to find job description
      const descSelectors = [
        '[data-automation-id="jobPostingDescription"]',
        ".job-description",
        '[itemprop="description"]',
        ".description",
        "#job-description",
      ];

      for (const sel of descSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim()) {
          details.description = el.textContent.trim();
          break;
        }
      }

      // Fallback: look for large text areas
      if (!details.description) {
        const paras = document.querySelectorAll("p, li");
        const texts = [];
        paras.forEach((p) => {
          const text = p.textContent.trim();
          if (text.length > 50 && text.length < 1000) {
            texts.push(text);
          }
        });
        if (texts.length > 3) {
          details.description = texts.slice(0, 10).join("\n");
        }
      }

      return details;
    },

    // Generate PDF from cover letter text
    generatePDF(coverLetterText, candidateName, companyName) {
      // Create PDF using jsPDF-like manual approach
      // Since we can't easily load jsPDF, we'll create a simple HTML-based solution

      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Cover Letter - ${candidateName}</title>
  <style>
    @page {
      margin: 1in;
      size: letter;
    }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #333;
      max-width: 6.5in;
      margin: 0 auto;
      padding: 1in;
    }
    .header {
      margin-bottom: 24pt;
    }
    .header h1 {
      font-size: 18pt;
      margin: 0 0 6pt 0;
      color: #1a365d;
    }
    .date {
      margin-bottom: 18pt;
      color: #666;
    }
    .content {
      text-align: justify;
    }
    .content p {
      margin: 0 0 12pt 0;
    }
    .signature {
      margin-top: 24pt;
    }
    .signature p {
      margin: 0;
    }
    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${candidateName}</h1>
  </div>
  <div class="date">${today}</div>
  <div class="content">
    ${coverLetterText
      .split("\n")
      .map((p) => (p.trim() ? `<p>${p}</p>` : ""))
      .join("\n")}
  </div>
</body>
</html>`;

      // Create blob and download
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);

      const filename = `Cover_Letter_${candidateName.replace(/\s+/g, "_")}_${companyName.replace(/[^a-z0-9]/gi, "_") || "Application"}.html`;

      // Use background script to download
      chrome.runtime.sendMessage({
        action: "downloadFile",
        url: url,
        filename: filename,
      });

      // Also try direct download
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

      return filename;
    },

    // Generate actual PDF using canvas (more compatible)
    async generateActualPDF(coverLetterText, candidateName, companyName) {
      // Create hidden iframe for printing
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:absolute;left:-9999px;top:-9999px;width:8.5in;height:11in;";
      document.body.appendChild(iframe);

      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #222;
      padding: 0.75in;
      background: white;
    }
    .header { 
      margin-bottom: 0.3in;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 0.15in;
    }
    .name { 
      font-size: 24pt; 
      font-weight: bold;
      color: #1e40af;
      letter-spacing: 0.5pt;
    }
    .date { 
      margin: 0.3in 0;
      color: #555;
    }
    .content p {
      margin-bottom: 0.15in;
      text-align: justify;
    }
    .signature {
      margin-top: 0.3in;
    }
    .signature-name {
      font-weight: bold;
      margin-top: 0.5in;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="name">${candidateName || "Cover Letter"}</div>
  </div>
  <div class="date">${today}</div>
  <div class="content">
    ${coverLetterText
      .split("\n\n")
      .map((p) => (p.trim() ? `<p>${p.replace(/\n/g, "<br>")}</p>` : ""))
      .join("\n")}
  </div>
  <div class="signature">
    <p>Sincerely,</p>
    <p class="signature-name">${candidateName || ""}</p>
  </div>
</body>
</html>`);
      doc.close();

      // Wait for render
      await new Promise((r) => setTimeout(r, 500));

      // Create filename
      const safeCompany = (companyName || "Application").replace(
        /[^a-z0-9]/gi,
        "_",
      );
      const safeName = (candidateName || "Candidate").replace(/\s+/g, "_");
      const filename = `Cover_Letter_${safeName}_${safeCompany}.pdf`;

      // Try using window.print() in iframe
      try {
        iframe.contentWindow.print();

        // Show download notification
        this.showNotification(
          "📄 Please save as PDF in the print dialog!",
          "info",
        );

        // Clean up after delay
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 5000);

        return filename;
      } catch (e) {
        console.error("Print failed:", e);
        document.body.removeChild(iframe);

        // Fallback to HTML download
        return this.generatePDF(coverLetterText, candidateName, companyName);
      }
    },

    // Show notification
    showNotification(message, type = "success") {
      const notif = document.createElement("div");
      notif.className = "jaf-notification";
      notif.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === "success" ? "#22c55e" : type === "error" ? "#ef4444" : "#8b5cf6"};
        color: white;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 999999;
        animation: jaf-slide-in 0.3s ease;
      `;
      notif.textContent = message;
      document.body.appendChild(notif);

      setTimeout(() => {
        notif.style.animation = "jaf-slide-out 0.3s ease forwards";
        setTimeout(() => notif.remove(), 300);
      }, 4000);
    },

    // Create cover letter panel UI
    createCoverLetterPanel() {
      const panel = document.createElement("div");
      panel.className = "jaf-cover-letter-panel";
      panel.innerHTML = `
        <div class="jaf-cl-header">
          <h3>📝 Cover Letter Generator</h3>
          <button class="jaf-cl-close">×</button>
        </div>
        <div class="jaf-cl-content">
          <div class="jaf-cl-preview">
            <div class="jaf-cl-loading">
              <div class="jaf-cl-spinner"></div>
              <p>Generating your cover letter...</p>
            </div>
            <div class="jaf-cl-text" style="display: none;"></div>
          </div>
          <div class="jaf-cl-actions" style="display: none;">
            <button class="jaf-cl-btn jaf-cl-copy">📋 Copy</button>
            <button class="jaf-cl-btn jaf-cl-download">⬇️ Download PDF</button>
            <button class="jaf-cl-btn jaf-cl-regenerate">🔄 Regenerate</button>
          </div>
        </div>
      `;

      // Styles
      const style = document.createElement("style");
      style.textContent = `
        .jaf-cover-letter-panel {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 700px;
          max-width: 90vw;
          max-height: 80vh;
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          z-index: 999999;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .jaf-cl-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
        }
        .jaf-cl-header h3 {
          margin: 0;
          font-size: 18px;
        }
        .jaf-cl-close {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          font-size: 20px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .jaf-cl-close:hover {
          background: rgba(255,255,255,0.3);
        }
        .jaf-cl-content {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }
        .jaf-cl-preview {
          min-height: 200px;
        }
        .jaf-cl-loading {
          text-align: center;
          padding: 60px 20px;
          color: #666;
        }
        .jaf-cl-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e2e8f0;
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: jaf-spin 0.8s linear infinite;
          margin: 0 auto 16px;
        }
        @keyframes jaf-spin {
          to { transform: rotate(360deg); }
        }
        .jaf-cl-text {
          font-family: Georgia, serif;
          font-size: 14px;
          line-height: 1.7;
          color: #333;
          white-space: pre-wrap;
          padding: 20px;
          background: #fafafa;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .jaf-cl-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
          justify-content: center;
        }
        .jaf-cl-btn {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .jaf-cl-copy {
          background: #e2e8f0;
          color: #475569;
        }
        .jaf-cl-download {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
        }
        .jaf-cl-regenerate {
          background: #f1f5f9;
          color: #64748b;
        }
        .jaf-cl-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .jaf-cl-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 999998;
        }
      `;
      document.head.appendChild(style);

      // Create overlay
      const overlay = document.createElement("div");
      overlay.className = "jaf-cl-overlay";
      document.body.appendChild(overlay);
      document.body.appendChild(panel);

      // Close handlers
      const closePanel = () => {
        panel.remove();
        overlay.remove();
      };

      panel
        .querySelector(".jaf-cl-close")
        .addEventListener("click", closePanel);
      overlay.addEventListener("click", closePanel);

      return {
        panel,
        overlay,
        close: closePanel,
        showLoading: () => {
          panel.querySelector(".jaf-cl-loading").style.display = "block";
          panel.querySelector(".jaf-cl-text").style.display = "none";
          panel.querySelector(".jaf-cl-actions").style.display = "none";
        },
        showContent: (text) => {
          panel.querySelector(".jaf-cl-loading").style.display = "none";
          panel.querySelector(".jaf-cl-text").style.display = "block";
          panel.querySelector(".jaf-cl-text").textContent = text;
          panel.querySelector(".jaf-cl-actions").style.display = "flex";
        },
        showError: (msg) => {
          panel.querySelector(".jaf-cl-loading").innerHTML = `
            <div style="color: #ef4444; font-size: 48px;">⚠️</div>
            <p style="color: #ef4444;">${msg}</p>
          `;
        },
      };
    },

    // Main function to generate and show cover letter
    async generateAndShow() {
      const ui = this.createCoverLetterPanel();
      ui.showLoading();

      try {
        // Get profile data
        const profileData = await chrome.storage.sync.get(null);

        // Extract job details from page
        const jobDetails = this.extractJobDetails();

        if (
          !jobDetails.title &&
          !jobDetails.company &&
          !jobDetails.description
        ) {
          ui.showError("Could not detect job details on this page.");
          return;
        }

        // Generate cover letter
        const coverLetter = await this.generateCoverLetter(
          jobDetails,
          profileData,
        );

        ui.showContent(coverLetter);

        // Store generated letter
        const generated =
          (await chrome.storage.sync.get("generatedCoverLetters"))
            .generatedCoverLetters || [];
        generated.push({
          id: `cl_${Date.now()}`,
          company: jobDetails.company,
          title: jobDetails.title,
          content: coverLetter,
          generatedAt: Date.now(),
          url: window.location.href,
        });
        await chrome.storage.sync.set({
          generatedCoverLetters: generated.slice(-20),
        });

        // Button handlers
        ui.panel.querySelector(".jaf-cl-copy").addEventListener("click", () => {
          navigator.clipboard.writeText(coverLetter);
          this.showNotification("📋 Cover letter copied!");
        });

        ui.panel
          .querySelector(".jaf-cl-download")
          .addEventListener("click", async () => {
            const name =
              profileData.fullName ||
              profileData.firstName + " " + profileData.lastName ||
              "Candidate";
            await this.generateActualPDF(coverLetter, name, jobDetails.company);
          });

        ui.panel
          .querySelector(".jaf-cl-regenerate")
          .addEventListener("click", async () => {
            ui.showLoading();
            const newLetter = await this.generateCoverLetter(
              jobDetails,
              profileData,
            );
            ui.showContent(newLetter);
          });
      } catch (err) {
        console.error("Cover letter error:", err);
        ui.showError(`Error: ${err.message}`);
      }
    },
  };
})();
