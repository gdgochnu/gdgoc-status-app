/**
 * GDGoC HNU Application Status Frontend - Enhanced (English)
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
    if (!/^\d{14}$/.test(id)) return "National ID must be exactly 14 digits.";
    
    // Century (2 = 1900s, 3 = 2000s)
    const century = parseInt(id.charAt(0));
    if (century !== 2 && century !== 3) return "Invalid century digit in National ID.";

    // Month
    const month = parseInt(id.substring(3, 5));
    if (month < 1 || month > 12) return "Invalid birth month in National ID.";

    // Day
    const day = parseInt(id.substring(5, 7));
    if (day < 1 || day > 31) return "Invalid birth day in National ID.";

    // Governorate
    const gov = parseInt(id.substring(7, 9));
    const validGovs = [1,2,3,4,11,12,13,14,15,16,17,18,19,21,22,23,24,25,26,27,28,29,31,32,33,34,35,88];
    if (!validGovs.includes(gov)) return "Invalid governorate code in National ID.";

    return null; // Valid
}


// ==========================================
// SOUND EFFECTS ENGINE (Web Audio API)
// ==========================================
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

const SoundFX = {
    playType: () => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.03);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.03);
    },
    playSwoosh: () => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.1);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    },
    playSuccess: () => {
        if (!audioCtx) return;
        const freqs = [523.25, 659.25, 783.99, 1046.50];
        freqs.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            const start = audioCtx.currentTime + (i * 0.1);
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.05, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
            osc.start(start);
            osc.stop(start + 0.4);
        });
    },
    playError: () => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.03, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }
};

// Initialize audio on first interaction
document.addEventListener('click', initAudio, { once: true });
document.addEventListener('keydown', initAudio, { once: true });

// ==========================================
// EVENT LISTENERS
// ==========================================
nationalIdInput.addEventListener('input', () => SoundFX.playType());

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    SoundFX.playSwoosh();
    
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
        showError("⚠️ API URL is not set. Please update API_URL in main.js.");
        return;
    }

    // Set Loading State
    setLoading(true);
    resultsContainer.innerHTML = ''; // Clear previous results

    try {
        const response = await fetch(`${API_URL}?nid=${encodeURIComponent(nationalId)}`);
        
        if (!response.ok) {
            throw new Error('Network error. Failed to connect to server.');
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        renderResults(data.data);

    } catch (error) {
        showError(error.message || "Failed to fetch data. Please check your internet connection.");
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

function parseStatus(app) {
    let ini = app.initialStatus || 'قيد المراجعة';
    let tsk = app.taskStatus || '';
    let intv = app.interviewTime || '';
    let decision = app.interviewDecision || '';

    // Default: Pending at Stage 1
    let s = { class: 'status-pending', icon: 'fa-spinner fa-spin-pulse', label: 'Under Initial Review', pipeline: 1, state: 'active' };

    // 1. Initial Review Rejection
    if (ini.includes('مرفوض') && !tsk) {
        return { class: 'status-rejected', icon: 'fa-ban', label: 'Rejected (Initial Review)', pipeline: 1, state: 'fail', rejectMsg: true };
    }

    // Waitlist at initial
    if (ini.includes('انتظار') && !tsk) {
        return { class: 'status-waitlist', icon: 'fa-hourglass-half', label: 'Waitlisted', pipeline: 1, state: 'wait' };
    }
    
    // Final Interview Decisions override everything else
    if (decision === 'مقبول' || decision === 'مقبول نهائي' || ini === 'مقبول نهائي') {
        return { class: 'status-accepted', icon: 'fa-check-double', label: 'Officially Accepted to the Core Team!', pipeline: 4, state: 'success' };
    }
    if (decision === 'مرفوض') {
        return { class: 'status-rejected', icon: 'fa-ban', label: 'Rejected (Post-Interview)', pipeline: 3, state: 'fail', rejectMsg: true };
    }
    if (decision.includes('انتظار')) {
        return { class: 'status-waitlist', icon: 'fa-hourglass-half', label: 'Waitlisted (Post-Interview)', pipeline: 3, state: 'wait' };
    }

    // 2. Task Phase
    if (tsk || ini.includes('مقبول') || ini.includes('مقابلة') || intv) {
        
        // Rejections in Task phase
        if (tsk.includes('مرفوض') || tsk.includes('لم يقم') || tsk.includes('Not Done') || (ini.includes('مرفوض') && tsk)) {
            let label = tsk.includes('لم يقم') ? 'Rejected (Task Not Submitted)' : 'Rejected (Task Phase)';
            return { class: 'status-rejected', icon: 'fa-xmark', label: label, pipeline: 2, state: 'fail', rejectMsg: true };
        }
        
        // Exact Status Matching
        if (tsk === 'تم التسليم') {
            return { class: 'status-task-done', icon: 'fa-file-circle-check', label: 'Task Submitted (Under Review)', pipeline: 2, state: 'active' };
        }
        if (tsk === 'تم إرسال التاسك') {
            return { class: 'status-task-sent', icon: 'fa-paper-plane', label: 'Task Sent (Awaiting Submission)', pipeline: 2, state: 'active' };
        }
        if (tsk === 'بانتظار الإرسال') {
            return { class: 'status-task-sent', icon: 'fa-hourglass-start', label: 'Initially Accepted (Awaiting Tasks)', pipeline: 2, state: 'active' };
        }
        
        if (tsk.includes('قُبل')) {
            // Passed task! Now check interview
            if (intv || ini.includes('مقابلة') || ini.includes('Interview')) {
                return { class: 'status-interview', icon: 'fa-comments', label: 'Invited for Interview', pipeline: 3, state: 'active' };
            } else if (ini.includes('مرفوض') && tsk.includes('قُبل')) {
                // Passed task but rejected in interview
                return { class: 'status-rejected', icon: 'fa-ban', label: 'Rejected (Post-Interview)', pipeline: 3, state: 'fail', rejectMsg: true };
            } else {
                // Passed task, waiting for interview schedule
                return { class: 'status-accepted', icon: 'fa-check', label: 'Task Accepted (Awaiting Interview Date)', pipeline: 3, state: 'wait' };
            }
        }

        // Direct Interview (e.g. Non-Tech roles that don't have tasks)
        if (intv || ini.includes('مقابلة') || ini.includes('Interview')) {
            return { class: 'status-interview', icon: 'fa-comments', label: 'Invited for Interview', pipeline: 3, state: 'active' };
        }

        // Final Acceptance
        if (ini === 'مقبول نهائي' || (ini.includes('مقبول') && (tsk === 'قُبل التاسك' || !tsk) && !ini.includes('مبدئي'))) {
            if (!tsk && !intv && !ini.includes('نهائي')) {
                return { class: 'status-task-sent', icon: 'fa-hourglass-start', label: 'Initially Accepted (Awaiting Tasks)', pipeline: 2, state: 'active' };
            }
            return { class: 'status-accepted', icon: 'fa-check-double', label: 'Officially Accepted to the Core Team!', pipeline: 4, state: 'success' };
        }

        if (!tsk) {
             // If Non-Tech and no tasks, they are waiting for interview
             if (app.type === 'Non-Tech') {
                 return { class: 'status-accepted', icon: 'fa-hourglass-start', label: 'Initially Accepted (Awaiting Interview Schedule)', pipeline: 2, state: 'active' };
             }
             return { class: 'status-task-sent', icon: 'fa-hourglass-start', label: 'Initially Accepted (Awaiting Tasks)', pipeline: 2, state: 'active' };
        }
    }

    return s;
}

function renderResults(results) {
    if (!results || results.length === 0) {
        SoundFX.playError();
        resultsContainer.innerHTML = `
            <div class="empty-state" style="animation: fadeUp 0.5s ease forwards;">
                <div class="icon-circle" style="background: rgba(234,67,53,0.1); color: var(--g-red);">
                    <i class="fa-solid fa-file-circle-xmark"></i>
                </div>
                <h3>No Application Found</h3>
                <p>Sorry, we couldn't find any application registered with this National ID.</p>
                <p style="font-size: 13px; color: var(--text-dim); margin-top: 5px;">Make sure to write the ID exactly as in your submission form.</p>
            </div>
        `;
        return;
    }

    SoundFX.playSuccess();

    resultsContainer.innerHTML = `<h3 class="results-title" style="margin-bottom: 15px; text-align: center; color: var(--text-dim); animation: fadeIn 0.5s ease;">Found ${results.length} Application(s)</h3>`;

    results.forEach((app, index) => {
        const s = parseStatus(app);
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
        if (app.interviewTime && (s.class === 'status-interview' || s.class === 'status-accepted' || s.state === 'wait')) {
            interviewHtml = `
                <div class="interview-alert">
                    <div class="icon-wrapper"><i class="fa-solid fa-bell"></i></div>
                    <div class="alert-content">
                        <p>Your Interview Schedule:</p>
                        <strong>${app.interviewTime}</strong>
                        <span class="sub-alert">Please be present 10 minutes prior to your time slot.</span>
                    </div>
                </div>
            `;
        }
        
                let missingTaskHtml = '';
        if (s.class === 'status-task-sent' || (app.type === 'Non-Tech' && s.class === 'status-accepted' && s.pipeline === 2)) { 
            if (app.missingTaskStatus) {
                let bClass = app.missingTaskStatus.includes('انتظار') ? 'badge-warning' : 'badge-success';
                missingTaskHtml = `
                    <div class="missing-task-alert">
                        <div class="alert-content">
                            <strong><i class="fa-solid fa-circle-info"></i> Request Submitted</strong>
                            <span class="sub-alert">Your request is: <span class="badge ${bClass}">${app.missingTaskStatus}</span></span>
                        </div>
                    </div>
                `;
            } else {
                const b64Data = btoa(unescape(encodeURIComponent(JSON.stringify(app))));
                missingTaskHtml = `
                    <div class="missing-task-action">
                        <p>Didn't receive the task email?</p>
                        <button class="btn-missing-task" onclick="reportMissingTask('${b64Data}', this)">
                            <i class="fa-solid fa-envelope-open-text"></i> Report Missing Task
                        </button>
                    </div>
                `;
            }
        }

        let rejectionHtml = '';
        if (s.rejectMsg) {
            rejectionHtml = `
                <div class="rejection-alert">
                    <p>We received an overwhelming number of applications this year with exceptionally high competition. Unfortunately, we cannot move forward with your application at this time. We deeply appreciate your interest and wish you the best in your future endeavors!</p>
                </div>
            `;
        }

        // Role Info
        let roleHtml = '';
        if (app.type === 'Tech' && app.role && app.role !== 'null') {
            roleHtml = `
                <div class="info-row">
                    <span class="info-label"><i class="fa-solid fa-user-gear"></i> Applied Role</span>
                    <span class="info-value role-badge">${app.role}</span>
                </div>
            `;
        }

        // Pipeline UI (4 stages)
        const pipeSteps = 4;
        const labels = ['Review', 'Task', 'Interview', 'Final'];
        let pipeHtml = '<div class="pipeline-tracker">';
        for (let i = 1; i <= pipeSteps; i++) {
            let pClass = 'pipe-step';
            
            if (i < s.pipeline) {
                pClass = 'pipe-step done';
            } else if (i === s.pipeline) {
                if (s.state === 'fail') pClass = 'pipe-step fail';
                else if (s.state === 'wait') pClass = 'pipe-step active wait';
                else pClass = 'pipe-step active';
            }
            
            pipeHtml += `
                <div class="pipe-node-wrap" style="animation-delay: ${(i - 1) * 0.25}s">
                    <div class="${pClass}">
                        <i class="pipe-icon"></i>
                    </div>
                    <span class="pipe-label">${labels[i-1]}</span>
                </div>
            `;
            
            if (i < pipeSteps) {
                pipeHtml += `<div class="pipe-line ${i < s.pipeline ? 'done' : (i === s.pipeline && s.state === 'fail' ? 'fail' : '')}" style="animation-delay: ${((i - 1) * 0.25) + 0.15}s"></div>`;
            }
        }
        pipeHtml += '</div>';

        card.innerHTML = `
            <div class="card-header">
                <div class="applicant-info">
                    <h3 style="font-family: 'Outfit', 'Cairo', sans-serif;">${app.name}</h3>
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
            ${pipeHtml}
            <div class="card-body">
                <div class="info-row">
                    <span class="info-label"><i class="fa-solid fa-layer-group"></i> Primary Track</span>
                    <span class="info-value">${app.committee}</span>
                </div>
                ${roleHtml}
                ${interviewHtml}
                ${rejectionHtml}
                ${missingTaskHtml}
            </div>
        `;

        resultsContainer.appendChild(card);
    });
}

function showError(message) {
    SoundFX.playError();
    resultsContainer.innerHTML = `
        <div class="empty-state" style="animation: fadeUp 0.3s ease forwards;">
            <div class="icon-circle" style="background: rgba(251,188,5,0.1); color: var(--g-yellow);">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <p style="font-weight: 600; font-size: 15px;">${message}</p>
        </div>
    `;
}



async function reportMissingTask(b64Data, btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
    
    try {
        const app = JSON.parse(decodeURIComponent(escape(atob(b64Data))));
        
        const params = new URLSearchParams({
            action: 'reportMissingTask',
            nid: nationalIdInput.value.trim(),
            name: app.name,
            email: app.email || '',
            team: app.type,
            role: app.role || app.committee
        });

        const response = await fetch(`${API_URL}?${params.toString()}`);

        const result = await response.json();
        if (result.success) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Submitted';
            btn.classList.add('btn-success');
            setTimeout(() => searchBtn.click(), 1000); // refresh
        } else {
            alert(result.message || 'Error submitting request');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-envelope-open-text"></i> Report Missing Task';
        }
    } catch (e) {
        alert('Network error. Please try again later.');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-envelope-open-text"></i> Report Missing Task';
    }
}

