// game.js - Phase 1.6: Button-Controlled Map & Free-hand Drawing Arena

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

    // Initialize Map with Touch Interactions Disabled for Host Drawing[cite: 1]
    map = L.map('map', { 
        zoomControl: false, 
        attributionControl: false,
        dragging: false,      // Disable touch pan[cite: 1]
        touchZoom: false,     // Disable pinch zoom[cite: 1]
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false
    }).setView([32.0853, 34.7818], 18);

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
// 3. Map Control Functions (Buttons Only)[cite: 1]
// ==========================================
function panMap(direction) {
    if (!map) return;
    const offset = 100; // Pixels to move
    switch (direction) {
        case 'up': map.panBy([0, -offset]); break;
        case 'down': map.panBy([0, offset]); break;
        case 'left': map.panBy([-offset, 0]); break;
        case 'right': map.panBy([offset, 0]); break;
    }
}

function zoomMap(delta) {
    if (!map) return;
    if (delta > 0) map.zoomIn();
    else map.zoomOut();
}

// ==========================================
// 4. Arena Setup (Drawing Mode)
// ==========================================
function checkArenaStatus() {
    window.db.ref(`game/${window.currentRoom}/arena`).on('value', snap => {
        const data = snap.val();
        if (!data) {
            if (window.isHost) {
                setupHostDrawingMode();
            } else {
                document.getElementById('briefing-overlay').style.display = 'block';
                const statusMsg = window.currentLang === 'he' ? "ממתין למנהל שיקבע את זירת המשחק..." : "Waiting for host to define arena...";
                document.getElementById('briefing-status').innerText = statusMsg;
            }
        } else {
            // Arena is ready - Cleanup Setup UI and Resume Normal Map Interaction
            arenaData = data;
            document.getElementById('setup-ui').style.display = 'none';
            document.getElementById('drawing-container').style.display = 'none';
            document.getElementById('map-controls').style.display = 'none';
            
            // Enable map interaction for gameplay[cite: 1]
            map.dragging.enable();
            map.touchZoom.enable();

            drawArenaOnMap();
            setupPoliceStation();
            listenToBriefing();
            
            document.getElementById('controls-container').style.display = 'block';
            if (window.playerRole === 'cop') {
                document.getElementById('capture-btn-container').style.display = 'block';
            } else {
                startThiefMechanics();
            }
        }
    });
}

function setupHostDrawingMode() {
    // 1. Set initial view to 4km^2 (approx zoom 14)[cite: 1]
    if (myLat && myLng) {
        map.setView([myLat, myLng], 14);
    }
    
    // 2. Show Drawing Canvas and Map Controls[cite: 1]
    document.getElementById('setup-ui').style.display = 'flex';
    document.getElementById('map-controls').style.display = 'flex';
    initDrawingCanvas(map); 
}

function confirmDrawing() {
    const results = finalizeDrawing(); // Logic from territory.js
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
// 5. GPS & Movement Logic
// ==========================================
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
    
    // Only pan map to player during active gameplay (not drawing)[cite: 1]
    const isDrawingMode = document.getElementById('drawing-container').style.display === 'block';
    if (!isDrawingMode) {
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
// 6. Gameplay Mechanics
// ==========================================
function triggerCapture() {
    if (!isBriefingComplete) return;
    const btn = document.getElementById('capture-btn');
    if (btn.disabled) return;
    btn.disabled = true;
    broadcastCapture(Date.now());
    setTimeout(() => {
        startCooldown(60);
    }, 10000); 
}

function startCooldown(seconds) {
    let left = seconds;
    const timerText = document.getElementById('cooldown-timer');
    const interval = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(interval);
            const btn = document.getElementById('capture-btn');
            if (btn) btn.disabled = false;
        }
    }, 1000);
}

// ==========================================
// 7. Firebase Listeners
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
            if (playersCountEl) playersCountEl.innerText = "שחקנים: 0";
            return;
        }

        let activeCount = 0;
        let thievesCount = 0;

        Object.keys(players).forEach(id => {
            const p = players[id];
            activeCount++;
            if (p.role === 'thief') thievesCount++;
            
            if (window.playerRole === 'cop' && p.role === 'thief' && id !== window.playerId) return;
            
            playerMarkers[id] = L.circleMarker([p.lat, p.lng], { 
                radius: id === window.playerId ? 25 : 15, 
                fillColor: p.role === 'cop' ? '#3b82f6' : '#ef4444', 
                fillOpacity: 1, color: '#fff', weight: 2 
            }).addTo(map);
        });

        if (playersCountEl) playersCountEl.innerText = `שחקנים: ${activeCount}`;
        if (thievesCount > 0) hasSeenThief = true;
        if (activeCount > 0 && hasSeenThief && thievesCount === 0) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'cops');
        }
    });
}

function listenToBriefing() {
    window.db.ref(`game/${window.currentRoom}/briefing`).on('value', snap => {
        const b = snap.val() || { active: false, timeLeft: 30, complete: false };
        isBriefingComplete = b.complete;
        if (isBriefingComplete) {
            document.getElementById('briefing-overlay').style.display = 'none';
        } else {
            document.getElementById('briefing-overlay').style.display = 'block';
            document.getElementById('briefing-timer-text').innerText = `00:${b.timeLeft < 10 ? '0' : ''}${b.timeLeft}`;
        }
    });
}

function manageBriefingLogic() {
    if (!window.isHost || isBriefingComplete || !arenaData) return;
    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        const cops = Object.values(players).filter(p => p.role === 'cop');
        const ready = cops.length > 0 && cops.every(c => c.inStation);
        if (ready) {
            // Start briefing timer in Firebase logic
        }
    });
}

function startThiefMechanics() {
    trailLayer = L.polyline([], { color: '#ef4444', weight: 4, dashArray: '5, 10' }).addTo(map);
    startListeningForCops((ts) => {
        if (ts && ts >= gameStartTime) {
            alert("נתפסת!");
            window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'cop' }).then(() => location.reload());
        }
    });
}