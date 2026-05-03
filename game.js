// game.js - Full Mechanics + Compass Setup + Restored Gameplay

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
    document.getElementById('map').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';
    document.getElementById('victory-screen').style.display = 'none';

    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // אתחול מפה - מצב התחלתי נעול לטובת סימון המנהל
    map = L.map('map', { 
        zoomControl: false, 
        attributionControl: false,
        dragging: false,      
        touchZoom: false,     
        doubleClickZoom: false,
        scrollWheelZoom: false
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
// 3. Setup Controls (Compass & Zoom) - ONLY FOR SETUP
// ==========================================
function panMap(direction) {
    if (!map) return;
    const offset = 120; 
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
// 4. Arena & Briefing Logic
// ==========================================
function checkArenaStatus() {
    window.db.ref(`game/${window.currentRoom}/arena`).on('value', snap => {
        const data = snap.val();
        if (!data) {
            if (window.isHost) {
                setupHostDrawingMode();
            } else {
                document.getElementById('game-header').style.display = 'block';
                document.getElementById('briefing-overlay').style.display = 'block';
                document.getElementById('briefing-status').innerText = "ממתין למנהל שיקבע את הזירה...";
            }
        } else {
            // שחרור המפה למצב משחק חופשי
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
    document.getElementById('game-header').style.display = 'none';
    if (myLat && myLng) map.setView([myLat, myLng], 14);
    
    document.getElementById('setup-ui').style.display = 'flex';
    document.getElementById('map-controls').style.display = 'flex';
    document.getElementById('zoom-controls').style.display = 'flex';
    
    if (typeof initDrawingCanvas === 'function') initDrawingCanvas(map); 
}

function confirmDrawing() {
    if (typeof finalizeDrawing === 'function') {
        const results = finalizeDrawing();
        if (results) window.db.ref(`game/${window.currentRoom}/arena`).set(results);
    }
}

function drawArenaOnMap() {
    if (!arenaData || !map) return;
    if (arenaPolygonLayer) map.removeLayer(arenaPolygonLayer);
    arenaPolygonLayer = L.polygon(arenaData.points, {
        color: '#1e40af', weight: 6, fillOpacity: 0.15, dashArray: '10, 10'
    }).addTo(map);
}

function setupPoliceStation() {
    const data = arenaData.policeStation;
    if (policeStationCircle) map.removeLayer(policeStationCircle);
    policeStationCircle = L.circle([data.lat, data.lng], {
        radius: data.radius, color: '#1e40af', fillColor: '#3b82f6', fillOpacity: 0.3, weight: 3
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
        if (gpsEl) { gpsEl.innerText = "GPS ✅"; gpsEl.style.color = "#059669"; }
        if (map && !window.firstLoadDone) { map.setView([myLat, myLng], 18); window.firstLoadDone = true; }
        updateRealPosition();
    }, null, { enableHighAccuracy: true });
}

function updateRealPosition() {
    if(!map || myLat === null) return;
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
// 6. Mechanics & Victory
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
    if (btn && !btn.disabled) {
        btn.disabled = true;
        if (typeof broadcastCapture === 'function') broadcastCapture(Date.now());
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
        const winner = snap.val();
        if (winner) {
            document.getElementById('victory-screen').style.display = 'flex';
            document.getElementById('victory-text').innerText = winner === 'cops' ? "השוטרים ניצחו!" : "הגנבים ניצחו!";
        }
    });
}

function listenToOtherPlayers() {
    window.db.ref(`game/${window.currentRoom}/players`).on('value', snap => {
        const players = snap.val();
        for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
        playerMarkers = {};
        
        const playersCountEl = document.getElementById('players-count');
        if (!players) { if (playersCountEl) playersCountEl.innerText = "שחקנים: 0"; return; }

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
        
        // תיקון ניצחון: חייבים להיות גנבים שנתפסו כדי לסיים
        if (thievesCount > 0) hasSeenThief = true;
        if (activeCount > 0 && arenaData && hasSeenThief && thievesCount === 0) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(curr => curr || 'cops');
        }
    });
}

function listenToCapturedAreas() {
    window.db.ref(`game/${window.currentRoom}/capturedAreas`).on('value', snap => {
        const areas = snap.val();
        if (typeof renderAreas === "function") areaLayers = renderAreas(map, areas, areaLayers);
    });
}

function listenToBriefing() {
    window.db.ref(`game/${window.currentRoom}/briefing`).on('value', snap => {
        const b = snap.val() || { active: false, timeLeft: 30, complete: false };
        isBriefingComplete = b.complete;
        if (isBriefingComplete) document.getElementById('briefing-overlay').style.display = 'none';
        else {
            document.getElementById('briefing-overlay').style.display = 'block';
            document.getElementById('briefing-timer-text').innerText = `00:${b.timeLeft < 10 ? '0' : ''}${b.timeLeft}`;
        }
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