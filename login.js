// login.js - Screen 1: Globals, Auth, Language, and Room Creation

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

// Mobile Drag Globals (Shared with lobby.js)
let activeTouchElement = null;
let initialX = 0;
let initialY = 0;

// ==========================================
// 2. Language & Initialization
// ==========================================
let currentLang = 'he'; 
const i18n = {
    'he': {
        mainTitle: "Territory Battle",
        lobbyTitle: "לובי המתנה",
        btnJoin: "הצטרף לחדר",
        btnCreate: "צור חדר חדש",
        roomCodeLbl: "קוד חדר:",
        copsLbl: "שוטרים 👮‍♂️",
        thievesLbl: "גנבים 🥷",
        btnStart: "התחל משחק<br><span style='font-size:12px; font-weight:normal;'>(לחוויה מיטבית וודא שאינך במצב חיסכון סוללה)</span>"
    },
    'en': {
        mainTitle: "Territory Battle",
        lobbyTitle: "Waiting Lobby",
        btnJoin: "Join Room",
        btnCreate: "Create Room",
        roomCodeLbl: "Room Code:",
        copsLbl: "Cops 👮‍♂️",
        thievesLbl: "Thieves 🥷",
        btnStart: "Start Game<br><span style='font-size:12px; font-weight:normal;'>(Turn off Low Power Mode)</span>"
    }
};

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has('room')) {
        document.getElementById('room-code-input').value = urlParams.get('room');
    }
    setLanguage('he'); 
    
    // הזרקת כפתורי בחירת מצב משחק
    const controlsHtml = `
        <div style="margin-bottom: 15px; text-align: center;">
            <label style="color: white; font-weight: bold; margin-left: 15px;">
                <input type="radio" name="gameMode" value="multi" checked onchange="toggleSinglePlayerOpts()"> רב משתתפים
            </label>
            <label style="color: white; font-weight: bold;">
                <input type="radio" name="gameMode" value="single" onchange="toggleSinglePlayerOpts()"> שחקן יחיד (בוטים)
            </label>
        </div>
        <div id="single-player-opts" style="display: none; width: 100%; max-width: 300px; margin-bottom: 15px;">
            <label style="color: #38bdf8; font-size: 14px;">כמות בוטים (שוטרים):</label>
            <input type="number" id="bot-count" value="3" min="1" max="5" style="margin-bottom: 10px;">
            <label style="color: #38bdf8; font-size: 14px;">רמת קושי:</label>
            <select id="bot-difficulty" style="width: 100%; padding: 10px; border-radius: 12px; border: 1px solid #38bdf8; background: #1e293b; color: white;">
                <option value="rookie">טירון</option>
                <option value="skilled" selected>מיומן</option>
                <option value="elite">עילית</option>
            </select>
        </div>
    `;
    document.getElementById('room-code-input').insertAdjacentHTML('beforebegin', controlsHtml);
};

function toggleSinglePlayerOpts() {
    const mode = document.querySelector('input[name="gameMode"]:checked').value;
    const opts = document.getElementById('single-player-opts');
    const roomInput = document.getElementById('room-code-input');
    const joinBtn = document.querySelector('button[onclick="joinRoom()"]');

    if (mode === 'single') {
        opts.style.display = 'block';
        roomInput.style.display = 'none';
        joinBtn.style.display = 'none';
    } else {
        opts.style.display = 'none';
        roomInput.style.display = 'block';
        joinBtn.style.display = 'block';
    }
}

function setLanguage(lang) {
    currentLang = lang;
    document.dir = lang === 'he' ? 'rtl' : 'ltr';
    const t = i18n[lang];
    document.getElementById('lbl-main-title').innerHTML = t.mainTitle;
    document.getElementById('lbl-lobby-title').innerHTML = t.lobbyTitle;
    document.querySelector('button[onclick="joinRoom()"]').innerHTML = t.btnJoin;
    document.querySelector('button[onclick="createRoom()"]').innerHTML = t.btnCreate;
    document.getElementById('btn-start-game').innerHTML = t.btnStart;
}

function toggleLanguage() { setLanguage(currentLang === 'he' ? 'en' : 'he'); }

async function enableWakeLock() {
    try { 
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); 
    } catch (err) {
        console.warn("WakeLock failed");
    }
}

// ==========================================
// 4. Lobby Actions (Auth & Setup)
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

    const gameMode = document.querySelector('input[name="gameMode"]:checked').value;
    const roomData = { 
        status: 'lobby', 
        host: playerId, 
        createdAt: Date.now(),
        gameMode: gameMode,
        players: {} 
    };

    if (gameMode === 'single') {
        roomData.difficulty = document.getElementById('bot-difficulty').value;
        roomData.botCount = parseInt(document.getElementById('bot-count').value) || 3;
    }

    // הוספת השחקן היוצר
    roomData.players[playerId] = { 
        name: playerName, 
        role: 'thief', 
        t: Date.now(),
        isOffline: false,
        disconnectedAt: null
    };

    // הזרקת בוטים ראשונית ללובי
    if (gameMode === 'single') {
        for (let i = 1; i <= roomData.botCount; i++) {
            roomData.players[`bot_cop_${i}`] = { 
                name: `שוטר ${i} (בוט)`, 
                role: 'cop', 
                t: Date.now() 
            };
        }
    }

    window.db.ref(`rooms/${roomId}`).set(roomData).then(() => {
        // קריאה לפונקציה שקיימת בקובץ lobby.js
        joinRoomLogic(roomId);
    });
}

function joinRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    const roomId = document.getElementById('room-code-input').value.trim();
    if (!inputName) return alert("הכנס שם");
    
    if (roomId === '99999' || roomId === '88888') {
        playerName = inputName;
        currentRoom = roomId;
        enableWakeLock();
        if (typeof initQARoom === 'function') initQARoom(roomId); 
        return;
    }
    
    playerName = inputName;
    currentRoom = roomId;
    enableWakeLock();
    window.db.ref(`rooms/${roomId}/status`).once('value', snap => {
        if (!snap.exists()) return alert("חדר לא נמצא");
        // קריאה לפונקציה שקיימת בקובץ lobby.js
        joinRoomLogic(roomId);
    });
}