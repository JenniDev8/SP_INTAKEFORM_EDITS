// =============================================================================
// Storage Plus – Intake Form Handler
// Google Apps Script Web App
//
// SETUP STEPS (see README):
//   1. Create a new Apps Script project at script.google.com
//   2. Paste this code
//   3. Set SHEET_ID and DRIVE_FOLDER_ID below
//   4. Deploy as Web App (Execute as: Me, Who can access: Anyone)
//   5. Copy the Web App URL into .env.local as NEXT_PUBLIC_GAS_URL
// =============================================================================

// ── CONFIGURATION ─────────────────────────────────────────────────────────────
// Replace these with your actual IDs

// Google Sheet ID (from its URL: .../spreadsheets/d/SHEET_ID/edit)
var SHEET_ID = "1FjuCY18qwszq5vi093auwjN4MFYMSGiea5KhENQbZJ8";

// Default / fallback Google Drive folder ID
// (used only if a submission's location doesn't match LOCATION_TO_FOLDER below)
var DRIVE_FOLDER_ID = "1BxDwPdx4p9V3tgmlMyAX5gz98v1seX5O";

// Per-location Drive folder IDs. Create a folder in Drive for each location,
// copy its ID from the URL (.../drive/folders/FOLDER_ID), and paste below.
// Leave as "" to fall back to the default DRIVE_FOLDER_ID for that location.
var LOCATION_TO_FOLDER = {
  "long island city": "1GIXzdhd8U2TLmvaktuk50aoeasX5F-GQ", // LIC
  "greenpoint":       "1yNRTIIxb5xBYaM1qLbELErTCca7fQ-MP", // GP
  "williamsburg":     "1JtlG53xjM-nD0ALy0cQj6_dNkJEJsLQd", // NYC
  "jamaica":          "1ChuW2gsFVOn9POGXqjJawX45t5vsECXn", // LIB
};

// Default / fallback sheet tab — used only if a submission's location doesn't
// match any entry in LOCATION_TO_TAB below.
var SHEET_TAB = "IntakeForm";

// Route each location to its own sheet tab. The key is matched
// case-insensitively against the start of `data.location`.
var LOCATION_TO_TAB = {
  "long island city": "LIC",
  "greenpoint":       "GP",
  "williamsburg":     "NYC",
  "jamaica":          "LIB",
};

// Email recipients per location. Every listed address gets a notification
// when a new intake form is submitted for that location. Add/remove as needed.
var LOCATION_TO_EMAILS = {
  "long island city": ["storageplus@nystorage.com", "romc@nystorage.com"],
  "greenpoint":       ["greenpoint@nystorage.com", "romc@nystorage.com"],
  "williamsburg":     ["nyc@nystorage.com", ],
  "jamaica":          ["liberty@nystorage.com",    "roman@nystorage.com"],
};

// Optional fallback — anyone here is always CC'd on every submission,
// regardless of location. Leave as [] to disable.
var ALWAYS_NOTIFY = [];

// ── EMAIL DIAGNOSTICS ─────────────────────────────────────────────────────────
// Run these from the Apps Script editor (pick function → click ▶ Run).
// If these functions don't appear in the dropdown after saving Code.gs,
// the editor hasn't picked up your changes yet — do File → Save (⌘S) first.
// If emails from these tests don't arrive either, the problem is with MailApp
// quota/delivery (check spam!), NOT with the form submission pipeline.

// Sends a bare-bones test email to every address configured for "williamsburg"
// (no attachments, no HTML, no form data) to confirm MailApp is working.
function testEmail() {
  var recipients = getEmailsForLocation("williamsburg");
  Logger.log("Resolved recipients for 'williamsburg': " + JSON.stringify(recipients));
  if (!recipients || recipients.length === 0) {
    Logger.log("❌ No recipients configured. Check LOCATION_TO_EMAILS['williamsburg'].");
    return;
  }
  MailApp.sendEmail({
    to: recipients.join(","),
    subject: "Storage Plus – test email (ignore)",
    body: "If you're reading this, MailApp + your Williamsburg recipient list work.\n\n— Storage Plus Intake",
    name: "Storage Plus Intake",
  });
  Logger.log("✅ Test email sent to: " + recipients.join(", "));
  Logger.log("MailApp quota remaining today: " + MailApp.getRemainingDailyQuota());
}

// Sends a sample Sales-only email to sales@nystorage.com so you can preview
// the minimal body and disclaimer formatting.
function testSalesEmail() {
  sendSalesIntakeNotification({
    firstName: "Test",
    lastName: "Customer",
    location: "Greenpoint – 425 Greenpoint Ave, Brooklyn, NY 11222",
  });
  Logger.log("✅ Sent Sales preview email to sales@nystorage.com");
}

// Simulates the full location → recipients resolution for EVERY configured
// location, without sending any email. Useful to verify the mapping.
function testLocationResolution() {
  var samples = [
    "Long Island City – 37-11 47th Avenue, Long Island City, NY 11101",
    "Greenpoint – 425 Greenpoint Ave, Brooklyn, NY 11222",
    "Williamsburg – 1053 Metropolitan Avenue, Brooklyn, NY 11211",
    "Jamaica – 130-17 Liberty Ave, South Richmond Hill, NY 11419",
  ];
  samples.forEach(function (loc) {
    Logger.log(loc + "  ⇒  " + JSON.stringify(getEmailsForLocation(loc)));
  });
}

// ── COLUMN ORDER (matches the sheet headers) ──────────────────────────────────
var COLUMNS = [
  "Timestamp",
  "Location",
  "Contract Type",
  "Business Name",
  "First Name",
  "Last Name",
  "Mailing Address",
  "Apt/Ste",
  "City",
  "State",
  "ZIP",
  "ZIP+4",
  "Phone Number(s)",
  "Email Address(es)",
  "Authorized Access",
  "Authorized Access Phone",
  "How Heard",
  "Reason For Storing",
  "Why Chose Us",
  "What Is Being Stored",
  "Payment Method",
  "Autopay",
  "Rental Start Date",
  "Unit Size",
  "Unit Dimensions",
  "Unit Monthly Rate",
  "Insurance",
  "Insurance Monthly Rate",
  "Reservation Status",
  "Reservation Note",
  "ID Front (Drive Link)",
  "ID Back (Drive Link)",
  "Signature (Drive Link)",
  "Intake PDF (Drive Link)",
];

// Translate internal wssStatus values into human-readable text for the sheet.
function formatWssStatus(status) {
  var s = String(status || "").toLowerCase();
  if (s === "reserved") return "Reserved in WSS";
  if (s === "skipped")  return "Skipped (Cash)";
  if (s === "failed")   return "Failed – manual entry needed";
  return "";
}

// ── TOKEN MANAGEMENT ──────────────────────────────────────────────────────────

var TOKENS_TAB = "Tokens";
var TOKEN_COLUMNS = ["Token", "Created At", "Label", "Used", "Used At"];

// GET handler — only used for token validation (called server-side from Next.js)
function doGet(e) {
  var params = e.parameter || {};
  if (params.action === "validateToken") {
    return handleValidateToken(params.token);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ error: "Unknown action" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleValidateToken(token) {
  if (!token) {
    return ContentService
      .createTextOutput(JSON.stringify({ valid: false, reason: "missing" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var sheet = getOrCreateTokenSheet();
  var result = findTokenRow(sheet, token);
  if (!result) {
    return ContentService
      .createTextOutput(JSON.stringify({ valid: false, reason: "not_found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var used = result.data[3];
  if (used === true || String(used).toUpperCase() === "TRUE") {
    return ContentService
      .createTextOutput(JSON.stringify({ valid: false, reason: "used" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ valid: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleCreateToken(label) {
  var token = Utilities.getUuid();
  var sheet = getOrCreateTokenSheet();
  sheet.appendRow([token, new Date().toISOString(), label || "", false, ""]);
  return ContentService
    .createTextOutput(JSON.stringify({ token: token }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleUseToken(token) {
  if (!token) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "Missing token" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var sheet = getOrCreateTokenSheet();
  var result = findTokenRow(sheet, token);
  if (!result) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "Token not found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  sheet.getRange(result.rowIndex, 4).setValue(true);
  sheet.getRange(result.rowIndex, 5).setValue(new Date().toISOString());
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateTokenSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(TOKENS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(TOKENS_TAB);
    sheet.getRange(1, 1, 1, TOKEN_COLUMNS.length).setValues([TOKEN_COLUMNS]);
    sheet.getRange(1, 1, 1, TOKEN_COLUMNS.length)
      .setBackground("#0F2044")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Returns { data: rowArray, rowIndex: 1basedInt } or null if not found
function findTokenRow(sheet, token) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, TOKEN_COLUMNS.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(token)) {
      return { data: data[i], rowIndex: i + 2 };
    }
  }
  return null;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Token management actions (called server-side from Next.js API routes)
    if (data.action === "createToken") return handleCreateToken(data.label || "");
    if (data.action === "useToken")    return handleUseToken(data.token || "");

    var tabName = getTabForLocation(data.location);
    var sheet = getOrCreateSheet(tabName);
    var folder = DriveApp.getFolderById(getFolderForLocation(data.location));

    // Create a sub-folder per submission named: LastName_FirstName_Timestamp
    var safeFirst = sanitizeName(data.firstName) || "Unknown";
    var safeLast = sanitizeName(data.lastName) || "Unknown";
    var label = safeLast + "_" + safeFirst + "_" + formatDate(new Date());
    var submissionFolder = folder.createFolder(label);

    // File name suffix: FirstName_LastName so each saved file is clearly labeled
    var nameSuffix = safeFirst + "_" + safeLast;

    // Save ID front image
    var idFrontLink = "";
    var idFrontBlob = base64ToBlob(data.idFront, "ID_Front_" + nameSuffix);
    if (idFrontBlob) {
      idFrontLink = submissionFolder.createFile(idFrontBlob).getUrl();
    }

    // Save ID back image
    var idBackLink = "";
    var idBackBlob = base64ToBlob(data.idBack, "ID_Back_" + nameSuffix);
    if (idBackBlob) {
      idBackLink = submissionFolder.createFile(idBackBlob).getUrl();
    }

    // Save signature image
    var signatureLink = "";
    var signatureBlob = base64ToBlob(data.signature, "Signature_" + nameSuffix);
    if (signatureBlob) {
      signatureLink = submissionFolder.createFile(signatureBlob).getUrl();
    }

    // Generate a clean printable PDF summary of the full intake form
    var intakePdfLink = "";
    var intakePdfFileId = "";
    try {
      var pdfResult = generateIntakePdf(
        submissionFolder,
        data,
        nameSuffix,
        idFrontBlob,
        idBackBlob,
        signatureBlob
      );
      if (pdfResult) {
        intakePdfLink = pdfResult.url || "";
        intakePdfFileId = pdfResult.fileId || "";
      }
    } catch (pdfErr) {
      Logger.log("PDF generation error: " + pdfErr.toString());
      Logger.log("Stack: " + (pdfErr.stack || "(no stack)"));
    }

    // Parse phones and emails into readable strings
    var phonesStr = formatPhones(data.phones);
    var emailsStr = formatEmails(data.emails);
    var accessNamesStr = formatAccessNames(data.additionalAccess);
    var accessPhonesStr = formatAccessPhones(data.additionalAccess);

    // Build the row — NO credit card numbers, just payment method
    var row = [
      data.timestamp || new Date().toISOString(),
      data.location || "",
      data.contractType || "",
      data.businessName || "",
      data.firstName || "",
      data.lastName || "",
      data.mailingAddress || "",
      "", // Apt/Ste is already combined in mailingAddress from the frontend
      data.city || "",
      data.state || "",
      data.zip || "",
      data.zipPlusFour || "",
      phonesStr,
      emailsStr,
      accessNamesStr,
      accessPhonesStr,
      data.howHeard || "",
      data.reasonForStoring || "",
      data.whyChose || "",
      data.whatStored || "",
      data.paymentMethod || "",   // "Credit Card" or "Cash" — no card number
      data.autopay || "",
      data.rentalStartDate || "",
      data.unitSize || "",
      data.unitDimensions || "",
      data.unitMonthlyRate || "",
      data.insuranceDescription || "",
      data.insuranceMonthlyRate || "",
      formatWssStatus(data.wssStatus),
      data.wssError || "",
      idFrontLink,
      idBackLink,
      signatureLink,
      intakePdfLink,
    ];

    sheet.appendRow(row);

    // Send notification email to the location team
    try {
      sendIntakeNotification({
        location: data.location,
        customerName: trim((data.firstName || "") + " " + (data.lastName || "")),
        businessName: data.businessName,
        folderUrl: submissionFolder.getUrl(),
        pdfUrl: intakePdfLink,
        pdfFileId: intakePdfFileId,
        idFrontBlob: idFrontBlob,
        idBackBlob: idBackBlob,
        wssStatus: data.wssStatus,
        wssError: data.wssError,
      });
    } catch (mailErr) {
      Logger.log("Notification email failed: " + mailErr.toString());
    }

    // Send a minimal notification to Sales only (no attachments, no sensitive fields)
    try {
      sendSalesIntakeNotification({
        location: data.location,
        firstName: data.firstName,
        lastName: data.lastName,
      });
    } catch (salesMailErr) {
      Logger.log("Sales notification email failed: " + salesMailErr.toString());
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, folder: label }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("ERROR: " + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── SHEET HELPER ──────────────────────────────────────────────────────────────

function getOrCreateSheet(tabName) {
  tabName = tabName || SHEET_TAB;
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(tabName);

  var needsHeaders = false;
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    needsHeaders = true;
  } else if (sheet.getLastRow() === 0) {
    // Existing but empty tab — populate headers on first use
    needsHeaders = true;
  }

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setBackground("#0F2044")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

// Map a full location string (e.g., "Greenpoint – 425 Greenpoint Ave…") to the
// correct sheet tab. Falls back to SHEET_TAB if no prefix matches.
function getTabForLocation(location) {
  var l = String(location || "").toLowerCase();
  if (!l) return SHEET_TAB;
  var keys = Object.keys(LOCATION_TO_TAB).sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    if (l.indexOf(keys[i]) === 0) return LOCATION_TO_TAB[keys[i]];
  }
  return SHEET_TAB;
}

// Map a full location string to the correct Drive folder ID.
// Falls back to DRIVE_FOLDER_ID if no match or if the mapped ID is blank.
function getFolderForLocation(location) {
  var l = String(location || "").toLowerCase();
  if (!l) return DRIVE_FOLDER_ID;
  var keys = Object.keys(LOCATION_TO_FOLDER).sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    if (l.indexOf(keys[i]) === 0) {
      var id = LOCATION_TO_FOLDER[keys[i]];
      if (id) return id;
    }
  }
  return DRIVE_FOLDER_ID;
}

// Return the list of email recipients for a given location (plus ALWAYS_NOTIFY).
function getEmailsForLocation(location) {
  var l = String(location || "").toLowerCase();
  var matched = [];
  if (l) {
    var keys = Object.keys(LOCATION_TO_EMAILS).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < keys.length; i++) {
      if (l.indexOf(keys[i]) === 0) {
        matched = LOCATION_TO_EMAILS[keys[i]] || [];
        break;
      }
    }
  }
  var combined = matched.concat(ALWAYS_NOTIFY || []);
  // De-duplicate, filter blanks
  var seen = {};
  var out = [];
  for (var j = 0; j < combined.length; j++) {
    var addr = String(combined[j] || "").trim().toLowerCase();
    if (addr && !seen[addr]) { seen[addr] = true; out.push(combined[j]); }
  }
  return out;
}

// Send the per-location notification email.
function sendIntakeNotification(info) {
  info = info || {};
  var recipients = getEmailsForLocation(info.location);
  if (!recipients || recipients.length === 0) {
    Logger.log("No email recipients configured for location: " + info.location);
    return;
  }

  var name = trim(info.customerName) || "(name not provided)";
  var business = trim(info.businessName || "");
  var wssStatusHuman = formatWssStatus(info.wssStatus);
  var wssError = trim(info.wssError || "");
  var failed = String(info.wssStatus || "").toLowerCase() === "failed";
  var subjectPrefix = failed ? "WSS Reservation Error – " : "";
  var subject = subjectPrefix + "New Intake Form Submitted – " + name;

  // Collect attachments (IDs + PDF)
  var attachments = [];
  try {
    if (info.idFrontBlob) attachments.push(info.idFrontBlob.copyBlob().setName("ID_Front_" + name + ".jpg"));
    if (info.idBackBlob)  attachments.push(info.idBackBlob.copyBlob().setName("ID_Back_"  + name + ".jpg"));
    if (info.pdfFileId) {
      var pdfBlob = DriveApp.getFileById(info.pdfFileId).getBlob();
      attachments.push(pdfBlob);
    }
  } catch (attErr) {
    Logger.log("Attachment error: " + attErr.toString());
  }

  // Plain-text fallback
  var plainLines = [
    "Hello,",
    "",
    "A new intake form has been submitted by: " + name,
  ];
  if (business) plainLines.push("Business: " + business);
  if (wssStatusHuman) plainLines.push("WSS Reservation Status: " + wssStatusHuman);
  if (failed && wssError) plainLines.push("WSS Failure Reason: " + wssError);
  plainLines.push("");
  plainLines.push("The ID photos and the intake PDF are attached to this email.");
  plainLines.push("");
  plainLines.push("You can also view everything in Drive here:");
  plainLines.push(info.folderUrl || "(folder link unavailable)");
  if (info.pdfUrl) {
    plainLines.push("");
    plainLines.push("Intake PDF: " + info.pdfUrl);
  }
  plainLines.push("");
  plainLines.push("— Storage Plus Intake System");

  // HTML body — matches the form's navy/red branding
  var brand = "#152C73";
  var accent = "#B22222";
  var softBg = "#F5F7FB";
  var border = "#E2E6EF";
  var textMuted = "#5B6270";

  var rowsHtml = "" +
    row("Customer", escapeHtml(name)) +
    (business ? row("Business", escapeHtml(business)) : "") +
    (wssStatusHuman ? row("WSS Status", escapeHtml(wssStatusHuman)) : "") +
    row("Submitted", escapeHtml(formatNiceDate(new Date().toISOString())));

  var wssAlertHtml = "";
  if (failed) {
    var wssLead =
      "An error with the customer's information caused the reservation to not go through to WSS. " +
      "However, the customer's intake information was collected successfully. Please review the intake form below.";
    wssAlertHtml =
      '<div style="border:1px solid ' + border + ';border-left:6px solid ' + accent + ';padding:12px 14px;border-radius:8px;background:#fff;margin:0 0 14px 0;">' +
        '<div style="font-weight:bold;color:' + accent + ';margin-bottom:6px;">WSS reservation did not go through</div>' +
        '<div style="color:#111;font-size:13px;line-height:1.35;">' +
          '<div style="margin:0 0 8px 0;">' + escapeHtml(wssLead) + '</div>' +
          '<div style="margin:0;color:#111;"><strong>Reason:</strong> ' + escapeHtml(wssError || "No error details were provided by WSS.") + '</div>' +
        '</div>' +
      '</div>';
  }

  var attachmentsNote = "The <strong>ID photos</strong> and the <strong>intake PDF</strong> are attached to this email.";

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:0 auto;">' +
      '<div style="background:' + brand + ';color:#fff;padding:18px 20px;border-radius:8px 8px 0 0;">' +
        '<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">Storage Plus</div>' +
        '<div style="font-size:20px;font-weight:bold;margin-top:2px;">' +
          (failed ? 'WSS Reservation Error – Intake Submitted' : 'New Intake Form Submitted') +
        '</div>' +
      '</div>' +
      '<div style="border:1px solid ' + border + ';border-top:none;padding:20px;border-radius:0 0 8px 8px;background:#fff;">' +
        '<p style="margin:0 0 12px 0;">Hello,</p>' +
        '<p style="margin:0 0 16px 0;">A new intake form has just been submitted.</p>' +
        wssAlertHtml +
        '<table role="presentation" style="width:100%;border-collapse:collapse;background:' + softBg + ';border:1px solid ' + border + ';border-radius:6px;margin-bottom:18px;">' +
          rowsHtml +
        '</table>' +
        '<p style="margin:0 0 16px 0;">' + attachmentsNote + '</p>' +
        '<div style="margin:18px 0;">' +
          (info.folderUrl
            ? '<a href="' + info.folderUrl + '" style="display:inline-block;background:' + brand + ';color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;margin-right:8px;">Open Drive Folder</a>'
            : '') +
          (info.pdfUrl
            ? '<a href="' + info.pdfUrl + '" style="display:inline-block;background:' + accent + ';color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">View Intake PDF</a>'
            : '') +
        '</div>' +
        '<p style="margin:18px 0 0 0;font-size:12px;color:' + textMuted + ';">This is an automated message from the Storage Plus Intake System.</p>' +
      '</div>' +
    '</div>';

  function row(label, value) {
    return '<tr>' +
      '<td style="padding:8px 12px;border-bottom:1px solid ' + border + ';color:' + textMuted + ';width:120px;font-size:13px;">' + label + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid ' + border + ';font-size:14px;"><strong>' + value + '</strong></td>' +
    '</tr>';
  }

  var mailOpts = {
    to: recipients.join(","),
    subject: subject,
    body: plainLines.join("\n"),
    htmlBody: html,
    name: "Storage Plus Intake",
  };
  if (attachments.length > 0) mailOpts.attachments = attachments;

  MailApp.sendEmail(mailOpts);

  Logger.log("Notification sent to: " + recipients.join(", ") +
             " | attachments: " + attachments.length);
}

// Send a minimal, sales-only notification.
// Requirements:
// - ONLY sales@nystorage.com receives this email
// - Include ONLY customer's first name, last name, and location
// - Must clearly state this is NOT a U-Haul reservation; it's an intake submission
function sendSalesIntakeNotification(info) {
  info = info || {};
  var to = "sales@nystorage.com";

  var first = trim(info.firstName) || "(first name not provided)";
  var last = trim(info.lastName) || "(last name not provided)";
  var location = trim(info.location) || "(location not provided)";

  var subject = "Intake Form Submission (Not a U-Haul Reservation) – " + first + " " + last;

  var plain = [
    "Intake form submission received.",
    "",
    "Customer: " + first + " " + last,
    "Location: " + location,
    "",
    "IMPORTANT: This is NOT a U-Haul reservation. This is an Intake Form submission.",
  ].join("\n");

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px;margin:0 auto;">' +
      '<h2 style="margin:0 0 10px 0;font-size:18px;">Intake Form Submission</h2>' +
      '<div style="padding:12px 14px;border:1px solid #E2E6EF;border-radius:8px;background:#F5F7FB;">' +
        '<p style="margin:0 0 8px 0;"><strong>Customer:</strong> ' + escapeHtml(first + " " + last) + '</p>' +
        '<p style="margin:0;"><strong>Location:</strong> ' + escapeHtml(location) + '</p>' +
      '</div>' +
      '<p style="margin:14px 0 0 0;color:#B22222;font-weight:bold;">IMPORTANT: This is NOT a U-Haul reservation. This is an Intake Form submission.</p>' +
    '</div>';

  MailApp.sendEmail({
    to: to,
    subject: subject,
    body: plain,
    htmlBody: html,
    name: "Storage Plus Intake",
  });

  Logger.log("Sales notification sent to: " + to);
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── BASE64 HELPER ─────────────────────────────────────────────────────────────
// Returns a Blob you can save to Drive and/or embed in a Doc (so we don't decode twice).

function base64ToBlob(base64String, prefix) {
  if (!base64String) return null;
  try {
    var parts = base64String.split(",");
    var mimeType = parts[0].split(":")[1].split(";")[0];
    var ext = mimeType.split("/")[1];
    var decoded = Utilities.base64Decode(parts[1]);
    return Utilities.newBlob(decoded, mimeType, prefix + "." + ext);
  } catch (err) {
    Logger.log("base64ToBlob error (" + prefix + "): " + err.toString());
    return null;
  }
}

// ── FORMAT HELPERS ────────────────────────────────────────────────────────────

function formatPhones(phonesJson) {
  try {
    var phones = JSON.parse(phonesJson || "[]");
    return phones
      .filter(function (p) { return p && p.number; })
      .map(function (p) {
        var line = p.number || "";
        if (p.ext) line += " ext " + p.ext;
        return line;
      })
      .join(" | ");
  } catch (e) {
    return phonesJson || "";
  }
}

function formatEmails(emailsJson) {
  try {
    var emails = JSON.parse(emailsJson || "[]");
    return emails
      .filter(function (em) { return em && em.address; })
      .map(function (em) { return em.address; })
      .join(" | ");
  } catch (e) {
    return emailsJson || "";
  }
}

function parseAccessPeople(accessJson) {
  try {
    var people = JSON.parse(accessJson || "[]");
    return people.filter(function (p) { return p && (p.name || p.phone); });
  } catch (e) {
    return [];
  }
}

function formatAccessNames(accessJson) {
  return parseAccessPeople(accessJson)
    .map(function (p) { return p.name || ""; })
    .join(" | ");
}

function formatAccessPhones(accessJson) {
  return parseAccessPeople(accessJson)
    .map(function (p) { return p.phone || ""; })
    .join(" | ");
}

// Kept for backwards compatibility if referenced elsewhere in this project.
function formatAccess(accessJson) {
  try {
    return parseAccessPeople(accessJson)
      .map(function (p) { return (p.name || "") + " " + (p.phone || ""); })
      .join(" | ");
  } catch (e) {
    return accessJson || "";
  }
}

function sanitizeName(name) {
  if (!name) return "";
  // Replace anything that isn't a letter/number with an underscore, trim repeats
  return String(name)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatDate(d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + "_" +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0");
}

function safe(v) {
  if (v === undefined || v === null || v === "") return "—";
  return String(v);
}

function trim(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function formatNiceDate(iso) {
  if (!iso) return "—";
  try {
    var d = new Date(iso);
    return Utilities.formatDate(d, Session.getScriptTimeZone() || "America/New_York", "MM/dd/yyyy h:mm a");
  } catch (e) {
    return String(iso);
  }
}

// ── INTAKE FORM PDF GENERATOR ─────────────────────────────────────────────────
// Clean, minimal, professional — white background throughout.
// No colored fills. Section headers = navy bold text + thin rule only.
// Inspired by professional legal/medical document design.

var BRAND_NAVY  = "#152C73";
var TEXT_DARK   = "#1A1A2E";
var TEXT_MED    = "#374151";
var TEXT_MUTED  = "#9CA3AF";
var RULE_LIGHT  = "#E5E7EB";   // very light gray — table borders & dividers
var RULE_NAVY   = "#152C73";   // used only for section underlines (thin)
var ROW_ALT     = "#F9FAFB";   // barely-there alternating row tint

var LOGO_URL = "https://nystorage.com/wp-content/uploads/2023/05/Storage-Plus-New-Color-logo.png";

function getLogoBlob() {
  try {
    var resp = UrlFetchApp.fetch(LOGO_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    return resp.getBlob();
  } catch (e) {
    Logger.log("Logo fetch failed: " + e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
function generateIntakePdf(folder, data, nameSuffix, idFrontBlob, idBackBlob, signatureBlob) {

  var tempName = "Intake_" + nameSuffix + "_TEMP_" + new Date().getTime();
  var doc  = DocumentApp.create(tempName);
  var body = doc.getBody();

  body.setPageWidth(612).setPageHeight(792);
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(54).setMarginRight(54);

  var PW = 504; // 612 - 54 - 54

  // ── 1. HEADER — logo left, title right, thin navy rule below ──────────────
  var hdrTbl = body.appendTable([["", ""]]);
  hdrTbl.setBorderWidth(0);
  try { hdrTbl.setColumnWidth(0, Math.round(PW * 0.55)); } catch(e) {}
  try { hdrTbl.setColumnWidth(1, Math.round(PW * 0.45)); } catch(e) {}

  var lCell = hdrTbl.getCell(0, 0);
  var rCell = hdrTbl.getCell(0, 1);
  [lCell, rCell].forEach(function(c) {
    try { c.setPaddingTop(0).setPaddingBottom(8).setPaddingLeft(0).setPaddingRight(0); } catch(e) {}
  });

  // Logo
  var logoBlob = getLogoBlob();
  var lp = lCell.getChild(0).asParagraph();
  if (logoBlob) {
    try {
      lp.setText("");
      var logoImg = lp.appendInlineImage(logoBlob);
      var tw = 150;
      logoImg.setWidth(tw);
      var origW = logoImg.getWidth(), origH = logoImg.getHeight();
      if (origW > 0) logoImg.setHeight(Math.round(origH * (tw / origW)));
    } catch(e) {
      lp.setText("STORAGE PLUS");
      lp.editAsText().setFontSize(16).setBold(true).setForegroundColor(BRAND_NAVY);
    }
  } else {
    lp.setText("STORAGE PLUS");
    lp.editAsText().setFontSize(16).setBold(true).setForegroundColor(BRAND_NAVY);
  }

  // Right: title + meta, right-aligned
  var rp = rCell.getChild(0).asParagraph();
  rp.setText("INTAKE FORM SUMMARY");
  rp.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  rp.editAsText().setFontSize(10).setBold(true).setForegroundColor(BRAND_NAVY);

  var dateLine = rCell.appendParagraph(formatNiceDate(data.timestamp));
  dateLine.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  dateLine.editAsText().setFontSize(8).setBold(false).setForegroundColor(TEXT_MUTED);

  var locLine = rCell.appendParagraph(safe(data.location));
  locLine.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  locLine.editAsText().setFontSize(8).setBold(false).setForegroundColor(TEXT_MUTED);

  // Thin divider below header
  navyRule(body, PW);
  spacer(body, 6);

  // ── 2. CUSTOMER INFORMATION ───────────────────────────────────────────────
  sectionLabel(body, "Customer Information");

  var isBusiness = String(data.contractType || "").toLowerCase() === "business";
  fieldRow(body, PW, "Contract Type", safe(data.contractType),
                     "Business Name", isBusiness ? safe(data.businessName) : "—");
  fieldRow(body, PW, "First Name", safe(data.firstName),
                     "Last Name",  safe(data.lastName));
  spacer(body, 4);

  // ── 3. MAILING ADDRESS ────────────────────────────────────────────────────
  sectionLabel(body, "Mailing Address");

  fieldRow(body, PW, "Street Address", safe(data.mailingAddress),
                     "City",           safe(data.city));
  fieldRow(body, PW, "State", safe(data.state),
                     "ZIP",   safe(data.zip) + (data.zipPlusFour ? "-" + data.zipPlusFour : ""));
  spacer(body, 4);

  // ── 4. CONTACT INFORMATION ────────────────────────────────────────────────
  sectionLabel(body, "Contact Information");

  fieldRow(body, PW,
    "Phone Number(s)",   formatPhones(data.phones) || "—",
    "Email Address(es)", formatEmails(data.emails) || "—");
  spacer(body, 4);

  // ── 5. ACCESS AUTHORIZATION ───────────────────────────────────────────────
  sectionLabel(body, "Access Authorization");

  var accessPeople = [];
  try { accessPeople = JSON.parse(data.additionalAccess || "[]"); } catch(e) {}
  accessPeople = accessPeople.filter(function(p) { return p.name || p.phone; });

  if (accessPeople.length === 0) {
    var noneP = body.appendParagraph("None provided");
    noneP.editAsText().setFontSize(9).setItalic(true).setForegroundColor(TEXT_MUTED);
    try { noneP.setSpacingBefore(0).setSpacingAfter(0); } catch(e) {}
  } else {
    var accessData = [["Name", "Phone Number"]];
    accessPeople.forEach(function(p) { accessData.push([safe(p.name), safe(p.phone)]); });
    cleanTable(body, PW, accessData, true);
  }
  spacer(body, 4);

  // ── 6. STORAGE & PAYMENT ──────────────────────────────────────────────────
  sectionLabel(body, "Storage & Payment Details");

  // Format unit display value. If WSS data is absent (older submissions,
  // cash flow, etc.) we render an em-dash.
  var unitLine = "";
  if (data.unitSize || data.unitDimensions) {
    unitLine = safe(data.unitDimensions || data.unitSize);
    if (data.unitMonthlyRate) {
      unitLine += "   ·   $" + safe(data.unitMonthlyRate) + "/mo";
    }
  }

  fieldRow(body, PW, "Rental Start Date",   safe(data.rentalStartDate),
                     "Payment Method",       safe(data.paymentMethod));
  fieldRow(body, PW, "Unit Size",           unitLine || "—",
                     "Enrolled in Autopay", safe(data.autopay));
  spacer(body, 4);

  // ── 7. MARKETING ──────────────────────────────────────────────────────────
  sectionLabel(body, "Marketing & Storage Information");

  var mktRows = [["How did you hear about us?", safe(data.howHeard)]];
  if (data.reasonForStoring) mktRows.push(["Reason for storing",   safe(data.reasonForStoring)]);
  if (data.whyChose)         mktRows.push(["Why they chose us",    safe(data.whyChose)]);
  if (data.whatStored)       mktRows.push(["What is being stored", safe(data.whatStored)]);
  cleanTable(body, PW, mktRows, false);

  // ── PAGE 2 ────────────────────────────────────────────────────────────────
  body.appendPageBreak();

  // ── 8. IDENTIFICATION ─────────────────────────────────────────────────────
  sectionLabel(body, "Identification Documents");
  spacer(body, 6);

  var idTbl = body.appendTable([["", ""]]);
  idTbl.setBorderWidth(0);
  var halfW = Math.floor(PW / 2) - 6;
  try { idTbl.setColumnWidth(0, halfW); idTbl.setColumnWidth(1, halfW); } catch(e) {}
  buildIdCell(idTbl.getCell(0, 0), "ID — Front", idFrontBlob);
  buildIdCell(idTbl.getCell(0, 1), "ID — Back",  idBackBlob);
  spacer(body, 14);

  // ── 9. SIGNATURE ──────────────────────────────────────────────────────────
  sectionLabel(body, "Customer Signature");
  spacer(body, 8);

  // Signature image sits directly above the X line so it visually rests
  // on the printed signature line, like a real document.
  if (signatureBlob) {
    try {
      var sigP = body.appendParagraph("");
      try { sigP.setSpacingBefore(0).setSpacingAfter(0); } catch(e) {}
      var sigImg = sigP.appendInlineImage(signatureBlob);
      var sigW = 280;
      sigImg.setWidth(sigW);
      var ratio = sigImg.getHeight() / Math.max(sigImg.getWidth(), 1);
      sigImg.setHeight(Math.min(Math.round(sigW * ratio), 110));
    } catch(e) {
      var errP = body.appendParagraph("(signature rendering error)");
      errP.editAsText().setFontSize(9).setItalic(true).setForegroundColor(TEXT_MUTED);
    }
  } else {
    var noSigP = body.appendParagraph("No signature captured");
    noSigP.editAsText().setFontSize(9).setItalic(true).setForegroundColor(TEXT_MUTED);
  }

  // Printed signature line — pulled close so the drawn signature sits on it
  var sigLine = body.appendParagraph("X  _____________________________________________");
  sigLine.editAsText().setFontSize(11).setForegroundColor(TEXT_DARK);
  try { sigLine.setSpacingBefore(0); } catch(e) {}

  var sigLabel = body.appendParagraph("Tenant Signature                                          Date: _______________");
  sigLabel.editAsText().setFontSize(8).setForegroundColor(TEXT_MUTED);
  try { sigLabel.setSpacingBefore(3); } catch(e) {}

  // Digital-signature timestamp lives BELOW the printed line, acting as the
  // notarization stamp for the whole signature block.
  var sigCaption = body.appendParagraph(
    "Digitally signed by " + safe(data.firstName) + " " + safe(data.lastName) +
    "  ·  " + formatNiceDate(data.timestamp)
  );
  try { sigCaption.setSpacingBefore(10); } catch(e) {}
  sigCaption.editAsText().setFontSize(8).setItalic(true).setForegroundColor(TEXT_MUTED);

  spacer(body, 24);

  // ── 10. FOOTER ────────────────────────────────────────────────────────────
  navyRule(body, PW);
  spacer(body, 6);
  var footP = body.appendParagraph(
    "This document is an intake summary only and does not constitute a rental agreement or contract. " +
    "The official rental agreement is signed separately at the facility.  ·  Storage Plus  |  nystorage.com"
  );
  footP.editAsText().setFontSize(7.5).setItalic(true).setForegroundColor(TEXT_MUTED);

  // ── EXPORT ────────────────────────────────────────────────────────────────
  doc.saveAndClose();
  var docFile = DriveApp.getFileById(doc.getId());
  var pdfBlob = docFile.getAs("application/pdf").setName("Intake_Form_" + nameSuffix + ".pdf");
  var pdfFile = folder.createFile(pdfBlob);
  docFile.setTrashed(true);

  return { url: pdfFile.getUrl(), fileId: pdfFile.getId() };
}


// =============================================================================
// ── LAYOUT HELPERS ────────────────────────────────────────────────────────────
// =============================================================================

// Section label: navy bold text + thin navy underline rule
function sectionLabel(body, label) {
  var tbl = body.appendTable([[label.toUpperCase()]]);

  try {
    tbl.setBorderWidth(0);
    var cell = tbl.getCell(0, 0);

    var p = cell.getChild(0).asParagraph();
    p.setText(label.toUpperCase());
    p.editAsText()
      .setFontSize(10)
      .setBold(true)
      .setForegroundColor(BRAND_NAVY);

    try { cell.setPaddingTop(0).setPaddingBottom(2).setPaddingLeft(0).setPaddingRight(0); } catch(e) {}
  } catch(e) {}

  // Thin light-gray rule directly under the section label
  navyRule(body, 504);
  spacer(body, 2);
}

// Thin full-width neutral horizontal rule (1pt height table)
// Previously navy — now a soft gray so it separates sections without
// being visually loud.
function navyRule(body, pageWidth) {
  var t = body.appendTable([[""]]);
  t.setBorderWidth(0);
  try { t.setColumnWidth(0, pageWidth || 504); } catch(e) {}
  var c = t.getCell(0, 0);
  try { c.setBackgroundColor(RULE_LIGHT); } catch(e) {}
  try { c.setPaddingTop(0).setPaddingBottom(0).setPaddingLeft(0).setPaddingRight(0); } catch(e) {}
  c.getChild(0).asParagraph().editAsText().setFontSize(0.75).setForegroundColor(RULE_LIGHT);
}

// Two-pair field row: label1 | value1 | label2 | value2
// Labels are small gray caps above; values are large dark bold below.
// Rendered as a 4-column borderless table.
function fieldRow(body, pageWidth, label1, value1, label2, value2) {
  var LW = 105; // label column width (wider so 9pt labels don't wrap)
  var VW = Math.floor(pageWidth / 2) - LW;

  var hasSecond = label2 || value2;

  var tbl = body.appendTable([[
    label1 || "",
    displayVal(value1),
    hasSecond ? (label2 || "") : "",
    hasSecond ? displayVal(value2) : "",
  ]]);
  tbl.setBorderWidth(0);
  try {
    tbl.setColumnWidth(0, LW);
    tbl.setColumnWidth(1, VW);
    tbl.setColumnWidth(2, LW);
    tbl.setColumnWidth(3, VW);
  } catch(e) {}

  var row = tbl.getRow(0);
  for (var c = 0; c < 4; c++) {
    try { row.getCell(c).setPaddingTop(1).setPaddingBottom(2).setPaddingLeft(0).setPaddingRight(6); } catch(e) {}
  }

  // Label columns — readable, dark gray
  [0, 2].forEach(function(ci) {
    row.getCell(ci).getChild(0).asParagraph()
      .editAsText().setFontSize(9).setBold(false).setForegroundColor(TEXT_DARK);
  });
  // Value columns — dark, bold, readable
  [1, 3].forEach(function(ci) {
    row.getCell(ci).getChild(0).asParagraph()
      .editAsText().setFontSize(10).setBold(true).setForegroundColor(TEXT_DARK);
  });
}

function displayVal(v) {
  if (v === undefined || v === null || String(v).trim() === "" || v === "—") return "—";
  return String(v);
}

// Clean two-column data table — minimal borders, no colored fills
// Header row gets navy bold text on white; alternating rows get near-white tint
function cleanTable(body, pageWidth, rows, hasHeader) {
  if (!rows || rows.length === 0) return;
  var COL1_W = 180;
  var COL2_W = pageWidth - COL1_W;

  var tbl = body.appendTable(rows.map(function(r) {
    return [
      r[0] == null || r[0] === "" ? "—" : String(r[0]),
      r[1] == null || r[1] === "" ? "—" : String(r[1]),
    ];
  }));

  try { tbl.setBorderWidth(0.5).setBorderColor(RULE_LIGHT); } catch(e) {}
  try { tbl.setColumnWidth(0, COL1_W); tbl.setColumnWidth(1, COL2_W); } catch(e) {}

  for (var r = 0; r < rows.length; r++) {
    var row = tbl.getRow(r);
    var isHead = hasHeader && r === 0;
    var isAlt  = !isHead && r % 2 === 1;

    for (var c = 0; c < 2; c++) {
      var cell = row.getCell(c);
      try { cell.setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(8).setPaddingRight(8); } catch(e) {}
      if (isAlt) { try { cell.setBackgroundColor(ROW_ALT); } catch(e) {} }

      var p = cell.getChild(0).asParagraph();
      if (isHead) {
        // Header: no fill, just navy bold text
        p.editAsText().setFontSize(8).setBold(true).setForegroundColor(BRAND_NAVY);
      } else if (c === 0) {
        p.editAsText().setFontSize(8.5).setBold(false).setForegroundColor(TEXT_MED);
      } else {
        p.editAsText().setFontSize(9.5).setBold(true).setForegroundColor(TEXT_DARK);
      }
    }
  }
}

// ID photo cell — light border box, label, image
function buildIdCell(cell, label, blob) {
  try { cell.setPaddingTop(8).setPaddingBottom(8).setPaddingLeft(8).setPaddingRight(8); } catch(e) {}

  // Label
  var lp = cell.getChild(0).asParagraph();
  lp.setText(label);
  lp.editAsText().setFontSize(8).setBold(true).setForegroundColor(BRAND_NAVY);
  try { lp.setSpacingAfter(5); } catch(e) {}

  if (blob) {
    try {
      var ip = cell.appendParagraph("");
      var img = ip.appendInlineImage(blob);
      var maxW = 210, maxH = 140;
      var origW = img.getWidth(), origH = img.getHeight();
      var scale = Math.min(maxW / Math.max(origW, 1), maxH / Math.max(origH, 1), 1);
      img.setWidth(Math.round(origW * scale));
      img.setHeight(Math.round(origH * scale));
    } catch(e) {
      cell.appendParagraph("(image error)").editAsText()
        .setFontSize(8).setItalic(true).setForegroundColor(TEXT_MUTED);
    }
  } else {
    cell.appendParagraph("Not provided").editAsText()
      .setFontSize(8).setItalic(true).setForegroundColor(TEXT_MUTED);
  }
}

// Blank spacer
function spacer(body, pts) {
  var p = body.appendParagraph("");
  try { p.setSpacingBefore(0).setSpacingAfter(pts || 6); } catch(e) {}
  p.editAsText().setFontSize(1);
}

// ── PDF PREVIEW HELPER ────────────────────────────────────────────────────────
// Run from the Apps Script editor (select `previewIntakePdf` in the function
// dropdown and press Run) to generate a sample PDF with dummy data so you can
// iterate on styling without submitting the real form. The result link is
// printed to the execution log.
function previewIntakePdf() {
  var folderId = (typeof DRIVE_FOLDER_ID !== "undefined" && DRIVE_FOLDER_ID) ? DRIVE_FOLDER_ID : null;
  if (!folderId) {
    Logger.log("Set DRIVE_FOLDER_ID at the top of Code.gs before running previewIntakePdf().");
    return;
  }
  var parent = DriveApp.getFolderById(folderId);
  var previewFolder = parent.createFolder("_PDF_PREVIEW_" + new Date().getTime());

  var sampleData = {
    timestamp: new Date().toISOString(),
    location: "Greenpoint",
    contractType: "Business",
    businessName: "Acme Storage Co.",
    firstName: "Jane",
    lastName: "Doe",
    mailingAddress: "123 Main St, Apt 4B",
    city: "Brooklyn",
    state: "NY",
    zip: "11222",
    zipPlusFour: "1234",
    phones: JSON.stringify([{ number: "(555) 123-4567" }]),
    emails: JSON.stringify([{ address: "jane@example.com" }]),
    additionalAccess: JSON.stringify([
      { name: "John Doe",  phone: "(555) 987-6543" },
      { name: "Mary Smith", phone: "(555) 222-3333" },
    ]),
    howHeard: "Google Search",
    reasonForStoring: "Moving to a new apartment",
    whyChose: "Close to home",
    whatStored: "Furniture, boxes, seasonal items",
    paymentMethod: "Credit Card",
    autopay: "Yes",
    rentalStartDate: "2026-05-01",
    unitSize: "5x7",
    unitDimensions: "5' x 7' x 8'",
    unitMonthlyRate: 95,
    insuranceDescription: "Bronze Coverage",
    insuranceMonthlyRate: 12,
  };

  var result = generateIntakePdf(previewFolder, sampleData, "PREVIEW_Jane_Doe", null, null, null);
  Logger.log("Preview PDF: " + result.url);
  Logger.log("Temp folder: " + previewFolder.getUrl() + " (you can delete after review)");
}

// ── TEST FUNCTION (run manually in Apps Script editor) ───────────────────────

function testSetup() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    Logger.log("✅ Sheet connected: " + ss.getName());
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    Logger.log("✅ Drive folder connected: " + folder.getName());
    getOrCreateSheet();
    Logger.log("✅ Default sheet tab ready");
  } catch (err) {
    Logger.log("❌ Setup error: " + err.toString());
  }
}
