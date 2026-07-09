// script.js
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

let apps = [];
let websites = [];
let exitPasswordValue = "unlock123";

// Request config from backend
if (window.chrome && window.chrome.webview) {
    window.chrome.webview.postMessage({ type: 'LoadConfig' });
}

// Session Tracking
let runningApps = [];
let appDurations = {}; // name -> total duration in ms

function updateTaskbar() {
    const taskbar = document.getElementById('taskbar');
    const hoverArea = document.querySelector('.taskbar-hover-area');
    const minimizedApps = runningApps.filter(a => a.status === 'minimized');
    
    if (minimizedApps.length > 0) {
        taskbar.classList.remove('is-empty');
        if (hoverArea) hoverArea.classList.remove('is-empty');
    } else {
        taskbar.classList.add('is-empty');
        if (hoverArea) hoverArea.classList.add('is-empty');
    }
    
    taskbar.innerHTML = '';
    minimizedApps.forEach(app => {
        const item = document.createElement('div');
        item.className = 'task-item';
        
        const title = document.createElement('span');
        title.innerText = app.name;
        item.appendChild(title);
        
        const controls = document.createElement('div');
        controls.className = 'task-controls';
        
        const minimizeBtn = document.createElement('button');
        minimizeBtn.className = 'win-btn minimize';
        minimizeBtn.innerHTML = '&#8722;'; // -
        minimizeBtn.onclick = (e) => e.stopPropagation(); // Already minimized
        controls.appendChild(minimizeBtn);
        
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'win-btn restore';
        restoreBtn.innerHTML = '<i data-lucide="arrow-up-right" style="width: 14px; height: 14px;"></i>';
        restoreBtn.onclick = (e) => {
            e.stopPropagation();
            restoreApp(app);
        };
        controls.appendChild(restoreBtn);
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'win-btn close';
        closeBtn.innerHTML = '&#10005;'; // X
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.chrome && window.chrome.webview) {
                window.chrome.webview.postMessage({ type: 'CloseApp', id: app.id });
                // Optimistically remove
                const elapsed = new Date() - app.startTime;
                appDurations[app.name] = (appDurations[app.name] || 0) + elapsed;
                runningApps = runningApps.filter(a => a.id !== app.id);
                updateTaskbar();
                resetPanePlaceholders();
            }
        };
        controls.appendChild(closeBtn);
        
        item.appendChild(controls);
        taskbar.appendChild(item);
    });
    
    if (window.lucide) window.lucide.createIcons();
}

function getOpenPanes() {
    return runningApps.filter(a => a.status === 'open').map(a => a.paneId);
}

function getAvailablePane() {
    const openApps = runningApps.filter(a => a.status === 'open');
    if (openApps.length >= (isSplit ? 2 : 1)) {
        return null;
    }
    const appInActive = runningApps.find(a => a.status === 'open' && a.paneId === activePaneId);
    if (!appInActive) {
        return activePaneId;
    }
    return activePaneId === 'pane1' ? 'pane2' : 'pane1';
}

function restoreApp(app) {
    const targetPaneId = getAvailablePane();
    if (!targetPaneId) {
        alert(`Maximum ${isSplit ? 2 : 1} open apps allowed in current layout. Please minimize or close an app first.`);
        return;
    }
    
    app.status = 'open';
    app.paneId = targetPaneId;
    app.startTime = new Date();
    
    updateTaskbar();
    resetPanePlaceholders();
    
    const activePane = document.getElementById(targetPaneId);
    
    setTimeout(() => {
        let rect = activePane.getBoundingClientRect();
        if (!isSplit) {
            rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        }
        
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({
                type: 'RestoreApp',
                id: app.id,
                paneId: targetPaneId,
                bounds: { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
            });
        }
    }, 50);
}

function resetPanePlaceholders() {
    const p1 = document.getElementById('pane1');
    const p2 = document.getElementById('pane2');
    
    const app1 = runningApps.find(a => a.status === 'open' && a.paneId === 'pane1');
    if (app1) {
        p1.querySelector('.placeholder-text').innerText = app1.name + ' (Running)';
    } else {
        p1.querySelector('.placeholder-text').innerText = 'Pane 1' + (activePaneId === 'pane1' ? ' (Active)' : '');
    }
    
    const app2 = runningApps.find(a => a.status === 'open' && a.paneId === 'pane2');
    if (app2) {
        p2.querySelector('.placeholder-text').innerText = app2.name + ' (Running)';
    } else {
        p2.querySelector('.placeholder-text').innerText = 'Pane 2' + (activePaneId === 'pane2' ? ' (Active)' : '');
    }
    
    updateSidebarMode();
}

function updateSidebarMode() {
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
        const hasOpenApps = runningApps.some(a => a.status === 'open');
        if (hasOpenApps) {
            appContainer.classList.add('apps-running');
        } else {
            appContainer.classList.remove('apps-running');
        }
    }
}

function escapeCsv(str) {
    if (!str) return '""';
    return '"' + str.toString().replace(/"/g, '""') + '"';
}

function generateReport(durationStr) {
    // Flush any currently open apps to total duration
    runningApps.forEach(app => {
        if (app.status === 'open') {
            const elapsed = new Date() - app.startTime;
            appDurations[app.name] = (appDurations[app.name] || 0) + elapsed;
        }
    });

    const sessionId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const startTimeStr = startTime ? startTime.toLocaleString() : new Date().toLocaleString();
    
    const activities = Object.entries(appDurations).map(([name, ms]) => {
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${name}: ${m}m ${s}s`;
    }).join('; ');
    const notesStr = sessionNotes.join('\n');
    
    return `${escapeCsv(sessionId)},${escapeCsv(startTimeStr)},${escapeCsv(durationStr)},${escapeCsv(activities)},${escapeCsv(notesStr)},${escapeCsv(sessionNamjapCount)}`;
}

// Notes Logic
let sessionNotes = [];

// Removed notes logic as UI was removed

// Split Screen State
let isSplit = false;
let activePaneId = 'pane1';

const pane1 = document.getElementById('pane1');
const pane2 = document.getElementById('pane2');
const resizer = document.getElementById('resizer');
const workspaceArea = document.getElementById('workspaceArea');

pane1.onclick = () => setActivePane('pane1');
pane2.onclick = () => setActivePane('pane2');

function setActivePane(id) {
    activePaneId = id;
    if (id === 'pane1') {
        pane1.classList.add('active');
        pane2.classList.remove('active');
    } else {
        pane2.classList.add('active');
        pane1.classList.remove('active');
    }
    resetPanePlaceholders();
}

// Resizer logic
let isResizing = false;
resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
});

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const containerRect = workspaceArea.getBoundingClientRect();
    const newLeftFlex = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    const newRightFlex = 100 - newLeftFlex;
    
    if (newLeftFlex > 10 && newRightFlex > 10) {
        pane1.style.flex = `${newLeftFlex}`;
        pane2.style.flex = `${newRightFlex}`;
        sendUpdateBounds();
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        sendUpdateBounds();
    }
});

function sendUpdateBounds() {
    if (!window.chrome || !window.chrome.webview) return;
    
    const panes = [];
    let p1Rect = pane1.getBoundingClientRect();
    if (!isSplit) {
        p1Rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    panes.push({
        id: 'pane1',
        bounds: { x: p1Rect.left, y: p1Rect.top, width: p1Rect.width, height: p1Rect.height }
    });
    
    if (isSplit) {
        const p2Rect = pane2.getBoundingClientRect();
        panes.push({
            id: 'pane2',
            bounds: { x: p2Rect.left, y: p2Rect.top, width: p2Rect.width, height: p2Rect.height }
        });
    }

    window.chrome.webview.postMessage({
        type: 'UpdateBounds',
        panes: panes
    });
}

const appIcons = {
    'vscode': 'code',
    'wsl': 'terminal',
    'antigravity': 'box',
    'slack': 'message-circle',
    'whatsapp': 'phone',
    'whiteboard': 'pen-tool'
};

const appList = document.getElementById("appList");

function initAppList() {
    appList.innerHTML = "";
    apps.forEach(app => {
        const li = document.createElement("li");
    li.className = "icon-btn";
    li.title = app.name;
    
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', appIcons[app.id] || 'app-window');
    li.appendChild(icon);

    li.onclick = () => {
        const minimizedApps = runningApps.filter(a => a.status === 'minimized');
        if (minimizedApps.length >= 4) {
            alert("Maximum 4 minimized apps allowed. Please close one first.");
            return;
        }

        const targetPane = getAvailablePane();
        if (!targetPane) {
            alert(`Maximum ${isSplit ? 2 : 1} open apps allowed in current layout. Please minimize an app first.`);
            return;
        }

        const id = 'app_' + Math.random().toString(36).substring(2, 9);
        
        runningApps.push({
            id: id,
            name: app.name,
            type: 'App',
            startTime: new Date(),
            status: 'open',
            paneId: targetPane
        });
        resetPanePlaceholders();

        setTimeout(() => {
            let rect = document.getElementById(targetPane).getBoundingClientRect();
            if (!isSplit) {
                rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
            }
            const payload = {
                type: 'LaunchApp',
                id: id,
                paneId: targetPane,
                executable: app.executable,
                arguments: app.arguments,
                bounds: {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height
                }
            };
            if (window.chrome && window.chrome.webview) {
                window.chrome.webview.postMessage(payload);
            }
        }, 50);
    };
    appList.appendChild(li);
});
}

const websiteList = document.getElementById("websiteList");

function getWebsiteIcon(site) {
    const url = site.url.toLowerCase();
    const name = site.name.toLowerCase();
    
    if (url.includes('github') || url.includes('bitbucket') || name.includes('git')) return 'code';
    if (url.includes('meet.google') || url.includes('zoom') || name.includes('meet') || name.includes('standup')) return 'video';
    if (url.includes('mail') || url.includes('gmail')) return 'mail';
    if (url.includes('drive.google')) return 'hard-drive';
    if (url.includes('slack') || url.includes('whatsapp') || name.includes('chat')) return 'message-square';
    if (url.includes('vercel') || url.includes('supabase') || name.includes('db')) return 'database';
    if (url.includes('study.iitm') || name.includes('dlp') || name.includes('mr') || name.includes('llm') || name.includes('course')) return 'book-open';
    if (url.includes('youtube')) return 'youtube';
    
    return 'globe'; // Default
}

function initWebsiteList() {
    websiteList.innerHTML = "";
    websites.forEach(site => {
        const li = document.createElement("li");
    li.className = "icon-btn";
    li.title = site.name;
    
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', getWebsiteIcon(site));
    li.appendChild(icon);

    li.onclick = () => {
        const minimizedApps = runningApps.filter(a => a.status === 'minimized');
        if (minimizedApps.length >= 4) {
            alert("Maximum 4 minimized apps allowed. Please close one first.");
            return;
        }

        const targetPane = getAvailablePane();
        if (!targetPane) {
            alert(`Maximum ${isSplit ? 2 : 1} open apps allowed in current layout. Please minimize an app first.`);
            return;
        }

        const rect = document.getElementById(targetPane).getBoundingClientRect();
        const id = 'app_' + Math.random().toString(36).substring(2, 9);
        
        runningApps.push({
            id: id,
            name: site.name,
            type: 'Website',
            startTime: new Date(),
            status: 'open',
            paneId: targetPane
        });

        const payload = {
            type: 'LaunchApp',
            id: id,
            paneId: targetPane,
            executable: edgePath,
            arguments: `--app="${site.url}"`,
            bounds: {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
            }
        };

        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage(payload);
        }
        resetPanePlaceholders();
    };
    websiteList.appendChild(li);
});
}

let allowedDomains = [
    // "study.iitm.ac.in",
    // "bitbucket.org",
    // "drive.google.com",
    // "github.com",
    // "vercel.com",
    // "vercel.app",
    // "helloramp.ai",
    // "blocksite.co",
    // "web.whatsapp.com",
    // "app.slack.com",
    // "meet.google.com",
    // "zoom.us",
    // "gmail.com",
    // "mail.google.com",
    // "shrigondavalekarmaharaj.org",
    // "supabase.com"
];

function isUrlAllowed(urlStr) {
    try {
        const url = new URL(urlStr);
        const host = url.hostname.toLowerCase();
        
        if (host.includes('helloramp')) return true;
        
        for (const domain of allowedDomains) {
            if (host === domain || host.endsWith('.' + domain)) {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

/* 
TO BE DECIDED LATER - Skip the search bar code since we have bookmarks

// URL Navigation using Edge App Mode
document.getElementById('goBtn').onclick = () => {
    const url = document.getElementById('urlInput').value;
    if (url) {
        let finalUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            finalUrl = 'https://' + url;
        }
        
        if (!isUrlAllowed(finalUrl)) {
            document.getElementById(activePaneId).querySelector('.placeholder-text').textContent = 'Not allowed in session';
            return;
        }

        const minimizedApps = runningApps.filter(a => a.status === 'minimized');
        if (minimizedApps.length >= 4) {
            alert("Maximum 4 minimized apps allowed. Please close one first.");
            return;
        }

        const targetPane = getAvailablePane();
        if (!targetPane) {
            alert(`Maximum ${isSplit ? 2 : 1} open apps allowed in current layout. Please minimize an app first.`);
            return;
        }

        const rect = document.getElementById(targetPane).getBoundingClientRect();
        const id = 'app_' + Math.random().toString(36).substring(2, 9);
        
        runningApps.push({
            id: id,
            name: finalUrl,
            type: 'URL',
            startTime: new Date(),
            status: 'open',
            paneId: targetPane
        });

        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({ 
                type: 'LaunchApp', 
                id: id,
                paneId: targetPane,
                executable: edgePath,
                arguments: `--app="${finalUrl}"`,
                bounds: {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height
                }
            });
        }
        resetPanePlaceholders();
    }
};

document.getElementById('urlInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        document.getElementById('goBtn').click();
    }
});
*/

// Session Setup Logic
const sessionSetupModal = document.getElementById("sessionSetupModal");
const sessionDurationSelect = document.getElementById("sessionDurationSelect");
const startSessionBtn = document.getElementById("startSessionBtn");
const timeError = document.getElementById("timeError");

let startTime = null;
let sessionDurationMs = 0;
let isSessionLocked = false;
const timeDisplay = document.getElementById('timeDisplay');
const startTimeDisplay = document.getElementById('startTimeDisplay');

startSessionBtn.onclick = () => {
    const mins = parseInt(sessionDurationSelect.value);
    if (mins > 0) {
        sessionDurationMs = mins * 60 * 1000;
        isSessionLocked = true;
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({ type: 'SetLock', locked: true });
        }
    }
    sessionSetupModal.classList.add("hidden");
    startTime = new Date();
    startTimeDisplay.textContent = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    isTrackerOpen = true;
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage({ type: 'GetTrackerDates' });
        window.chrome.webview.postMessage({ type: 'LoadTrackerData' });
    }
};

setInterval(() => {
    if (!startTime) return;
    const now = new Date();
    const diff = Math.floor((now - startTime) / 1000);
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    timeDisplay.textContent = `${h}:${m}:${s}`;
}, 1000);

// Exit Logic
const exitBtn = document.getElementById('exitBtn');
const exitModal = document.getElementById('exitModal');
const cancelExitBtn = document.getElementById('cancelExitBtn');
const confirmExitBtn = document.getElementById('confirmExitBtn');
const exitPassword = document.getElementById('exitPassword');
const passwordError = document.getElementById('passwordError');

exitBtn.onclick = () => {
    if (isSessionLocked) {
        const elapsed = new Date() - startTime;
        if (elapsed < sessionDurationMs) {
            timeError.classList.remove('hidden');
            passwordError.classList.add('hidden');
            exitPassword.value = '';
            exitModal.classList.remove('hidden');
            return;
        }
    }
    
    exitModal.classList.remove('hidden');
    exitPassword.value = '';
    exitPassword.focus();
    passwordError.classList.add('hidden');
    timeError.classList.add('hidden');
};

exitPassword.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        confirmExitBtn.click();
    }
});

cancelExitBtn.onclick = () => {
    exitModal.classList.add('hidden');
};

confirmExitBtn.onclick = () => {
    if (isSessionLocked) {
        const elapsed = new Date() - startTime;
        if (elapsed < sessionDurationMs) {
            timeError.classList.remove('hidden');
            passwordError.classList.add('hidden');
            return;
        }
    }

    const pwd = exitPassword.value;
    if (pwd === exitPasswordValue) {
        const elapsedMs = startTime ? (new Date() - startTime) : 0;
        const diff = Math.floor(elapsedMs / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        const durationStr = `${h}:${m}:${s}`;

        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({ type: 'GenerateReport', content: generateReport(durationStr) });
            setTimeout(() => {
                window.chrome.webview.postMessage({ type: 'ExitApp' });
            }, 200);
        } else {
            alert("App would exit now. Report generated.");
        }
    } else {
        passwordError.classList.remove('hidden');
        timeError.classList.add('hidden');
    }
};

window.addEventListener('resize', () => {
    sendUpdateBounds();
});

// Tracker Logic
const trackerToggleBtn = document.getElementById('trackerToggleBtn');
const mainWorkspaceView = document.getElementById('mainWorkspaceView');
const trackerWorkspaceView = document.getElementById('trackerWorkspaceView');
const prevDateBtn = document.getElementById('prevDateBtn');
const nextDateBtn = document.getElementById('nextDateBtn');
const reportsList = document.getElementById('reportsList');
const reportContentDiv = document.getElementById('reportContent');
const currentTrackerDateSpan = document.getElementById('currentTrackerDate');
const newGoalInput = document.getElementById('newGoalInput');
const addGoalBtn = document.getElementById('addGoalBtn');
const goalsList = document.getElementById('goalsList');
const newBookInput = document.getElementById('newBookInput');
const addBookBtn = document.getElementById('addBookBtn');
const booksList = document.getElementById('booksList');
const startScoreInput = document.getElementById('startScoreInput');
const startScoreDisplay = document.getElementById('startScoreDisplay');
const todayScoreDisplay = document.getElementById('todayScoreDisplay');
const totalScoreDisplay = document.getElementById('totalScoreDisplay');
const saveTrackerBtn = document.getElementById('saveTrackerBtn');

// Modes & Namjap
const modeSelector = document.getElementById('modeSelector');
const focusModeOverlay = document.getElementById('focusModeOverlay');
const namjapDisplay = document.getElementById('namjapDisplay');
const exitFocusModeBtn = document.getElementById('exitFocusModeBtn');
const smallNamjapCount = document.getElementById('smallNamjapCount');
let sessionNamjapCount = 0;
let totalDayNamjapCount = 0; // Fetched from CSVs

let trackerDates = [];
let selectedDateStr = new Date().toLocaleDateString('en-CA');
let carouselStartDateStr = null;
let trackerData = {}; // Format: { "YYYY-MM-DD": { startScore: 0, goals: [...] } }

function getDayName(date) {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return days[date.getDay()];
}

// Mode Selector Logic

modeSelector.addEventListener('change', (e) => {
    if (e.target.value !== 'none') {
        document.body.classList.add('focus-mode-active');
        focusModeOverlay.classList.remove('hidden');
        
        namjapDisplay.classList.add('hidden');
        
        if (e.target.value === 'namjap') {
            namjapDisplay.classList.remove('hidden');
        }
    }
});

exitFocusModeBtn.onclick = () => {
    document.body.classList.remove('focus-mode-active');
    focusModeOverlay.classList.add('hidden');
    modeSelector.value = 'none';
};

// Global Shortcut for Namjap
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !focusModeOverlay.classList.contains('hidden')) {
        exitFocusModeBtn.click();
    }
    
    // Allow Alt+ArrowUp globally, or just Space/ArrowUp if in Namjap mode
    const isNamjapMode = modeSelector.value === 'namjap';
    if ((e.altKey && e.key === 'ArrowUp') || (isNamjapMode && (e.key === 'ArrowUp' || e.key === ' '))) {
        e.preventDefault(); // Prevent scrolling if Space is pressed
        sessionNamjapCount++;
        namjapDisplay.textContent = sessionNamjapCount;
        smallNamjapCount.textContent = sessionNamjapCount;
        updateScoreUI();
    }
});

let isTrackerOpen = true;
// Tracker is now permanently open, toggle btn is hidden

prevDateBtn.onclick = () => {
    let start = new Date(carouselStartDateStr);
    start.setDate(start.getDate() - 7);
    carouselStartDateStr = start.toLocaleDateString('en-CA');
    renderDateBubbles();
};

nextDateBtn.onclick = () => {
    let start = new Date(carouselStartDateStr);
    start.setDate(start.getDate() + 7);
    carouselStartDateStr = start.toLocaleDateString('en-CA');
    renderDateBubbles();
};

function renderDateBubbles() {
    const carousel = document.getElementById('dateCarousel');
    if (!carousel) return;
    carousel.innerHTML = '';
    
    if (!carouselStartDateStr) {
        let sd = new Date(selectedDateStr);
        sd.setDate(sd.getDate() - 3); // center selected date
        carouselStartDateStr = sd.toLocaleDateString('en-CA');
    }
    
    let start = new Date(carouselStartDateStr);
    let end = new Date(start);
    end.setDate(end.getDate() + 6);
    
    const rangeStr = `${start.toLocaleDateString('en-US', {month:'short', day:'numeric'})} — ${end.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}`;
    document.getElementById('carouselDateRange').textContent = rangeStr;
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dStr = d.toLocaleDateString('en-CA');
        
        const b = document.createElement('div');
        b.className = 'date-item';
        if (dStr === selectedDateStr) b.classList.add('active');
        
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day';
        dayDiv.textContent = getDayName(d);
        
        const dateDiv = document.createElement('div');
        dateDiv.className = 'date';
        dateDiv.textContent = d.getDate();
        
        const dotDiv = document.createElement('div');
        dotDiv.className = 'dot';
        
        b.appendChild(dayDiv);
        b.appendChild(dateDiv);
        b.appendChild(dotDiv);
        
        b.onclick = () => selectDate(dStr);
        carousel.appendChild(b);
    }
}

function selectDate(dateStr) {
    selectedDateStr = dateStr;
    renderDateBubbles();
    
    const [y, m, d_num] = dateStr.split('-');
    const localD = new Date(y, m - 1, d_num);
    const subtitle = localD.toLocaleDateString('en-US', {weekday: 'long', month: 'long', day: 'numeric'});
    
    document.getElementById('reportsDateSubtitle').textContent = subtitle;
    document.getElementById('goalsDateSubtitle').textContent = subtitle;
    
    // Clear UI
    const reportsList = document.getElementById('reportsList');
    reportsList.innerHTML = '';
    reportsList.classList.add('hidden');
    document.getElementById('reportContent').classList.add('hidden');
    document.getElementById('reportContent').innerHTML = '';
    document.getElementById('reportEmptyState').classList.remove('hidden');
    
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage({ type: 'GetReportsForDate', date: dateStr });
    }
    
    updateGoalsUI();
    updateBooksUI();
}

function updateGoalsUI() {
    if (!selectedDateStr) return;
    const dateStr = selectedDateStr;
    if (!trackerData[dateStr]) {
        trackerData[dateStr] = { startScore: 0, goals: [], books: [] };
    }
    
    // Default goals
    if (!trackerData[dateStr].goals) {
        trackerData[dateStr].goals = [
            { text: 'Exercise', completed: false },
            { text: 'Namjap', completed: false }
        ];
    } else if (trackerData[dateStr].goals.length === 0) {
        trackerData[dateStr].goals.push({ text: 'Exercise', completed: false });
        trackerData[dateStr].goals.push({ text: 'Namjap', completed: false });
    }
    
    const data = trackerData[dateStr];
    startScoreInput.value = data.startScore || 0;
    startScoreDisplay.innerText = data.startScore || 0;
    
    goalsList.innerHTML = '';
    
    data.goals.forEach((goal, i) => {
        const li = document.createElement('li');
        if (goal.completed) li.classList.add('completed');
        
        const textSpan = document.createElement('span');
        textSpan.style.flex = '1';
        textSpan.textContent = goal.text;
        
        li.appendChild(textSpan);
        
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-item-btn';
        delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            data.goals.splice(i, 1);
            updateGoalsUI();
        };
        li.appendChild(delBtn);
        
        li.onclick = (e) => {
            if (e.target === delBtn || delBtn.contains(e.target)) return;
            goal.completed = !goal.completed;
            updateGoalsUI();
        };
        goalsList.appendChild(li);
    });
    
    if (window.lucide) window.lucide.createIcons();
    
    const goalsEmptyState = document.getElementById('goalsEmptyState');
    if (data.goals.length === 0) {
        goalsEmptyState.classList.remove('hidden');
    } else {
        goalsEmptyState.classList.add('hidden');
    }
    
    updateScoreUI();
}

function updateBooksUI() {
    if (!selectedDateStr) return;
    const dateStr = selectedDateStr;
    if (!trackerData[dateStr]) {
        trackerData[dateStr] = { startScore: 0, goals: [], books: [] };
    }
    if (!trackerData[dateStr].books) trackerData[dateStr].books = [];
    
    const data = trackerData[dateStr];
    
    booksList.innerHTML = '';
    data.books.forEach((book, i) => {
        const li = document.createElement('li');
        li.className = 'book-item';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'book-name';
        nameDiv.textContent = book.name;
        
        const pageInput = document.createElement('input');
        pageInput.type = 'text';
        pageInput.className = 'book-page';
        pageInput.value = book.page || '';
        pageInput.placeholder = 'Pg';
        pageInput.onchange = (e) => {
            book.page = e.target.value;
        };
        
        const checkDiv = document.createElement('div');
        checkDiv.className = 'book-check' + (book.completed ? ' completed' : '');
        checkDiv.innerHTML = '<i data-lucide="check"></i>';
        checkDiv.onclick = () => {
            book.completed = !book.completed;
            updateBooksUI();
        };
        
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-item-btn';
        delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            data.books.splice(i, 1);
            updateBooksUI();
        };
        
        li.appendChild(nameDiv);
        li.appendChild(pageInput);
        li.appendChild(checkDiv);
        li.appendChild(delBtn);
        
        booksList.appendChild(li);
    });
    
    if (window.lucide) window.lucide.createIcons();
    
    const booksEmptyState = document.getElementById('booksEmptyState');
    if (data.books.length === 0) {
        booksEmptyState.classList.remove('hidden');
    } else {
        booksEmptyState.classList.add('hidden');
    }
    updateScoreUI();
}

function updateScoreUI() {
    if (!selectedDateStr) return;
    const data = trackerData[selectedDateStr];
    if (!data) return;
    
    const completedGoals = (data.goals || []).filter(g => g.completed).length;
    const completedBooks = (data.books || []).filter(b => b.completed).length;
    
    let namjapScore = 0;
    const todayStr = new Date().toLocaleDateString('en-CA');
    if (selectedDateStr === todayStr) {
        const total = totalDayNamjapCount + sessionNamjapCount;
        namjapScore = Math.min(10, Math.floor(total / 1000));
    } else {
        namjapScore = Math.min(10, Math.floor(totalDayNamjapCount / 1000));
    }
    
    const todayScore = (completedGoals * 5) + (completedBooks * 20) + namjapScore;
    todayScoreDisplay.textContent = todayScore;
    const totalScore = parseInt(data.startScore || 0) + todayScore;
    totalScoreDisplay.textContent = totalScore;
}

addGoalBtn.onclick = () => {
    if (!selectedDateStr) return;
    const text = newGoalInput.value.trim();
    if (text) {
        const dateStr = selectedDateStr;
        if (!trackerData[dateStr].goals) trackerData[dateStr].goals = [];
        trackerData[dateStr].goals.push({ text: text, completed: false });
        newGoalInput.value = '';
        updateGoalsUI();
    }
};

addBookBtn.onclick = () => {
    if (!selectedDateStr) return;
    const text = newBookInput.value.trim();
    if (text) {
        const dateStr = selectedDateStr;
        if (!trackerData[dateStr].books) trackerData[dateStr].books = [];
        trackerData[dateStr].books.push({ name: text, page: '', completed: false });
        newBookInput.value = '';
        updateBooksUI();
    }
};

startScoreInput.onchange = () => {
    if (!selectedDateStr) return;
    const dateStr = selectedDateStr;
    trackerData[dateStr].startScore = parseInt(startScoreInput.value) || 0;
    updateScoreUI();
};

if (startScoreDisplay) {
    startScoreDisplay.onclick = () => {
        startScoreDisplay.style.display = 'none';
        startScoreInput.style.display = 'inline-block';
        startScoreInput.focus();
    };
}
if (startScoreInput) {
    startScoreInput.addEventListener('blur', () => {
        startScoreInput.style.display = 'none';
        startScoreDisplay.style.display = 'inline-block';
        startScoreDisplay.innerText = startScoreInput.value || '0';
    });
    startScoreInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            startScoreInput.blur();
        }
    });
}

saveTrackerBtn.onclick = () => {
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage({ type: 'SaveTrackerData', data: JSON.stringify(trackerData) });
        alert("Tracker data saved!");
    }
};

// C# Message Receiver
if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', event => {
        const msg = event.data;
        if (msg.type === 'TrackerDates') {
            trackerDates = msg.dates || [];
            if (!carouselStartDateStr) {
                selectDate(new Date().toLocaleDateString('en-CA'));
            } else {
                renderDateBubbles();
            }
        } else if (msg.type === 'ReportsForDate') {
            totalDayNamjapCount = msg.totalNamjap || 0;
            updateScoreUI();
            
            reportsList.innerHTML = '';
            
            if (msg.reports && msg.reports.length > 0) {
                document.getElementById('reportEmptyState').classList.add('hidden');
                reportsList.classList.add('hidden'); // We won't use the list UI
                reportContentDiv.classList.remove('hidden');
                reportContentDiv.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Loading...</p>';
                // Automatically fetch the first (and usually only) report file's content
                window.chrome.webview.postMessage({ type: 'GetReportContent', path: msg.reports[0].path });

            } else {
                document.getElementById('reportEmptyState').classList.remove('hidden');
                reportsList.classList.add('hidden');
                reportContentDiv.classList.add('hidden');
            }
        } else if (msg.type === 'ReportContent') {
            const text = msg.content;
            const lines = text.split('\n').filter(l => l.trim() !== '');
            if (lines.length <= 1) {
                reportContentDiv.innerHTML = '<p style="color: var(--text-secondary);">No sessions recorded yet.</p>';
            } else {
                let html = '<div class="session-cards">';
                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split('","').map(s => s.replace(/^"|"$/g, ''));
                    if (row.length >= 4) {
                        const startTime = row[1];
                        const duration = row[2];
                        const activitiesStr = row[3];
                        const notes = row[4] ? row[4].trim() : '';
                        
                        const activities = activitiesStr.split('; ').filter(a => a).map(act => {
                            const parts = act.split(': ');
                            return `<span class="activity-badge">${parts[0]} <small>${parts[1]}</small></span>`;
                        }).join('');

                        html += `
                            <div class="session-card">
                                <div class="session-header">
                                    <span class="session-time"><i data-lucide="clock"></i> ${startTime.split(', ')[1] || startTime}</span>
                                    <span class="session-duration">${duration}</span>
                                </div>
                                <div class="session-activities">
                                    ${activities}
                                </div>
                                ${notes ? `<div class="session-notes">${notes}</div>` : ''}
                            </div>
                        `;
                    }
                }
                html += '</div>';
                reportContentDiv.innerHTML = html;
                if (window.lucide) {
                    window.lucide.createIcons();
                }
            }
            reportContentDiv.classList.remove('hidden');
        } else if (msg.type === 'TrackerDataLoaded') {
            try {
                trackerData = JSON.parse(msg.data) || {};
            } catch {
                trackerData = {};
            }
            if (selectedDateStr) {
                updateGoalsUI();
                updateBooksUI();
            }
        } else if (msg.type === 'ForceExitModal') {
            exitBtn.click();
        } else if (msg.type === 'AppMinimized') {
            const minimizedCount = runningApps.filter(a => a.status === 'minimized').length;
            if (minimizedCount >= 4) {
                alert("Maximum 4 minimized apps allowed!");
                window.chrome.webview.postMessage({ type: 'ForceRestore', id: msg.id });
                return;
            }

            const app = runningApps.find(a => a.id === msg.id);
            if (app) {
                const elapsed = new Date() - app.startTime;
                appDurations[app.name] = (appDurations[app.name] || 0) + elapsed;
                app.status = 'minimized';
                app.paneId = null;
                updateTaskbar();
                showTaskbarTemporarily();
                resetPanePlaceholders();
            }
        } else if (msg.type === 'AppClosed') {
            const app = runningApps.find(a => a.id === msg.id);
            if (app) {
                if (app.status === 'open') {
                    const elapsed = new Date() - app.startTime;
                    appDurations[app.name] = (appDurations[app.name] || 0) + elapsed;
                }
                runningApps = runningApps.filter(a => a.id !== msg.id);
                updateTaskbar();
                resetPanePlaceholders();
            }
        } else if (msg.type === 'ConfigLoaded') {
            try {
                const configData = JSON.parse(msg.config);
                if (configData.apps) apps = configData.apps;
                if (configData.websites) websites = configData.websites;
                if (Array.isArray(configData.allowedDomains)) allowedDomains = configData.allowedDomains;
                if (configData.password) exitPasswordValue = configData.password;
                if (configData.testing === true) {
                    const sel = document.getElementById('sessionDurationSelect');
                    const opt = document.createElement('option');
                    opt.value = "1";
                    opt.textContent = "1 Minute (Trial)";
                    sel.insertBefore(opt, sel.firstChild);
                }
            } catch (e) {
                console.error("Failed to parse config.json", e);
            }
            initAppList();
            initWebsiteList();
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    });
}

// Initialize Icons
if (window.lucide) {
    window.lucide.createIcons();
}

let taskbarTimeout;
function showTaskbarTemporarily() {
    const taskbar = document.getElementById('taskbar');
    if (taskbar) {
        taskbar.classList.add('show-temp');
        clearTimeout(taskbarTimeout);
        taskbarTimeout = setTimeout(() => {
            taskbar.classList.remove('show-temp');
        }, 3000); // Wait 3 seconds then slide down
    }
}
