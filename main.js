/**
 * GDGoC HNU Application Status Frontend - Enhanced (English)
 */

// ==========================================
// CONFIGURATION
// ==========================================
// Master Admin System API (Realtime Evaluated Students & Scheduled Appointments)
const MASTER_API_URL = "https://script.google.com/macros/s/AKfycbx6H9hNYnzJkph774lFTLhSgOIQK8C9AC0RnqcFVy85ya4K3UvbnKJyDqOmdQ-uGhJQ/exec";
// Legacy / Fallback Web App URL (Raw Forms Submissions & Missing Task Reporter)
const API_URL = "https://script.google.com/macros/s/AKfycbzkiqzpZB6f0ji-WJFwCZbfqCOBgA55fNmTMKRjTtiESYDn6kshOSbRsxoqTwb9a4Uc3Q/exec"; 

// Supabase High-Performance Backend (Sub-50ms Response Latency)
const SUPABASE_CONFIG = {
    URL: "https://gdjjrhxobivruqadydkv.supabase.co",
    ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkampyaHhvYml2cnVxYWR5ZGt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzY3MDksImV4cCI6MjEwNDAxMjcwOX0.mVXGJ5iAZG9KuAP57ktyUR3D_1R9zaEE3-rEqRTjODA"
}; 

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
// VALIDATION & HELPERS
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

function cleanCandidateText(text) {
    if (!text) return '';
    let s = String(text);
    try {
        s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
        s = s.replace(/[\u2600-\u27BF]/g, '');
        s = s.replace(/[\uFE00-\uFE0F]/g, '');
    } catch(e) {}
    s = s.replace(/[\uFFFD\uFFFE\uFFFF]/g, '');
    return s.replace(/\s+/g, ' ').trim();
}

function formatInterviewerTitle(name) {
    let raw = cleanCandidateText(name);
    if (!raw || raw.toLowerCase() === 'gdgoc team' || raw === '-' || raw.toLowerCase() === 'unknown') {
        return 'Eng. GDGoC Technical Team';
    }
    if (/^eng\.?/i.test(raw) || /^م\.?\s*/i.test(raw) || /^مهندس/i.test(raw)) {
        return raw;
    }
    return 'Eng. ' + raw;
}

// Persistent Multi-Tier Client Cache (In-Memory + SessionStorage + LocalStorage)
const searchCache = new Map();

const CACHE_TTL_SCHEDULED   = 90 * 1000;  // 90 seconds – interview already scheduled, data won't change often
const CACHE_TTL_UNSCHEDULED = 0;           // Never cache – student may get scheduled at any moment

function getCachedApplications(nid) {
    if (searchCache.has(nid)) {
        const mem = searchCache.get(nid);
        // If none of the applications have an interview scheduled, never serve from cache
        const anyScheduled = mem && mem.some(a => a.isScheduled);
        if (!anyScheduled) return null;
        return mem;
    }
    try {
        const stored = sessionStorage.getItem('gdgoc_app_cache_' + nid) || localStorage.getItem('gdgoc_app_cache_' + nid);
        if (stored) {
            const parsed = JSON.parse(stored);
            const anyScheduled = parsed.apps && parsed.apps.some(a => a.isScheduled);
            if (!anyScheduled) {
                // Clear stale no-interview cache so the next fetch is always live
                clearCache(nid);
                return null;
            }
            if (Date.now() - parsed.ts < CACHE_TTL_SCHEDULED) {
                searchCache.set(nid, parsed.apps);
                return parsed.apps;
            }
        }
    } catch(e) {}
    return null;
}

function setCachedApplications(nid, apps) {
    searchCache.set(nid, apps);
    try {
        const payload = JSON.stringify({ ts: Date.now(), apps: apps });
        sessionStorage.setItem('gdgoc_app_cache_' + nid, payload);
        localStorage.setItem('gdgoc_app_cache_' + nid, payload);
    } catch(e) {}
}

function clearCache(nid) {
    searchCache.delete(nid);
    try {
        sessionStorage.removeItem('gdgoc_app_cache_' + nid);
        localStorage.removeItem('gdgoc_app_cache_' + nid);
    } catch(e) {}
}

async function fetchStudentApplications(nationalId) {
    const cleanNid = nationalId.trim();
    const cached = getCachedApplications(cleanNid);
    if (cached) {
        return cached;
    }

    let applications = [];

    // 1. Primary: Lightning-fast query to Supabase PostgreSQL (~20-50ms)
    try {
        const sbUrl = `${SUPABASE_CONFIG.URL}/rest/v1/students?nid=eq.${encodeURIComponent(cleanNid)}`;
        const sbRes = await fetch(sbUrl, {
            headers: {
                'apikey': SUPABASE_CONFIG.ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`
            }
        });
        if (sbRes.ok) {
            const rawList = await sbRes.json();
            if (Array.isArray(rawList) && rawList.length > 0) {
                rawList.forEach(s => {
                    const hasInterview = Boolean(s.interview_scheduled_at && s.interview_scheduled_at !== 'Scheduled' && s.interview_scheduled_at !== '');
                    applications.push({
                        nationalId: s.nid || cleanNid,
                        scheduleId: s.schedule_id || '',
                        type: s.type || 'Tech',
                        name: s.name || 'Applicant',
                        email: s.email || '',
                        committee: cleanCandidateText(s.track) || 'General Track',
                        role: cleanCandidateText(s.role) || null,
                        initialStatus: s.task_status ? 'مقبول' : 'قيد المراجعة',
                        taskStatus: s.task_status || '',
                        taskNotes: s.task_review_notes || '',
                        interviewTime: s.interview_scheduled_at || null,
                        interviewer: s.assigned_interviewer ? formatInterviewerTitle(s.assigned_interviewer) : null,
                        interviewerEmail: s.interviewer_email || '',
                        interviewNotes: s.interview_notes || '',
                        interviewDecision: s.interview_decision || '',
                        isScheduled: hasInterview,
                        attendanceStatus: s.attendance_status || 'Pending',
                        attendanceConfirmedAt: s.attendance_confirmed_at || '',
                        attendanceNote: s.attendance_note || ''
                    });
                });
            }
        }
    } catch (sbErr) {
        console.warn('Supabase query error, fallback to Master API:', sbErr);
    }

    // 2. Fallback: Google Apps Script Master API (if Supabase returned no rows)
    if (applications.length === 0) {
        try {
            const masterRes = await fetch(`${MASTER_API_URL}?action=getStudent&nid=${encodeURIComponent(cleanNid)}`);
            if (masterRes.ok) {
                const data = await masterRes.json();
                let rawList = [];
                if (data.students && Array.isArray(data.students) && data.students.length > 0) {
                    rawList = data.students;
                } else if (data.student && data.student.nid) {
                    rawList = [data.student];
                }

                rawList.forEach(s => {
                    const hasInterview = Boolean(s.interviewScheduledAt && s.interviewScheduledAt !== 'Scheduled' && s.interviewScheduledAt !== '');
                    applications.push({
                        nationalId: s.nid || cleanNid,
                        scheduleId: s.scheduleId || '',
                        type: s.type || 'Tech',
                        name: s.name || 'Applicant',
                        email: s.email || '',
                        committee: cleanCandidateText(s.track) || 'General Track',
                        role: cleanCandidateText(s.role) || null,
                        initialStatus: s.taskStatus ? 'مقبول' : 'قيد المراجعة',
                        taskStatus: s.taskStatus || '',
                        taskNotes: s.taskReviewNotes || '',
                        interviewTime: s.interviewScheduledAt || null,
                        interviewer: s.assignedInterviewer ? formatInterviewerTitle(s.assignedInterviewer) : null,
                        interviewerEmail: s.interviewerEmail || '',
                        interviewNotes: s.interviewNotes || '',
                        interviewDecision: s.interviewDecision || '',
                        isScheduled: hasInterview,
                        attendanceStatus: s.attendanceStatus || 'Pending',
                        attendanceConfirmedAt: s.attendanceConfirmedAt || '',
                        attendanceNote: s.attendanceNote || ''
                    });
                });
            }
        } catch (err) {
            console.warn('Master API fetch error:', err);
        }
    }

    // 2. Fallback to raw form response API ONLY if no applications were found in the master database
    if (applications.length === 0) {
        try {
            const fallbackResponse = await fetch(`${API_URL}?nid=${encodeURIComponent(cleanNid)}`);
            if (fallbackResponse.ok) {
                const fallbackData = await fallbackResponse.json();
                if (fallbackData.data && Array.isArray(fallbackData.data)) {
                    applications = fallbackData.data.map(app => ({
                        ...app,
                        nationalId: app.nationalId || cleanNid,
                        scheduleId: app.scheduleId || '',
                        committee: cleanCandidateText(app.committee),
                        role: cleanCandidateText(app.role),
                        interviewer: app.interviewer ? formatInterviewerTitle(app.interviewer) : null,
                        isScheduled: Boolean(app.interviewTime && app.interviewTime !== ''),
                        attendanceStatus: app.attendanceStatus || 'Pending',
                        attendanceConfirmedAt: app.attendanceConfirmedAt || '',
                        attendanceNote: app.attendanceNote || ''
                    }));
                }
            }
        } catch (fbErr) {
            console.warn('Fallback API error:', fbErr);
        }
    }

    if (applications.length > 0) {
        setCachedApplications(cleanNid, applications);
    }

    return applications;
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

let isSearchInFlight = false;

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSearchInFlight) return;
    
    SoundFX.playSwoosh();
    
    const nationalId = nationalIdInput.value.trim();
    
    // Detailed Validation
    const validationError = validateEgyptianNationalId(nationalId);
    if (validationError) {
        showError(validationError);
        nationalIdInput.style.borderColor = "var(--g-yellow)";
        setTimeout(() => nationalIdInput.style.borderColor = "", 2000);
        return;
    }

    if (API_URL === "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE") {
        showError("⚠️ API URL is not set. Please update API_URL in main.js.");
        return;
    }

    // Instant zero-delay cache hit check
    const cached = getCachedApplications(nationalId);
    if (cached) {
        renderResults(cached);
        localStorage.setItem('gdgoc_saved_nid', nationalId);
        return;
    }

    // Set Loading State
    isSearchInFlight = true;
    setLoading(true);

    try {
        const apps = await fetchStudentApplications(nationalId);
        renderResults(apps);
        // Save ID for auto-fetch on next visit
        localStorage.setItem('gdgoc_saved_nid', nationalId);

    } catch (error) {
        showError(error.message || "Failed to fetch data. Please check your internet connection.");
    } finally {
        setLoading(false);
        isSearchInFlight = false;
    }
});

// ==========================================
// FUNCTIONS
// ==========================================
let countdownIntervals = [];

function clearAllCountdowns() {
    countdownIntervals.forEach(id => clearInterval(id));
    countdownIntervals = [];
}

function parseInterviewDate(dateStr) {
    if (!dateStr || dateStr === 'Scheduled' || dateStr === 'null') return null;
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    let cleaned = String(dateStr).trim().replace(' ', 'T');
    d = new Date(cleaned);
    if (!isNaN(d.getTime())) return d;
    return null;
}

function initCountdown(dateStr, index) {
    const targetDate = parseInterviewDate(dateStr);
    if (!targetDate) return;

    const daysEl = document.getElementById(`cd-days-${index}`);
    const hoursEl = document.getElementById(`cd-hours-${index}`);
    const minsEl = document.getElementById(`cd-mins-${index}`);
    const secsEl = document.getElementById(`cd-secs-${index}`);
    const urgencyEl = document.getElementById(`cd-urgency-${index}`);
    const noticeEl = document.getElementById(`cd-notice-${index}`);
    const cardEl = document.getElementById(`countdown-card-${index}`);

    if (!daysEl || !hoursEl || !minsEl || !secsEl) return;

    function update() {
        const now = Date.now();
        const diff = targetDate.getTime() - now;

        if (diff <= 0) {
            const passedMs = Math.abs(diff);
            const passedHours = passedMs / (1000 * 60 * 60);

            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minsEl.textContent = '00';
            secsEl.textContent = '00';

            if (passedHours < 3) {
                if (urgencyEl) {
                    urgencyEl.textContent = 'In Session';
                    urgencyEl.className = 'countdown-urgency-badge live';
                }
                if (noticeEl) {
                    noticeEl.innerHTML = '<i class="fa-solid fa-fire fa-fade" style="color:var(--g-yellow);"></i> <span><strong>Happening Now:</strong> Your interview session is today! Please be at Building B.</span>';
                }
                if (cardEl) {
                    cardEl.classList.remove('today', 'ended');
                    cardEl.classList.add('urgent');
                }
            } else {
                if (urgencyEl) {
                    urgencyEl.textContent = 'Concluded';
                    urgencyEl.className = 'countdown-urgency-badge ended';
                }
                if (noticeEl) {
                    noticeEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--g-green);"></i> <span>Interview scheduled time has passed. Best of luck with your evaluation!</span>';
                }
                if (cardEl) {
                    cardEl.classList.remove('urgent', 'today');
                    cardEl.classList.add('ended');
                }
            }
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);

        daysEl.textContent = String(days).padStart(2, '0');
        hoursEl.textContent = String(hours).padStart(2, '0');
        minsEl.textContent = String(mins).padStart(2, '0');
        secsEl.textContent = String(secs).padStart(2, '0');

        if (days === 0 && hours < 2) {
            if (urgencyEl) {
                urgencyEl.textContent = 'Starting Soon';
                urgencyEl.className = 'countdown-urgency-badge urgent';
            }
            if (noticeEl) {
                noticeEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation fa-bounce" style="color:var(--g-red);"></i> <span><strong>Final Call:</strong> Arrive at Building B 30 mins before your slot!</span>';
            }
            if (cardEl) {
                cardEl.classList.remove('today', 'ended');
                cardEl.classList.add('urgent');
            }
        } else if (days === 0) {
            if (urgencyEl) {
                urgencyEl.textContent = 'Happening Today';
                urgencyEl.className = 'countdown-urgency-badge today';
            }
            if (noticeEl) {
                noticeEl.innerHTML = '<i class="fa-solid fa-clock fa-spin" style="color:var(--g-yellow); --fa-animation-duration: 4s;"></i> <span><strong>Today is Interview Day!</strong> Make sure your presentation and ID are ready.</span>';
            }
            if (cardEl) {
                cardEl.classList.remove('urgent', 'ended');
                cardEl.classList.add('today');
            }
        } else if (days === 1) {
            if (urgencyEl) {
                urgencyEl.textContent = 'Tomorrow';
                urgencyEl.className = 'countdown-urgency-badge tomorrow';
            }
            if (noticeEl) {
                noticeEl.innerHTML = '<i class="fa-solid fa-bolt" style="color:var(--g-blue);"></i> <span><strong>Tomorrow is your interview:</strong> Review your prep guidelines and confirm attendance.</span>';
            }
            if (cardEl) {
                cardEl.classList.remove('urgent', 'today', 'ended');
            }
        } else {
            if (urgencyEl) {
                urgencyEl.textContent = `${days} Days Left`;
                urgencyEl.className = 'countdown-urgency-badge';
            }
            if (noticeEl) {
                noticeEl.innerHTML = '<i class="fa-solid fa-calendar-days" style="color:var(--g-green);"></i> <span>Plenty of time to prepare — review the checklist below.</span>';
            }
            if (cardEl) {
                cardEl.classList.remove('urgent', 'today', 'ended');
            }
        }
    }

    update();
    const intervalId = setInterval(update, 1000);
    countdownIntervals.push(intervalId);
}

function setLoading(isLoading) {
    if (isLoading) {
        clearAllCountdowns();
        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnIcon.style.display = 'none';
        spinner.style.display = 'block';
        resultsContainer.innerHTML = `
            <div class="skeleton-loader-wrap">
                <div class="skeleton-shimmer-badge">
                    <i class="fa-solid fa-satellite-dish fa-fade"></i> Fetching Live Application Status...
                </div>
                <div class="skeleton-line title"></div>
                <div class="skeleton-line sub"></div>
                <div class="skeleton-grid">
                    <div class="skeleton-box"></div>
                    <div class="skeleton-box"></div>
                </div>
            </div>
        `;
    } else {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnIcon.style.display = 'inline-block';
        spinner.style.display = 'none';
    }
}

function buildGoogleCalendarUrl(app) {
    const targetDate = parseInterviewDate(app.interviewTime);
    if (!targetDate) return '#';
    const endDate = new Date(targetDate.getTime() + 30 * 60 * 1000);

    const formatGDate = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');
    const dates = `${formatGDate(targetDate)}/${formatGDate(endDate)}`;

    const cleanTrack = cleanCandidateText(app.committee) || 'Core Team';
    const title = `GDGoC Core Team Interview - ${cleanTrack}`;
    const details = `Congratulations on qualifying for the official interview with GDGoC Helwan National University Core Team 2026/2027!\n\nCandidate: ${app.name || 'Applicant'}\nTrack: ${cleanTrack}\nRole: ${cleanCandidateText(app.role) || 'General'}\nInterviewer: ${app.interviewer || 'Technical Team'}\nVenue: Helwan National University — Building B (Computer Science), 3rd Floor\n\nPlease arrive 30 minutes before your scheduled appointment with your University or National ID.\nStatus Portal: https://gdgoc-status-app.vercel.app/`;
    const location = `Faculty of Computer Science, Helwan National University, Building B, 3rd Floor`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dates}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
}

window.downloadInterviewICal = function(b64) {
    try {
        const app = JSON.parse(decodeURIComponent(escape(atob(b64))));
        const targetDate = parseInterviewDate(app.interviewTime);
        if (!targetDate) return;
        const endDate = new Date(targetDate.getTime() + 30 * 60 * 1000);

        const formatIcsDate = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');
        const startStr = formatIcsDate(targetDate);
        const endStr = formatIcsDate(endDate);
        const nowStr = formatIcsDate(new Date());

        const cleanTrack = cleanCandidateText(app.committee) || 'Core Team';
        const title = `GDGoC Core Team Interview - ${cleanTrack}`;
        const description = `Official GDGoC Helwan National University Core Team Interview.\\nCandidate: ${app.name || ''}\\nTrack: ${cleanTrack}\\nVenue: Helwan National University — Building B (Computer Science), 3rd Floor.\\nPlease arrive 30 minutes early with your University/National ID.`;
        const location = `Faculty of Computer Science, Helwan National University, Building B, 3rd Floor`;

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//GDGoC HNU//Application Status//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:gdgoc-${Date.now()}@hnu.gdg`,
            `DTSTAMP:${nowStr}`,
            `DTSTART:${startStr}`,
            `DTEND:${endStr}`,
            `SUMMARY:${title}`,
            `DESCRIPTION:${description}`,
            `LOCATION:${location}`,
            'STATUS:CONFIRMED',
            'BEGIN:VALARM',
            'TRIGGER:-PT30M',
            'ACTION:DISPLAY',
            'DESCRIPTION:Reminder: GDGoC Interview in 30 minutes at Building B',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeName = (app.name || 'Applicant').replace(/[^a-zA-Z0-9]/g, '_');
        link.download = `GDGoC_Interview_${safeName}.ics`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch(err) {
        console.error('Failed to generate iCal:', err);
    }
};

function formatInterviewDateTime(dateStr) {
    if (!dateStr || dateStr === 'Scheduled' || dateStr === 'null') return 'Interview Scheduled (Details to be confirmed)';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
        return d.toLocaleDateString('en-US', options) + ' (Cairo Time · GMT+3)';
    } catch(e) {
        return dateStr;
    }
}

function renderPrepGuide(app) {
    const roleLow = String(app.role || '').toLowerCase();
    const trackLow = String(app.committee || '').toLowerCase();
    const isInstructor = roleLow.includes('instructor') || roleLow.includes('مدرس') || roleLow.includes('محاضر');
    const isMentor = roleLow.includes('mentor') || roleLow.includes('مرشد') || roleLow.includes('موجه');
    const isTech = app.type === 'Tech' || ['ai', 'data', 'web', 'cyber'].some(k => trackLow.includes(k));

    if (isInstructor) {
        return `
            <div class="prep-card instructor">
                <span class="prep-pill instructor">Instructor Track Preparation</span>
                <div class="prep-title"><i class="fa-solid fa-graduation-cap"></i> Technical Presentation Demonstration</div>
                <p class="prep-desc">As an <strong>Instructor</strong> candidate, you are requested to prepare a <strong>short presentation or topic (5 to 10 minutes)</strong> related to your track to present live during your interview:</p>
                <ul class="prep-list">
                    <li><i class="fa-solid fa-check"></i> Choose a technical concept within your track that you are passionate about teaching.</li>
                    <li><i class="fa-solid fa-check"></i> Focus on clarity, structuring the topic logically, and simplifying complex ideas for learners.</li>
                    <li><i class="fa-solid fa-check"></i> You will be asked in-depth conceptual and technical questions about your chosen topic.</li>
                    <li><i class="fa-solid fa-check"></i> Feel free to prepare slides, code snippets, or a live coding demo to showcase your delivery.</li>
                </ul>
            </div>
        `;
    } else if (isMentor) {
        return `
            <div class="prep-card mentor">
                <span class="prep-pill mentor">Mentor Track Preparation</span>
                <div class="prep-title"><i class="fa-solid fa-screwdriver-wrench"></i> Live Assessment & Problem Solving</div>
                <p class="prep-desc">As a <strong>Mentor</strong> candidate, your interview will emphasize practical debugging, problem diagnosis, and guiding developers:</p>
                <ul class="prep-list">
                    <li><i class="fa-solid fa-check"></i> <strong>Live Problem-Solving / Bug Fixing:</strong> You may be presented with a practical technical bug or scenario to troubleshoot and walk through your solution.</li>
                    <li><i class="fa-solid fa-check"></i> Be prepared to explain technical concepts clearly and demonstrate your methodology for unblocking team members.</li>
                    <li><i class="fa-solid fa-check"></i> You will be evaluated on your code review mindset, technical empathy, and guidance ability.</li>
                </ul>
            </div>
        `;
    } else if (isTech) {
        return `
            <div class="prep-card tech">
                <span class="prep-pill tech">Technical Role Preparation</span>
                <div class="prep-title"><i class="fa-solid fa-code"></i> Technical Interview Focus</div>
                <p class="prep-desc">Please be prepared to discuss:</p>
                <ul class="prep-list">
                    <li><i class="fa-solid fa-check"></i> Your submitted task, architecture decisions, and implementation details.</li>
                    <li><i class="fa-solid fa-check"></i> Previous practical projects, tech stack experience, and problem-solving methodologies.</li>
                    <li><i class="fa-solid fa-check"></i> Core fundamentals of your track.</li>
                </ul>
            </div>
        `;
    } else {
        return `
            <div class="prep-card nontech">
                <span class="prep-pill nontech">Committee Preparation</span>
                <div class="prep-title"><i class="fa-solid fa-users"></i> Committee Interview Focus</div>
                <p class="prep-desc">Please be prepared to discuss:</p>
                <ul class="prep-list">
                    <li><i class="fa-solid fa-check"></i> Your previous experience and portfolio relevant to this committee.</li>
                    <li><i class="fa-solid fa-check"></i> Situational questions and practical scenarios.</li>
                    <li><i class="fa-solid fa-check"></i> Team collaboration, time commitment, and your vision for GDGoC.</li>
                </ul>
            </div>
        `;
    }
}

function renderAttendanceSection(app, index, currentNid) {
    const isConfirmed = app.attendanceStatus === 'Confirmed';
    const isDeclined = app.attendanceStatus === 'Declined';
    const confTime = app.attendanceConfirmedAt ? formatInterviewDateTime(app.attendanceConfirmedAt) : '';
    const nidVal = app.nationalId || currentNid || '';

    if (isConfirmed) {
        return `
            <div class="attendance-card confirmed" id="attendanceCard-${index}">
                <div class="attendance-card-header">
                    <div class="attendance-badge-icon confirmed">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <div class="attendance-info">
                        <div class="attendance-pill confirmed"><i class="fa-solid fa-check"></i> Attendance Confirmed</div>
                        <h4 class="attendance-title">Interview Attendance Confirmed!</h4>
                        <p class="attendance-desc">Thank you! Your interview attendance has been officially confirmed with the committee. We look forward to meeting you at your scheduled time.</p>
                        ${confTime ? `<div class="attendance-timestamp"><i class="fa-regular fa-clock"></i> Confirmed on: ${confTime}</div>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    if (isDeclined) {
        return `
            <div class="attendance-card declined" id="attendanceCard-${index}">
                <div class="attendance-card-header">
                    <div class="attendance-badge-icon declined">
                        <i class="fa-solid fa-circle-xmark"></i>
                    </div>
                    <div class="attendance-info">
                        <div class="attendance-pill declined"><i class="fa-solid fa-xmark"></i> Declined</div>
                        <h4 class="attendance-title">Interview Attendance Declined</h4>
                        <p class="attendance-desc">The committee has been notified of your declination. If this was made by mistake and you wish to attend, you can re-confirm below:</p>
                        <button class="btn-confirm-attendance sm" onclick="confirmCandidateAttendance('${nidVal}', '${app.type}', '${app.scheduleId || ''}', 'Confirmed', this, ${index})">
                            <i class="fa-solid fa-rotate-left"></i> Re-Confirm Attendance
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    return `
        <div class="attendance-card pending" id="attendanceCard-${index}">
            <div class="attendance-card-header">
                <div class="attendance-badge-icon pending">
                    <i class="fa-solid fa-user-check"></i>
                </div>
                <div class="attendance-info">
                    <div class="attendance-pill pending"><i class="fa-solid fa-hourglass-half"></i> Action Required</div>
                    <h4 class="attendance-title">Confirm Your Interview Attendance</h4>
                    <p class="attendance-desc">Please confirm your attendance for the scheduled date and time above to secure your interview slot with the committee panel:</p>
                </div>
            </div>
            <div class="attendance-actions-row">
                <button class="btn-confirm-attendance" onclick="confirmCandidateAttendance('${nidVal}', '${app.type}', '${app.scheduleId || ''}', 'Confirmed', this, ${index})">
                    <i class="fa-solid fa-check-double"></i> Confirm Attendance
                </button>
                <button class="btn-decline-attendance" onclick="promptDeclineAttendance('${nidVal}', '${app.type}', '${app.scheduleId || ''}', this, ${index})">
                    <i class="fa-solid fa-calendar-xmark"></i> Can't Attend (Decline)
                </button>
            </div>
        </div>
    `;
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

    // 2. Scheduled Interview
    if (intv || app.isScheduled) {
        return { class: 'status-interview', icon: 'fa-calendar-check', label: 'Interview Scheduled', pipeline: 3, state: 'active' };
    }

    // 3. Task Phase
    if (tsk || ini.includes('مقبول') || ini.includes('مقابلة')) {
        // Rejections in Task phase
        if (tsk.includes('مرفوض') || tsk.includes('لم يقم') || tsk.includes('Not Done') || (ini.includes('مرفوض') && tsk)) {
            let label = tsk.includes('لم يقم') ? 'Rejected (Task Not Submitted)' : 'Rejected (Task Phase)';
            return { class: 'status-rejected', icon: 'fa-xmark', label: label, pipeline: 2, state: 'fail', rejectMsg: true };
        }
        
        // Exact Status Matching
        if (tsk === 'تم التسليم') {
            return { class: 'status-task-done', icon: 'fa-file-circle-check', label: 'Task Submitted (Under Review)', pipeline: 2, state: 'active' };
        }
        if (tsk === 'تم إرسال التاسك' || tsk === 'Task Sent' || tsk.includes('إرسال التاسك')) {
            return {
                class: 'status-rejected',
                icon: 'fa-clock-rotate-left',
                label: 'Rejected (Task Deadline Passed)',
                pipeline: 2,
                state: 'fail',
                rejectMsg: true,
                deadlinePassed: true
            };
        }
        if (tsk === 'بانتظار الإرسال') {
            return { class: 'status-task-sent', icon: 'fa-hourglass-start', label: 'Initially Accepted (Awaiting Tasks)', pipeline: 2, state: 'active' };
        }
        
        if (tsk.includes('قُبل') || tsk.includes('قبل') || tsk.includes('accept')) {
            return { class: 'status-accepted', icon: 'fa-hourglass-half', label: 'Task Accepted (Awaiting Interview Date)', pipeline: 3, state: 'wait' };
        }

        // Direct Interview (e.g. Non-Tech roles that don't have tasks)
        if (ini.includes('مقابلة') || ini.includes('Interview')) {
            return { class: 'status-interview', icon: 'fa-calendar-check', label: 'Invited for Interview', pipeline: 3, state: 'active' };
        }

        // Final Acceptance
        if (ini === 'مقبول نهائي' || (ini.includes('مقبول') && (tsk === 'قُبل التاسك' || !tsk) && !ini.includes('مبدئي'))) {
            if (!tsk && !ini.includes('نهائي')) {
                return { class: 'status-task-sent', icon: 'fa-hourglass-start', label: 'Initially Accepted (Awaiting Tasks)', pipeline: 2, state: 'active' };
            }
            return { class: 'status-accepted', icon: 'fa-check-double', label: 'Officially Accepted to the Core Team!', pipeline: 4, state: 'success' };
        }

        if (!tsk) {
             if (app.type === 'Non-Tech') {
                 return { class: 'status-accepted', icon: 'fa-hourglass-half', label: 'Initially Accepted (Awaiting Interview Schedule)', pipeline: 2, state: 'active' };
             }
             return { class: 'status-task-sent', icon: 'fa-hourglass-start', label: 'Initially Accepted (Awaiting Tasks)', pipeline: 2, state: 'active' };
        }
    }

    return s;
}

function renderResults(results) {
    clearAllCountdowns();
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
        const b64App = btoa(unescape(encodeURIComponent(JSON.stringify(app))));
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
        const hasInterview = Boolean(app.interviewTime || app.isScheduled);
        if (hasInterview && (s.class === 'status-interview' || s.class === 'status-accepted' || s.state === 'wait' || s.pipeline >= 3)) {
            const dateDisplay = formatInterviewDateTime(app.interviewTime);
            const interviewerDisplay = app.interviewer ? (app.interviewer.startsWith('Eng.') ? app.interviewer : 'Eng. ' + app.interviewer) : 'Eng. GDGoC Technical Team';

            const countdownHtml = (app.interviewTime && parseInterviewDate(app.interviewTime)) ? `
                <div class="interview-countdown-card" id="countdown-card-${index}">
                    <div class="countdown-card-header">
                        <div class="countdown-badge">
                            <span class="countdown-pulse-ring"></span>
                            <i class="fa-solid fa-hourglass-half"></i>
                            <span>Interview Countdown</span>
                        </div>
                        <div class="countdown-urgency-badge" id="cd-urgency-${index}">Live Sync</div>
                    </div>
                    
                    <div class="countdown-digits-grid">
                        <div class="countdown-digit-box">
                            <span class="countdown-digit-val" id="cd-days-${index}">--</span>
                            <span class="countdown-digit-lbl">Days</span>
                        </div>
                        <span class="countdown-digit-sep">:</span>
                        <div class="countdown-digit-box">
                            <span class="countdown-digit-val" id="cd-hours-${index}">--</span>
                            <span class="countdown-digit-lbl">Hours</span>
                        </div>
                        <span class="countdown-digit-sep">:</span>
                        <div class="countdown-digit-box">
                            <span class="countdown-digit-val" id="cd-mins-${index}">--</span>
                            <span class="countdown-digit-lbl">Mins</span>
                        </div>
                        <span class="countdown-digit-sep">:</span>
                        <div class="countdown-digit-box">
                            <span class="countdown-digit-val" id="cd-secs-${index}">--</span>
                            <span class="countdown-digit-lbl">Secs</span>
                        </div>
                    </div>

                    <div class="countdown-notice-bar" id="cd-notice-${index}">
                        <i class="fa-solid fa-clock"></i>
                        <span>Calculating remaining time to interview...</span>
                    </div>
                </div>
            ` : '';

            const googleCalUrl = buildGoogleCalendarUrl(app);
            const b64App = btoa(unescape(encodeURIComponent(JSON.stringify(app))));
            const calendarActionsHtml = (app.interviewTime && parseInterviewDate(app.interviewTime)) ? `
                <div class="calendar-actions-wrap">
                    <a href="${googleCalUrl}" target="_blank" rel="noopener noreferrer" class="btn-cal google">
                        <i class="fa-brands fa-google"></i> Add to Google Calendar
                    </a>
                    <button type="button" class="btn-cal ical" onclick="downloadInterviewICal('${b64App}')">
                        <i class="fa-solid fa-calendar-plus"></i> Download iCal (.ics)
                    </button>
                </div>
            ` : '';

            interviewHtml = `
                <div class="interview-details-box">
                    <div class="interview-header-row">
                        <span class="interview-tag"><i class="fa-solid fa-calendar-check"></i> Confirmed Appointment</span>
                        <span style="font-size: 11.5px; color: var(--text-dim); font-weight: 600;">GDGoC Core Team 2026/2027</span>
                    </div>

                    ${countdownHtml}

                    <div class="interview-time-display">
                        <div class="interview-time-icon"><i class="fa-solid fa-clock"></i></div>
                        <div class="interview-time-text">
                            <span class="interview-time-label">Date & Time</span>
                            <span class="interview-time-value">${dateDisplay}</span>
                        </div>
                    </div>

                    ${calendarActionsHtml}

                    <div class="interview-location-display">
                        <div class="interview-location-icon"><i class="fa-solid fa-location-dot"></i></div>
                        <div class="interview-location-text">
                            <span class="interview-location-label">Interview Venue / Location</span>
                            <span class="interview-location-value">Helwan National University — Building B (Computer Science), 3rd Floor</span>
                            <span class="interview-location-sub"><i class="fa-solid fa-building-columns"></i> Faculty of Computers &amp; Artificial Intelligence — Building B, 3rd Floor</span>
                        </div>
                    </div>

                    <div class="interview-map-box">
                        <div class="map-header">
                            <div class="map-title">
                                <i class="fa-solid fa-map-location-dot"></i>
                                <span>Campus Location Map</span>
                            </div>
                            <a href="https://maps.google.com/?q=Faculty+of+computer+science+helwan+national+university" target="_blank" rel="noopener noreferrer" class="map-external-link">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i> Open in Google Maps
                            </a>
                        </div>
                        <div class="map-frame-wrapper">
                            <iframe 
                                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1729.9103867705494!2d31.31932196859505!3d29.869442217882174!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x145837e94446de75%3A0x1e81892096f0f8f4!2sFaculty%20of%20computer%20science%20helwan%20national%20university!5e0!3m2!1sar!2seg!4v1788439861082!5m2!1sar!2seg" 
                                allowfullscreen="" 
                                loading="lazy" 
                                referrerpolicy="strict-origin-when-cross-origin"
                                title="Faculty of Computer Science Map"
                            ></iframe>
                        </div>
                        <div class="map-footer-hint">
                            <i class="fa-solid fa-location-crosshairs"></i>
                            <span>Head to <strong>Building B (Computer Science)</strong> &mdash; 3rd Floor upon arrival.</span>
                        </div>
                    </div>

                    <div class="interview-meta-grid">
                        <div class="interview-meta-item">
                            <span class="interview-meta-title"><i class="fa-solid fa-user-tie"></i> Interviewer</span>
                            <span class="interview-meta-val">${interviewerDisplay}</span>
                        </div>
                        <div class="interview-meta-item">
                            <span class="interview-meta-title"><i class="fa-solid fa-layer-group"></i> Committee</span>
                            <span class="interview-meta-val">${app.committee || '-'}</span>
                        </div>
                        ${app.role ? `
                        <div class="interview-meta-item">
                            <span class="interview-meta-title"><i class="fa-solid fa-id-badge"></i> Role</span>
                            <span class="interview-meta-val">${app.role}</span>
                        </div>
                        ` : ''}
                    </div>

                    ${(app.interviewNotes && !app.interviewNotes.toLowerCase().includes('smart auto-generated batch') && !app.interviewNotes.toLowerCase().includes('auto-generated')) ? `
                    <div class="interview-notes-bar">
                        <strong><i class="fa-solid fa-circle-info"></i> Notes:</strong> ${app.interviewNotes}
                    </div>
                    ` : ''}

                    ${renderPrepGuide(app)}

                    ${renderAttendanceSection(app, index, nationalIdInput ? nationalIdInput.value.trim() : '')}

                    <div class="checklist-box">
                        <div class="checklist-title"><i class="fa-solid fa-list-check"></i> Interview Day Checklist</div>
                        <div class="checklist-grid">
                            <div class="checklist-item"><i class="fa-regular fa-clock"></i> Arrive 30 minutes early</div>
                            <div class="checklist-item"><i class="fa-solid fa-building-columns"></i> Venue: Building B (Computer Science), 3rd Floor</div>
                            <div class="checklist-item"><i class="fa-solid fa-id-card"></i> College ID / National ID ready</div>
                            <div class="checklist-item"><i class="fa-regular fa-file-powerpoint"></i> Presentation / tasks ready</div>
                        </div>
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
                        <p style="margin-bottom: 8px; font-size: 13px;">Didn't receive the task email? Provide your correct email:</p>
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <input type="email" id="correctEmail-${index}" class="form-control" style="flex: 1; min-width: 150px; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--panel-border); background: rgba(0,0,0,0.2); color: #fff; font-size: 13px;" placeholder="Correct Email Address" value="${app.email || ''}">
                            <button class="btn-missing-task" onclick="reportMissingTask('${b64Data}', this, 'correctEmail-${index}')" style="margin: 0; padding: 8px 15px; flex-shrink: 0;">
                                <i class="fa-solid fa-paper-plane"></i> Send
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        let rejectionHtml = '';
        if (s.rejectMsg) {
            if (s.deadlinePassed) {
                rejectionHtml = `
                    <div class="rejection-alert">
                        <p style="margin-bottom: 6px; font-weight: 700; color: #fff;"><i class="fa-solid fa-clock-rotate-left" style="color: var(--g-red); margin-right: 6px;"></i> Task Submission Deadline Passed</p>
                        <p style="margin: 0;">The deadline to submit your technical task has ended. Applications without a submitted task prior to the deadline unfortunately cannot advance to the interview stage.</p>
                    </div>
                `;
            } else {
                rejectionHtml = `
                    <div class="rejection-alert">
                        <p>We received an overwhelming number of applications this year with exceptionally high competition. Unfortunately, we cannot move forward with your application at this time. We deeply appreciate your interest and wish you the best in your future endeavors!</p>
                    </div>
                `;
            }
        }

        
        let easterEggHtml = '';
        if (app.type === 'Tech' && s.class === 'status-accepted') {
            easterEggHtml = `
                <div class="tech-easter-egg">
                    <div class="terminal-text">
                        <p>> INITIALIZING PROTOCOLS...</p>
                        <p>> VERIFYING TECH SKILLS...</p>
                        <p class="success">> ACCESS GRANTED. WELCOME.</p>
                    </div>
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
                else if (s.state === 'success') pClass = 'pipe-step done';
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
            ${easterEggHtml}
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
                <div class="card-footer-actions">
                    <button type="button" class="btn-share-status" onclick="openShareModal('${b64App}')">
                        <i class="fa-solid fa-share-nodes"></i> Share Status Card
                    </button>
                </div>
            </div>
        `;

        resultsContainer.appendChild(card);
    });

    // Initialize real-time countdown timers for scheduled interviews
    results.forEach((app, index) => {
        if (app.interviewTime) {
            initCountdown(app.interviewTime, index);
        }
    });
}

function showError(message) {
    clearAllCountdowns();
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



async function reportMissingTask(b64Data, btn, inputId) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
    
    try {
        const app = JSON.parse(decodeURIComponent(escape(atob(b64Data))));
        
        const params = new URLSearchParams({
            action: 'reportMissingTask',
            nid: nationalIdInput.value.trim(),
            name: app.name,
            email: document.getElementById(inputId).value.trim() || app.email || '',
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



// ==========================================
// REMEMBER ME (Auto-Fetch)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    const savedNid = localStorage.getItem('gdgoc_saved_nid');
    if (savedNid) {
        nationalIdInput.value = savedNid;
        // Small delay to ensure everything is ready, then submit
        setTimeout(() => {
            // Dispatch a submit event on the form so the submit listener catches it
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }, 500);
    }
});

// ==========================================
// CANDIDATE ATTENDANCE CONFIRMATION
// ==========================================
window.confirmCandidateAttendance = async function(nid, type, scheduleId, status, btnEl, index) {
    if (!nid && !scheduleId) return;

    const cardEl = document.getElementById(`attendanceCard-${index}`);
    const originalContent = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    }

    try {
        const nowIso = new Date().toISOString();
        const formattedTime = formatInterviewDateTime(nowIso);

        // 1. Instant Real-time update directly to Supabase
        try {
            const sbUrl = `${SUPABASE_CONFIG.URL}/rest/v1/students?nid=eq.${encodeURIComponent(nid)}`;
            fetch(sbUrl, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_CONFIG.ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    attendance_status: status,
                    attendance_confirmed_at: nowIso
                })
            }).catch(e => console.warn('Supabase attendance PATCH err:', e));
        } catch(e) {}

        // 2. Background sync to Google Apps Script
        try {
            const url = `${MASTER_API_URL}?action=confirmAttendance&nid=${encodeURIComponent(nid)}&type=${encodeURIComponent(type || '')}&scheduleId=${encodeURIComponent(scheduleId || '')}&status=${encodeURIComponent(status)}`;
            fetch(url).catch(() => {});
        } catch(e) {}

        SoundFX.playSuccess();

        // Update in-memory & persistent cache
        const list = getCachedApplications(nid);
        if (list && Array.isArray(list)) {
            const found = list.find(a => (a.type || '').toLowerCase() === (type || '').toLowerCase()) || list[0];
            if (found) {
                found.attendanceStatus = status;
                found.attendanceConfirmedAt = nowIso;
                setCachedApplications(nid, list);
            }
        }

            // Morph card into updated state
            if (cardEl) {
                cardEl.className = status === 'Confirmed' ? 'attendance-card confirmed' : 'attendance-card declined';
                if (status === 'Confirmed') {
                    cardEl.innerHTML = `
                        <div class="attendance-card-header" style="animation: scaleIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                            <div class="attendance-badge-icon confirmed">
                                <i class="fa-solid fa-circle-check"></i>
                            </div>
                            <div class="attendance-info">
                                <div class="attendance-pill confirmed"><i class="fa-solid fa-check"></i> Attendance Confirmed</div>
                                <h4 class="attendance-title">Interview Attendance Confirmed!</h4>
                                <p class="attendance-desc">Thank you! Your interview attendance has been officially confirmed with the committee. We look forward to meeting you at your scheduled time.</p>
                                <div class="attendance-timestamp"><i class="fa-regular fa-clock"></i> Confirmed on: ${formattedTime}</div>
                            </div>
                        </div>
                    `;
                } else {
                    cardEl.innerHTML = `
                        <div class="attendance-card-header" style="animation: fadeIn 0.3s ease;">
                            <div class="attendance-badge-icon declined">
                                <i class="fa-solid fa-circle-xmark"></i>
                            </div>
                            <div class="attendance-info">
                                <div class="attendance-pill declined"><i class="fa-solid fa-xmark"></i> Declined</div>
                                <h4 class="attendance-title">Interview Attendance Declined</h4>
                                <p class="attendance-desc">The committee has been notified of your declination. If this was made by mistake and you wish to attend, you can re-confirm below:</p>
                                <button class="btn-confirm-attendance sm" onclick="confirmCandidateAttendance('${nid}', '${type}', '${scheduleId}', 'Confirmed', this, ${index})">
                                    <i class="fa-solid fa-rotate-left"></i> Re-Confirm Attendance
                                </button>
                            </div>
                        </div>
                    `;
                }
            }
    } catch (err) {
        console.error('Attendance confirmation error:', err);
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = originalContent;
        }
        alert('An error occurred while connecting to the server. Please try again.');
    }
};

window.promptDeclineAttendance = function(nid, type, scheduleId, btnEl, index) {
    if (confirm('Are you sure you want to decline this scheduled interview slot? The committee will be notified.')) {
        confirmCandidateAttendance(nid, type, scheduleId, 'Declined', btnEl, index);
    }
};

// ==========================================
// SHARE STATUS MODAL & CARD EXPORT
// ==========================================
let activeShareApp = null;
let activeShareStatus = null;

window.openShareModal = function(b64) {
    try {
        const app = JSON.parse(decodeURIComponent(escape(atob(b64))));
        const s = parseStatus(app);
        activeShareApp = app;
        activeShareStatus = s;

        const dateDisplay = app.interviewTime ? formatInterviewDateTime(app.interviewTime) : '';
        const roleStr = app.role && app.role !== 'null' ? `<span class="share-card-role-badge"><i class="fa-solid fa-id-badge"></i> ${app.role}</span>` : '';

        let appointmentHtml = '';
        if (app.interviewTime && (s.class === 'status-interview' || s.class === 'status-accepted' || s.pipeline >= 3)) {
            appointmentHtml = `
                <div class="share-card-appointment-info">
                    <div><i class="fa-solid fa-calendar-check"></i> <strong>Appointment:</strong> ${dateDisplay}</div>
                    <div style="margin-top:4px;"><i class="fa-solid fa-location-dot"></i> <strong>Venue:</strong> Building B (Computer Science), 3rd Floor</div>
                </div>
            `;
        }

        const previewContainer = document.getElementById('shareCardPreview');
        if (previewContainer) {
            previewContainer.innerHTML = `
                <div class="share-card-top-bar">
                    <div class="share-card-logo-wrap">
                        <img src="LOGO.png" alt="GDGoC Logo" class="share-card-logo">
                        <span class="share-card-brand-name">GDGoC HNU</span>
                    </div>
                    <span class="share-card-season-pill">Core Team 2026/27</span>
                </div>

                <div class="share-card-person">
                    <h3 class="share-card-name">${app.name || 'Applicant'}</h3>
                    <div class="share-card-track-row">
                        <span class="share-card-track-badge">
                            <i class="fa-solid ${app.type === 'Tech' ? 'fa-code' : 'fa-lightbulb'}"></i>
                            ${app.committee || 'General Track'}
                        </span>
                        ${roleStr}
                    </div>
                </div>

                <div class="share-card-status-box">
                    <div class="share-card-status-title">Official Application Status</div>
                    <div class="share-card-status-val">
                        <i class="fa-solid ${s.icon}"></i>
                        <span>${s.label}</span>
                    </div>
                    ${appointmentHtml}
                </div>

                <div class="share-card-footer">
                    <div class="share-card-footer-brand">
                        <i class="fa-solid fa-shield-halved"></i>
                        <span>Verified Application Status</span>
                    </div>
                    <span>gdgoc-status-app.vercel.app</span>
                </div>
            `;
        }

        // WhatsApp Share URL
        const cleanTrack = cleanCandidateText(app.committee) || 'Core Team';
        let shareSummaryText = `🎉 My GDGoC Helwan National University Application Status:\nName: ${app.name || 'Applicant'}\nTrack: ${cleanTrack}\nStatus: ${s.label}`;
        if (app.interviewTime) {
            shareSummaryText += `\nInterview: ${dateDisplay}\nVenue: Building B (Computer Science), 3rd Floor`;
        }
        shareSummaryText += `\n\nCheck your application status here: https://gdgoc-status-app.vercel.app/`;

        const waBtn = document.getElementById('btnShareWhatsApp');
        if (waBtn) {
            waBtn.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareSummaryText)}`;
        }

        const liBtn = document.getElementById('btnShareLinkedIn');
        if (liBtn) {
            liBtn.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://gdgoc-status-app.vercel.app/')}`;
        }

        const toast = document.getElementById('shareToastMsg');
        if (toast) toast.style.display = 'none';

        const modal = document.getElementById('shareModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    } catch(err) {
        console.error('Failed to open share modal:', err);
    }
};

window.closeShareModal = function() {
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.downloadShareCardImage = async function() {
    const btn = document.getElementById('btnDownloadCard');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    }

    try {
        const preview = document.getElementById('shareCardPreview');
        if (window.html2canvas && preview) {
            const canvas = await html2canvas(preview, {
                scale: 2,
                backgroundColor: '#0b1120',
                useCORS: true,
                logging: false
            });
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            const safeName = (activeShareApp && activeShareApp.name ? activeShareApp.name : 'Candidate').replace(/[^a-zA-Z0-9]/g, '_');
            link.download = `GDGoC_Status_${safeName}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            copyShareText();
        }
    } catch (err) {
        console.error('Error generating image:', err);
        alert('Could not generate image on this device. Status summary copied instead.');
        copyShareText();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
};

window.triggerNativeShare = async function() {
    if (!activeShareApp) return;
    const cleanTrack = cleanCandidateText(activeShareApp.committee) || 'Core Team';
    const statusLabel = activeShareStatus ? activeShareStatus.label : 'Applicant';
    const shareText = `🎉 My GDGoC Helwan National University Status: ${statusLabel} for ${cleanTrack}! Check your status at: https://gdgoc-status-app.vercel.app/`;

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'GDGoC Helwan National University Application Status',
                text: shareText,
                url: 'https://gdgoc-status-app.vercel.app/'
            });
        } catch(e) {
            // Cancelled
        }
    } else {
        copyShareText();
    }
};

window.copyShareText = function() {
    if (!activeShareApp) return;
    const cleanTrack = cleanCandidateText(activeShareApp.committee) || 'Core Team';
    const statusLabel = activeShareStatus ? activeShareStatus.label : 'Applicant';
    const dateDisplay = activeShareApp.interviewTime ? formatInterviewDateTime(activeShareApp.interviewTime) : '';

    let text = `🎉 GDGoC Helwan National University Application Status:\nCandidate: ${activeShareApp.name || ''}\nTrack: ${cleanTrack}\nStatus: ${statusLabel}`;
    if (activeShareApp.interviewTime) {
        text += `\nInterview: ${dateDisplay}\nVenue: Building B (Computer Science), 3rd Floor`;
    }
    text += `\nPortal: https://gdgoc-status-app.vercel.app/`;

    navigator.clipboard.writeText(text).then(() => {
        const toast = document.getElementById('shareToastMsg');
        if (toast) {
            toast.textContent = '✓ Summary copied to clipboard!';
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 3000);
        }
    }).catch(() => {
        alert('Failed to copy to clipboard.');
    });
};

document.addEventListener('click', (e) => {
    const modal = document.getElementById('shareModal');
    if (modal && e.target === modal) {
        closeShareModal();
    }
});
