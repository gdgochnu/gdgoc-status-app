// ═══════════════════════════════════════════════════════════════════
// GDGoC HNU - Application Status API Backend
// ═══════════════════════════════════════════════════════════════════

// Configuration
const CONFIG = {
  // Centralized Evaluation & Interview Database
  CENTRAL_STUDENTS_SHEET_ID: '1JrN05fj0C6pkg8cXl3AnQXXQzDZPB4YR9lQyZj3bCW4',

  // Raw Form Submission Sheets
  TECH_SHEET_ID: '1PENTGuAKWb7TkXC9KwvQmaVRRzrN_mSa-XfCvvJsa2Y',
  NON_TECH_SHEET_ID: '1avumVIfBJeMhLF-QOyvbfKvvx2ADxAxF11W3UcVIxBs',
  MISSING_TASK_SHEET_ID: '1Fe3xBUj5WwnzF_RnI_OwpVm4WtTlMEUShQwSWCHGgPY',
  
  // Header names in raw Google Sheets
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

function cleanText_(text) {
  if (!text) return '';
  var s = String(text);
  try {
    s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
    s = s.replace(/[\u2600-\u27BF]/g, '');
    s = s.replace(/[\uFE00-\uFE0F]/g, '');
    s = s.replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}\u{2700}-\u{27FF}\u{FE00}-\u{FEFF}]/gu, '');
  } catch(e) {}
  s = s.replace(/[\uFFFD\uFFFE\uFFFF]/g, '');
  s = s.replace(/[]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function formatInterviewerTitle_(name) {
  var raw = cleanText_(name);
  if (!raw || raw.toLowerCase() === 'gdogc team' || raw.toLowerCase() === 'unknown' || raw === '-') {
    return 'Eng. GDGoC Team';
  }
  if (/^eng\.?/i.test(raw) || /^م\.?\s*/i.test(raw) || /^مهندس/i.test(raw)) {
    return raw;
  }
  return 'Eng. ' + raw;
}

/**
 * Searches the centralized database for evaluated & scheduled students.
 */
function searchCentralStudents_(searchId) {
  var sid = String(searchId || '').trim();
  if (!sid) return [];
  try {
    var ss = SpreadsheetApp.openById(CONFIG.CENTRAL_STUDENTS_SHEET_ID);
    var studentsSheet = ss.getSheetByName('Students') || ss.getSheets()[0];
    var scheduleSheet = ss.getSheetByName('Schedule');
    
    var sData = studentsSheet.getDataRange().getValues();
    if (sData.length < 2) return [];

    var sHeaders = sData[0].map(function(h) { return String(h || '').trim(); });
    function sCol(row, name) {
      var idx = sHeaders.indexOf(name);
      return idx !== -1 ? String(row[idx] || '').trim() : '';
    }

    // Read Schedule sheet if available
    var schedules = [];
    if (scheduleSheet) {
      var scData = scheduleSheet.getDataRange().getValues();
      if (scData.length > 1) {
        var scHeaders = scData[0].map(function(h) { return String(h || '').trim(); });
        function scCol(row, name) {
          var idx = scHeaders.indexOf(name);
          return idx !== -1 ? String(row[idx] || '').trim() : '';
        }
        for (var k = 1; k < scData.length; k++) {
          var scRow = scData[k];
          var scNid = scCol(scRow, 'Student NID');
          if (scNid === sid) {
            schedules.push({
              id: scCol(scRow, 'ID'),
              studentNid: scNid,
              track: cleanText_(scCol(scRow, 'Track')),
              role: cleanText_(scCol(scRow, 'Role')),
              interviewer: formatInterviewerTitle_(scCol(scRow, 'Interviewer')),
              interviewerEmail: scCol(scRow, 'Interviewer Email'),
              scheduledAt: scCol(scRow, 'Scheduled At'),
              notes: scCol(scRow, 'Notes'),
              decision: scCol(scRow, 'Decision'),
              type: scCol(scRow, 'Type')
            });
          }
        }
      }
    }

    var matches = [];
    for (var i = 1; i < sData.length; i++) {
      var row = sData[i];
      var rowNid = sCol(row, 'NID');
      if (rowNid === sid) {
        var type = sCol(row, 'Type') || 'Tech';
        var track = cleanText_(sCol(row, 'Track'));
        var role = cleanText_(sCol(row, 'Role'));
        var taskStatus = sCol(row, 'Task Status');
        var taskNotes = sCol(row, 'Task Review Notes');
        var schedAt = sCol(row, 'Interview Scheduled At');
        var interviewer = formatInterviewerTitle_(sCol(row, 'Assigned Interviewer'));
        var interviewerEmail = sCol(row, 'Interviewer Email');
        var intvNotes = sCol(row, 'Interview Notes');
        var decision = sCol(row, 'Interview Decision');
        var schedId = sCol(row, 'Schedule ID');

        // Match schedule item
        var matchedSched = null;
        if (schedId) {
          matchedSched = schedules.find(function(sc) { return sc.id === schedId; });
        }
        if (!matchedSched && schedules.length > 0) {
          matchedSched = schedules.find(function(sc) {
            var tMatch = !sc.type || sc.type.toLowerCase() === type.toLowerCase();
            return tMatch;
          });
        }

        var finalInterviewTime = (matchedSched && matchedSched.scheduledAt) ? matchedSched.scheduledAt : (schedAt || null);
        var finalInterviewer = (matchedSched && matchedSched.interviewer) ? matchedSched.interviewer : (interviewer || null);
        var finalNotes = (matchedSched && matchedSched.notes) ? matchedSched.notes : (intvNotes || '');
        var finalDecision = (matchedSched && matchedSched.decision) ? matchedSched.decision : (decision || '');

        matches.push({
          type: type,
          name: sCol(row, 'Name') || 'Applicant',
          email: sCol(row, 'Email') || '',
          committee: track || 'General Track',
          role: role || null,
          initialStatus: taskStatus ? 'مقبول' : 'قيد المراجعة',
          taskStatus: taskStatus,
          taskNotes: taskNotes,
          interviewTime: finalInterviewTime,
          interviewer: finalInterviewer,
          interviewerEmail: (matchedSched && matchedSched.interviewerEmail) ? matchedSched.interviewerEmail : interviewerEmail,
          interviewNotes: finalNotes,
          interviewDecision: finalDecision,
          isScheduled: Boolean(finalInterviewTime && finalInterviewTime !== 'Scheduled' && finalInterviewTime !== '')
        });
      }
    }
    return matches;
  } catch(err) {
    Logger.log('searchCentralStudents_ error: ' + err.message);
    return [];
  }
}

/**
 * Searches a raw responses sheet for the given National ID.
 */
function searchSheet(spreadsheetId, searchId, type, committeeColName) {
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheets()[0]; 
    const data = sheet.getDataRange().getValues();
    
    if (data.length < 2) return [];

    const headers = data[0];
    
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

    if (idIdx === -1) return [];

    const matches = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowId = row[idIdx] ? row[idIdx].toString().trim() : '';

      if (rowId === searchId.trim()) {
        let initialStatus = statusIdx !== -1 && row[statusIdx] ? String(row[statusIdx]).trim() : 'قيد المراجعة';
        let taskStatus = taskStatusIdx !== -1 && row[taskStatusIdx] ? String(row[taskStatusIdx]).trim() : '';
        let intvTime = interviewTimeIdx !== -1 && row[interviewTimeIdx] ? String(row[interviewTimeIdx]).trim() : null;
        
        matches.push({
          type: type,
          name: nameIdx !== -1 ? row[nameIdx] : 'مجهول',
          email: emailIdx !== -1 ? row[emailIdx] : '',
          committee: cleanText_(committeeIdx !== -1 ? row[committeeIdx] : 'غير محدد'),
          role: cleanText_(roleIdx !== -1 ? row[roleIdx] : null),
          initialStatus: initialStatus,
          taskStatus: taskStatus,
          interviewTime: intvTime,
          interviewer: null,
          interviewerEmail: '',
          interviewNotes: '',
          interviewDecision: interviewDecisionIdx !== -1 && row[interviewDecisionIdx] ? String(row[interviewDecisionIdx]).trim() : '',
          isScheduled: Boolean(intvTime && intvTime !== '')
        });
      }
    }
    return matches;
  } catch(e) {
    return [];
  }
}

/**
 * HTTP GET handler (doGet)
 */
function doGet(e) {
  try {
    const nationalId = e.parameter.nid;

    // --- Missing Task Action ---
    if (e.parameter.action === 'reportMissingTask') {
      try {
        const ss = SpreadsheetApp.openById(CONFIG.MISSING_TASK_SHEET_ID);
        const sheet = ss.getSheets()[0];
        
        if (sheet.getLastRow() === 0) {
          sheet.appendRow(['Timestamp', 'National ID', 'Name', 'Email', 'Team', 'Committee/Role', 'Status']);
        }

        const reqData = sheet.getDataRange().getValues();
        let existing = false;
        if (reqData.length > 1) {
          const nIdx = reqData[0].findIndex(h => h.toString().includes('National ID'));
          for (let i = 1; i < reqData.length; i++) {
            if (reqData[i][nIdx] && reqData[i][nIdx].toString().trim() === e.parameter.nid.trim()) {
              existing = true;
              break;
            }
          }
        }

        if (existing) {
          return createJsonResponse({ success: false, message: 'Request already submitted.' }, 200);
        }

        sheet.appendRow([
          new Date(),
          e.parameter.nid,
          e.parameter.name,
          e.parameter.email || 'N/A',
          e.parameter.team,
          e.parameter.role || 'N/A',
          'قيد الانتظار'
        ]);

        return createJsonResponse({ success: true, message: 'Request submitted successfully.' }, 200);
      } catch (err) {
        return createJsonResponse({ error: 'Server error: ' + err.message }, 500);
      }
    }

    if (!nationalId) {
      return createJsonResponse({ error: 'Missing National ID parameter (nid).' }, 400);
    }

    const results = [];

    // 1. Check Central Database (Evaluations & Interview Schedules)
    const centralResults = searchCentralStudents_(nationalId);
    if (centralResults.length > 0) {
      results.push.apply(results, centralResults);
    } else {
      // 2. Fallback to Raw Response Sheets
      const techResults = searchSheet(CONFIG.TECH_SHEET_ID, nationalId, 'Tech', CONFIG.COLUMNS.TECH_COMMITTEE);
      results.push.apply(results, techResults);

      const nonTechResults = searchSheet(CONFIG.NON_TECH_SHEET_ID, nationalId, 'Non-Tech', CONFIG.COLUMNS.NON_TECH_COMMITTEE);
      results.push.apply(results, nonTechResults);
    }

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
 * Helper to create JSON responses compatible with Google Apps Script
 */
function createJsonResponse(content, statusCode) {
  const response = ContentService.createTextOutput(JSON.stringify(content));
  response.setMimeType(ContentService.MimeType.JSON);
  return response;
}

function doPost(e) {
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
      
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Timestamp', 'National ID', 'Name', 'Email', 'Team', 'Committee/Role', 'Status']);
      }

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

      sheet.appendRow([
        new Date(),
        data.nid,
        data.name,
        data.email || 'N/A',
        data.team,
        data.role || data.committee,
        'قيد الانتظار'
      ]);

      return createJsonResponse({ success: true, message: 'Request submitted successfully.' }, 200);
    }

    return createJsonResponse({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return createJsonResponse({ error: 'Server error: ' + error.message }, 500);
  }
}
