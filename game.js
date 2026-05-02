// game.js - Phase 1: Real GPS Tracking, Game Scene Logic & Victory Conditions

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

// ==========================================
// 2. Game Scene Initialization
// ==========================================
function enterGameScene() {
    // Hide Lobby UI, Show Game UI
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-header').style.display = 'block';
    document.getElementById('map').style.display = 'block';
    document.getElementById('controls-container').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    // Wake AudioContext for Autoplay bypass
    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // Init Map
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([32.0853, 34.7818], 18);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);

    // Setup Role Specifics
    if (window.playerRole === 'cop') {
        document.getElementById('capture-btn-container').style.display = 'block';
        document.getElementById('audio-status').innerText = window.currentLang === 'he' ? "רמקול ✅" : "Speaker ✅";
        document.getElementById('audio-status').style.color = "#10b981";
    } else {
        startListeningForCops(() => {
            alert(window.currentLang === 'he' ? "נתפסת! 👮‍♂️" : "Busted! 👮‍♂️");
            window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'cop' }).then(() => location.reload());
        });
        trailLayer = L.polyline([], { color: '#ef4444', weight: 5, opacity: 0.6, dashArray: '10, 10' }).addTo(map);
    }

    startRealGpsTracking();
    listenToOtherPlayers();
    listenToCapturedAreas();
    listenToVictory(); // New listener for victory state
}

// ==========================================
// 3. Real GPS Tracking Logic
// ==========================================
function startRealGpsTracking() {
    if (!navigator.geolocation) {
        alert("GPS is not supported by your browser");
        return;
    }

    gpsWatchId = navigator.geolocation.watchPosition(
        (position) => {
            lastGpsTimestamp = Date.now();
            const gpsEl = document.getElementById('gps-status');
            if (gpsEl) {
                gpsEl.innerText = "GPS ✅";
                gpsEl.style.color = "#10b981";
            }

            const isFirstLoad = (myLat === null);
            myLat = position.coords.latitude;
            myLng = position.coords.longitude;

            if (isFirstLoad) {
                map.setView([myLat, myLng], 18);
                window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).set({ 
                    role: window.playerRole, 
                    lat: myLat, 
                    lng: myLng, 
                    t: Date.now() 
                });
                window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).onDisconnect().remove();
            } else {
                updateRealPosition();
            }
        },
        (error) => {
            console.error("GPS Error: ", error);
            const gpsEl = document.getElementById('gps-status');
            if (gpsEl) {
                gpsEl.innerText = "GPS ❌";
                gpsEl.style.color = "#ef4444";
            }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
}

function updateRealPosition() {
    if(!map || myLat === null) return;
    map.panTo([myLat, myLng]);
    
    // Thief Capture Logic ("Stealing the Block")
    if (window.playerRole === 'thief') {
        if (typeof checkCaptureProgress === "function" && checkCaptureProgress(thiefPath, [myLat, myLng])) {
            const areaId = 'area_' + Date.now();
            window.db.ref(`game/${window.currentRoom}/capturedAreas/` + areaId).set({ 
                points: [...thiefPath, thiefPath[0]], 
                capturedBy: window.playerId 
            });
            thiefPath = []; 
            if (trailLayer) trailLayer.setLatLngs([]);
            alert(window.currentLang === 'he' ? "שטח נכבש!" : "Area Captured!");
        } else {
            thiefPath.push([myLat, myLng]);
            if (trailLayer) trailLayer.setLatLngs(thiefPath);
        }
    }
    
    // Update Firebase
    window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ 
        lat: myLat, 
        lng: myLng, 
        t: Date.now() 
    });
}

// ==========================================
// 4. Cop Mechanics (Capture Button)
// ==========================================
function triggerCapture() {
    const btn = document.getElementById('capture-btn');
    const timerText = document.getElementById('cooldown-timer');
    const circle = document.getElementById('cooldown-circle');
    const circumference = 326.7;

    if (btn.disabled) return;

    btn.disabled = true;
    broadcastCapture(); // From audio.js

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
    }, 10000); // 10 seconds active sonar time
}

// ==========================================
// 5. Firebase Listeners & Victory Conditions
// ==========================================
function listenToVictory() {
    window.db.ref(`game/${window.currentRoom}/winner`).on('value', snap => {
        const winner = snap.val();
        if (winner) {
            if (typeof showVictoryScreen === 'function') {
                showVictoryScreen(winner);
            }
        }
    });
}

function listenToCapturedAreas() {
    window.db.ref(`game/${window.currentRoom}/capturedAreas`).on('value', snap => {
        const areas = snap.val();
        if (typeof renderAreas === "function") {
            areaLayers = renderAreas(map, areas, areaLayers);
        }
        
        // Check Thief Victory Condition: Captured Area > 5000 sq meters
        if (areas) {
            let totalAreaSqMeters = 0;
            Object.values(areas).forEach(area => {
                if (area.points && area.points.length >= 3) {
                    try {
                        const coords = area.points.map(p => [p[1], p[0]]); // Turf needs [lng, lat]
                        // Ensure polygon is closed
                        if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) {
                            coords.push([...coords[0]]); 
                        }
                        const polygon = turf.polygon([coords]);
                        totalAreaSqMeters += turf.area(polygon);
                    } catch (err) { console.error("Turf Area Error:", err); }
                }
            });
            
            if (totalAreaSqMeters > 5000) {
                window.db.ref(`game/${window.currentRoom}/winner`).once('value', s => {
                    if (!s.exists()) window.db.ref(`game/${window.currentRoom}/winner`).set('thieves');
                });
            }
        }
    });
}

function listenToOtherPlayers() {
    window.db.ref(`game/${window.currentRoom}/players`).on('value', snap => {
        const players = snap.val();
        
        // Clear existing markers
        for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
        playerMarkers = {};
        
        if (!players) {
            document.getElementById('players-count').innerText = window.currentLang === 'he' ? `שחקנים: 0` : `Players: 0`;
            return;
        }

        const now = Date.now();
        let activeCount = 0;
        let thievesCount = 0;

        Object.keys(players).forEach(id => {
            const p = players[id];
            
            // Remove inactive players (Offline > 1min)
            if (now - p.t > 60000) {
                window.db.ref(`game/${window.currentRoom}/players/` + id).remove();
                return;
            }

            activeCount++;
            if (p.role === 'thief') thievesCount++;

            // Visibility Logic: Cops can't see thieves
            if (window.playerRole === 'cop' && p.role === 'thief' && id !== window.playerId) return;
            
            const color = p.role === 'cop' ? '#3b82f6' : '#ef4444';
            playerMarkers[id] = L.circleMarker([p.lat, p.lng], { 
                radius: id === window.playerId ? 30 : 20, 
                color: '#fff', 
                weight: 3, 
                fillColor: color, 
                fillOpacity: 1 
            }).addTo(map);
        });

        document.getElementById('players-count').innerText = window.currentLang === 'he' ? `שחקנים: ${activeCount}` : `Players: ${activeCount}`;

        // Check Cop Victory Condition: All active thieves caught/removed
        if (activeCount > 0 && thievesCount === 0) {
            window.db.ref(`game/${window.currentRoom}/winner`).once('value', s => {
                if (!s.exists()) window.db.ref(`game/${window.currentRoom}/winner`).set('cops');
            });
        }
    });
}