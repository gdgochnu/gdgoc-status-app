/**
 * GDGoC HNU Application Status Frontend - Enhanced
 */

// ==========================================
// CONFIGURATION
// ==========================================
// IMPORTANT: Replace this URL with your deployed Google Apps Script Web App URL
const API_URL = "https://script.google.com/macros/s/AKfycbzkiqzpZB6f0ji-WJFwCZbfqCOBgA55fNmTMKRjTtiESYDn6kshOSbRsxoqTwb9a4Uc3Q/exec"; 

// ==========================================
// ELEMENTS
// ==========================================
const form = document.getElementById('searchForm');
const nationalIdInput = document.getElementById('nationalId');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.querySelector('.btn-text');
const btnIcon = document.querySelector('.btn-icon');
const spinner = document.querySelector('.loader-spinner');
const resultsContainer = document.getElementById('resultsContainer');

// ==========================================
// VALIDATION
// ==========================================
function validateEgyptianNationalId(id) {
    if (!/^\d{14}$/.test(id)) return "يجب أن يتكون الرقم القومي من 14 رقماً.";
    
    // Century (2 = 1900s, 3 = 2000s)
    const century = parseInt(id.charAt(0));
    if (century !== 2 && century !== 3) return "تأكد من صحة الرقم الأول (قرن الميلاد).";

    // Month
    const month = parseInt(id.substring(3, 5));
    if (month < 1 || month > 12) return "تأكد من صحة شهر الميلاد في الرقم القومي.";

    // Day
    const day = parseInt(id.substring(5, 7));
    if (day < 1 || day > 31) return "تأكد من صحة يوم الميلاد في الرقم القومي.";

    // Governorate
    const gov = parseInt(id.substring(7, 9));
    const validGovs = [1,2,3,4,11,12,13,14,15,16,17,18,19,21,22,23,24,25,26,27,28,29,31,32,33,34,35,88];
    if (!validGovs.includes(gov)) return "تأكد من كود المحافظة في الرقم القومي.";

    return null; // Valid
}

// ==========================================
// EVENT LISTENERS
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nationalId = nationalIdInput.value.trim();
    
    // Detailed Validation
    const validationError = validateEgyptianNationalId(nationalId);
    if (validationError) {
        showError(validationError);
        // Highlight input
        nationalIdInput.style.borderColor = "var(--g-yellow)";
        setTimeout(() => nationalIdInput.style.borderColor = "", 2000);
        return;
    }

    if (API_URL === "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE") {
        showError("⚠️ لم يتم إعداد رابط الـ API. يرجى تحديث API_URL في ملف main.js.");
        return;
    }

    // Set Loading State
    setLoading(true);
    resultsContainer.innerHTML = ''; // Clear previous results

    try {
        const response = await fetch(`${API_URL}?nid=${encodeURIComponent(nationalId)}`);
        
        if (!response.ok) {
            throw new Error('حدث خطأ في الاتصال بالخادم.');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        renderResults(data.data);

    } catch (error) {
        showError(error.message || "فشل في جلب البيانات، تأكد من اتصالك بالإنترنت.");
    } finally {
        setLoading(false);
    }
});

// ==========================================
// FUNCTIONS
// ==========================================
function setLoading(isLoading) {
    if (isLoading) {
        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnIcon.style.display = 'none';
        spinner.style.display = 'block';
    } else {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnIcon.style.display = 'inline-block';
        spinner.style.display = 'none';
    }
}

function parseStatus(statusText) {
    let s = { class: 'status-pending', icon: 'fa-spinner fa-spin-pulse', label: 'قيد المراجعة', pipeline: 1 };
    if (!statusText) return s;

    // We categorize the detailed statuses
    if (statusText.includes('مقبول') || statusText.includes('Accept')) {
        s = { class: 'status-accepted', icon: 'fa-check-double', label: statusText, pipeline: 5 };
    } else if (statusText.includes('مرفوض') || statusText.includes('Reject')) {
        s = { class: 'status-rejected', icon: 'fa-ban', label: statusText, pipeline: 0 };
    } else if (statusText.includes('مقابل') || statusText.includes('Interview')) {
        s = { class: 'status-interview', icon: 'fa-comments', label: statusText, pipeline: 4 };
    } else if (statusText.includes('انتظار') || statusText.includes('Waitlist')) {
        s = { class: 'status-waitlist', icon: 'fa-hourglass-half', label: statusText, pipeline: 3 };
    } else if (statusText.includes('إرسال التاسك') || statusText.includes('تاسك')) {
        s = { class: 'status-task-sent', icon: 'fa-paper-plane', label: statusText, pipeline: 2 };
    } else if (statusText.includes('تسليم التاسك')) {
        s = { class: 'status-task-done', icon: 'fa-file-circle-check', label: statusText, pipeline: 3 };
    } else if (statusText.includes('لم يقم') || statusText.includes('Not Done')) {
        s = { class: 'status-rejected', icon: 'fa-xmark', label: statusText, pipeline: 0 };
    } else {
        // Fallback for custom statuses
        s.label = statusText;
        s.icon = 'fa-circle-info';
    }
    return s;
}

function renderResults(results) {
    if (!results || results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state" style="animation: fadeUp 0.5s ease forwards;">
                <div class="icon-circle" style="background: rgba(234,67,53,0.1); color: var(--g-red);">
                    <i class="fa-solid fa-file-circle-xmark"></i>
                </div>
                <h3>لا يوجد طلب بهذا الرقم</h3>
                <p>عذراً، لم نتمكن من العثور على أي طلبات مسجلة بهذا الرقم القومي.</p>
                <p style="font-size: 13px; color: var(--text-dim); margin-top: 5px;">تأكد من كتابة الرقم بشكل صحيح كما في استمارة التقديم.</p>
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = `<h3 class="results-title" style="margin-bottom: 15px; text-align: center; color: var(--text-dim); animation: fadeIn 0.5s ease;">عثرنا على ${results.length} طلب</h3>`;

    results.forEach((app, index) => {
        const s = parseStatus(app.status);
        const typeColor = app.type === 'Tech' ? 'var(--g-blue)' : 'var(--g-green)';
        const typeIcon = app.type === 'Tech' ? 'fa-code' : 'fa-lightbulb';

        const card = document.createElement('div');
        card.className = 'result-card glass-panel premium-card';
        card.style.animationDelay = `${index * 0.15}s`;
        
        // Add glowing top border based on status
        if (s.class === 'status-accepted') card.style.borderTop = "3px solid var(--g-green)";
        else if (s.class === 'status-interview') card.style.borderTop = "3px solid var(--g-purple)";
        else if (s.class === 'status-rejected') card.style.borderTop = "3px solid var(--g-red)";
        else if (s.class === 'status-task-sent' || s.class === 'status-task-done') card.style.borderTop = "3px solid var(--g-blue)";
        else if (s.class === 'status-waitlist') card.style.borderTop = "3px solid var(--g-yellow)";

        let interviewHtml = '';
        if (app.interviewTime && (s.class === 'status-interview' || s.class === 'status-accepted')) {
            interviewHtml = `
                <div class="interview-alert">
                    <div class="icon-wrapper"><i class="fa-solid fa-bell"></i></div>
                    <div class="alert-content">
                        <p>موعد المقابلة الخاص بك:</p>
                        <strong>${app.interviewTime}</strong>
                        <span class="sub-alert">يرجى التواجد قبل الموعد بـ 10 دقائق.</span>
                    </div>
                </div>
            `;
        }

        // Role Info
        let roleHtml = '';
        if (app.type === 'Tech' && app.role && app.role !== 'null') {
            roleHtml = `
                <div class="info-row">
                    <span class="info-label"><i class="fa-solid fa-user-gear"></i> الدور المطلوب (Role)</span>
                    <span class="info-value role-badge">${app.role}</span>
                </div>
            `;
        }

        // Pipeline UI
        const pipeSteps = 5;
        let pipeHtml = '<div class="pipeline-tracker">';
        for (let i = 1; i <= pipeSteps; i++) {
            let pClass = 'pipe-step';
            if (s.pipeline === 0 && i > 1) {
                // Rejected early
                pClass = 'pipe-step'; 
            } else if (i < s.pipeline) {
                pClass = 'pipe-step done';
            } else if (i === s.pipeline) {
                pClass = s.pipeline === 0 ? 'pipe-step fail' : 'pipe-step active';
            }
            pipeHtml += `<div class="${pClass}"></div>`;
            if (i < pipeSteps) pipeHtml += `<div class="pipe-line ${i < s.pipeline ? 'done' : ''}"></div>`;
        }
        pipeHtml += '</div>';

        card.innerHTML = `
            <div class="card-header">
                <div class="applicant-info">
                    <h3>${app.name}</h3>
                    <div class="applicant-type" style="color: ${typeColor}; background: ${typeColor}15; border: 1px solid ${typeColor}40;">
                        <i class="fa-solid ${typeIcon}"></i>
                        ${app.type} Team
                    </div>
                </div>
                <div class="status-badge ${s.class}">
                    <i class="fa-solid ${s.icon}"></i>
                    ${s.label}
                </div>
            </div>
            ${s.pipeline > 0 ? pipeHtml : ''}
            <div class="card-body">
                <div class="info-row">
                    <span class="info-label"><i class="fa-solid fa-layer-group"></i> اللجنة / التراك الأساسي</span>
                    <span class="info-value">${app.committee}</span>
                </div>
                ${roleHtml}
                ${interviewHtml}
            </div>
        `;

        resultsContainer.appendChild(card);
    });
}

function showError(message) {
    resultsContainer.innerHTML = `
        <div class="empty-state" style="animation: fadeUp 0.3s ease forwards;">
            <div class="icon-circle" style="background: rgba(251,188,5,0.1); color: var(--g-yellow);">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <p style="font-weight: 600; font-size: 15px;">${message}</p>
        </div>
    `;
}
