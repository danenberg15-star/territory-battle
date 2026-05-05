// login.js - Screen 1: Globals, Auth, Language, and Room Creation[cite: 8]

// 1. Globals & Persistence[cite: 8]
let playerId = localStorage.getItem('tb_uuid');
if (!playerId) {
    playerId = 'p_' + Math.floor(Math.random() * 999999);
    localStorage.setItem('tb_uuid', playerId);
}

let playerName = localStorage.getItem('tb_name') || "";
let currentRoom = null;
let isHost = false;
let wakeLock = null;
let selectedGameMode = 'multi'; 
let currentLang = 'he'; 

// Mobile Drag Globals (Shared context)[cite: 8]
let activeTouchElement = null;
let initialX = 0;
let initialY = 0;

// 2. Language & Terminology[cite: 8]
const i18n = {
    'he': {
        mainTitle: "<b>Cops Vs. Thieves:</b><span>Territory Battle</span>",
        lobbyTitle: "לובי המתנה",
        btnJoin: "הצטרף למשחק קיים",
        btnCreate: "התחל משחק חדש",
        roomCodePlaceholder: "קוד המשחק",
        namePlaceholder: "שם השחקן",
        modeMulti: "קבוצה מול קבוצה",
        modeSingle: "לשחק מול הבוטים",
        copsLbl: "שוטרים 👮‍♂️",
        thievesLbl: "גנבים 🥷"
    },
    'en': {
        mainTitle: "<b>Cops Vs. Thieves:</b><span>Territory Battle</span>",
        lobbyTitle: "Waiting Lobby",
        btnJoin: "Join Existing Game",
        btnCreate: "Start New Game",
        roomCodePlaceholder: "Game Code",
        namePlaceholder: "Player Name",
        modeMulti: "Team vs Team",
        modeSingle: "VS Bots",
        copsLbl: "Cops 👮‍♂️",
        thievesLbl: "Thieves 🥷"
    }
};

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has('room')) {
        const roomInput = document.getElementById('room-code-input');
        if (roomInput) roomInput.value = urlParams.get('room');
    }
    injectAdvancedToggle();
    setLanguage('he'); 
};

// 3. UI Injections (Screen 1)[cite: 8]
function injectAdvancedToggle() {
    const wrapper = document.getElementById('mode-toggle-wrapper');
    const t = i18n[currentLang];
    
    const toggleHtml = `
        <div class="mode-toggle-container" id="game-mode-toggle">
            <div class="mode-slider"></div>
            <div class="mode-option active" id="opt-multi" onclick="setGameMode('multi')">${t.modeMulti}</div>
            <div class="mode-option" id="opt-single" onclick="setGameMode('single')">${t.modeSingle}</div>
        </div>
        <div id="single-player-opts" style="display: none;">
            <div class="opt-group">
                <label class="opt-label">כמות בוטים (שוטרים):</label>
                <input type="number" id="bot-count" value="3" min="1" max="5">
            </div>
            <div class="opt-group">
                <label class="opt-label">רמת קושי:</label>
                <select id="bot-difficulty">
                    <option value="rookie">טירון</option>
                    <option value="skilled" selected>מיומן</option>
                    <option value="elite">עילית</option>
                </select>
            </div>
        </div>
    `;
    if (wrapper) wrapper.innerHTML = toggleHtml;
}

function setGameMode(mode) {
    selectedGameMode = mode;
    const toggle = document.getElementById('game-mode-toggle');
    const optMulti = document.getElementById('opt-multi');
    const optSingle = document.getElementById('opt-single');
    const opts = document.getElementById('single-player-opts');
    const roomInput = document.getElementById('room-code-input');
    
    const joinBtn = document.getElementById('btn-join-room') || document.querySelector('button[onclick="joinRoom()"]');

    if (mode === 'single') {
        if(toggle) toggle.classList.add('single-active');
        if(optSingle) optSingle.classList.add('active');
        if(optMulti) optMulti.classList.remove('active');
        if(opts) opts.style.display = 'flex'; 
        if(roomInput) roomInput.style.display = 'none';
        if(joinBtn) joinBtn.style.display = 'none';
    } else {
        if(toggle) toggle.classList.remove('single-active');
        if(optMulti) optMulti.classList.add('active');
        if(optSingle) optSingle.classList.remove('active');
        if(opts) opts.style.display = 'none';
        if(roomInput) roomInput.style.display = 'block';
        if(joinBtn) joinBtn.style.display = 'block';
    }
}

function setLanguage(lang) {
    currentLang = lang;
    document.dir = lang === 'he' ? 'rtl' : 'ltr';
    const t = i18n[lang];
    
    const mainTitle = document.getElementById('lbl-main-title');
    if(mainTitle) mainTitle.innerHTML = t.mainTitle;
    
    const pName = document.getElementById('player-name');
    if(pName) pName.placeholder = t.namePlaceholder;
    
    const rCode = document.getElementById('room-code-input');
    if(rCode) rCode.placeholder = t.roomCodePlaceholder;
}

function toggleLanguage() { setLanguage(currentLang === 'he' ? 'en' : 'he'); }

async function enableWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } 
    catch (err) { console.warn("WakeLock failed"); }
}

// 4. Room Actions (Screen 1 Logic)[cite: 8]
function createRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    if (!inputName) return alert("הכנס שם");
    playerName = inputName;
    localStorage.setItem('tb_name', playerName);
    
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoom = roomId;
    isHost = true;
    enableWakeLock();

    const roomData = { 
        status: 'lobby', 
        host: playerId, 
        createdAt: Date.now(),
        gameMode: selectedGameMode,
        players: {} 
    };

    if (selectedGameMode === 'single') {
        const diffEl = document.getElementById('bot-difficulty');
        const countEl = document.getElementById('bot-count');
        roomData.difficulty = diffEl ? diffEl.value : 'skilled';
        roomData.botCount = countEl ? (parseInt(countEl.value) || 3) : 3;
    }

    roomData.players[playerId] = { name: playerName, role: 'thief', t: Date.now(), isOffline: false, disconnectedAt: null };

    if (selectedGameMode === 'single') {
        for (let i = 1; i <= roomData.botCount; i++) {
            roomData.players[`bot_cop_${i}`] = { name: `שוטר ${i} (בוט)`, role: 'cop', t: Date.now() };
        }
    }

    window.db.ref(`rooms/${roomId}`).set(roomData).then(() => {
        if (typeof joinRoomLogic === 'function') joinRoomLogic(roomId);
    });
}

function joinRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    const roomId = document.getElementById('room-code-input').value.trim();
    if (!inputName || !roomId) return alert("הכנס שם וקוד משחק");
    
    playerName = inputName;
    currentRoom = roomId;
    enableWakeLock();
    window.db.ref(`rooms/${roomId}/status`).once('value', snap => {
        if (!snap.exists()) return alert("משחק לא נמצא");
        if (typeof joinRoomLogic === 'function') joinRoomLogic(roomId);
    });
}