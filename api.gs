// ═══════════════════════════════════════════════════════════════════
// GDGoC HNU - Application Status API Backend
// ═══════════════════════════════════════════════════════════════════

// Configuration
const CONFIG = {
  TECH_SHEET_ID: '1PENTGuAKWb7TkXC9KwvQmaVRRzrN_mSa-XfCvvJsa2Y',
  NON_TECH_SHEET_ID: '1avumVIfBJeMhLF-QOyvbfKvvx2ADxAxF11W3UcVIxBs',
  
  // Update these to match the EXACT header names in your Google Sheets
  COLUMNS: {
    NATIONAL_ID: "الرقم القومي :",
    NAME: "الاسم الرباعي كاملًا :",
    TECH_COMMITTEE: "التراك التقني الأساسي الذي تقدم عليه (Primary Track)",
    NON_TECH_COMMITTEE: "اختر اللجنة / الدور الذي ترغب في التقديم عليه:  ",
    STATUS: "الحالة", // IMPORTANT: Add this column to your sheets if it doesn't exist
    INTERVIEW_TIME: "موعد المقابلة" // Optional: Add if you want to show interview times
  }
};

/**
 * HTTP GET handler (doGet)
 * Accepts a 'nid' (National ID) parameter and returns JSON results.
 * Example URL: https://script.google.com/macros/s/.../exec?nid=12345678901234
 */
function doGet(e) {
  // Setup CORS headers to allow requests from the Vercel app
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
    "Content-Type": "application/json"
  };

  try {
    const nationalId = e.parameter.nid;

    if (!nationalId) {
      return createJsonResponse({ error: 'Missing National ID parameter (nid).' }, 400);
    }

    const results = [];

    // Search Tech Sheet
    const techResults = searchSheet(
      CONFIG.TECH_SHEET_ID, 
      nationalId, 
      'Tech', 
      CONFIG.COLUMNS.TECH_COMMITTEE
    );
    results.push(...techResults);

    // Search Non-Tech Sheet
    const nonTechResults = searchSheet(
      CONFIG.NON_TECH_SHEET_ID, 
      nationalId, 
      'Non-Tech', 
      CONFIG.COLUMNS.NON_TECH_COMMITTEE
    );
    results.push(...nonTechResults);

    return createJsonResponse({ success: true, data: results }, 200);

  } catch (error) {
    return createJsonResponse({ error: 'Server error: ' + error.message }, 500);
  }
}

/**
 * Searches a specific sheet for the given National ID.
 */
function searchSheet(spreadsheetId, searchId, type, committeeColName) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  // Assume the first sheet is the responses sheet
  const sheet = ss.getSheets()[0]; 
  const data = sheet.getDataRange().getValues();
  
  if (data.length < 2) return []; // No data

  const headers = data[0];
  
  // Find column indices
  const getIndex = (name) => {
    // Exact match or partial match for robustness
    const idx = headers.findIndex(h => h.toString().trim() === name.trim());
    if (idx !== -1) return idx;
    // Fallback: search if header includes the name
    return headers.findIndex(h => h.toString().includes(name.trim()));
  };

  const idIdx = getIndex(CONFIG.COLUMNS.NATIONAL_ID);
  const nameIdx = getIndex(CONFIG.COLUMNS.NAME);
  const committeeIdx = getIndex(committeeColName);
  const statusIdx = getIndex(CONFIG.COLUMNS.STATUS);
  const interviewTimeIdx = getIndex(CONFIG.COLUMNS.INTERVIEW_TIME);

  if (idIdx === -1) return []; // National ID column not found in this sheet

  const matches = [];

  // Loop through rows (skip header)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowId = row[idIdx] ? row[idIdx].toString().trim() : '';

    if (rowId === searchId.trim()) {
      matches.push({
        type: type,
        name: nameIdx !== -1 ? row[nameIdx] : 'مجهول',
        committee: committeeIdx !== -1 ? row[committeeIdx] : 'غير محدد',
        status: statusIdx !== -1 && row[statusIdx] ? row[statusIdx] : 'قيد المراجعة',
        interviewTime: interviewTimeIdx !== -1 && row[interviewTimeIdx] ? row[interviewTimeIdx] : null
      });
    }
  }

  return matches;
}

/**
 * Helper to create JSON responses compatible with Google Apps Script
 */
function createJsonResponse(content, statusCode) {
  // Google Apps Script doesn't let us easily set HTTP status codes in doGet,
  // but we can return it in the JSON body.
  const response = ContentService.createTextOutput(JSON.stringify(content));
  response.setMimeType(ContentService.MimeType.JSON);
  return response;
}
