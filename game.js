// game.js - Phase 2.1: Free-hand Drawing Arena, Auto-Zoom & Game Flow

// ==========================================
// 1. Game Globals
// ==========================================
let playerMarkers = {};
let areaLayers = [];
let thiefPath = []; 
let trailLayer = null;
let lastGpsTimestamp = Date.now();
let map = null;

let myLat = null;
let myLng = null;
let gpsWatchId = null;

let hasSeenThief = false; 
let gameStartTime = 0;
let isBriefingComplete = false;
let arenaData = null;
let policeStationCircle = null;
let arenaPolygonLayer = null;

// ==========================================
// 2. Game Scene Initialization
// ==========================================
function enterGameScene() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-header').style.display = 'block';
    document.getElementById('map').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // Initialize Map with default view
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([32.0853, 34.7818], 18);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);

    // Sync Game Data
    window.db.ref(`rooms/${window.currentRoom}/gameStartTime`).once('value', snap => {
        gameStartTime = snap.val() || Date.now();
        checkArenaStatus();
    });

    startRealGpsTracking();
    listenToOtherPlayers();
    listenToCapturedAreas();
    listenToVictory(); 
}

// ==========================================
// 3. New Arena Setup (Free-hand Drawing)
// ==========================================
function checkArenaStatus() {
    window.db.ref(`game/${window.currentRoom}/arena`).on('value', snap => {
        const data = snap.val();
        if (!data) {
            if (window.isHost) {
                setupHostDrawingMode();
            } else {
                document.getElementById('briefing-overlay').style.display = 'block';
                const statusMsg = window.currentLang === 'he' ? "ממתין למנהל שיצייר את זירת המשחק..." : "Waiting for host to draw arena...";
                document.getElementById('briefing-status').innerText = statusMsg;
            }
        } else {
            // Arena is ready - Start Game
            arenaData = data;
            document.getElementById('setup-ui').style.display = 'none';
            document.getElementById('drawing-container').style.display = 'none';
            
            drawArenaOnMap();
            setupPoliceStation();
            listenToBriefing();
            
            document.getElementById('controls-container').style.display = 'block';
            if (window.playerRole === 'cop') {
                document.getElementById('capture-btn-container').style.display = 'block';
                const audioEl = document.getElementById('audio-status');
                if (audioEl) {
                    audioEl.innerText = window.currentLang === 'he' ? "רמקול ✅" : "Speaker ✅";
                    audioEl.style.color = "#10b981";
                }
            } else {
                startThiefMechanics();
            }
        }
    });
}

function setupHostDrawingMode() {
    // 1. Zoom Out to 4km^2 area (approx Zoom 14)[cite: 1]
    if (myLat && myLng) {
        map.setView([myLat, myLng], 14);
    }
    
    // 2. Activate Canvas Drawing[cite: 1]
    document.getElementById('setup-ui').style.display = 'flex';
    initDrawingCanvas(map); 
}

function confirmDrawing() {
    const results = finalizeDrawing(); // Logic from territory.js[cite: 1]
    if (results) {
        window.db.ref(`game/${window.currentRoom}/arena`).set(results);
    }
}

function drawArenaOnMap() {
    if (!arenaData || !map) return;
    if (arenaPolygonLayer) map.removeLayer(arenaPolygonLayer);
    arenaPolygonLayer = L.polygon(arenaData.points, {
        color: '#38bdf8', weight: 3, fillOpacity: 0.1, dashArray: '5, 10'
    }).addTo(map);
}

function setupPoliceStation() {
    const data = arenaData.policeStation;
    if (policeStationCircle) map.removeLayer(policeStationCircle);
    policeStationCircle = L.circle([data.lat, data.lng], {
        radius: data.radius,
        color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.2
    }).addTo(map);
}

// ==========================================
// 4. Briefing & Movement
// ==========================================
function listenToBriefing() {
    const overlay = document.getElementById('briefing-overlay');
    const timerText = document.getElementById('briefing-timer-text');
    const statusText = document.getElementById('briefing-status');

    window.db.ref(`game/${window.currentRoom}/briefing`).on('value', snap => {
        const b = snap.val() || { active: false, timeLeft: 30, complete: false };
        isBriefingComplete = b.complete;
        
        if (isBriefingComplete) {
            overlay.style.display = 'none';
            if (policeStationCircle) policeStationCircle.setStyle({ opacity: 0.1, fillOpacity: 0.05 });
            return;
        }

        overlay.style.display = 'block';
        timerText.innerText = `00:${b.timeLeft < 10 ? '0' : ''}${b.timeLeft}`;
        statusText.innerText = b.active ? 
            (window.currentLang === 'he' ? "תדריך בעיצומו! הישארו בתחנה" : "Briefing! Stay in station") : 
            (window.currentLang === 'he' ? "היכנסו לתחנת המשטרה לתדריך" : "Enter station for briefing");
    });
}

function startRealGpsTracking() {
    if (!navigator.geolocation) return;
    gpsWatchId = navigator.geolocation.watchPosition((pos) => {
        myLat = pos.coords.latitude;
        myLng = pos.coords.longitude;
        
        const gpsEl = document.getElementById('gps-status');
        if (gpsEl) {
            gpsEl.innerText = "GPS ✅";
            gpsEl.style.color = "#10b981";
        }

        if (map && !window.firstLoadDone) {
            map.setView([myLat, myLng], 18);
            window.firstLoadDone = true;
        }
        updateRealPosition();
    }, null, { enableHighAccuracy: true });
}

function updateRealPosition() {
    if(!map || myLat === null) return;
    
    // Only follow player if not in drawing mode
    if (document.getElementById('drawing-container').style.display !== 'block') {
        map.panTo([myLat, myLng]);
    }

    if (window.playerRole === 'cop' && arenaData) {
        const dist = map.distance([myLat, myLng], [arenaData.policeStation.lat, arenaData.policeStation.lng]);
        const inStation = dist <= arenaData.policeStation.radius;
        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/inStation`).set(inStation);
    }

    if (window.playerRole === 'thief' && isBriefingComplete) {
        handleThiefPath();
    }

    window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ 
        lat: myLat, lng: myLng, t: Date.now() 
    });

    if (window.isHost) manageBriefingLogic();
}

function handleThiefPath() {
    if (thiefPath.length > 0) {
        const last = thiefPath[thiefPath.length - 1];
        if (map.distance([myLat, myLng], last) < 3) return;
    }

    if (typeof checkCaptureProgress === "function" && checkCaptureProgress(thiefPath, [myLat, myLng])) {
        const areaId = 'area_' + Date.now();
        window.db.ref(`game/${window.currentRoom}/capturedAreas/${areaId}`).set({ 
            points: [...thiefPath, [myLat, myLng]],
            capturedBy: window.playerId
        });
        thiefPath = [];
        if (trailLayer) trailLayer.setLatLngs([]);
    } else {
        thiefPath.push([myLat, myLng]);
        if (trailLayer) trailLayer.setLatLngs(thiefPath);
    }
}

// ==========================================
// 5. Host & Cop Mechanics
// ==========================================
let bInterval = null;
function manageBriefingLogic() {
    if (!window.isHost || isBriefingComplete || !arenaData) return;
    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        const cops = Object.values(players).filter(p => p.role === 'cop');
        const ready = cops.length > 0 && cops.every(c => c.inStation);

        window.db.ref(`game/${window.currentRoom}/briefing`).once('value', bSnap => {
            let bData = bSnap.val() || { active: false, timeLeft: 30, complete: false };
            if (ready && !bData.active) {
                bData.active = true;
                bInterval = setInterval(() => {
                    bData.timeLeft--;
                    if (bData.timeLeft <= 0) { bData.complete = true; clearInterval(bInterval); }
                    window.db.ref(`game/${window.currentRoom}/briefing`).set(bData);
                }, 1000);
            } else if (!ready && bData.active) {
                bData.active = false; bData.timeLeft = 30; clearInterval(bInterval);
                window.db.ref(`game/${window.currentRoom}/briefing`).set(bData);
            }
        });
    });
}

function triggerCapture() {
    if (!isBriefingComplete) return;
    const btn = document.getElementById('capture-btn');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('active-sonar'); 
    broadcastCapture(Date.now());
    setTimeout(() => {
        btn.classList.remove('active-sonar');
        btn.classList.add('cooldown');
        startCooldown(60);
    }, 10000); 
}

function startCooldown(seconds) {
    let left = seconds;
    const timerText = document.getElementById('cooldown-timer');
    const circle = document.getElementById('cooldown-circle');
    const interval = setInterval(() => {
        left--;
        if (timerText) timerText.innerText = left;
        if (circle) circle.style.strokeDashoffset = 326.7 - (left/seconds)*326.7;
        if (left <= 0) {
            clearInterval(interval);
            const btn = document.getElementById('capture-btn');
            if (btn) { btn.disabled = false; btn.classList.remove('cooldown'); }
        }
    }, 1000);
}

// ==========================================
// 6. Listeners
// ==========================================
function listenToVictory() {
    window.db.ref(`game/${window.currentRoom}/winner`).on('value', snap => {
        if (snap.val() && typeof showVictoryScreen === 'function') showVictoryScreen(snap.val());
    });
}

function listenToCapturedAreas() {
    window.db.ref(`game/${window.currentRoom}/capturedAreas`).on('value', snap => {
        const areas = snap.val();
        if (typeof renderAreas === "function") areaLayers = renderAreas(map, areas, areaLayers);
    });
}

function listenToOtherPlayers() {
    window.db.ref(`game/${window.currentRoom}/players`).on('value', snap => {
        const players = snap.val();
        for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
        playerMarkers = {};
        
        const playersCountEl = document.getElementById('players-count');
        if (!players) {
            if (playersCountEl) playersCountEl.innerText = window.currentLang === 'he' ? "שחקנים: 0" : "Players: 0";
            return;
        }

        const now = Date.now();
        let activeCount = 0;
        let thievesCount = 0;

        Object.keys(players).forEach(id => {
            const p = players[id];
            if (now - p.t > 60000) {
                window.db.ref(`game/${window.currentRoom}/players/` + id).remove();
                return;
            }
            activeCount++;
            if (p.role === 'thief') thievesCount++;
            
            if (window.playerRole === 'cop' && p.role === 'thief' && id !== window.playerId) return;
            
            playerMarkers[id] = L.circleMarker([p.lat, p.lng], { 
                radius: id === window.playerId ? 25 : 15, 
                fillColor: p.role === 'cop' ? '#3b82f6' : '#ef4444', 
                fillOpacity: 1, color: '#fff', weight: 2 
            }).addTo(map);
        });

        if (playersCountEl) playersCountEl.innerText = window.currentLang === 'he' ? `שחקנים: ${activeCount}` : `Players: ${activeCount}`;
        
        if (thievesCount > 0) hasSeenThief = true;
        if (activeCount > 0 && hasSeenThief && thievesCount === 0) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'cops');
        }
    });
}

function startThiefMechanics() {
    trailLayer = L.polyline([], { color: '#ef4444', weight: 4, dashArray: '5, 10' }).addTo(map);
    startListeningForCops((ts) => {
        if (ts && ts >= gameStartTime) {
            alert(window.currentLang === 'he' ? "נתפסת!" : "Busted!");
            window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'cop' }).then(() => location.reload());
        }
    });
}