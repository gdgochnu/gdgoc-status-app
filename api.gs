// ═══════════════════════════════════════════════════════════════════
// GDGoC HNU - Application Status API Backend
// ═══════════════════════════════════════════════════════════════════

// Configuration
const CONFIG = {
  TECH_SHEET_ID: '1PENTGuAKWb7TkXC9KwvQmaVRRzrN_mSa-XfCvvJsa2Y',
  NON_TECH_SHEET_ID: '1avumVIfBJeMhLF-QOyvbfKvvx2ADxAxF11W3UcVIxBs',
  MISSING_TASK_SHEET_ID: '1Fe3xBUj5WwnzF_RnI_OwpVm4WtTlMEUShQwSWCHGgPY',
  
  // Update these to match the EXACT header names in your Google Sheets
  COLUMNS: {
    NATIONAL_ID: "الرقم القومي :",
    NAME: "الاسم الرباعي كاملًا :",
    EMAIL: ["البريد الالكتروني", "Email", "البريد الإلكتروني"],
    TECH_COMMITTEE: "التراك التقني الأساسي الذي تقدم عليه (Primary Track)",
    TECH_ROLE: "الدور الذي ترغب في الانضمام به للتراك (Role Selection) :",
    NON_TECH_COMMITTEE: "اختر اللجنة / الدور الذي ترغب في التقديم عليه:  ",
    STATUS: "حالة القبول", 
    TASK_STATUS: ["حالة التاسك", "نتيجة التاسك", "التاسك"],
    INTERVIEW_TIME: "موعد المقابلة",
    INTERVIEW_DECISION: ["قرار الإنترفيو", "نتيجة الإنترفيو", "الإنترفيو"] 
  }
};

/**
 * HTTP GET handler (doGet)
 * Accepts a 'nid' (National ID) parameter and returns JSON results.
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

        // Fetch Missing Task Requests
    let missingRequests = {};
    try {
      const reqSheet = SpreadsheetApp.openById(CONFIG.MISSING_TASK_SHEET_ID).getSheets()[0];
      const reqData = reqSheet.getDataRange().getValues();
      if (reqData.length > 1) {
        const rHeaders = reqData[0];
        const rNidIdx = rHeaders.findIndex(h => h.toString().includes('National ID'));
        const rStatusIdx = rHeaders.findIndex(h => h.toString().includes('Status'));
        if (rNidIdx !== -1 && rStatusIdx !== -1) {
          for (let i = 1; i < reqData.length; i++) {
            let rnid = reqData[i][rNidIdx] ? reqData[i][rNidIdx].toString().trim() : '';
            if (rnid === nationalId.trim()) {
              missingRequests[rnid] = reqData[i][rStatusIdx];
            }
          }
        }
      }
    } catch (e) { }

    results.forEach(res => {
      res.missingTaskStatus = missingRequests[nationalId.trim()] || null;
    });

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
  const getIndex = (names) => {
    if (!Array.isArray(names)) names = [names];
    for (let name of names) {
      let idx = headers.findIndex(h => h.toString().trim() === name.trim());
      if (idx !== -1) return idx;
    }
    for (let name of names) {
      let idx = headers.findIndex(h => h.toString().includes(name.trim()));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idIdx = getIndex(CONFIG.COLUMNS.NATIONAL_ID);
  const nameIdx = getIndex(CONFIG.COLUMNS.NAME);
  const emailIdx = getIndex(CONFIG.COLUMNS.EMAIL);
  const committeeIdx = getIndex(committeeColName);
  const roleIdx = type === 'Tech' ? getIndex(CONFIG.COLUMNS.TECH_ROLE) : -1;
  const statusIdx = getIndex(CONFIG.COLUMNS.STATUS);
  const taskStatusIdx = getIndex(CONFIG.COLUMNS.TASK_STATUS);
  const interviewTimeIdx = getIndex(CONFIG.COLUMNS.INTERVIEW_TIME);
  const interviewDecisionIdx = getIndex(CONFIG.COLUMNS.INTERVIEW_DECISION);

  if (idIdx === -1) return []; // National ID column not found in this sheet

  const matches = [];

  // Loop through rows (skip header)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowId = row[idIdx] ? row[idIdx].toString().trim() : '';

    if (rowId === searchId.trim()) {
      
      let initialStatus = statusIdx !== -1 && row[statusIdx] ? String(row[statusIdx]).trim() : 'قيد المراجعة';
      let taskStatus = taskStatusIdx !== -1 && row[taskStatusIdx] ? String(row[taskStatusIdx]).trim() : '';
      
      matches.push({
        type: type,
        name: nameIdx !== -1 ? row[nameIdx] : 'مجهول',
        email: emailIdx !== -1 ? row[emailIdx] : '',
        committee: committeeIdx !== -1 ? row[committeeIdx] : 'غير محدد',
        role: roleIdx !== -1 ? row[roleIdx] : null,
        initialStatus: initialStatus,
        taskStatus: taskStatus,
        interviewTime: interviewTimeIdx !== -1 && row[interviewTimeIdx] ? row[interviewTimeIdx] : null,
        interviewDecision: interviewDecisionIdx !== -1 && row[interviewDecisionIdx] ? row[interviewDecisionIdx] : ''
      });
    }
  }

  return matches;
}

/**
 * Helper to create JSON responses compatible with Google Apps Script
 */
function createJsonResponse(content, statusCode) {
  const response = ContentService.createTextOutput(JSON.stringify(content));
  response.setMimeType(ContentService.MimeType.JSON);
  return response;
}


function doPost(e) {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST",
    "Content-Type": "application/json"
  };

  try {
    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else {
      return createJsonResponse({ error: 'No data provided.' }, 400);
    }

    if (data.action === 'reportMissingTask') {
      const ss = SpreadsheetApp.openById(CONFIG.MISSING_TASK_SHEET_ID);
      const sheet = ss.getSheets()[0];
      
      // Init headers if empty
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Timestamp', 'National ID', 'Name', 'Email', 'Team', 'Committee/Role', 'Status']);
      }

      // Check if already requested
      const reqData = sheet.getDataRange().getValues();
      let existing = false;
      if (reqData.length > 1) {
        const nIdx = reqData[0].findIndex(h => h.toString().includes('National ID'));
        for (let i = 1; i < reqData.length; i++) {
          if (reqData[i][nIdx] && reqData[i][nIdx].toString().trim() === data.nid.trim()) {
            existing = true;
            break;
          }
        }
      }

      if (existing) {
        return createJsonResponse({ success: false, message: 'Request already submitted.' }, 200);
      }

      // Append row
      sheet.appendRow([
        new Date(),
        data.nid,
        data.name,
        data.email || 'N/A',
        data.team,
        data.role || data.committee,
        'قيد الانتظار' // Pending
      ]);

      return createJsonResponse({ success: true, message: 'Request submitted successfully.' }, 200);
    }

    return createJsonResponse({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return createJsonResponse({ error: 'Server error: ' + error.message }, 500);
  }
}
