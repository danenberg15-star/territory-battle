// login.js - Screen 1: Login UI, Auth, Language, and Room Creation

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

let currentLang = 'he'; 
const i18n = {
    'he': {
        mainTitle: "Territory Battle",
        lobbyTitle: "לובי המתנה",
        btnJoin: "הצטרף למשחק",
        btnCreate: "צור משחק חדש",
        roomCodeLbl: "קוד משחק:",
        copsLbl: "שוטרים 👮‍♂️",
        thievesLbl: "גנבים 🥷",
        btnStart: "התחל משחק"
    },
    'en': {
        mainTitle: "Territory Battle",
        lobbyTitle: "Waiting Lobby",
        btnJoin: "Join Room",
        btnCreate: "Create Room",
        roomCodeLbl: "Room Code:",
        copsLbl: "Cops 👮‍♂️",
        thievesLbl: "Thieves 🥷",
        btnStart: "Start Game"
    }
};

// ==========================================
// 2. UI Injection (Exact original design)
// ==========================================
function renderLoginScreen() {
    const loginContainer = document.getElementById('login-screen');
    if (!loginContainer) return;
    
    // הזרקת ה-HTML המדויק של מסך הפתיחה
    loginContainer.innerHTML = `
        <h1 id="lbl-main-title">Territory Battle</h1>
        <input type="text" id="player-name" placeholder="הכנס שם שחקן" value="${playerName}" />
        
        <div style="margin: 10px 0; display: flex; flex-direction: column; gap: 5px; align-items: center;">
            <label style="font-size: 12px; color: #94a3b8;"><input type="radio" name="game-mode" value="multi" checked onchange="toggleSinglePlayerOpts()"> רב משתתפים</label>
            <label style="font-size: 12px; color: #94a3b8;"><input type="radio" name="game-mode" value="single" onchange="toggleSinglePlayerOpts()"> נגד בוטים (Single Player)</label>
        </div>

        <div id="single-player-opts" style="display:none; margin-bottom: 10px; width: 100%; max-width: 300px;">
            <input type="number" id="bot-count" placeholder="כמות שוטרים (בוטים)" value="3" />
            <select id="bot-difficulty">
                <option value="rookie">רמת טירון (ילד בן 10)</option>
                <option value="skilled" selected>רמת מיומן (ילד בן 14)</option>
                <option value="elite">רמת עילית (בחור בן 20)</option>
            </select>
        </div>

        <div id="multiplayer-inputs" style="width: 100%; max-width: 300px; display: flex; flex-direction: column; align-items: center;">
            <input type="number" id="room-code-input" placeholder="קוד משחק" />
            <button class="btn btn-blue" id="btn-join" onclick="joinRoom()">הצטרף למשחק</button>
        </div>
        
        <button class="btn btn-red" id="btn-create" onclick="createRoom()">צור משחק חדש</button>
    `;

    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has('room')) {
        document.getElementById('room-code-input').value = urlParams.get('room');
    }
    
    setLanguage('he');
}

// ==========================================
// 3. Logic & Handlers
// ==========================================
window.onload = () => {
    renderLoginScreen();
};

function toggleSinglePlayerOpts() {
    const mode = document.querySelector('input[name="game-mode"]:checked').value;
    const opts = document.getElementById('single-player-opts');
    const multiInputs = document.getElementById('multiplayer-inputs');

    if (mode === 'single') {
        opts.style.display = 'block';
        multiInputs.style.display = 'none';
    } else {
        opts.style.display = 'none';
        multiInputs.style.display = 'flex';
    }
}

function setLanguage(lang) {
    currentLang = lang;
    document.dir = lang === 'he' ? 'rtl' : 'ltr';
    const t = i18n[lang];
    
    const mainTitle = document.getElementById('lbl-main-title');
    if (mainTitle) mainTitle.innerHTML = t.mainTitle;
    
    const lobbyTitle = document.getElementById('lbl-lobby-title');
    if (lobbyTitle) lobbyTitle.innerHTML = t.lobbyTitle;
    
    const btnJoin = document.getElementById('btn-join');
    if (btnJoin) btnJoin.innerHTML = t.btnJoin;
    
    const btnCreate = document.getElementById('btn-create');
    if (btnCreate) btnCreate.innerHTML = t.btnCreate;
    
    const btnStart = document.getElementById('btn-start-game');
    if (btnStart) btnStart.innerHTML = t.btnStart;
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
// 4. Room Actions (Auth & Setup)
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

    const gameMode = document.querySelector('input[name="game-mode"]:checked').value;
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
        if (typeof joinRoomLogic === 'function') joinRoomLogic(roomId);
    });
}

function joinRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    const roomId = document.getElementById('room-code-input').value.trim();
    if (!inputName || !roomId) return alert("מלא שם וקוד חדר");
    
    if (roomId === '99999' || roomId === '88888') {
        playerName = inputName;
        currentRoom = roomId;
        enableWakeLock();
        if (typeof initQARoom === 'function') initQARoom(roomId); 
        return;
    }
    
    playerName = inputName;
    currentRoom = roomId;
    localStorage.setItem('tb_name', playerName);
    enableWakeLock();
    
    window.db.ref(`rooms/${roomId}`).once('value', snap => {
        if (!snap.exists()) return alert("חדר לא נמצא");
        
        window.db.ref(`rooms/${roomId}/players/${playerId}`).update({
            name: playerName,
            role: 'thief',
            t: Date.now(),
            isOffline: false,
            disconnectedAt: null
        }).then(() => {
            if (typeof joinRoomLogic === 'function') joinRoomLogic(roomId);
        });
    });
}