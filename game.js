// game.js - Phase 1.8.2: Refactored for Advanced Thief Mechanics

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
            if (window.isHost) {
                setupHostDrawingMode();
            } else {
                document.getElementById('briefing-overlay').style.display = 'block';
                const statusMsg = window.currentLang === 'he' ? "ממתין למנהל שיקבע את זירת המשחק..." : "Waiting for host to define arena...";
                document.getElementById('briefing-status').innerText = statusMsg;
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
    initDrawingCanvas(map); 
}

function confirmDrawing() {
    const results = finalizeDrawing(); 
    if (results) window.db.ref(`game/${window.currentRoom}/arena`).set(results);
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

    // עדכון סטטוס תחנה לשוטרים
    if (window.playerRole === 'cop' && arenaData) {
        const dist = map.distance([myLat, myLng], [arenaData.policeStation.lat, arenaData.policeStation.lng]);
        const inStation = dist <= arenaData.policeStation.radius;
        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/inStation`).set(inStation);
    }

    // הפעלת לוגיקת גנב מתקדמת מקובץ thief-mechanics.js[cite: 2]
    if (window.playerRole === 'thief' && isBriefingComplete) {
        if (typeof updateThiefLogic === "function") {
            updateThiefLogic(myLat, myLng);
        }
    }

    // עדכון מיקום כללי בשרת - Ticking Rate 2s[cite: 2]
    window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ 
        lat: myLat, lng: myLng, t: Date.now() 
    });

    if (window.isHost && typeof manageBriefingLogic === "function") {
        manageBriefingLogic();
    }
}

// ==========================================
// 6. Gameplay Mechanics & Offline Rules
// ==========================================
function checkOfflinePlayers() {
    if (!window.isHost || !window.currentRoom) return;
    const now = Date.now();
    
    window.db.ref(`rooms/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val();
        if (!players) return;
        
        Object.keys(players).forEach(id => {
            const p = players[id];
            if (p.isOffline && p.disconnectedAt && (now - p.disconnectedAt > 180000)) {
                window.db.ref(`rooms/${window.currentRoom}/players/${id}`).remove();
            }
        });
    });
}

function triggerCapture() {
    if (!isBriefingComplete) return;
    const btn = document.getElementById('capture-btn');
    if (btn.disabled) return;
    btn.disabled = true;
    if (typeof broadcastCapture === "function") broadcastCapture(Date.now());
    setTimeout(() => startCooldown(60), 10000); 
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
                const isFlashing = gp.flashUntil && gp.flashUntil > Date.now(); // חשיפה ל-3 שניות[cite: 2]
                
                if (!isOffline) {
                    activeCount++;
                    if (role === 'thief') thievesCount++;
                }
                
                // שוטר לא רואה גנבים אלא אם הם ב"חשיפה"[cite: 2]
                if (window.playerRole === 'cop' && role === 'thief' && id !== window.playerId && !isFlashing) return;
                
                let markerColor = role === 'cop' ? '#2563eb' : '#dc2626';
                if (isOffline) markerColor = '#6b7280';
                
                // יצירת הסמן עם אפקט הבהוב אם הגנב נחשף[cite: 2]
                const markerOptions = {
                    radius: id === window.playerId ? 25 : 15, 
                    fillColor: markerColor, 
                    fillOpacity: isOffline ? 0.5 : 1,
                    color: isFlashing ? '#ffff00' : '#fff', // צבע מסגרת בולט בחשיפה
                    weight: isFlashing ? 6 : 3 
                };

                playerMarkers[id] = L.circleMarker([gp.lat, gp.lng], markerOptions).addTo(map);
                
                // הוספת אנימציית הבהוב בסיסית אם נחשף
                if (isFlashing) {
                    let flashToggle = true;
                    const flashInt = setInterval(() => {
                        if (!playerMarkers[id]) { clearInterval(flashInt); return; }
                        playerMarkers[id].setStyle({ fillOpacity: flashToggle ? 0.2 : 1 });
                        flashToggle = !flashToggle;
                        if (Date.now() > gp.flashUntil) {
                            clearInterval(flashInt);
                            if (playerMarkers[id]) playerMarkers[id].setStyle({ fillOpacity: 1 });
                        }
                    }, 300);
                }
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
    if (typeof startListeningForCops === "function") {
        startListeningForCops((ts) => {
            if (ts && ts >= gameStartTime) {
                alert("נתפסת!");
                window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'cop' }).then(() => location.reload());
            }
        });
    }
}