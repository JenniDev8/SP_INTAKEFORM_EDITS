# Storage Plus – Tenant Intake System

A professional, multi-section intake form for Storage Plus with 4 locations. Built with **Next.js**, styled with **Tailwind CSS**, deployed on **Vercel**, and connected to **Google Sheets + Google Drive** via **Google Apps Script**.

---

## What This Does

- Tenant fills out a full intake form on any device
- On submit, all data is written to a **centralized Google Sheet**
- ID photos (front/back) and the signature are uploaded to a **Google Drive folder**
- **No credit card numbers** are stored anywhere in this system
- After submission, the form resets and returns to the welcome screen
- 4 locations are selectable via a dropdown

---

## Project Structure

```
storage-plus-intake/
├── app/
│   ├── layout.jsx          # Root layout (fonts, metadata)
│   ├── globals.css         # Tailwind + custom styles
│   ├── page.jsx            # Welcome screen (/)
│   └── intake/
│       └── page.jsx        # Intake form (/intake)
├── components/
│   ├── IntakeForm.jsx      # Main form (all sections)
│   └── SignaturePad.jsx    # Canvas signature widget
├── lib/
│   └── submitForm.js       # POST to Google Apps Script
├── google-apps-script/
│   └── Code.gs             # Apps Script web app
├── .env.local.example      # Environment variable template
├── vercel.json             # Vercel config
└── package.json
```

---

## Setup Guide

### Step 1 – Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/storage-plus-intake.git
cd storage-plus-intake
npm install
```

### Step 2 – Update Location Names

Open `components/IntakeForm.jsx` and find the `LOCATIONS` array at the top. Replace the placeholder names with your 4 actual location names:

```js
const LOCATIONS = [
  "Storage Plus – Bronx (Main St)",
  "Storage Plus – Queens (Jamaica Ave)",
  "Storage Plus – Brooklyn (Atlantic Ave)",
  "Storage Plus – Manhattan (W 125th St)",
];
```

### Step 3 – Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it **"Storage Plus Intakes"** (or anything you like)
3. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit
   ```

> The Apps Script will automatically create the **Intakes** tab and headers on first submission.

### Step 4 – Create the Google Drive Folder

1. Go to [drive.google.com](https://drive.google.com)
2. Create a new folder called **"Storage Plus – ID Documents"**
3. Copy the Folder ID from its URL:
   ```
   https://drive.google.com/drive/folders/THIS_IS_YOUR_FOLDER_ID
   ```

> Each submission creates a sub-folder named `LastName_FirstName_YYYY-MM-DD` containing the ID front, ID back, and signature image.

### Step 5 – Set Up the Google Apps Script

1. Go to [script.google.com](https://script.google.com) → **New Project**
2. Rename the project to **"Storage Plus Intake Handler"**
3. Delete the default code and paste the entire contents of `google-apps-script/Code.gs`
4. Update the two constants at the top:
   ```js
   var SHEET_ID = "paste-your-sheet-id-here";
   var DRIVE_FOLDER_ID = "paste-your-folder-id-here";
   ```
5. **Run the `testSetup` function** first to confirm both IDs work (check the Logs)
6. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy** → copy the **Web App URL** (it looks like `https://script.google.com/macros/s/.../exec`)

> ⚠️ Every time you change the Apps Script code, you must create a **New Deployment** (not edit existing) for changes to take effect.

### Step 6 – Configure Environment Variables Locally

```bash
cp .env.local.example .env.local
```

Open `.env.local` and set:

```
NEXT_PUBLIC_GAS_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

### Step 7 – Test Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), fill out the form, and submit. Check your Google Sheet and Drive folder for the entry.

---

## Deploy to Vercel via GitHub

### Push to GitHub

```bash
git add .
git commit -m "Initial Storage Plus intake system"
git push origin main
```

### Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. In **Environment Variables**, add:
   - Key: `NEXT_PUBLIC_GAS_URL`
   - Value: your Apps Script web app URL
4. Click **Deploy**

> Vercel auto-deploys on every push to `main`.

---

## Google Apps Script CORS Note

Google Apps Script web apps require `mode: 'no-cors'` on the client. This means the browser treats the response as opaque (you cannot read it), but the data IS sent and received correctly. The form assumes success if no network error is thrown.

To debug issues, check **Apps Script → Executions** to see server-side logs.

---

## Customization Checklist

- [ ] Replace the 4 location names in `IntakeForm.jsx`
- [ ] Set your Google Sheet ID in `Code.gs`
- [ ] Set your Google Drive Folder ID in `Code.gs`
- [ ] Set `NEXT_PUBLIC_GAS_URL` in `.env.local` and Vercel
- [ ] Optionally update the logo/branding in `page.jsx` and `IntakeForm.jsx`
- [ ] Run `testSetup()` in Apps Script editor to verify connections

---

## Security Notes

- Credit card numbers are **never collected or stored** by this form
- "Credit Card" payment method is recorded as a text field only (no numbers)
- ID images and signatures are stored in Google Drive, not the spreadsheet
- The Apps Script URL is public-facing but only accepts POST — no data is readable via GET
- Do **not** commit `.env.local` to GitHub (it is in `.gitignore`)
