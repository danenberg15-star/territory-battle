// login.js - Screen 1: Initialization, Language, and Advanced Pill Toggle[cite: 12]

// ==========================================
// 1. Globals & Persistence
// ==========================================
let playerId = localStorage.getItem('tb_uuid');
if (!playerId) {
    playerId = 'p_' + Math.floor(Math.random() * 999999);
    localStorage.setItem('tb_uuid', playerId);
}

let playerName = localStorage.getItem('tb_name') || "";
let currentRoom = null;
let isHost = false;
let wakeLock = null;
let selectedGameMode = 'multi'; // ברירת מחדל

// Mobile Drag Globals (Shared)
let activeTouchElement = null;
let initialX = 0;
let initialY = 0;

// ==========================================
// 2. Language & Initialization
// ==========================================
let currentLang = 'he'; 
const i18n = {
    'he': {
        mainTitle: "<b>Cops Vs. Thieves:</b><span>Territory Battle</span>",
        lobbyTitle: "לובי המתנה",
        btnJoin: "הצטרף למשחק קיים",
        btnCreate: "התחל משחק חדש",
        roomCodePlaceholder: "קוד המשחק",
        namePlaceholder: "שם השחקן",
        modeMulti: "רב משתתפים",
        modeSingle: "שחקן יחיד (בוטים)"
    },
    'en': {
        mainTitle: "<b>Cops Vs. Thieves:</b><span>Territory Battle</span>",
        lobbyTitle: "Waiting Lobby",
        btnJoin: "Join Room",
        btnCreate: "Create Room",
        roomCodePlaceholder: "Game Code",
        namePlaceholder: "Player Name",
        modeMulti: "Multiplayer",
        modeSingle: "VS Bots"
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

// הזרקת הטוגל המעוגל והאלגנטי[cite: 12]
function injectAdvancedToggle() {
    const loginScreen = document.getElementById('login-screen');
    const roomInput = document.getElementById('room-code-input');
    const t = i18n[currentLang];
    
    const toggleHtml = `
        <div class="mode-toggle-container" id="game-mode-toggle" onclick="toggleGameMode()">
            <div class="mode-slider"></div>
            <div class="mode-option active" id="opt-multi">${t.modeMulti}</div>
            <div class="mode-option" id="opt-single">${t.modeSingle}</div>
        </div>
        <div id="single-player-opts" style="display: none;">
            <div class="opt-group">
                <span class="opt-label">כמות בוטים (שוטרים):</span>
                <input type="number" id="bot-count" value="3" min="1" max="5">
            </div>
            <div class="opt-group">
                <span class="opt-label">רמת קושי:</span>
                <select id="bot-difficulty">
                    <option value="rookie">טירון</option>
                    <option value="skilled" selected>מיומן</option>
                    <option value="elite">עילית</option>
                </select>
            </div>
        </div>
    `;
    
    // הזרקה לפני שדה קוד החדר[cite: 12]
    roomInput.insertAdjacentHTML('beforebegin', toggleHtml);
}

function toggleGameMode() {
    const newMode = selectedGameMode === 'multi' ? 'single' : 'multi';
    setGameMode(newMode);
}

function setGameMode(mode) {
    selectedGameMode = mode;
    const container = document.getElementById('game-mode-toggle');
    const optMulti = document.getElementById('opt-multi');
    const optSingle = document.getElementById('opt-single');
    const optsPanel = document.getElementById('single-player-opts');
    const roomInput = document.getElementById('room-code-input');
    const joinBtn = document.querySelector('button[onclick="joinRoom()"]');

    if (mode === 'single') {
        container.classList.add('single-active');
        optSingle.classList.add('active');
        optMulti.classList.remove('active');
        optsPanel.style.display = 'flex';
        roomInput.style.display = 'none';
        joinBtn.style.display = 'none';
    } else {
        container.classList.remove('single-active');
        optMulti.classList.add('active');
        optSingle.classList.remove('active');
        optsPanel.style.display = 'none';
        roomInput.style.display = 'block';
        joinBtn.style.display = 'block';
    }
}

function setLanguage(lang) {
    currentLang = lang;
    document.dir = lang === 'he' ? 'rtl' : 'ltr';
    const t = i18n[lang];
    document.getElementById('lbl-main-title').innerHTML = t.mainTitle;
    document.getElementById('player-name').placeholder = t.namePlaceholder;
    document.getElementById('room-code-input').placeholder = t.roomCodePlaceholder;
    document.querySelector('button[onclick="joinRoom()"]').innerText = t.btnJoin;
    document.querySelector('button[onclick="createRoom()"]').innerText = t.btnCreate;
}

function toggleLanguage() { setLanguage(currentLang === 'he' ? 'en' : 'he'); }

async function enableWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } 
    catch (err) { console.warn("WakeLock failed"); }
}

// ==========================================
// 3. Room Actions[cite: 12]
// ==========================================
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
        roomData.difficulty = document.getElementById('bot-difficulty').value;
        roomData.botCount = parseInt(document.getElementById('bot-count').value) || 3;
    }

    roomData.players[playerId] = { name: playerName, role: 'thief', t: Date.now(), isOffline: false };

    if (selectedGameMode === 'single') {
        for (let i = 1; i <= roomData.botCount; i++) {
            roomData.players[`bot_cop_${i}`] = { name: `שוטר ${i} (בוט)`, role: 'cop', t: Date.now() };
        }
    }

    window.db.ref(`rooms/${roomId}`).set(roomData).then(() => {
        joinRoomLogic(roomId);
    });
}

function joinRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    const roomId = document.getElementById('room-code-input').value.trim();
    if (!inputName || !roomId) return alert("הכנס שם וקוד");
    
    playerName = inputName;
    currentRoom = roomId;
    enableWakeLock();
    window.db.ref(`rooms/${roomId}/status`).once('value', snap => {
        if (!snap.exists()) return alert("חדר לא נמצא");
        joinRoomLogic(roomId);
    });
}