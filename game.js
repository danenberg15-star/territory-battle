// game.js - Phase 1.8.3: Hybrid Catch Implementation with Visual Cooldown

// ==========================================
// 1. Game Globals
// ==========================================
let playerMarkers = {};
let areaLayers = [];
let thiefPath = []; 
let trailLayer = null;
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
    listenForCaptureSignals(); 

    if (window.isHost) {
        setInterval(checkOfflinePlayers, 10000); 
    }
}

// ==========================================
// 3. Map Control Functions
// ==========================================
function panMap(direction) {
    if (!map) return;
    const offset = 100; 
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
// 4. Arena Setup
// ==========================================
function checkArenaStatus() {
    window.db.ref(`game/${window.currentRoom}/arena`).on('value', snap => {
        const data = snap.val();
        if (!data) {
            if (window.isHost) setupHostDrawingMode();
            else {
                document.getElementById('briefing-overlay').style.display = 'block';
                document.getElementById('briefing-status').innerText = window.currentLang === 'he' ? "ממתין למנהל..." : "Waiting for host...";
            }
        } else {
            arenaData = data;
            document.getElementById('setup-ui').style.display = 'none';
            document.getElementById('drawing-container').style.display = 'none';
            document.getElementById('map-controls').style.display = 'none';
            document.getElementById('zoom-controls').style.display = 'none';
            document.getElementById('game-header').style.display = 'block';
            
            map.dragging.enable();
            map.touchZoom.enable();

            drawArenaOnMap();
            setupPoliceStation();
            if (typeof listenToBriefing === "function") listenToBriefing();
            
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
    document.getElementById('game-header').style.display = 'none';
    if (myLat && myLng) map.setView([myLat, myLng], 14);
    document.getElementById('setup-ui').style.display = 'flex';
    document.getElementById('map-controls').style.display = 'flex';
    document.getElementById('zoom-controls').style.display = 'flex';
    if (typeof initDrawingCanvas === "function") initDrawingCanvas(map); 
}

function confirmDrawing() {
    if (typeof finalizeDrawing === "function") {
        const results = finalizeDrawing(); 
        if (results) window.db.ref(`game/${window.currentRoom}/arena`).set(results);
    }
}

function drawArenaOnMap() {
    if (!arenaData || !map) return;
    if (arenaPolygonLayer) map.removeLayer(arenaPolygonLayer);
    arenaPolygonLayer = L.polygon(arenaData.points, {
        color: '#1d4ed8', weight: 4, fillOpacity: 0.1, dashArray: '5, 10'
    }).addTo(map);
}

function setupPoliceStation() {
    const data = arenaData.policeStation;
    if (policeStationCircle) map.removeLayer(policeStationCircle);
    policeStationCircle = L.circle([data.lat, data.lng], {
        radius: data.radius,
        color: '#1e40af', fillColor: '#3b82f6', fillOpacity: 0.3
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
    
    const isDrawingMode = document.getElementById('drawing-container').style.display === 'block';
    if (!isDrawingMode) map.panTo([myLat, myLng]);

    if (window.playerRole === 'cop' && arenaData) {
        const dist = map.distance([myLat, myLng], [arenaData.policeStation.lat, arenaData.policeStation.lng]);
        const inStation = dist <= arenaData.policeStation.radius;
        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/inStation`).set(inStation);
    }

    if (window.playerRole === 'thief' && isBriefingComplete) {
        if (typeof updateThiefLogic === "function") updateThiefLogic(myLat, myLng);
    }

    window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ 
        lat: myLat, lng: myLng, t: Date.now() 
    });

    if (window.isHost && typeof manageBriefingLogic === "function") manageBriefingLogic();
}

// ==========================================
// 6. 5.1: Hybrid Catch Logic[cite: 6]
// ==========================================

function triggerCapture() {
    if (!isBriefingComplete) return;
    const btn = document.getElementById('capture-btn');
    if (btn.disabled) return;

    btn.disabled = true;
    btn.classList.add('active-capture');
    
    if (typeof broadcastCapture === "function") broadcastCapture();

    const timestamp = Date.now();
    window.db.ref(`game/${window.currentRoom}/captureSignal`).set({
        sender: window.playerId,
        t: timestamp,
        lat: myLat,
        lng: myLng
    });

    let gpsChecks = 0;
    const gpsInterval = setInterval(() => {
        checkGpsCatch(myLat, myLng, timestamp);
        gpsChecks++;
        if (gpsChecks >= 10) clearInterval(gpsInterval);
    }, 1000);

    setTimeout(() => {
        btn.classList.remove('active-capture');
        startCooldown(60); // המעבר לשקיפות יתבצע כאן אוטומטית דרך ה-CSS[cite: 6]
    }, 10000);
}

function checkGpsCatch(copLat, copLng, signalTime) {
    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        Object.keys(players).forEach(id => {
            const p = players[id];
            if (p.role === 'thief') {
                const dist = map.distance([copLat, copLng], [p.lat, p.lng]);
                if (dist <= 5) confirmCatch(id, signalTime);
            }
        });
    });
}

function listenForCaptureSignals() {
    window.db.ref(`game/${window.currentRoom}/captureSignal`).on('value', snap => {
        const sig = snap.val();
        if (!sig || Date.now() - sig.t > 10000) return;
        
        if (window.playerRole === 'thief') {
            if (typeof startListeningForCops === "function") {
                startListeningForCops(() => confirmCatch(window.playerId, sig.t));
            }
        }
    });
}

function confirmCatch(victimId, signalTime) {
    window.db.ref(`game/${window.currentRoom}/catches/${victimId}_${signalTime}`).transaction(current => {
        if (current) return;
        return { t: Date.now(), cop: window.playerId };
    }, (error, committed) => {
        if (committed) {
            if (victimId === window.playerId) {
                alert(window.currentLang === 'he' ? "נתפסת!" : "Caught!");
                window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'cop' })
                    .then(() => location.reload());
            }
        }
    });
}

function startCooldown(seconds) {
    const circle = document.getElementById('cooldown-circle');
    if (!circle) return;
    
    let left = seconds;
    const totalOffset = 326.7; // stroke-dasharray
    circle.style.strokeDashoffset = 0; // התחלה כטבעת מלאה[cite: 6]

    const interval = setInterval(() => {
        left--;
        // חישוב הריקון של הטבעת האדומה[cite: 6]
        const offset = totalOffset - (left / seconds) * totalOffset;
        circle.style.strokeDashoffset = offset;

        if (left <= 0) {
            clearInterval(interval);
            const btn = document.getElementById('capture-btn');
            if (btn) btn.disabled = false; // הכפתור יחזור להיות נראה
            circle.style.strokeDashoffset = totalOffset; // איפוס טבעת
        }
    }, 1000);
}

// ==========================================
// 7. Utility & Listeners
// ==========================================
function checkOfflinePlayers() {
    if (!window.isHost || !window.currentRoom) return;
    const now = Date.now();
    window.db.ref(`rooms/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        Object.keys(players).forEach(id => {
            const p = players[id];
            if (p.isOffline && p.disconnectedAt && (now - p.disconnectedAt > 180000)) {
                window.db.ref(`rooms/${window.currentRoom}/players/${id}`).remove();
            }
        });
    });
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
    window.db.ref(`rooms/${window.currentRoom}/players`).on('value', snapRooms => {
        const roomPlayers = snapRooms.val() || {};
        window.db.ref(`game/${window.currentRoom}/players`).on('value', snapGame => {
            const gamePlayers = snapGame.val();
            for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
            playerMarkers = {};
            
            const playersCountEl = document.getElementById('players-count');
            if (!gamePlayers) {
                if (playersCountEl) playersCountEl.innerText = "שחקנים: 0";
                return;
            }

            let activeCount = 0;
            let thievesCount = 0;

            Object.keys(gamePlayers).forEach(id => {
                const gp = gamePlayers[id];
                const rp = roomPlayers[id] || {}; 
                const role = rp.role || gp.role;
                const isOffline = rp.isOffline || false;
                const isFlashing = gp.flashUntil && gp.flashUntil > Date.now();
                
                if (!isOffline) {
                    activeCount++;
                    if (role === 'thief') thievesCount++;
                }
                
                if (window.playerRole === 'cop' && role === 'thief' && id !== window.playerId && !isFlashing) return;
                
                let markerColor = role === 'cop' ? '#2563eb' : '#dc2626';
                if (isOffline) markerColor = '#6b7280';
                
                const markerOptions = {
                    radius: id === window.playerId ? 25 : 15, 
                    fillColor: markerColor, 
                    fillOpacity: isOffline ? 0.5 : 1,
                    color: isFlashing ? '#ffff00' : '#fff',
                    weight: isFlashing ? 6 : 3 
                };

                playerMarkers[id] = L.circleMarker([gp.lat, gp.lng], markerOptions).addTo(map);
            });

            if (playersCountEl) playersCountEl.innerText = `שחקנים: ${activeCount}`;
            if (thievesCount > 0) hasSeenThief = true;
            if (activeCount > 0 && hasSeenThief && thievesCount === 0) {
                window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'cops');
            }
        });
    });
}

function startThiefMechanics() {
    trailLayer = L.polyline([], { color: '#dc2626', weight: 4, dashArray: '5, 10' }).addTo(map);
}