// game.js - Phase 1.8.1: Police Station Briefing Logic (Refactored)

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

    // Initialize Map with Touch Interactions Disabled for Host Drawing
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

    // מפה בהירה - CartoDB Voyager
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { 
        maxZoom: 20 
    }).addTo(map);

    // Sync Game Data
    window.db.ref(`rooms/${window.currentRoom}/gameStartTime`).once('value', snap => {
        gameStartTime = snap.val() || Date.now();
        checkArenaStatus();
    });

    startRealGpsTracking();
    listenToOtherPlayers();
    listenToCapturedAreas();
    listenToVictory(); 
    
    // הפעלת בדיקת 3 הדקות לניתוקים (רק למנהל כדי למנוע כפילויות)
    if (window.isHost) {
        setInterval(checkOfflinePlayers, 10000); 
    }
}

// ==========================================
// 3. Map Control Functions (Buttons Only)
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
            arenaData = data;
            document.getElementById('setup-ui').style.display = 'none';
            document.getElementById('drawing-container').style.display = 'none';
            document.getElementById('map-controls').style.display = 'none';
            document.getElementById('zoom-controls').style.display = 'none';
            
            // החזרת התפריט העליון למשתמשים לאחר ציור הזירה
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
    // הסתרת התפריט העליון בזמן הציור לתצוגה נקייה
    document.getElementById('game-header').style.display = 'none';
    
    if (myLat && myLng) {
        map.setView([myLat, myLng], 14);
    }
    
    document.getElementById('setup-ui').style.display = 'flex';
    document.getElementById('map-controls').style.display = 'flex';
    document.getElementById('zoom-controls').style.display = 'flex';
    initDrawingCanvas(map); 
}

function confirmDrawing() {
    const results = finalizeDrawing(); 
    if (results) {
        window.db.ref(`game/${window.currentRoom}/arena`).set(results);
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
// 6. Gameplay Mechanics & Offline Rules
// ==========================================

// בדיקת ניתוקים - פועלת בשרת (על ידי המנהל) כל 10 שניות
function checkOfflinePlayers() {
    if (!window.isHost || !window.currentRoom) return;
    const now = Date.now();
    
    window.db.ref(`rooms/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val();
        if (!players) return;
        
        Object.keys(players).forEach(id => {
            const p = players[id];
            // חוק 3 הדקות (180,000 מילישניות)
            if (p.isOffline && p.disconnectedAt && (now - p.disconnectedAt > 180000)) {
                console.log(`Player ${p.name} disconnected for over 3 minutes. Removing from game.`);
                
                // מחיקת השחקן מהחדר
                window.db.ref(`rooms/${window.currentRoom}/players/${id}`).remove();
                
                // במידה ויש שובל פעיל (יוטמע בשלבים הבאים), יש למחוק אותו כאן
                // window.db.ref(`game/${window.currentRoom}/activeTrails/${id}`).remove();
            }
        });
    });
}

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
                const isOffline = rp.isOffline || false; // בדיקת סטטוס מנותק
                
                // ספירה רק של שחקנים מחוברים לניצחון
                if (!isOffline) {
                    activeCount++;
                    if (role === 'thief') thievesCount++;
                }
                
                // שוטר לא רואה גנבים
                if (window.playerRole === 'cop' && role === 'thief' && id !== window.playerId) return;
                
                // קביעת צבע הסמן - אפור אם מנותק, אחרת כחול/אדום
                let markerColor = '#dc2626'; // אדום גנב
                if (role === 'cop') markerColor = '#2563eb'; // כחול שוטר
                if (isOffline) markerColor = '#6b7280'; // אפור אם מנותק 

                playerMarkers[id] = L.circleMarker([gp.lat, gp.lng], { 
                    radius: id === window.playerId ? 25 : 15, 
                    fillColor: markerColor, 
                    fillOpacity: isOffline ? 0.5 : 1, // חצי שקוף אם מנותק
                    color: '#fff', 
                    weight: 3 
                }).addTo(map);
            });

            if (playersCountEl) playersCountEl.innerText = `שחקנים: ${activeCount}`;
            if (thievesCount > 0) hasSeenThief = true;
            
            // תנאי ניצחון קיים - הוספת וידוא שרק שחקנים פעילים נספרים
            if (activeCount > 0 && hasSeenThief && thievesCount === 0) {
                window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'cops');
            }
        });
    });
}

function startThiefMechanics() {
    trailLayer = L.polyline([], { color: '#dc2626', weight: 4, dashArray: '5, 10' }).addTo(map);
    startListeningForCops((ts) => {
        if (ts && ts >= gameStartTime) {
            alert("נתפסת!");
            window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'cop' }).then(() => location.reload());
        }
    });
}