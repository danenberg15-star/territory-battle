// game.js - Phase 1.7: Clean UI Setup, Compass Controls & Dynamic Line Weight

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
    document.getElementById('map').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // Initialize Map - Interaction disabled for Host during drawing
    map = L.map('map', { 
        zoomControl: false, 
        attributionControl: false,
        dragging: false,      
        touchZoom: false,     
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false
    }).setView([32.0853, 34.7818], 18);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
        maxZoom: 20 
    }).addTo(map);

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
// 3. Compass & Zoom Logic
// ==========================================
function panMap(direction) {
    if (!map) return;
    const offset = 120; // תזוזה מעט גדולה יותר לניווט מהיר
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
// 4. Clean Arena Setup Mode
// ==========================================
function checkArenaStatus() {
    window.db.ref(`game/${window.currentRoom}/arena`).on('value', snap => {
        const data = snap.val();
        if (!data) {
            if (window.isHost) {
                setupHostDrawingMode();
            } else {
                // Guests wait with header visible
                document.getElementById('game-header').style.display = 'block';
                document.getElementById('briefing-overlay').style.display = 'block';
                document.getElementById('briefing-status').innerText = window.currentLang === 'he' ? "ממתין למנהל שיקבע את הזירה..." : "Waiting for host...";
            }
        } else {
            // Arena Defined - Show Main UI
            arenaData = data;
            document.getElementById('game-header').style.display = 'block';
            document.getElementById('setup-ui').style.display = 'none';
            document.getElementById('drawing-container').style.display = 'none';
            document.getElementById('map-controls').style.display = 'none';
            document.getElementById('zoom-controls').style.display = 'none';
            
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
    // Hide header for clean drawing workspace
    document.getElementById('game-header').style.display = 'none';
    
    if (myLat && myLng) {
        map.setView([myLat, myLng], 14);
    }
    
    document.getElementById('setup-ui').style.display = 'flex';
    document.getElementById('map-controls').style.display = 'flex';
    document.getElementById('zoom-controls').style.display = 'flex';
    
    if (typeof initDrawingCanvas === 'function') initDrawingCanvas(map); 
}

function confirmDrawing() {
    if (typeof finalizeDrawing === 'function') {
        const results = finalizeDrawing();
        if (results) {
            window.db.ref(`game/${window.currentRoom}/arena`).set(results);
        }
    }
}

function drawArenaOnMap() {
    if (!arenaData || !map) return;
    if (arenaPolygonLayer) map.removeLayer(arenaPolygonLayer);
    
    // Increased weight (6) and dynamic visibility
    arenaPolygonLayer = L.polygon(arenaData.points, {
        color: '#1e40af', 
        weight: 6, 
        fillOpacity: 0.15, 
        dashArray: '10, 10'
    }).addTo(map);
}

function setupPoliceStation() {
    const data = arenaData.policeStation;
    if (policeStationCircle) map.removeLayer(policeStationCircle);
    policeStationCircle = L.circle([data.lat, data.lng], {
        radius: data.radius,
        color: '#1e40af', fillColor: '#3b82f6', fillOpacity: 0.3, weight: 3
    }).addTo(map);
}

// ==========================================
// 5. GPS & Movement
// ==========================================
function startRealGpsTracking() {
    if (!navigator.geolocation) return;
    gpsWatchId = navigator.geolocation.watchPosition((pos) => {
        myLat = pos.coords.latitude;
        myLng = pos.coords.longitude;
        
        const gpsEl = document.getElementById('gps-status');
        if (gpsEl) {
            gpsEl.innerText = "GPS ✅";
            gpsEl.style.color = "#059669";
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
// 6. Mechanics & Listeners
// ==========================================
function triggerCapture() {
    if (!isBriefingComplete) return;
    const btn = document.getElementById('capture-btn');
    if (btn && !btn.disabled) {
        btn.disabled = true;
        broadcastCapture(Date.now());
        setTimeout(() => { startCooldown(60); }, 10000); 
    }
}

function startCooldown(seconds) {
    let left = seconds;
    const interval = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(interval);
            const btn = document.getElementById('capture-btn');
            if (btn) btn.disabled = false;
        }
    }, 1000);
}

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
                fillColor: p.role === 'cop' ? '#2563eb' : '#dc2626', 
                fillOpacity: 1, color: '#fff', weight: 3 
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
        // Sync ready status logic here if needed
    });
}

function startThiefMechanics() {
    trailLayer = L.polyline([], { color: '#dc2626', weight: 4, dashArray: '5, 10' }).addTo(map);
    if (typeof startListeningForCops === 'function') {
        startListeningForCops((ts) => {
            if (ts && ts >= gameStartTime) {
                alert("נתפסת!");
                window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'cop' }).then(() => location.reload());
            }
        });
    }
}