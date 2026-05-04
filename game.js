// game.js - Phase 8.4: Taser Logic Fix, Star Icon & Technical Victory[cite: 7, 10, 13]

// ==========================================
// 1. Game Globals
// ==========================================
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

// ==========================================
// 2. Game Scene Initialization
// ==========================================
function enterGameScene() {
    console.log("Entering Game Scene...");
    document.getElementById('lobby-screen').style.display = 'none';
    
    const floatingStats = document.getElementById('floating-stats');
    if (floatingStats) floatingStats.style.display = 'flex';
    
    document.getElementById('map').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // אתחול מפה עם תמיכה בגרירה וזום
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
// 4. Arena Setup & QA Bypass
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
            
            map.dragging.enable();
            map.touchZoom.enable();

            drawArenaOnMap();
            setupPoliceStation();
            
            if (window.isHost && typeof initTreasuresMaster === 'function') {
                initTreasuresMaster();
            }

            // QA Bypass: כניסה מיידית למשחק[cite: 7]
            window.db.ref(`game/${window.currentRoom}/briefing/complete`).once('value', bSnap => {
                if (bSnap.val() === true) {
                    isBriefingComplete = true; 
                    document.getElementById('briefing-overlay').style.display = 'none';
                    if (window.playerRole === 'thief') startThiefMechanics();
                } else {
                    if (typeof listenToBriefing === "function") listenToBriefing();
                }
            });
            
            document.getElementById('controls-container').style.display = 'block';

            if (typeof toggleChatVisibility === "function") {
                toggleChatVisibility(true);
            }

            if (window.playerRole === 'cop') {
                document.getElementById('capture-btn-container').style.display = 'block';
            } else if (window.playerRole === 'snitch') {
                document.getElementById('snitch-btn-container').style.display = 'block';
            } else {
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
// 5. GPS & Movement Logic (Auto-Pan)
// ==========================================
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
    
    const drawingEl = document.getElementById('drawing-container');
    const isDrawingMode = drawingEl && drawingEl.style.display === 'block';
    
    if (!isDrawingMode) {
        map.panTo([myLat, myLng], { animate: true, duration: 1.0 });
    }

    if ((window.playerRole === 'cop' || window.playerRole === 'snitch') && arenaData) {
        const dist = map.distance([myLat, myLng], [arenaData.policeStation.lat, arenaData.policeStation.lng]);
        const inStation = dist <= arenaData.policeStation.radius;
        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/inStation`).set(inStation);
    }

    if (window.playerRole === 'thief' && isBriefingComplete) {
        if (typeof updateThiefLogic === "function") updateThiefLogic(myLat, myLng);
    }
    
    if (typeof checkTreasureProximity === 'function') {
        checkTreasureProximity(myLat, myLng);
    }

    window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ 
        lat: myLat, lng: myLng, t: Date.now() 
    });

    if (window.isHost && typeof manageBriefingLogic === "function") manageBriefingLogic();
}

// ==========================================
// 6. Tactical Taser & Catch Logic[cite: 7, 13]
// ==========================================
function triggerCapture() {
    if (!isBriefingComplete || (typeof isGameFrozen !== 'undefined' && isGameFrozen)) return;
    const btn = document.getElementById('capture-btn');
    if (btn.disabled) return;

    console.log("Taser Fired!");
    btn.disabled = true;
    btn.classList.add('active-capture'); // מפעיל אנימציה ב-CSS[cite: 13]
    
    // אפקט חשמלי על המפה[cite: 7]
    if (taserVisualRing) map.removeLayer(taserVisualRing);
    taserVisualRing = L.circle([myLat, myLng], {
        radius: 10,
        color: '#7dd3fc',
        weight: 5,
        fillColor: '#0ea5e9',
        fillOpacity: 0.4,
        className: 'electric-arc-pulse' 
    }).addTo(map);

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    
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
        if (gpsChecks >= 10) {
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
        if (!sig || Date.now() - sig.t > 10000) return;
        
        if (window.playerRole === 'thief') {
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
            if (committed) {
                if (victimId === window.playerId) {
                    playArrestAnimation(() => {
                        window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'snitch' })
                            .then(() => location.reload());
                    });
                }
            }
        });
    });
}

function playArrestAnimation(callback) {
    const overlay = document.getElementById('arrest-overlay');
    const bars = document.getElementById('jail-bars');
    const text = document.getElementById('arrest-text');
    
    if (overlay) overlay.style.display = 'flex';
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
    
    setTimeout(() => { if (bars) bars.classList.add('closed'); }, 100);
    setTimeout(() => { if (text) text.classList.add('show'); }, 600);
    setTimeout(() => { if (callback) callback(); }, 3500); 
}

function triggerSnitch() {
    if (typeof isGameFrozen !== 'undefined' && isGameFrozen) return;
    
    const btn = document.getElementById('snitch-btn');
    if (btn.disabled) return;

    btn.disabled = true;
    btn.style.opacity = '0.5';

    let foundThief = false;
    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        Object.keys(players).forEach(id => {
            const p = players[id];
            if (p.role === 'thief' && !p.isOffline) {
                const dist = map.distance([myLat, myLng], [p.lat, p.lng]);
                if (dist <= 15) {
                    window.db.ref(`game/${window.currentRoom}/players/${id}/flashUntil`).set(Date.now() + 3000);
                    foundThief = true;
                }
            }
        });

        if (foundThief) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } else {
            const text = document.getElementById('briefing-status');
            const overlay = document.getElementById('briefing-overlay');
            if (overlay && text) {
                text.innerText = window.currentLang === 'he' ? "לא נמצאו גנבים קרובים!" : "No thieves nearby!";
                overlay.style.display = 'block';
                overlay.style.borderColor = "#ef4444";
                setTimeout(() => { overlay.style.display = 'none'; overlay.style.borderColor = "#facc15"; }, 2000);
            }
        }
    });

    setTimeout(() => {
        btn.disabled = false;
        btn.style.opacity = '1';
    }, 10000);
}

function startCooldown(seconds) {
    const circle = document.getElementById('cooldown-circle');
    if (!circle) return;
    
    let left = seconds;
    const totalOffset = 358; 
    circle.style.strokeDashoffset = 0; 

    const interval = setInterval(() => {
        left--;
        const offset = totalOffset - (left / seconds) * totalOffset;
        circle.style.strokeDashoffset = offset;

        if (left <= 0) {
            clearInterval(interval);
            const btn = document.getElementById('capture-btn');
            if (btn) {
                btn.disabled = false;
                if (navigator.vibrate) navigator.vibrate(50);
            }
            circle.style.strokeDashoffset = totalOffset; 
        }
    }, 1000);
}

// ==========================================
// 7. Technical Victory & Offline Checks[cite: 7]
// ==========================================
function checkOfflinePlayers() {
    if (!window.isHost || !window.currentRoom) return;
    const now = Date.now();
    
    window.db.ref(`rooms/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        let activeThieves = 0;
        let activeCops = 0;

        Object.keys(players).forEach(id => {
            const p = players[id];
            // חוק ה-3 דקות לניתוק[cite: 7]
            if (p.isOffline && p.disconnectedAt && (now - p.disconnectedAt > 180000)) {
                window.db.ref(`rooms/${window.currentRoom}/players/${id}`).remove();
                window.db.ref(`game/${window.currentRoom}/players/${id}`).remove();
            } else {
                if (!p.isOffline) {
                    if (p.role === 'thief') activeThieves++;
                    else if (p.role === 'cop') activeCops++;
                }
            }
        });

        if (activeThieves === 0 && hasSeenThief) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'cops');
        } else if (activeCops === 0 && activeThieves > 0) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'thieves');
        }
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
            let isThiefNearby = false; 
            
            const isCopRadarActive = window.copRadarActiveUntil && window.copRadarActiveUntil > Date.now();
            const isLawEnforcement = window.playerRole === 'cop' || window.playerRole === 'snitch';

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

                if (isLawEnforcement && role === 'thief' && !isOffline && myLat && myLng) {
                    if (map.distance([myLat, myLng], [gp.lat, gp.lng]) <= 30) {
                        isThiefNearby = true;
                    }
                }
                
                let isRevealedByDrone = false;
                if (window.droneActiveData && role === 'thief' && !isOffline) {
                    const distToDrone = map.distance([gp.lat, gp.lng], [window.droneActiveData.lat, window.droneActiveData.lng]);
                    if (distToDrone <= window.droneActiveData.radius) {
                        isRevealedByDrone = true;
                    }
                }
                
                if (isLawEnforcement && role === 'thief' && id !== window.playerId && !isFlashing && !isCopRadarActive && !isRevealedByDrone) return;
                
                // כוכב זהב לשחקן המקומי[cite: 10]
                if (id === window.playerId) {
                    const starIcon = L.divIcon({
                        html: `<div style="font-size: 32px; filter: drop-shadow(0 0 8px gold); animation: star-glow 2s infinite alternate;">⭐</div>`,
                        className: '',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    });
                    playerMarkers[id] = L.marker([gp.lat, gp.lng], { icon: starIcon }).addTo(map);
                } else {
                    let markerColor = '#dc2626'; 
                    if (role === 'cop') markerColor = '#2563eb'; 
                    if (role === 'snitch') markerColor = '#f59e0b'; 
                    if (isOffline) markerColor = '#6b7280'; 
                    
                    const markerOptions = {
                        radius: 15, 
                        fillColor: markerColor, 
                        fillOpacity: isOffline ? 0.5 : 1,
                        color: (isFlashing || isRevealedByDrone) ? '#ffff00' : '#fff',
                        weight: (isFlashing || isRevealedByDrone) ? 6 : 3 
                    };
                    playerMarkers[id] = L.circleMarker([gp.lat, gp.lng], markerOptions).addTo(map);
                }
            });

            if (playersCountEl) playersCountEl.innerText = `שחקנים: ${activeCount}`;
            if (thievesCount > 0) hasSeenThief = true;
            
            if (isLawEnforcement) {
                const radar = document.getElementById('radar-overlay');
                if (radar) {
                    radar.style.display = (isThiefNearby || isCopRadarActive) ? 'block' : 'none';
                }
            }
        });
    });
}

function startThiefMechanics() {
    if (trailLayer) map.removeLayer(trailLayer);
    trailLayer = L.polyline([], { 
        color: '#dc2626', 
        weight: 6, 
        dashArray: '5, 10',
        lineCap: 'round',
        opacity: 0.8
    }).addTo(map);
    console.log("Thief trail initialized.");
}