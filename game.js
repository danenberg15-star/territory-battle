// game.js - Full Expanded Version: Static Star & Tactical Logic Sync

let playerMarkers = {};
let areaLayers = [];
let thiefPath = []; 
let trailLayer = null;
let map = null;
let taserVisualRing = null; 

let myLat = null;
let myLng = null;
let gpsWatchId = null;

let hasSeenThief = false; 
let gameStartTime = 0;
let isBriefingComplete = false;
let arenaData = null;
let policeStationCircle = null;
let arenaPolygonLayer = null;

/**
 * איתחול סצנת המשחק והמפה הטקטית
 */
function enterGameScene() {
    console.log("Tactical Scene Initializing...");
    document.getElementById('lobby-screen').style.display = 'none';
    
    const stats = document.getElementById('floating-stats');
    if (stats) stats.style.display = 'flex';
    
    document.getElementById('map').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();

    map = L.map('map', { 
        zoomControl: false, 
        attributionControl: false,
        dragging: true,      
        touchZoom: true,     
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
    
    if (typeof listenToTreasures === 'function') listenToTreasures();

    if (window.isHost) {
        setInterval(checkOfflinePlayers, 10000); 
    }
}

/**
 * בקרת שליטה במפה (Panning/Zoom)
 */
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

/**
 * סנכרון נתוני זירה והרשאות UI לפי תפקיד
 */
function checkArenaStatus() {
    window.db.ref(`game/${window.currentRoom}/arena`).on('value', snap => {
        const data = snap.val();
        if (!data) {
            if (window.isHost) setupHostDrawingMode();
            else {
                const overlay = document.getElementById('briefing-overlay');
                if (overlay) overlay.style.display = 'block';
                const status = document.getElementById('briefing-status');
                if (status) status.innerText = window.currentLang === 'he' ? "ממתין למנהל..." : "Waiting for host...";
            }
        } else {
            arenaData = data;
            document.getElementById('setup-ui').style.display = 'none';
            document.getElementById('drawing-container').style.display = 'none';
            document.getElementById('map-controls').style.display = 'none';
            document.getElementById('zoom-controls').style.display = 'none';
            
            map.dragging.enable();
            map.touchZoom.enable();

            drawArenaOnMap();
            setupPoliceStation();

            window.db.ref(`game/${window.currentRoom}/briefing/complete`).once('value', bSnap => {
                if (bSnap.val() === true) {
                    isBriefingComplete = true; 
                    document.getElementById('briefing-overlay').style.display = 'none';
                    if (window.playerRole === 'thief') startThiefMechanics();
                } else {
                    if (typeof listenToBriefing === "function") listenToBriefing();
                }
            });
            
            // הצגת בקרים לשוטר בלבד
            const controls = document.getElementById('controls-container');
            const capture = document.getElementById('capture-btn-container');
            if (controls) controls.style.display = 'block';

            if (window.playerRole === 'cop') {
                if (capture) capture.style.display = 'block';
            } else {
                if (capture) capture.style.display = 'none';
                if (isBriefingComplete) startThiefMechanics();
            }
        }
    });
}

function setupHostDrawingMode() {
    if (myLat && myLng) map.setView([myLat, myLng], 14);
    document.getElementById('setup-ui').style.display = 'flex';
    document.getElementById('map-controls').style.display = 'flex';
    document.getElementById('zoom-controls').style.display = 'flex';
    if (typeof initDrawingCanvas === "function") initDrawingCanvas(map); 
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

/**
 * ניהול מיקום GPS ומעקב מפה (Auto-Pan)
 */
function startRealGpsTracking() {
    if (!navigator.geolocation) return;
    gpsWatchId = navigator.geolocation.watchPosition((pos) => {
        myLat = pos.coords.latitude;
        myLng = pos.coords.longitude;
        window.myLat = myLat; 
        window.myLng = myLng;
        
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
    
    const drawMode = document.getElementById('drawing-container');
    if (!drawMode || drawMode.style.display !== 'block') {
        map.panTo([myLat, myLng], { animate: true, duration: 1.0 });
    }

    if (window.playerRole === 'cop' && arenaData) {
        const dist = map.distance([myLat, myLng], [arenaData.policeStation.lat, arenaData.policeStation.lng]);
        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/inStation`).set(dist <= arenaData.policeStation.radius);
    }

    if (window.playerRole === 'thief' && isBriefingComplete) {
        if (typeof updateThiefLogic === "function") updateThiefLogic(myLat, myLng);
    }

    window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ 
        lat: myLat, lng: myLng, t: Date.now() 
    });
}

/**
 * הפעלת טייזר וחיווי ויזואלי
 */
function triggerCapture() {
    if (!isBriefingComplete || (typeof isGameFrozen !== 'undefined' && isGameFrozen)) return;
    const btn = document.getElementById('capture-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.classList.add('active-capture'); 
    
    if (taserVisualRing) map.removeLayer(taserVisualRing);
    taserVisualRing = L.circle([myLat, myLng], {
        radius: 10, color: '#7dd3fc', weight: 5, fillColor: '#0ea5e9', fillOpacity: 0.4, className: 'electric-arc-pulse' 
    }).addTo(map);

    if (navigator.vibrate) navigator.vibrate([150, 50, 150]);
    
    const timestamp = Date.now();
    window.db.ref(`game/${window.currentRoom}/captureSignal`).set({
        sender: window.playerId, t: timestamp, lat: myLat, lng: myLng
    });

    let gpsChecks = 0;
    const gpsInterval = setInterval(() => {
        checkGpsCatch(myLat, myLng, timestamp);
        if (++gpsChecks >= 10) {
            clearInterval(gpsInterval);
            if (taserVisualRing) { map.removeLayer(taserVisualRing); taserVisualRing = null; }
        }
    }, 1000);

    setTimeout(() => {
        btn.classList.remove('active-capture');
        startCooldown(60); 
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
        if (sig && Date.now() - sig.t < 10000 && window.playerRole === 'thief') {
            if (typeof startListeningForCops === "function") {
                startListeningForCops(() => confirmCatch(window.playerId, sig.t));
            }
        }
    });
}

function confirmCatch(victimId, signalTime) {
    window.db.ref(`game/${window.currentRoom}/players/${victimId}/hasJailCard`).once('value', snap => {
        if (snap.val()) {
            if (typeof triggerGameFreeze === 'function') triggerGameFreeze(victimId);
            return; 
        }
        
        window.db.ref(`game/${window.currentRoom}/catches/${victimId}_${signalTime}`).transaction(current => {
            if (current) return;
            return { t: Date.now(), cop: window.playerId };
        }, (error, committed) => {
            if (committed && victimId === window.playerId) {
                playArrestAnimation(() => {
                    window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'snitch' })
                        .then(() => location.reload());
                });
            }
        });
    });
}

function playArrestAnimation(callback) {
    document.getElementById('arrest-overlay').style.display = 'flex';
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
    setTimeout(() => { document.getElementById('jail-bars').classList.add('closed'); }, 100);
    setTimeout(() => { document.getElementById('arrest-text').classList.add('show'); }, 600);
    setTimeout(callback, 3500); 
}

function startCooldown(seconds) {
    const circle = document.getElementById('cooldown-circle');
    let left = seconds;
    const interval = setInterval(() => {
        if (circle) circle.style.strokeDashoffset = 358 - (left / seconds) * 358;
        if (--left <= 0) {
            clearInterval(interval);
            const btn = document.getElementById('capture-btn');
            if (btn) btn.disabled = false;
        }
    }, 1000);
}

/**
 * ניהול ניתוקים וניצחון טכני
 */
function checkOfflinePlayers() {
    if (!window.isHost) return;
    const now = Date.now();
    window.db.ref(`rooms/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        let activeThieves = 0;
        let activeCops = 0;

        Object.keys(players).forEach(id => {
            const p = players[id];
            // חוק ה-3 דקות
            if (p.isOffline && p.disconnectedAt && (now - p.disconnectedAt > 180000)) {
                window.db.ref(`rooms/${window.currentRoom}/players/${id}`).remove();
                window.db.ref(`game/${window.currentRoom}/players/${id}`).remove();
            } else if (!p.isOffline) {
                if (p.role === 'thief') activeThieves++;
                else activeCops++;
            }
        });

        if (activeThieves === 0 && hasSeenThief) window.db.ref(`game/${window.currentRoom}/winner`).set('cops');
        else if (activeCops === 0 && activeThieves > 0) window.db.ref(`game/${window.currentRoom}/winner`).set('thieves');
    });
}

function listenToVictory() {
    window.db.ref(`game/${window.currentRoom}/winner`).on('value', snap => {
        if (snap.val() && typeof showVictoryScreen === 'function') showVictoryScreen(snap.val());
    });
}

function listenToCapturedAreas() {
    window.db.ref(`game/${window.currentRoom}/capturedAreas`).on('value', snap => {
        if (typeof renderAreas === "function") areaLayers = renderAreas(map, snap.val(), areaLayers);
    });
}

/**
 * סנכרון שחקנים במפה וניהול רדאר
 */
function listenToOtherPlayers() {
    window.db.ref(`rooms/${window.currentRoom}/players`).on('value', snapRooms => {
        const roomPlayers = snapRooms.val() || {};
        window.db.ref(`game/${window.currentRoom}/players`).on('value', snapGame => {
            const gamePlayers = snapGame.val();
            for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
            playerMarkers = {};
            if (!gamePlayers) return;

            let count = 0;
            let isThiefNearby = false;

            Object.keys(gamePlayers).forEach(id => {
                const gp = gamePlayers[id];
                const role = roomPlayers[id]?.role || gp.role;
                const isOffline = roomPlayers[id]?.isOffline;
                if (!isOffline) count++;

                if (window.playerRole === 'cop' && role === 'thief' && !isOffline && myLat && myLng) {
                    if (map.distance([myLat, myLng], [gp.lat, gp.lng]) <= 30) isThiefNearby = true;
                }
                
                if (id === window.playerId) {
                    // כוכב זהב סטטי (ללא אנימציה)
                    const starIcon = L.divIcon({
                        html: `<div style="font-size: 32px; filter: drop-shadow(0 0 8px gold);">⭐</div>`,
                        className: '', iconSize: [32, 32], iconAnchor: [16, 16]
                    });
                    playerMarkers[id] = L.marker([gp.lat, gp.lng], { icon: starIcon }).addTo(map);
                } else {
                    if ((window.playerRole === 'cop' || window.playerRole === 'snitch') && role === 'thief' && !(gp.flashUntil > Date.now())) return;
                    let color = role === 'cop' ? '#2563eb' : (role === 'snitch' ? '#f59e0b' : '#dc2626');
                    playerMarkers[id] = L.circleMarker([gp.lat, gp.lng], {
                        radius: 15, fillColor: color, fillOpacity: isOffline ? 0.5 : 1, color: '#fff', weight: 3 
                    }).addTo(map);
                }
            });

            const countEl = document.getElementById('players-count');
            if (countEl) countEl.innerText = `שחקנים: ${count}`;
            
            const radar = document.getElementById('radar-overlay');
            if (radar && (window.playerRole === 'cop' || window.playerRole === 'snitch')) {
                radar.style.display = isThiefNearby ? 'block' : 'none';
            }
        });
    });
}

function startThiefMechanics() {
    if (trailLayer) map.removeLayer(trailLayer);
    trailLayer = L.polyline([], { color: '#dc2626', weight: 6, dashArray: '5, 10', opacity: 0.8 }).addTo(map);
}