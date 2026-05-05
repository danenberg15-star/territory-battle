// lobby.js - Full Version with Bot Injection, Single Player UI, and Chat Rules

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

// Mobile Drag Globals
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
// 4. Lobby Actions
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
        joinRoomLogic(roomId);
    });
}

function joinRoomLogic(roomId) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('display-room-code').innerText = roomId;
    
    window.db.ref(`rooms/${roomId}`).on('value', snap => {
        const roomData = snap.val();
        if (!roomData) return;
        
        isHost = (roomData.host === playerId);
        if (isHost) document.getElementById('btn-start-game').style.display = 'block';
        
        if (roomData.status === 'playing') {
            window.db.ref(`rooms/${roomId}`).off(); 
            window.isHost = isHost; 
            window.playerRole = roomData.players[playerId]?.role || 'thief';
            window.currentRoom = currentRoom;
            window.playerId = playerId;
            window.currentLang = currentLang;
            if(typeof enterGameScene === 'function') enterGameScene();
            return;
        }
        renderLobbyPlayers(roomData.players || {});
    });
}

function renderLobbyPlayers(players) {
    const copsDiv = document.getElementById('players-cops');
    const thievesDiv = document.getElementById('players-thieves');
    copsDiv.innerHTML = ""; 
    thievesDiv.innerHTML = "";
    
    Object.keys(players).forEach(id => {
        const p = players[id];
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerText = p.name + (id === playerId ? " (אתה)" : "");
        
        if (isHost && !id.startsWith('bot_')) {
            div.classList.add('draggable');
            div.addEventListener('touchstart', (e) => handleTouchStart(e, id, div), { passive: false });
            div.addEventListener('touchmove', handleTouchMove, { passive: false });
            div.addEventListener('touchend', (e) => handleTouchEnd(e, id, div));
        }
        
        if (p.role === 'cop') copsDiv.appendChild(div); 
        else thievesDiv.appendChild(div);
    });
}

// ==========================================
// 5. Drag & Drop Logic
// ==========================================
function handleTouchStart(e, id, el) {
    activeTouchElement = el;
    activeTouchElement.dataset.playerId = id;
    const touch = e.touches[0];
    const rect = el.getBoundingClientRect();
    initialX = touch.clientX - rect.left;
    initialY = touch.clientY - rect.top;
    
    el.style.position = 'fixed';
    el.style.zIndex = '9999';
    el.style.opacity = '0.8';
    moveTouchElement(touch.clientX, touch.clientY);
}

function handleTouchMove(e) {
    if (!activeTouchElement) return;
    e.preventDefault();
    moveTouchElement(e.touches[0].clientX, e.touches[0].clientY);
}

function moveTouchElement(x, y) {
    activeTouchElement.style.left = (x - initialX) + 'px';
    activeTouchElement.style.top = (y - initialY) + 'px';
}

function handleTouchEnd(e, id, el) {
    if (!activeTouchElement) return;
    const touch = e.changedTouches[0];
    el.style.display = 'none';
    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    el.style.display = 'block';
    
    el.style.position = '';
    el.style.zIndex = '';
    el.style.left = '';
    el.style.top = '';
    el.style.opacity = '';
    activeTouchElement = null;

    if (dropTarget) {
        const copsList = document.getElementById('list-cops');
        const thievesList = document.getElementById('list-thieves');
        const pId = el.dataset.playerId;
        if (copsList.contains(dropTarget)) {
            window.db.ref(`rooms/${currentRoom}/players/${pId}`).update({ role: 'cop' });
        } else if (thievesList.contains(dropTarget)) {
            window.db.ref(`rooms/${currentRoom}/players/${pId}`).update({ role: 'thief' });
        }
    }
}

// ==========================================
// 6. Game Start & Bot Injection
// ==========================================
function startGame() {
    window.db.ref(`rooms/${currentRoom}`).once('value', snap => {
        const roomData = snap.val();
        if (!roomData) return;

        const gamePlayers = {};
        // העברת כל השחקנים (כולל בוטים) למבנה המשחק הפעיל
        Object.keys(roomData.players).forEach(id => {
            gamePlayers[id] = {
                role: roomData.players[id].role,
                name: roomData.players[id].name,
                t: Date.now(),
                lat: 0, 
                lng: 0
            };
        });

        const updates = {};
        updates[`rooms/${currentRoom}/status`] = 'playing';
        updates[`rooms/${currentRoom}/gameStartTime`] = Date.now();
        updates[`game/${currentRoom}/players`] = gamePlayers;

        window.db.ref().update(updates);
    });
}

function shareWhatsApp() {
    const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent("בואו לשחק! " + link)}`, '_blank');
}

function exitGame() { 
    location.reload(); 
}