// lobby.js - Full Version with Drag & Drop & Persistence + QA Interceptor + Offline Persistence

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
        mainTitle: "Territory Battle", lobbyTitle: "לובי המתנה",
        btnJoin: "הצטרף לחדר", btnCreate: "צור חדר חדש",
        roomCodeLbl: "קוד חדר:",
        copsLbl: "שוטרים 👮‍♂️", thievesLbl: "גנבים 🥷",
        btnStart: "התחל משחק<br><span style='font-size:12px; font-weight:normal;'>(לחוויה מיטבית וודא שאינך במצב חיסכון סוללה)</span>"
    },
    'en': {
        mainTitle: "Territory Battle", lobbyTitle: "Waiting Lobby",
        btnJoin: "Join Room", btnCreate: "Create Room",
        roomCodeLbl: "Room Code:",
        copsLbl: "Cops 👮‍♂️", thievesLbl: "Thieves 🥷",
        btnStart: "Start Game<br><span style='font-size:12px; font-weight:normal;'>(Turn off Low Power Mode)</span>"
    }
};

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has('room')) document.getElementById('room-code-input').value = urlParams.get('room');
    setLanguage('he'); 
};

function setLanguage(lang) {
    currentLang = lang;
    document.dir = lang === 'he' ? 'rtl' : 'ltr';
    const t = i18n[lang];
    document.getElementById('lbl-main-title').innerHTML = t.mainTitle;
    document.getElementById('lbl-lobby-title').innerHTML = t.lobbyTitle;
    document.getElementById('btn-join').innerHTML = t.btnJoin;
    document.getElementById('btn-create').innerHTML = t.btnCreate;
    document.getElementById('lbl-room-code').innerHTML = t.roomCodeLbl;
    document.getElementById('lbl-cops').innerHTML = t.copsLbl;
    document.getElementById('lbl-thieves').innerHTML = t.thievesLbl;
    document.getElementById('btn-start-game').innerHTML = t.btnStart;
}

function toggleLanguage() { setLanguage(currentLang === 'he' ? 'en' : 'he'); }

// ==========================================
// 3. Wake Lock Logic
// ==========================================
async function enableWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
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
    window.db.ref(`rooms/${roomId}`).set({ status: 'lobby', host: playerId, createdAt: Date.now() }).then(() => joinRoomLogic(roomId));
}

function joinRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    const roomId = document.getElementById('room-code-input').value.trim();
    
    if (!inputName) return alert("הכנס שם");

    // ==========================================
    // QA Sandbox Interception (99999 / 88888)
    // ==========================================
    if (roomId === '99999' || roomId === '88888') {
        playerName = inputName;
        localStorage.setItem('tb_name', playerName);
        currentRoom = roomId;
        enableWakeLock();
        if (typeof initQARoom === 'function') {
            initQARoom(roomId); // מזניק את ה-QA
        } else {
            alert("שגיאה: קובץ בדיקות (QA) לא נטען כראוי.");
        }
        return;
    }

    if (roomId.length !== 4) return alert("בדוק קוד חדר (4 ספרות)");
    
    playerName = inputName;
    localStorage.setItem('tb_name', playerName);
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
    
    // קריאה מקדימה כדי למנוע דריסת נתוני שחקן בחיבור מחדש למשחק פעיל
    window.db.ref(`rooms/${roomId}`).once('value', snap => {
        const roomData = snap.val();
        if (!roomData) return;

        const isReconnecting = roomData.status === 'playing' && roomData.players && roomData.players[playerId];

        if (!isReconnecting) {
            // התחברות לראשונה או ללובי
            window.db.ref(`rooms/${roomId}/players/${playerId}`).set({ 
                name: playerName, 
                role: 'thief', 
                t: Date.now(),
                isOffline: false,
                disconnectedAt: null
            });
        } else {
            // התחברות מחדש (Reconnect) - עדכון סטטוס חיבור בלבד
            window.db.ref(`rooms/${roomId}/players/${playerId}`).update({ 
                isOffline: false,
                disconnectedAt: null,
                t: Date.now()
            });
        }

        // במקום מחיקה מיידית, מסמנים כלא מקוון לטובת חוק ה-3 דקות
        window.db.ref(`rooms/${roomId}/players/${playerId}`).onDisconnect().update({
            isOffline: true,
            disconnectedAt: firebase.database.ServerValue.TIMESTAMP
        });

        // האזנה לשינויים בחדר
        window.db.ref(`rooms/${roomId}`).on('value', snap => {
            const updatedRoom = snap.val();
            if (!updatedRoom) return;
            
            isHost = (updatedRoom.host === playerId);
            if (isHost) document.getElementById('btn-start-game').style.display = 'block';
            
            if (updatedRoom.status === 'playing') {
                window.db.ref(`rooms/${roomId}`).off(); 
                window.isHost = isHost; 
                window.playerRole = updatedRoom.players[playerId]?.role || 'thief';
                window.currentRoom = currentRoom;
                window.playerId = playerId;
                window.currentLang = currentLang;
                if(typeof enterGameScene === 'function') enterGameScene();
                return;
            }
            renderLobbyPlayers(updatedRoom.players || {});
        });
    });
}

function renderLobbyPlayers(players) {
    const copsDiv = document.getElementById('players-cops');
    const thievesDiv = document.getElementById('players-thieves');
    copsDiv.innerHTML = ""; thievesDiv.innerHTML = "";
    Object.keys(players).forEach(id => {
        const p = players[id];
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerText = p.name + (id === playerId ? " (אתה)" : "");
        
        if (isHost) {
            div.classList.add('draggable');
            div.addEventListener('touchstart', (e) => handleTouchStart(e, id, div), { passive: false });
            div.addEventListener('touchmove', handleTouchMove, { passive: false });
            div.addEventListener('touchend', (e) => handleTouchEnd(e, id, div));
        }

        if (p.role === 'cop') copsDiv.appendChild(div); else thievesDiv.appendChild(div);
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
    el.style.width = rect.width + 'px';
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
    
    // Reset styles
    el.style.position = ''; el.style.zIndex = ''; el.style.left = ''; el.style.top = ''; el.style.width = ''; el.style.opacity = '';
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
    window.db.ref(`game/${currentRoom}`).remove().then(() => {
        window.db.ref(`rooms/${currentRoom}`).update({ status: 'playing', gameStartTime: Date.now() });
    });
}

function shareWhatsApp() {
    const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent("בואו לשחק! " + link)}`, '_blank');
}

function exitGame() { location.reload(); }