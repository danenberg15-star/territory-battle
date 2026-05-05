// lobby.js - Fixed Responsive Layout for Modern Phones

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
let selectedGameMode = 'multi'; 

// Mobile Drag Globals
let activeTouchElement = null;
let initialX = 0;
let initialY = 0;

// ==========================================
// 2. Language & Terminology
// ==========================================
let currentLang = 'he'; 
const i18n = {
    'he': {
        mainTitle: "<b>Cops Vs. Thieves:</b><br><span>Territory Battle</span>",
        lobbyTitle: "לובי המתנה",
        btnJoin: "הצטרף למשחק קיים",
        btnCreate: "התחל משחק חדש",
        roomCodePlaceholder: "קוד המשחק",
        namePlaceholder: "שם השחקן",
        modeMulti: "קבוצה מול קבוצה",
        modeSingle: "לשחק מול הבוטים",
        copsLbl: "שוטרים 👮‍♂️",
        thievesLbl: "גנבים 🥷",
        btnStart: "התחל משחק<br><span style='font-size:12px; font-weight:normal;'>(לחוויה מיטבית וודא שאינך במצב חיסכון סוללה)</span>"
    },
    'en': {
        mainTitle: "<b>Cops Vs. Thieves:</b><br><span>Territory Battle</span>",
        lobbyTitle: "Waiting Lobby",
        btnJoin: "Join Existing Game",
        btnCreate: "Start New Game",
        roomCodePlaceholder: "Game Code",
        namePlaceholder: "Player Name",
        modeMulti: "Team vs Team",
        modeSingle: "VS Bots",
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
    injectAdvancedToggle();
    setLanguage('he'); 
};

// ==========================================
// 3. UI Injections
// ==========================================
function injectAdvancedToggle() {
    const wrapper = document.getElementById('mode-toggle-wrapper');
    const t = i18n[currentLang];
    
    const toggleHtml = `
        <div class="mode-toggle-container" id="game-mode-toggle">
            <div class="mode-slider"></div>
            <div class="mode-option active" id="opt-multi" onclick="setGameMode('multi')">${t.modeMulti}</div>
            <div class="mode-option" id="opt-single" onclick="setGameMode('single')">${t.modeSingle}</div>
        </div>
        <div id="single-player-opts" style="display: none; width: 100%; max-width: 300px;">
            <label style="color: #38bdf8; font-size: 14px; display: block; margin-bottom: 5px; text-align: right;">כמות בוטים (שוטרים):</label>
            <input type="number" id="bot-count" value="3" min="1" max="5" style="margin-bottom: 10px;">
            <label style="color: #38bdf8; font-size: 14px; display: block; margin-bottom: 5px; text-align: right;">רמת קושי:</label>
            <select id="bot-difficulty" style="width: 100%; padding: 12px; border-radius: 50px; border: 1px solid #38bdf8; background: #1e293b; color: white; text-align: center; font-size: 16px;">
                <option value="rookie">טירון</option>
                <option value="skilled" selected>מיומן</option>
                <option value="elite">עילית</option>
            </select>
        </div>
    `;
    wrapper.innerHTML = toggleHtml;
}

function setGameMode(mode) {
    selectedGameMode = mode;
    const toggle = document.getElementById('game-mode-toggle');
    const optMulti = document.getElementById('opt-multi');
    const optSingle = document.getElementById('opt-single');
    const opts = document.getElementById('single-player-opts');
    const roomInput = document.getElementById('room-code-input');
    const joinBtn = document.getElementById('btn-join-room');

    if (mode === 'single') {
        toggle.classList.add('single-active');
        optSingle.classList.add('active');
        optMulti.classList.remove('active');
        opts.style.display = 'block';
        roomInput.style.display = 'none';
        joinBtn.style.display = 'none';
    } else {
        toggle.classList.remove('single-active');
        optMulti.classList.add('active');
        optSingle.classList.remove('active');
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
    document.getElementById('player-name').placeholder = t.namePlaceholder;
    document.getElementById('room-code-input').placeholder = t.roomCodePlaceholder;
    document.getElementById('btn-join-room').innerHTML = t.btnJoin;
    document.getElementById('btn-create-room').innerHTML = t.btnCreate;
    
    const optMulti = document.getElementById('opt-multi');
    const optSingle = document.getElementById('opt-single');
    if(optMulti) optMulti.innerText = t.modeMulti;
    if(optSingle) optSingle.innerText = t.modeSingle;

    const lobbyTitle = document.getElementById('lbl-lobby-title');
    if(lobbyTitle) lobbyTitle.innerHTML = t.lobbyTitle;
    
    const startBtn = document.getElementById('btn-start-game');
    if(startBtn) startBtn.innerHTML = t.btnStart;
}

function toggleLanguage() { setLanguage(currentLang === 'he' ? 'en' : 'he'); }

async function enableWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } 
    catch (err) { console.warn("WakeLock failed"); }
}

// ==========================================
// 4. Lobby & Room Actions
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

    roomData.players[playerId] = { 
        name: playerName, 
        role: 'thief', 
        t: Date.now(),
        isOffline: false,
        disconnectedAt: null
    };

    if (selectedGameMode === 'single') {
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
        if (!snap.exists()) return alert("משחק לא נמצא");
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
        div.style.padding = '12px';
        div.style.marginBottom = '8px';
        div.style.borderRadius = '20px'; 
        div.style.background = '#334155';
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

function handleTouchMove(e) { if (!activeTouchElement) return; e.preventDefault(); moveTouchElement(e.touches[0].clientX, e.touches[0].clientY); }

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
    el.style.position = ''; el.style.zIndex = ''; el.style.left = ''; el.style.top = ''; el.style.opacity = '';
    activeTouchElement = null;

    if (dropTarget) {
        const copsList = document.getElementById('list-cops');
        const thievesList = document.getElementById('list-thieves');
        const pId = el.dataset.playerId;
        if (copsList.contains(dropTarget)) window.db.ref(`rooms/${currentRoom}/players/${pId}`).update({ role: 'cop' });
        else if (thievesList.contains(dropTarget)) window.db.ref(`rooms/${currentRoom}/players/${pId}`).update({ role: 'thief' });
    }
}

function startGame() {
    window.db.ref(`rooms/${currentRoom}`).once('value', snap => {
        const roomData = snap.val();
        if (!roomData) return;
        const gamePlayers = {};
        Object.keys(roomData.players).forEach(id => {
            gamePlayers[id] = { role: roomData.players[id].role, name: roomData.players[id].name, t: Date.now(), lat: 0, lng: 0 };
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

function exitGame() { location.reload(); }