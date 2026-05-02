// lobby.js - Language, Persistence, Wake Lock & Lobby Management

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
        btnStart: "התחל משחק<br><span style='font-size:12px; font-weight:normal;'>(לחוויה מיטבית וודא שאינך במצב חיסכון סוללה)</span>",
        lblCapture: "תפוס!"
    },
    'en': {
        mainTitle: "Territory Battle", lobbyTitle: "Waiting Lobby",
        btnJoin: "Join Room", btnCreate: "Create Room",
        roomCodeLbl: "Room Code:",
        copsLbl: "Cops 👮‍♂️", thievesLbl: "Thieves 🥷",
        btnStart: "Start Game<br><span style='font-size:12px; font-weight:normal;'>(Turn off Low Power Mode for best experience)</span>",
        lblCapture: "Catch!"
    }
};

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has('room')) {
        document.getElementById('room-code-input').value = urlParams.get('room');
    }
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (lat > 29.4 && lat < 33.4 && lng > 34.2 && lng < 35.9) {
                setLanguage('he');
            } else {
                setLanguage('en');
            }
        }, () => setLanguage('he'));
    }
};

function toggleLanguage() {
    setLanguage(currentLang === 'he' ? 'en' : 'he');
}

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
    document.getElementById('lbl-capture').innerHTML = t.lblCapture;
    document.getElementById('lbl-game-title').innerHTML = t.mainTitle;
    
    document.getElementById('player-name').placeholder = lang === 'he' ? "הכנס שם שחקן" : "Enter Player Name";
    document.getElementById('room-code-input').placeholder = lang === 'he' ? "קוד חדר (4 ספרות)" : "Room Code (4 digits)";
}

// ==========================================
// 3. Wake Lock Logic
// ==========================================
async function enableWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.warn('Wake Lock error:', err);
    }
}
document.addEventListener('visibilitychange', () => {
    if (wakeLock !== null && document.visibilityState === 'visible') enableWakeLock();
});

// ==========================================
// 4. Lobby & Auto-Assign
// ==========================================
function getPlayerName() {
    const inputName = document.getElementById('player-name').value.trim();
    if (!inputName) {
        alert(currentLang === 'he' ? "אנא הכנס שם שחקן" : "Please enter a name");
        return false;
    }
    localStorage.setItem('tb_name', inputName);
    playerName = inputName;
    return true;
}

function createRoom() {
    if (!getPlayerName()) return;
    enableWakeLock();
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoom = roomId;
    isHost = true;
    
    window.db.ref(`rooms/${roomId}`).set({
        status: 'lobby',
        host: playerId,
        createdAt: Date.now()
    }).then(() => {
        joinRoomLogic(roomId);
    });
}

function joinRoom() {
    if (!getPlayerName()) return;
    const roomId = document.getElementById('room-code-input').value.trim();
    if (roomId.length !== 4) {
        alert(currentLang === 'he' ? "קוד חדר חייב להיות 4 ספרות" : "Room code must be 4 digits");
        return;
    }
    enableWakeLock();
    
    window.db.ref(`rooms/${roomId}/status`).once('value', snap => {
        if (!snap.exists()) {
            alert(currentLang === 'he' ? "החדר לא קיים" : "Room not found");
            return;
        }
        currentRoom = roomId;
        joinRoomLogic(roomId);
    });
}

function joinRoomLogic(roomId) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('display-room-code').innerText = roomId;
    
    window.db.ref(`rooms/${roomId}/players`).once('value', snap => {
        const players = snap.val() || {};
        let copsCount = 0;
        let thievesCount = 0;
        
        Object.values(players).forEach(p => {
            if (p.role === 'cop') copsCount++;
            if (p.role === 'thief') thievesCount++;
        });
        
        let assignedRole = copsCount <= thievesCount ? 'cop' : 'thief';
        
        window.db.ref(`rooms/${roomId}/players/${playerId}`).set({
            name: playerName,
            role: assignedRole,
            t: Date.now()
        });

        window.db.ref(`rooms/${roomId}/players/${playerId}`).onDisconnect().remove();
    });

    window.db.ref(`rooms/${roomId}`).on('value', snap => {
        const roomData = snap.val();
        if (!roomData) return exitGame(); 
        
        isHost = (roomData.host === playerId);
        if (isHost) document.getElementById('btn-start-game').style.display = 'block';
        
        if (roomData.status === 'playing') {
            window.db.ref(`rooms/${roomId}`).off(); 
            // Save final role to global window object so game.js can read it
            window.playerRole = roomData.players[playerId]?.role || 'cop';
            window.currentRoom = currentRoom;
            window.playerId = playerId;
            window.currentLang = currentLang;
            
            // Call the function from game.js
            if(typeof enterGameScene === 'function') {
                enterGameScene();
            }
            return;
        }

        renderLobbyPlayers(roomData.players);
    });
}

// ==========================================
// 5. Drag & Drop (Mobile & Desktop)
// ==========================================
function renderLobbyPlayers(players) {
    if (!players) return;
    const copsDiv = document.getElementById('players-cops');
    const thievesDiv = document.getElementById('players-thieves');
    
    copsDiv.innerHTML = "";
    thievesDiv.innerHTML = "";
    
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
            
            div.draggable = true;
            div.ondragstart = (e) => { e.dataTransfer.setData("text/plain", id); };
        }

        if (p.role === 'cop') copsDiv.appendChild(div);
        else if (p.role === 'thief') thievesDiv.appendChild(div);
    });
}

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
    el.style.border = '2px solid #38bdf8';
    
    moveTouchElement(touch.clientX, touch.clientY);
}

function handleTouchMove(e) {
    if (!activeTouchElement) return;
    e.preventDefault(); 
    const touch = e.touches[0];
    moveTouchElement(touch.clientX, touch.clientY);
}

function moveTouchElement(clientX, clientY) {
    activeTouchElement.style.left = (clientX - initialX) + 'px';
    activeTouchElement.style.top = (clientY - initialY) + 'px';
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
    el.style.width = '';
    el.style.opacity = '';
    el.style.border = '1px solid transparent';
    
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

function allowDrop(event) { event.preventDefault(); }
function dragEnter(event) { if(isHost) event.currentTarget.classList.add('drag-over'); }
function dragLeave(event) { if(isHost) event.currentTarget.classList.remove('drag-over'); }
function drop(event, newRole) {
    event.preventDefault();
    if(isHost) event.currentTarget.classList.remove('drag-over');
    if (!isHost) return;
    const targetPlayerId = event.dataTransfer.getData("text/plain");
    if (targetPlayerId && currentRoom) {
        window.db.ref(`rooms/${currentRoom}/players/${targetPlayerId}`).update({ role: newRole });
    }
}

// ==========================================
// 6. Lobby Actions
// ==========================================
function shareWhatsApp() {
    const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    const text = currentLang === 'he' ? 
        `בואו לשחק שוטרים וגנבים! כנסו ללינק: ${link}` : 
        `Join my Territory Battle game! Click here: ${link}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function startGame() {
    window.db.ref(`rooms/${currentRoom}`).update({ status: 'playing' });
}

function exitGame() {
    if (currentRoom) {
        window.db.ref(`rooms/${currentRoom}/players/${playerId}`).remove();
    }
    location.reload();
}