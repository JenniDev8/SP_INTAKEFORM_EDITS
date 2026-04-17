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

// Google Drive Folder ID (from folder URL: .../drive/folders/FOLDER_ID)
var DRIVE_FOLDER_ID = "1BxDwPdx4p9V3tgmlMyAX5gz98v1seX5O";

// Name of the tab in your sheet to write to
var SHEET_TAB = "IntakeForm";

// ── COLUMN ORDER (matches the sheet headers) ──────────────────────────────────
var COLUMNS = [
  "Timestamp",
  "Location",
  "Account Type",
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
  "Rent Reminder",
  "Reminder Days",
  "Emergency Contact 1 Name",
  "Emergency Contact 1 Phone",
  "Emergency Contact 2 Name",
  "Emergency Contact 2 Phone",
  "Additional Access",
  "How Heard",
  "Reason For Storing",
  "Why Chose Us",
  "What Is Being Stored",
  "Payment Method",
  "Autopay",
  "Storage Start Date",
  "ID Front (Drive Link)",
  "ID Back (Drive Link)",
  "Signature (Drive Link)",
  "Intake PDF (Drive Link)",
];

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getOrCreateSheet();
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);

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
    try {
      intakePdfLink = generateIntakePdf(
        submissionFolder,
        data,
        nameSuffix,
        idFrontBlob,
        idBackBlob,
        signatureBlob
      );
    } catch (pdfErr) {
      Logger.log("PDF generation error: " + pdfErr.toString());
      Logger.log("Stack: " + (pdfErr.stack || "(no stack)"));
    }

    // Parse phones and emails into readable strings
    var phonesStr = formatPhones(data.phones);
    var emailsStr = formatEmails(data.emails);
    var accessStr = formatAccess(data.additionalAccess);

    // Build the row — NO credit card numbers, just payment method
    var row = [
      data.timestamp || new Date().toISOString(),
      data.location || "",
      data.contractType || "",
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
      data.rentReminder ? "Yes" : "No",
      data.reminderDays || "",
      data.emergency1Name || "",
      data.emergency1Phone || "",
      data.emergency2Name || "",
      data.emergency2Phone || "",
      accessStr,
      data.howHeard || "",
      data.reasonForStoring || "",
      data.whyChose || "",
      data.whatStored || "",
      data.paymentMethod || "",   // "Credit Card" or "Cash" — no card number
      data.autopay || "",
      data.storageStartDate || "",
      idFrontLink,
      idBackLink,
      signatureLink,
      intakePdfLink,
    ];

    sheet.appendRow(row);

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

function getOrCreateSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_TAB);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TAB);
    // Write headers
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setBackground("#0F2044")
      .setFontColor("#FFFFFF")
      .setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
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
    return phones.map(function(p) {
      var line = p.number || "";
      if (p.ext) line += " ext " + p.ext;
      if (p.type) line += " [" + p.type + "]";
      var flags = [];
      if (p.international) flags.push("Intl");
      if (p.textAllowed) flags.push("Text OK");
      if (p.smsEnabled) flags.push("SMS");
      if (flags.length) line += " (" + flags.join(", ") + ")";
      return line;
    }).join(" | ");
  } catch (e) {
    return phonesJson || "";
  }
}

function formatEmails(emailsJson) {
  try {
    var emails = JSON.parse(emailsJson || "[]");
    return emails.map(function(em) {
      return em.address + " [" + em.type + "]";
    }).join(" | ");
  } catch (e) {
    return emailsJson || "";
  }
}

function formatAccess(accessJson) {
  try {
    var people = JSON.parse(accessJson || "[]");
    return people
      .filter(function(p) { return p.name || p.phone; })
      .map(function(p) { return p.name + " " + p.phone; })
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

// ── INTAKE FORM PDF GENERATOR ─────────────────────────────────────────────────
// Builds a compact, printable Google Doc with ALL intake data + embedded ID
// photos and signature, then exports it as a PDF into the submission folder.

var BRAND_COLOR = "#152C73";
var BRAND_LIGHT = "#EEF1F8";
var TEXT_COLOR = "#1F2937";
var MUTED_COLOR = "#6B7280";
var LINE_COLOR = "#D0D4DC";
var LOGO_URL = "https://nystorage.com/wp-content/uploads/2023/05/Storage-Plus-New-Color-logo.png";

function getLogoBlob() {
  try {
    var resp = UrlFetchApp.fetch(LOGO_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    return resp.getBlob();
  } catch (e) {
    Logger.log("Failed to fetch logo: " + e.toString());
    return null;
  }
}

function generateIntakePdf(folder, data, nameSuffix, idFrontBlob, idBackBlob, signatureBlob) {
  var tempName = "Intake_" + nameSuffix + "_TEMP_" + new Date().getTime();
  var doc = DocumentApp.create(tempName);
  var body = doc.getBody();
  body.setMarginTop(28).setMarginBottom(28).setMarginLeft(40).setMarginRight(40);

  // ── Header: logo (fallback to text if fetch fails) ──
  var logoBlob = getLogoBlob();
  if (logoBlob) {
    try {
      var logoImg = body.appendImage(logoBlob);
      var origW = logoImg.getWidth();
      var origH = logoImg.getHeight();
      var targetW = 170;
      logoImg.setWidth(targetW);
      if (origW > 0) logoImg.setHeight(Math.round(origH * (targetW / origW)));
    } catch (e) {
      var fallback = body.appendParagraph("STORAGE PLUS");
      styleText(fallback, { size: 18, bold: true, color: BRAND_COLOR });
    }
  } else {
    var fallback2 = body.appendParagraph("STORAGE PLUS");
    styleText(fallback2, { size: 18, bold: true, color: BRAND_COLOR });
  }

  // Meta line
  var metaPara = body.appendParagraph("");
  var metaText = metaPara.editAsText();
  metaText.appendText("Location: ");
  metaText.appendText(safe(data.location));
  metaText.appendText("     Submitted: ");
  metaText.appendText(formatNiceDate(data.timestamp));
  metaText.appendText("     Customer: ");
  metaText.appendText(trim((data.firstName || "") + " " + (data.lastName || "")) || "—");
  styleText(metaPara, { size: 9, color: MUTED_COLOR });
  try { metaPara.setSpacingBefore(4).setSpacingAfter(8); } catch (e) {}

  // ── Customer Information ──
  sectionHeader(body, "Customer Information");
  kvTable(body, [
    ["Account Type", safe(data.contractType), "", ""],
    ["First Name",   safe(data.firstName),    "Last Name", safe(data.lastName)],
  ]);

  // ── Mailing Address ──
  sectionHeader(body, "Mailing Address");
  var zipLine = safe(data.zip) + (data.zipPlusFour ? "-" + data.zipPlusFour : "");
  kvTable(body, [
    ["Street", safe(data.mailingAddress), "City", safe(data.city)],
    ["State",  safe(data.state),          "ZIP",  zipLine],
  ]);

  // ── Contact Info: phone & email side by side ──
  sectionHeader(body, "Contact Information");
  var phonesText = formatPhones(data.phones) || "—";
  var emailsText = formatEmails(data.emails) || "—";
  kvTable(body, [
    ["Phone(s)", phonesText, "Email(s)", emailsText],
  ]);

  // ── Rent Reminder ──
  sectionHeader(body, "Rent Reminder");
  var reminderText = data.rentReminder
    ? "Yes — notify " + (data.reminderDays || "—") + " day(s) in advance"
    : "No";
  kvTable(body, [
    ["Reminder", reminderText, "", ""],
  ]);

  // ── Emergency Contacts ──
  sectionHeader(body, "Emergency Contacts");
  kvTable(body, [
    ["1st Name", safe(data.emergency1Name), "1st Phone", safe(data.emergency1Phone)],
    ["2nd Name", safe(data.emergency2Name), "2nd Phone", safe(data.emergency2Phone)],
  ]);

  // ── Additional Access ──
  sectionHeader(body, "Additional Access Authorization");
  var accessPeople = [];
  try { accessPeople = JSON.parse(data.additionalAccess || "[]"); } catch (e) {}
  accessPeople = accessPeople.filter(function (p) { return p.name || p.phone; });
  if (accessPeople.length === 0) {
    var none = body.appendParagraph("None provided");
    styleText(none, { size: 9, color: MUTED_COLOR, italic: true });
    try { none.setSpacingBefore(2).setSpacingAfter(4); } catch (e) {}
  } else {
    var accessRows = [["Name", "Phone"]];
    accessPeople.forEach(function (p) {
      accessRows.push([safe(p.name), safe(p.phone)]);
    });
    dataTable(body, accessRows, true);
  }

  // ── Marketing ──
  sectionHeader(body, "Marketing Information");
  var mkt = [["How did you hear about us?", safe(data.howHeard)]];
  if (data.reasonForStoring) mkt.push(["Reason for storing", data.reasonForStoring]);
  if (data.whyChose)         mkt.push(["What made you choose us", data.whyChose]);
  if (data.whatStored)       mkt.push(["What is being stored", data.whatStored]);
  dataTable(body, mkt, false);

  // ── Payment & Rental Details ──
  sectionHeader(body, "Payment & Rental Details");
  kvTable(body, [
    ["Payment Method",     safe(data.paymentMethod),     "Autopay", safe(data.autopay)],
    ["Storage Start Date", safe(data.storageStartDate), "", ""],
  ]);

  // ── Identification (starts on page 2 so the IDs aren't split across pages) ──
  body.appendPageBreak();
  sectionHeader(body, "Identification");

  var idTable = body.appendTable([["", ""]]);
  clearTableBorders(idTable);
  var idRow = idTable.getRow(0);
  fillIdCell(idRow.getCell(0), "ID — Front", idFrontBlob);
  fillIdCell(idRow.getCell(1), "ID — Back",  idBackBlob);

  // ── Signature ──
  sectionHeader(body, "Signature");
  if (signatureBlob) {
    try {
      var sigImg = body.appendImage(signatureBlob);
      sigImg.setWidth(280);
      var ratio = sigImg.getHeight() / sigImg.getWidth();
      if (ratio > 0.3) sigImg.setHeight(Math.round(280 * 0.25));
    } catch (e) {
      var sErr = body.appendParagraph("(signature render error)");
      styleText(sErr, { size: 9, color: MUTED_COLOR, italic: true });
    }
  } else {
    var noSig = body.appendParagraph("(No signature captured)");
    styleText(noSig, { size: 9, color: MUTED_COLOR, italic: true });
  }

  var sigCaption = body.appendParagraph(
    "Signed by " + safe(data.firstName) + " " + safe(data.lastName) +
    "  ·  " + formatNiceDate(data.timestamp)
  );
  styleText(sigCaption, { size: 9, color: MUTED_COLOR });
  try { sigCaption.setSpacingBefore(2); } catch (e) {}

  // footer
  var footer = body.appendParagraph(
    "This is an intake summary only. It is not a rental contract. " +
    "The rental agreement is signed separately at the facility."
  );
  styleText(footer, { size: 8, color: MUTED_COLOR, italic: true });
  try { footer.setSpacingBefore(8); } catch (e) {}

  doc.saveAndClose();

  // Convert the temp Doc to PDF and save into the submission folder
  var docFile = DriveApp.getFileById(doc.getId());
  var pdfBlob = docFile.getAs("application/pdf").setName("Intake_Form_" + nameSuffix + ".pdf");
  var pdfFile = folder.createFile(pdfBlob);
  docFile.setTrashed(true); // remove the temp Doc

  return pdfFile.getUrl();
}

// ── DOC LAYOUT HELPERS ────────────────────────────────────────────────────────

function sectionHeader(body, label) {
  // Full-width single-cell table with a light background = colored section bar
  try {
    var t = body.appendTable([[label.toUpperCase()]]);
    t.setBorderWidth(0);
    var cell = t.getCell(0, 0);
    try { cell.setBackgroundColor(BRAND_LIGHT); } catch (e) {}
    try {
      cell.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(6).setPaddingRight(6);
    } catch (e) {}
    var para = cell.getChild(0).asParagraph();
    styleText(para, { size: 9, bold: true, color: BRAND_COLOR });
  } catch (err) {
    // Fallback: plain bold colored paragraph if the table approach fails
    var p = body.appendParagraph(label.toUpperCase());
    styleText(p, { size: 10, bold: true, color: BRAND_COLOR });
    p.setSpacingBefore(6).setSpacingAfter(2);
  }
}

function kvTable(body, rows) {
  // rows: array of [label, value, label, value]
  // Empty pairs (both label & value blank) render as truly empty cells.
  // Empty values w/ a real label still render "—" for clarity.
  var tableRows = rows.map(function (r) {
    var l1 = r[0] || "", v1 = r[1] || "", l2 = r[2] || "", v2 = r[3] || "";
    var emptyPair = !l2 && !v2;
    return [l1, kvDisplayValue(l1, v1), emptyPair ? "" : l2, emptyPair ? "" : kvDisplayValue(l2, v2)];
  });

  var table = body.appendTable(tableRows);
  clearTableBorders(table);

  // Set column widths so long values (emails, addresses, phone blocks) don't
  // wrap awkwardly. Page content width ≈ 532pt; labels are narrow, values wide.
  try {
    table.setColumnWidth(0, 80);   // label 1
    table.setColumnWidth(1, 186);  // value 1
    table.setColumnWidth(2, 80);   // label 2
    table.setColumnWidth(3, 186);  // value 2
  } catch (e) {}

  for (var r = 0; r < tableRows.length; r++) {
    var row = table.getRow(r);
    try {
      styleCellText(row.getCell(0), { size: 8, bold: true, color: MUTED_COLOR });
      styleCellText(row.getCell(1), { size: 10, bold: true, color: TEXT_COLOR });
      styleCellText(row.getCell(2), { size: 8, bold: true, color: MUTED_COLOR });
      styleCellText(row.getCell(3), { size: 10, bold: true, color: TEXT_COLOR });
    } catch (e) {}
    for (var c = 0; c < 4; c++) {
      try {
        row.getCell(c).setPaddingTop(2).setPaddingBottom(2)
          .setPaddingLeft(4).setPaddingRight(4);
      } catch (e) {}
    }
  }
}

function kvDisplayValue(label, value) {
  // If we have a label but no value, show "—". If neither, show blank.
  if (!label && !value) return "";
  if (value == null || value === "") return "—";
  return String(value);
}

function styleCellText(cell, style) {
  try {
    var para = cell.getChild(0).asParagraph();
    styleText(para, style || {});
  } catch (e) {}
}

function dataTable(body, rows, firstRowIsHeader) {
  var normalized = rows.map(function (r) {
    return [r[0] == null || r[0] === "" ? "—" : String(r[0]),
            r[1] == null || r[1] === "" ? "—" : String(r[1])];
  });
  var table = body.appendTable(normalized);
  try { table.setBorderWidth(0.5).setBorderColor(LINE_COLOR); } catch (e) {}
  try {
    table.setColumnWidth(0, 200);
    table.setColumnWidth(1, 332);
  } catch (e) {}

  for (var r = 0; r < normalized.length; r++) {
    var row = table.getRow(r);
    var isHead = (firstRowIsHeader && r === 0);
    try {
      row.getCell(0).setPaddingTop(3).setPaddingBottom(3)
        .setPaddingLeft(6).setPaddingRight(6);
      row.getCell(1).setPaddingTop(3).setPaddingBottom(3)
        .setPaddingLeft(6).setPaddingRight(6);
    } catch (e) {}
    if (isHead) {
      try {
        row.getCell(0).setBackgroundColor(BRAND_LIGHT);
        row.getCell(1).setBackgroundColor(BRAND_LIGHT);
      } catch (e) {}
      styleCellText(row.getCell(0), { size: 8, bold: true, color: BRAND_COLOR });
      styleCellText(row.getCell(1), { size: 8, bold: true, color: BRAND_COLOR });
    } else {
      styleCellText(row.getCell(0), { size: 9, color: MUTED_COLOR });
      styleCellText(row.getCell(1), { size: 10, color: TEXT_COLOR, bold: true });
    }
  }
}

function fillIdCell(cell, label, blob) {
  try { cell.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(4).setPaddingRight(4); } catch (e) {}
  try {
    var para = cell.getChild(0).asParagraph();
    para.setText(label);
    styleText(para, { size: 9, bold: true, color: BRAND_COLOR });
  } catch (e) {}
  if (blob) {
    try {
      var img = cell.appendImage(blob);
      var w = 220;
      img.setWidth(w);
      var ratio = img.getHeight() / img.getWidth();
      var targetH = Math.min(Math.round(w * ratio), 150);
      img.setHeight(targetH);
    } catch (err) {
      try {
        cell.appendParagraph("(image error)").editAsText().setFontSize(8).setForegroundColor(MUTED_COLOR);
      } catch (e) {}
    }
  } else {
    try {
      cell.appendParagraph("(not provided)").editAsText().setFontSize(8).setForegroundColor(MUTED_COLOR);
    } catch (e) {}
  }
}

function setCellText(cell, text, style) {
  var content = text == null || text === "" ? "—" : String(text);
  var para = cell.getChild(0).asParagraph();
  para.setText(content);
  styleText(para, style || {});
}

function styleText(paragraphOrText, opts) {
  var t = paragraphOrText.editAsText ? paragraphOrText.editAsText() : paragraphOrText;
  if (opts.size != null) t.setFontSize(opts.size);
  if (opts.bold != null) t.setBold(opts.bold);
  if (opts.italic != null) t.setItalic(opts.italic);
  if (opts.color) t.setForegroundColor(opts.color);
}

function clearTableBorders(table) {
  table.setBorderWidth(0);
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
    return Utilities.formatDate(d, Session.getScriptTimeZone() || "America/New_York", "MMM d, yyyy h:mm a");
  } catch (e) {
    return String(iso);
  }
}

// ── TEST FUNCTION (run manually in Apps Script editor) ────────────────────────

function testSetup() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    Logger.log("✅ Sheet connected: " + ss.getName());
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    Logger.log("✅ Drive folder connected: " + folder.getName());
    getOrCreateSheet();
    Logger.log("✅ Sheet tab ready");
  } catch (err) {
    Logger.log("❌ Setup error: " + err.toString());
  }
}
