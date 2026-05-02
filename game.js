// game.js - Phase 1: Lobby, Persistence, Language & Game Init

// ==========================================
// 1. Firebase Configuration (ללא שינוי)
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCC3-6oLBu7OrhnC5Kh6t-mkuo3v4gYN4Q",
    authDomain: "territory-battle-56887.firebaseapp.com",
    databaseURL: "https://territory-battle-56887-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "territory-battle-56887",
    storageBucket: "territory-battle-56887.firebasestorage.app",
    messagingSenderId: "1094082573020",
    appId: "1:1094082573020:web:b3ba4455f1636437c33a19"
};
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ==========================================
// 2. Persistence & Globals
// ==========================================
let playerId = localStorage.getItem('tb_uuid');
if (!playerId) {
    playerId = 'p_' + Math.floor(Math.random() * 999999);
    localStorage.setItem('tb_uuid', playerId);
}

let playerName = localStorage.getItem('tb_name') || "";
let currentRoom = null;
let isHost = false;
let playerRole = 'unassigned';
let wakeLock = null;

// Game logic globals (from original code)
let playerMarkers = {};
let areaLayers = [];
let mockLat = 32.1714;
let mockLng = 34.9083;
let thiefPath = []; 
let trailLayer = null;
let lastGpsTimestamp = Date.now();
let map = null;

// ==========================================
// 3. Language & Initialization
// ==========================================
let currentLang = 'he'; // Default
const i18n = {
    'he': {
        mainTitle: "Territory Battle", lobbyTitle: "לובי המתנה",
        btnJoin: "הצטרף לחדר", btnCreate: "צור חדר חדש",
        roomCodeLbl: "קוד חדר:", unassignedLbl: "ממתינים לשיבוץ",
        copsLbl: "שוטרים 👮‍♂️", thievesLbl: "גנבים 🥷",
        btnShare: "📱 שתף בוואטסאפ", 
        btnStart: "התחל משחק<br><span style='font-size:12px; font-weight:normal;'>(לחוויה מיטבית וודא שאינך במצב חיסכון סוללה)</span>",
        lblCapture: "תפוס!"
    },
    'en': {
        mainTitle: "Territory Battle", lobbyTitle: "Waiting Lobby",
        btnJoin: "Join Room", btnCreate: "Create Room",
        roomCodeLbl: "Room Code:", unassignedLbl: "Unassigned",
        copsLbl: "Cops 👮‍♂️", thievesLbl: "Thieves 🥷",
        btnShare: "📱 Share on WhatsApp", 
        btnStart: "Start Game<br><span style='font-size:12px; font-weight:normal;'>(Turn off Low Power Mode for best experience)</span>",
        lblCapture: "Catch!"
    }
};

window.onload = () => {
    // Check for Deep Link
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has('room')) {
        document.getElementById('room-code-input').value = urlParams.get('room');
    }
    
    // Auto-detect Language based on GPS (Israel bounding box approx)
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            if (lat > 29.4 && lat < 33.4 && lng > 34.2 && lng < 35.9) {
                setLanguage('he');
            } else {
                setLanguage('en');
            }
        }, () => setLanguage('he')); // Fallback
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
    document.getElementById('lbl-unassigned').innerHTML = t.unassignedLbl;
    document.getElementById('lbl-cops').innerHTML = t.copsLbl;
    document.getElementById('lbl-thieves').innerHTML = t.thievesLbl;
    document.getElementById('btn-share').innerHTML = t.btnShare;
    document.getElementById('btn-start-game').innerHTML = t.btnStart;
    document.getElementById('lbl-capture').innerHTML = t.lblCapture;
    document.getElementById('lbl-game-title').innerHTML = t.mainTitle;
    
    document.getElementById('player-name').placeholder = lang === 'he' ? "הכנס שם שחקן" : "Enter Player Name";
    document.getElementById('room-code-input').placeholder = lang === 'he' ? "קוד חדר (4 ספרות)" : "Room Code (4 digits)";
}

// ==========================================
// 4. Wake Lock Logic
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
// 5. Lobby & Room Management
// ==========================================
function getPlayerName() {
    const inputName = document.getElementById('player-name').value.trim();
    if (!inputName) return alert(currentLang === 'he' ? "אנא הכנס שם שחקן" : "Please enter a name");
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
    
    db.ref(`rooms/${roomId}`).set({
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
    if (roomId.length !== 4) return alert(currentLang === 'he' ? "קוד חדר חייב להיות 4 ספרות" : "Room code must be 4 digits");
    enableWakeLock();
    
    db.ref(`rooms/${roomId}/status`).once('value', snap => {
        if (!snap.exists()) return alert(currentLang === 'he' ? "החדר לא קיים" : "Room not found");
        currentRoom = roomId;
        joinRoomLogic(roomId);
    });
}

function joinRoomLogic(roomId) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('display-room-code').innerText = roomId;
    
    // Add player to room
    db.ref(`rooms/${roomId}/players/${playerId}`).set({
        name: playerName,
        role: 'unassigned',
        t: Date.now()
    });

    db.ref(`rooms/${roomId}/players/${playerId}`).onDisconnect().remove();

    // Listen to room changes
    db.ref(`rooms/${roomId}`).on('value', snap => {
        const roomData = snap.val();
        if (!roomData) return exitGame(); // Room closed
        
        isHost = (roomData.host === playerId);
        if (isHost) document.getElementById('btn-start-game').style.display = 'block';
        
        // Handle Game Start
        if (roomData.status === 'playing') {
            db.ref(`rooms/${roomId}`).off(); // Stop listening to lobby
            playerRole = roomData.players[playerId]?.role || 'unassigned';
            enterGameScene();
            return;
        }

        renderLobbyPlayers(roomData.players);
    });
}

function renderLobbyPlayers(players) {
    if (!players) return;
    const unassignedDiv = document.getElementById('players-unassigned');
    const copsDiv = document.getElementById('players-cops');
    const thievesDiv = document.getElementById('players-thieves');
    
    unassignedDiv.innerHTML = copsDiv.innerHTML = thievesDiv.innerHTML = "";
    
    Object.keys(players).forEach(id => {
        const p = players[id];
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerText = p.name + (id === playerId ? " (אתה)" : "");
        
        // Host can click players to cycle roles
        if (isHost) {
            div.onclick = () => {
                let nextRole = p.role === 'unassigned' ? 'cop' : (p.role === 'cop' ? 'thief' : 'unassigned');
                db.ref(`rooms/${currentRoom}/players/${id}`).update({ role: nextRole });
            };
        }

        if (p.role === 'cop') copsDiv.appendChild(div);
        else if (p.role === 'thief') thievesDiv.appendChild(div);
        else unassignedDiv.appendChild(div);
    });
}

function shareWhatsApp() {
    const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    const text = currentLang === 'he' ? 
        `בואו לשחק שוטרים וגנבים! כנסו ללינק: ${link}` : 
        `Join my Territory Battle game! Click here: ${link}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function startGame() {
    db.ref(`rooms/${currentRoom}`).update({ status: 'playing' });
}

function exitGame() {
    if (currentRoom) {
        db.ref(`rooms/${currentRoom}/players/${playerId}`).remove();
    }
    location.reload();
}

// ==========================================
// 6. Game Scene (Original Game Logic Wrapper)
// ==========================================
function enterGameScene() {
    // Hide Lobby, Show Game
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-header').style.display = 'block';
    document.getElementById('map').style.display = 'block';
    document.getElementById('controls-container').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    // Wake AudioContext for Autoplay bypass
    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // Map Setup (Original)
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([mockLat, mockLng], 18);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);

    // Initial GPS Watch
    navigator.geolocation.watchPosition(() => {
        lastGpsTimestamp = Date.now();
        const gpsEl = document.getElementById('gps-status');
        if (gpsEl) {
            gpsEl.innerText = "GPS ✅";
            gpsEl.style.color = "#10b981";
        }
    }, null, { enableHighAccuracy: true });

    // Role specific UI
    if (playerRole === 'cop') {
        document.getElementById('capture-btn-container').style.display = 'block';
        document.getElementById('audio-status').innerText = "רמקול ✅";
        document.getElementById('audio-status').style.color = "#10b981";
    } else {
        startListeningForCops(() => {
            alert(currentLang === 'he' ? "נתפסת! 👮‍♂️" : "Busted! 👮‍♂️");
            db.ref(`rooms/${currentRoom}/players/${playerId}`).update({ role: 'cop' }).then(() => location.reload());
        });
        trailLayer = L.polyline([], { color: '#ef4444', weight: 5, opacity: 0.6, dashArray: '10, 10' }).addTo(map);
    }

    // Write initial location to game branch
    db.ref(`game/${currentRoom}/players/${playerId}`).set({ role: playerRole, lat: mockLat, lng: mockLng, t: Date.now() });
    db.ref(`game/${currentRoom}/players/${playerId}`).onDisconnect().remove();

    listenToOtherPlayers();
    listenToCapturedAreas();
}

// ----------------------------------------------------
// Original Map functions adapted to room node
// ----------------------------------------------------
function moveMock(dir) {
    const s = 0.00015;
    if (dir === 'up') mockLat += s; if (dir === 'down') mockLat -= s;
    if (dir === 'left') mockLng -= s; if (dir === 'right') mockLng += s;
    lastGpsTimestamp = Date.now();
    updateMockPosition();
}

function updateMockPosition() {
    if(!map) return;
    map.panTo([mockLat, mockLng]);
    if (playerRole === 'thief') {
        if (typeof checkCaptureProgress === "function" && checkCaptureProgress(thiefPath, [mockLat, mockLng])) {
            const areaId = 'area_' + Date.now();
            db.ref(`game/${currentRoom}/capturedAreas/` + areaId).set({ points: [...thiefPath, thiefPath[0]], capturedBy: playerId });
            thiefPath = []; 
            if (trailLayer) trailLayer.setLatLngs([]);
            alert(currentLang === 'he' ? "שטח נכבש!" : "Area Captured!");
        } else {
            thiefPath.push([mockLat, mockLng]);
            if (trailLayer) trailLayer.setLatLngs(thiefPath);
        }
    }
    db.ref(`game/${currentRoom}/players/${playerId}`).update({ lat: mockLat, lng: mockLng, t: Date.now() });
}

function triggerCapture() {
    const btn = document.getElementById('capture-btn');
    const timerText = document.getElementById('cooldown-timer');
    const circle = document.getElementById('cooldown-circle');
    const circumference = 326.7;

    if (btn.disabled) return;

    btn.disabled = true;
    broadcastCapture();

    setTimeout(() => {
        btn.classList.add('cooldown');
        let timeLeft = 60;
        timerText.innerText = timeLeft;

        const cooldownInterval = setInterval(() => {
            timeLeft--;
            timerText.innerText = timeLeft;
            const offset = circumference - (timeLeft / 60) * circumference;
            circle.style.strokeDashoffset = offset;

            if (timeLeft <= 0) {
                clearInterval(cooldownInterval);
                btn.disabled = false;
                btn.classList.remove('cooldown');
                circle.style.strokeDashoffset = 0;
            }
        }, 1000);
    }, 10000);
}

function listenToCapturedAreas() {
    db.ref(`game/${currentRoom}/capturedAreas`).on('value', snap => {
        if (typeof renderAreas === "function") {
            areaLayers = renderAreas(map, snap.val(), areaLayers);
        }
    });
}

function listenToOtherPlayers() {
    db.ref(`game/${currentRoom}/players`).on('value', snap => {
        const players = snap.val();
        for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
        playerMarkers = {};
        
        if (!players) {
            document.getElementById('players-count').innerText = currentLang === 'he' ? `שחקנים: 0` : `Players: 0`;
            return;
        }

        const now = Date.now();
        let activeCount = 0;

        Object.keys(players).forEach(id => {
            const p = players[id];
            if (now - p.t > 60000) {
                db.ref(`game/${currentRoom}/players/` + id).remove();
                return;
            }

            activeCount++;

            // Limit visibility for cops
            if (playerRole === 'cop' && p.role === 'thief' && id !== playerId) return;
            
            const color = p.role === 'cop' ? '#3b82f6' : '#ef4444';
            playerMarkers[id] = L.circleMarker([p.lat, p.lng], { 
                radius: id === playerId ? 30 : 20, 
                color: '#fff', 
                weight: 3, 
                fillColor: color, 
                fillOpacity: 1 
            }).addTo(map);
        });

        document.getElementById('players-count').innerText = currentLang === 'he' ? `שחקנים: ${activeCount}` : `Players: ${activeCount}`;
    });
}