// Workday Form Detection Module
// Detects and handles Workday-style complex job application forms
// (Work History, Education, Skills sections with multiple entries)

(function() {
  'use strict';

  // Export for use in content.js
  window.WorkdayDetector = {
    // Detect if current page is a Workday application
    isWorkdayPage() {
      const url = window.location.href.toLowerCase();
      const pageText = document.body?.innerText?.toLowerCase() || '';
      
      const workdayIndicators = [
        'myworkdayjobs.com',
        'workday.com',
        'wd5.myworkday',
        'wd3.myworkday',
        'wd1.myworkday'
      ];
      
      const contentIndicators = [
        'work history',
        'my experience',
        'add another',
        'i currently work here',
        'role description',
        'education (optional)',
        'skills and strengths'
      ];
      
      const urlMatch = workdayIndicators.some(p => url.includes(p));
      const textMatch = contentIndicators.filter(p => pageText.includes(p)).length >= 2;
      
      return urlMatch || textMatch;
    },

    // Detect all Workday sections and fields
    detectWorkdaySections() {
      const sections = [];
      
      // Work History sections
      const workHistoryPattern = /work\s*history\s*\(optional\)\s*(\d+)?/i;
      const educationPattern = /education\s*\(optional\)\s*(\d+)?/i;
      const skillsPattern = /skills\s*and\s*strengths/i;
      
      // Find all section containers
      const allContainers = document.querySelectorAll('[data-automation-id], [class*="field"], [class*="section"], fieldset, .workExperience, .educationSection');
      
      allContainers.forEach(container => {
        const text = container.textContent;
        
        if (workHistoryPattern.test(text)) {
          sections.push({
            type: 'workHistory',
            element: container,
            fields: this.extractWorkHistoryFields(container)
          });
        } else if (educationPattern.test(text)) {
          sections.push({
            type: 'education',
            element: container,
            fields: this.extractEducationFields(container)
          });
        } else if (skillsPattern.test(text)) {
          sections.push({
            type: 'skills',
            element: container,
            fields: this.extractSkillsFields(container)
          });
        }
      });
      
      return sections;
    },

    // Extract work history fields from a section
    extractWorkHistoryFields(container) {
      const fields = {};
      
      // Field patterns for Workday work history
      const fieldPatterns = {
        jobTitle: /job\s*title/i,
        company: /company/i,
        location: /location/i,
        currentlyWorkHere: /currently\s*work\s*here/i,
        fromMonth: /from.*month/i,
        fromYear: /from.*year/i,
        toMonth: /to.*month/i,
        toYear: /to.*year/i,
        roleDescription: /role\s*description/i
      };
      
      const inputs = container.querySelectorAll('input, textarea, select');
      
      inputs.forEach(input => {
        const label = this.findFieldLabel(input, container);
        if (!label) return;
        
        for (const [fieldType, pattern] of Object.entries(fieldPatterns)) {
          if (pattern.test(label)) {
            fields[fieldType] = {
              element: input,
              label: label,
              value: input.value || '',
              type: input.tagName.toLowerCase()
            };
            break;
          }
        }
      });
      
      // Also look for date dropdowns (MM/YYYY format)
      const dateInputs = container.querySelectorAll('[data-automation-id*="date"], [class*="date"], select[name*="month"], select[name*="year"]');
      dateInputs.forEach(input => {
        const nearbyText = this.getNearbyText(input);
        if (/from/i.test(nearbyText)) {
          if (input.name?.includes('month') || input.className?.includes('month')) {
            fields.fromMonth = { element: input, label: 'From Month', value: input.value };
          } else if (input.name?.includes('year') || input.className?.includes('year')) {
            fields.fromYear = { element: input, label: 'From Year', value: input.value };
          }
        } else if (/to/i.test(nearbyText)) {
          if (input.name?.includes('month') || input.className?.includes('month')) {
            fields.toMonth = { element: input, label: 'To Month', value: input.value };
          } else if (input.name?.includes('year') || input.className?.includes('year')) {
            fields.toYear = { element: input, label: 'To Year', value: input.value };
          }
        }
      });
      
      return fields;
    },

    // Extract education fields
    extractEducationFields(container) {
      const fields = {};
      
      const fieldPatterns = {
        school: /school|university|college|institution/i,
        degree: /degree|diploma|qualification/i,
        fieldOfStudy: /field\s*of\s*study|major|concentration/i,
        fromYear: /from/i,
        toYear: /to.*expected/i
      };
      
      const inputs = container.querySelectorAll('input, textarea, select');
      
      inputs.forEach(input => {
        const label = this.findFieldLabel(input, container);
        if (!label) return;
        
        for (const [fieldType, pattern] of Object.entries(fieldPatterns)) {
          if (pattern.test(label)) {
            fields[fieldType] = {
              element: input,
              label: label,
              value: input.value || '',
              type: input.tagName.toLowerCase()
            };
            break;
          }
        }
      });
      
      return fields;
    },

    // Extract skills fields
    extractSkillsFields(container) {
      const fields = {};
      
      // Look for multi-select or tag input
      const skillInputs = container.querySelectorAll('input[type="text"], [role="combobox"], [class*="tag"], [class*="skill"]');
      
      skillInputs.forEach((input, index) => {
        fields[`skill_${index}`] = {
          element: input,
          label: 'Skill',
          value: input.value || '',
          type: 'skill'
        };
      });
      
      // Look for already selected skills
      const selectedSkills = container.querySelectorAll('[class*="selected"], [class*="chip"], [class*="tag"]');
      const existingSkills = [];
      selectedSkills.forEach(skill => {
        const text = skill.textContent.trim();
        if (text && text.length < 50) {
          existingSkills.push(text);
        }
      });
      
      if (existingSkills.length > 0) {
        fields.existingSkills = existingSkills;
      }
      
      return fields;
    },

    // Find label for a field within a container
    findFieldLabel(input, container) {
      // Try aria-label
      if (input.getAttribute('aria-label')) {
        return input.getAttribute('aria-label');
      }
      
      // Try associated label
      if (input.id) {
        const label = container.querySelector(`label[for="${input.id}"]`);
        if (label) return label.textContent.trim();
      }
      
      // Try parent label
      const parentLabel = input.closest('label');
      if (parentLabel) return parentLabel.textContent.trim();
      
      // Try preceding element
      const prevEl = input.previousElementSibling;
      if (prevEl && (prevEl.tagName === 'LABEL' || prevEl.classList.contains('label'))) {
        return prevEl.textContent.trim();
      }
      
      // Try container with label-like class
      const labelContainer = input.closest('[class*="field"], [class*="form-group"]');
      if (labelContainer) {
        const labelEl = labelContainer.querySelector('label, .label, [class*="label"]');
        if (labelEl) return labelEl.textContent.trim();
      }
      
      // Try placeholder
      if (input.placeholder) return input.placeholder;
      
      return null;
    },

    // Get nearby text for context
    getNearbyText(element) {
      const parent = element.parentElement;
      if (!parent) return '';
      return parent.textContent.substring(0, 100);
    },

    // Build structured data requirement for the page
    buildPageRequirements() {
      const requirements = {
        workHistory: [],
        education: [],
        skills: [],
        basicInfo: [],
        questions: []
      };
      
      // Detect Workday sections
      const sections = this.detectWorkdaySections();
      sections.forEach(section => {
        if (section.type === 'workHistory') {
          const workEntry = {
            index: requirements.workHistory.length + 1,
            fields: section.fields,
            missing: []
          };
          
          // Check which fields are empty
          Object.entries(section.fields).forEach(([key, field]) => {
            if (!field.value || field.value.trim() === '') {
              workEntry.missing.push({
                key,
                label: field.label
              });
            }
          });
          
          requirements.workHistory.push(workEntry);
        } else if (section.type === 'education') {
          const eduEntry = {
            index: requirements.education.length + 1,
            fields: section.fields,
            missing: []
          };
          
          Object.entries(section.fields).forEach(([key, field]) => {
            if (!field.value || field.value.trim() === '') {
              eduEntry.missing.push({
                key,
                label: field.label
              });
            }
          });
          
          requirements.education.push(eduEntry);
        } else if (section.type === 'skills') {
          requirements.skills.push(section.fields);
        }
      });
      
      // Also detect basic info fields
      const basicFields = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="url"]');
      basicFields.forEach(input => {
        // Skip if part of a work history section
        if (input.closest('[class*="workHistory"], [class*="education"]')) return;
        
        const label = this.findFieldLabel(input, document.body);
        if (label && !input.value) {
          requirements.basicInfo.push({
            element: input,
            label: label,
            type: 'basic'
          });
        }
      });
      
      // Detect open-ended questions
      const textareas = document.querySelectorAll('textarea');
      textareas.forEach(textarea => {
        const label = this.findFieldLabel(textarea, document.body);
        if (label && !textarea.value) {
          requirements.questions.push({
            element: textarea,
            label: label,
            type: 'question'
          });
        }
      });
      
      return requirements;
    },

    // Calculate total fields needed
    getTotalFieldsNeeded(requirements) {
      let total = 0;
      
      requirements.workHistory.forEach(w => {
        total += w.missing.length;
      });
      
      requirements.education.forEach(e => {
        total += e.missing.length;
      });
      
      total += requirements.basicInfo.length;
      total += requirements.questions.length;
      
      return total;
    },

    // Fill a work history entry
    async fillWorkHistoryEntry(entry, data) {
      const fields = entry.fields;
      const results = [];
      
      // Fill each field
      if (fields.jobTitle?.element && data.jobTitle) {
        this.fillField(fields.jobTitle.element, data.jobTitle);
        results.push('Job Title');
      }
      
      if (fields.company?.element && data.company) {
        this.fillField(fields.company.element, data.company);
        results.push('Company');
      }
      
      if (fields.location?.element && data.location) {
        this.fillField(fields.location.element, data.location);
        results.push('Location');
      }
      
      if (fields.roleDescription?.element && data.description) {
        this.fillField(fields.roleDescription.element, data.description);
        results.push('Role Description');
      }
      
      // Handle date fields
      if (data.fromMonth && data.fromYear) {
        if (fields.fromMonth?.element) {
          await this.fillDateDropdown(fields.fromMonth.element, data.fromMonth);
        }
        if (fields.fromYear?.element) {
          await this.fillDateDropdown(fields.fromYear.element, data.fromYear);
        }
        results.push('Start Date');
      }
      
      if (data.toMonth && data.toYear) {
        if (fields.toMonth?.element) {
          await this.fillDateDropdown(fields.toMonth.element, data.toMonth);
        }
        if (fields.toYear?.element) {
          await this.fillDateDropdown(fields.toYear.element, data.toYear);
        }
        results.push('End Date');
      }
      
      return results;
    },

    // Fill a single field
    fillField(element, value) {
      if (!element || !value) return false;
      
      const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      
      if (desc && desc.set) {
        desc.set.call(element, value);
      } else {
        element.value = value;
      }
      
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      
      return true;
    },

    // Fill a date dropdown
    async fillDateDropdown(element, value) {
      if (element.tagName === 'SELECT') {
        // Find matching option
        const options = Array.from(element.options);
        const match = options.find(opt => 
          opt.value === value.toString() || 
          opt.text.includes(value.toString())
        );
        
        if (match) {
          element.value = match.value;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      } else {
        // Input field - just type
        this.fillField(element, value.toString());
        return true;
      }
      return false;
    }
  };
})();
