# Job Application Autofill - Chrome Extension

A minimalist Chrome extension to auto-fill job application forms with your saved profile data. Now with AI-powered cover letter generation!

## ✨ New Features (v1.1)

- **🧠 Smart AI Chatbox** - Conversational AI that detects ALL fields, compares with your data, and asks for missing info naturally
- **📄 PDF Cover Letter Generator** - One-click professional cover letters with automatic download
- **💼 Workday Form Detection** - Specialized support for Workday's complex multi-entry forms (Work History 1, 2, 3... Education, Skills)
- **📊 Quick Stats Dashboard** - Track your applications at a glance
- **💾 Export Profile Backup** - Backup all your stored data to JSON
- **🌙 Dark Mode Support** - Automatic dark mode when your system prefers it
- **⚡ Efficient AI Models** - Uses GPT-4o-mini for fast, cost-effective responses

## Features

- **One-click autofill** - Fill entire forms instantly
- **Per-field buttons** - "Fill" button appears next to each detected field
- **Fill All Panel** - Top-left panel on job pages with one-click fill all
- **Smart field detection** - Works with Greenhouse, Lever, Workday, and most ATS systems
- **AI Cover Letters** - Generate personalized cover letters using OpenAI GPT-4
- **AI Assistant Chatbox** - Natural conversation to fill missing fields
- **Smart CV Selection** - Suggests which CV to upload based on job title
- **CV Management** - Store multiple CVs with descriptive names (e.g., "Sales CV", "Tech CV")
- **Profile sync** - Your data syncs across devices via Chrome
- **Export/Import** - Backup and restore your profile
- **Stats tracking** - See how many fields you've filled

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `job-autofill-extension` folder

## Setup

1. Click the extension icon in your toolbar
2. Fill in your profile information (tabs: Profile, Work, Links)
3. Add your CVs in the **Docs** tab with descriptive names
4. (Optional) Add your OpenAI API key in the **AI** tab for cover letter generation
5. Click **Save All Settings**

## Usage

### Method 1: Per-Field Buttons

- On job pages, small "Fill" buttons appear next to each detected field
- Click individual buttons to fill specific fields
- "AI Write" button appears on cover letter textareas

### Method 2: Fill All Panel

- A panel appears in the top-left corner on job pages
- Shows how many fields can be filled
- Suggests which CV to upload based on the job
- Click "Fill All Fields" to autofill everything

### Method 3: Extension Popup

1. Go to any job application page
2. Click the extension icon
3. Click **Autofill This Page**

## AI Cover Letters

1. Get an OpenAI API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Add it in the **AI** tab
3. Optionally add context about yourself and paste your CV content
4. On job pages, click "AI Write" button on cover letter fields
5. The AI generates a personalized letter based on your profile + the job description

## CV Management

- Add multiple CVs in the **Docs** tab
- Name them descriptively (e.g., "Sales CV", "Tech CV", "General CV")
- The extension analyzes the job posting and suggests the best match
- Note: Due to browser security, files can't be auto-attached, but you'll see which one to upload

## Supported Job Boards

Works with most major ATS platforms, including those embedded in iframes:

- Greenhouse (including embedded iframes on company sites like Stripe)
- Lever
- Workday
- SmartRecruiters
- Jobvite
- Taleo
- iCIMS
- Ashby
- Recruitee
- And most custom application forms

**Note:** The extension now works seamlessly with embedded application forms (iframes), such as Greenhouse job boards embedded on company career pages.

## Icons

The extension needs icon files. You can generate them from the SVG or use any 16x16, 48x48, and 128x128 PNG images named:

- `icons/icon16.png`
- `icons/icon48.png`
- `icons/icon128.png`

Quick way to create them (if you have ImageMagick):

```bash
convert -background none -resize 16x16 icons/icon.svg icons/icon16.png
convert -background none -resize 48x48 icons/icon.svg icons/icon48.png
convert -background none -resize 128x128 icons/icon.svg icons/icon128.png
```

Or just use any square PNG images.

## Files

```
job-autofill-extension/
├── manifest.json              # Extension config
├── popup.html                 # Extension popup UI
├── popup.js                   # Popup logic
├── content.js                 # Form detection & filling
├── content.css                # Injected styles
├── background.js              # Service worker
├── workday-detector.js        # Workday form specialized detection
├── smart-chatbox.js           # AI chatbox module
├── cover-letter-generator.js  # PDF cover letter generation
├── pdf.min.js                 # PDF.js for document parsing
├── pdf.worker.min.js          # PDF.js worker
├── icons/
│   ├── icon.svg               # Source icon
│   ├── icon16.png             # Toolbar icon
│   ├── icon48.png             # Extension page icon
│   └── icon128.png            # Store icon
└── README.md
```

## Privacy

- All data stored locally via Chrome's sync storage
- OpenAI API calls only made when you use AI features
- No external servers or tracking (except OpenAI when you choose to use AI)
- Only you can see your profile data
- Export your data anytime with the backup feature
