# Admin Panel + One-Time Link Setup

This adds:

1. A **Tokens** sheet tab (auto-created on first run) that stores generated one-time intake links.
2. An **Admin Web App** (separate URL) where staff can:
   - Generate a one-time intake link for a specific customer (with QR code, copy, email, SMS)
   - See all generated links + their status (Unused / Used / Revoked)
   - Revoke links that haven't been used yet
3. Token enforcement on the public intake form: if a customer arrives via `?token=xxx`,
   the form validates it on load and the Apps Script rejects the submission if the
   token is invalid, used, or revoked.

The plain Vercel URL (no token) still works for office staff submitting walk-ins,
unchanged.

---

## 1. Update the script files

Two files in `google-apps-script/`:

- `Code.gs` — paste the full contents into your existing `Code.gs` in the Apps Script editor (replace everything).
- `Admin.html` — in the Apps Script editor, click **+ → HTML**, name it exactly **`Admin`** (no extension), and paste the full contents.

## 2. Configure constants at the top of `Code.gs`

```javascript
var ADMIN_EMAILS = [
  "you@nystorage.com",
  // add other staff work emails
];

var PUBLIC_INTAKE_URL = "https://your-vercel-domain.vercel.app/intake";
```

- `ADMIN_EMAILS` — every work email allowed into the admin panel.
- `PUBLIC_INTAKE_URL` — the public intake page on Vercel. Tokens are appended as `?token=...`.

Save the project (Ctrl/Cmd-S).

## 3. Initialize the Tokens sheet

In the Apps Script editor, select the function `testSetup` from the dropdown and click **Run**. Authorize when prompted. Check the execution log — you should see:

```
✅ Sheet connected
✅ Drive folder connected
✅ Sheet tab ready
✅ Tokens tab ready
```

Open the Google Sheet to confirm a new **Tokens** tab now exists with headers.

## 4. Two web app deployments (important)

You'll have **two** deployments from the same script — one for the form (anonymous), one for the admin (authenticated).

### Deployment A — Form (probably already exists)

Settings:
- Description: `Intake Form (public)`
- Execute as: **Me**
- Who has access: **Anyone**

This URL goes into Vercel as `NEXT_PUBLIC_GAS_URL`. **Keep using your existing one** — you do **not** need to redeploy it just for this change. Just push the new code via **Deploy → Manage deployments → pencil → New version**.

### Deployment B — Admin (new)

In the Apps Script editor: **Deploy → New deployment → Web app**:
- Description: `Intake Admin`
- Execute as: **User accessing the web app**  ← critical
- Who has access: **Anyone with Google Account** (or, if your domain is Google Workspace, **Anyone in <your-domain>**)
- Click **Deploy** and copy the resulting URL.

Bookmark this URL — that's your admin panel. Anyone signed into a non-allowlisted Google account will see "Access Denied".

> Why two deployments? The form needs to accept anonymous POSTs from Vercel, so it has to run as you. The admin needs to know **which** staff member is logged in, which only works when "Execute as: User accessing".

## 5. Push the frontend changes to Vercel

The frontend is already wired up:

- Customers visiting `https://your-vercel-domain.vercel.app/intake?token=abc...` will have the link verified before they see the form.
- If the link is used / revoked / unknown, they see a "Link Unavailable" screen.
- The token is sent with the submission and the Apps Script marks it as **Used** in the Tokens sheet.
- Office staff visiting the bare `/intake` URL (no token) still submit normally.

```
git add -A
git commit -m "Add one-time intake links + admin panel"
git push
```

Vercel will rebuild automatically.

## 6. Daily use

- Open the **Admin URL** (Deployment B) in a tab while signed into your work email.
- Type a customer name (and optionally email/phone/notes) → **Generate Link**.
- Click **Copy**, **Email it**, or **Text it** — or hand the customer the QR code.
- The **Generated Links** table shows everything you've created. Use **Revoke** to kill any unused link.

The customer can open the link only once. After they submit, the row in the Tokens sheet flips to **Used** and points to the submission folder name. Any second visit shows the "Link Unavailable" screen.

---

## FAQ

**Does this cost anything?** No. Apps Script web apps and storage are free with your Google account; Vercel's free tier handles the frontend. No third-party services involved.

**What if a customer's link doesn't work?** Open the admin panel and generate a fresh one. Old link can be deleted from the sheet if you want.

**What if I want to allow walk-ins through a custom kiosk?** They use the bare `/intake` URL with no token — works exactly as before.

**Where do I see who created which link?** The Tokens sheet has a `Created By` column with the staff member's email.
