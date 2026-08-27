/**
 * GDGoC HNU Application Status Frontend
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
// EVENT LISTENERS
// ==========================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nationalId = nationalIdInput.value.trim();
    if (nationalId.length !== 14) {
        showError("يرجى إدخال رقم قومي صحيح مكون من 14 رقم.");
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

function renderResults(results) {
    if (!results || results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-file-circle-xmark" style="color: var(--g-red);"></i>
                <p>عذراً، لم نتمكن من العثور على أي طلبات مسجلة بهذا الرقم القومي.</p>
                <p style="font-size: 13px; color: var(--text-dim); margin-top: 5px;">تأكد من كتابة الرقم القومي بشكل صحيح كما في استمارة التقديم.</p>
            </div>
        `;
        return;
    }

    results.forEach((app, index) => {
        // Map status to visual classes
        let statusClass = 'status-pending';
        let statusIcon = 'fa-clock';
        let statusText = app.status;

        // Simple keyword matching for colors
        if (statusText.includes('مقبول') || statusText.includes('Accept')) {
            statusClass = 'status-accepted';
            statusIcon = 'fa-circle-check';
        } else if (statusText.includes('مرفوض') || statusText.includes('Reject')) {
            statusClass = 'status-rejected';
            statusIcon = 'fa-circle-xmark';
        } else if (statusText.includes('مقابل') || statusText.includes('Interview')) {
            statusClass = 'status-interview';
            statusIcon = 'fa-calendar-check';
        }

        const typeColor = app.type === 'Tech' ? 'var(--g-blue)' : 'var(--g-green)';

        const card = document.createElement('div');
        card.className = 'result-card glass-panel';
        card.style.animationDelay = `${index * 0.15}s`;

        let interviewHtml = '';
        if (app.interviewTime && statusClass === 'status-interview') {
            interviewHtml = `
                <div class="interview-alert">
                    <i class="fa-solid fa-bell"></i>
                    <p>موعد المقابلة الخاص بك: <strong>${app.interviewTime}</strong><br>يرجى التواجد قبل الموعد بـ 10 دقائق.</p>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="card-header">
                <div class="applicant-info">
                    <h3>${app.name}</h3>
                    <div class="applicant-type" style="color: ${typeColor}; border: 1px solid ${typeColor}40;">
                        <i class="fa-solid ${app.type === 'Tech' ? 'fa-code' : 'fa-lightbulb'}"></i>
                        ${app.type} Team
                    </div>
                </div>
                <div class="status-badge ${statusClass}">
                    <i class="fa-solid ${statusIcon}"></i>
                    ${statusText}
                </div>
            </div>
            <div class="card-body">
                <div class="info-row">
                    <span class="info-label">اللجنة / التراك</span>
                    <span class="info-value">${app.committee}</span>
                </div>
                ${interviewHtml}
            </div>
        `;

        resultsContainer.appendChild(card);
    });
}

function showError(message) {
    resultsContainer.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid fa-triangle-exclamation" style="color: var(--g-yellow);"></i>
            <p>${message}</p>
        </div>
    `;
}
