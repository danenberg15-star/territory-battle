// game.js - Phase 2: Police Station, Briefing Timer & Visual Sonar Feedback

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
let policeStationCircle = null;
let policeStationCoords = null;

// ==========================================
// 2. Game Scene Initialization
// ==========================================
function enterGameScene() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-header').style.display = 'block';
    document.getElementById('map').style.display = 'block';
    document.getElementById('controls-container').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([32.0853, 34.7818], 18);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);

    window.db.ref(`rooms/${window.currentRoom}/gameStartTime`).once('value', snap => {
        gameStartTime = snap.val() || Date.now();
        
        setupPoliceStation(); // Initialize Station
        
        if (window.playerRole === 'cop') {
            document.getElementById('capture-btn-container').style.display = 'block';
            document.getElementById('audio-status').innerText = window.currentLang === 'he' ? "רמקול ✅" : "Speaker ✅";
            document.getElementById('audio-status').style.color = "#10b981";
        } else {
            startListeningForCops((signalTimestamp) => {
                if (signalTimestamp && signalTimestamp < gameStartTime) return;
                alert(window.currentLang === 'he' ? "נתפסת! 👮‍♂️" : "Busted! 👮‍♂️");
                window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'cop' }).then(() => location.reload());
            });
            trailLayer = L.polyline([], { color: '#ef4444', weight: 5, opacity: 0.6, dashArray: '10, 10' }).addTo(map);
        }
    });

    startRealGpsTracking();
    listenToOtherPlayers();
    listenToCapturedAreas();
    listenToVictory(); 
    listenToBriefing();
}

// ==========================================
// 3. Police Station & Briefing Logic
// ==========================================
function setupPoliceStation() {
    window.db.ref(`game/${window.currentRoom}/policeStation`).on('value', snap => {
        const data = snap.val();
        if (!data && window.isHost) {
            // Host generates station location (near first GPS lock)
            if (myLat && myLng) {
                const station = { lat: myLat + 0.0001, lng: myLng + 0.0001, radius: 25 };
                window.db.ref(`game/${window.currentRoom}/policeStation`).set(station);
            }
        } else if (data) {
            policeStationCoords = data;
            if (policeStationCircle) map.removeLayer(policeStationCircle);
            policeStationCircle = L.circle([data.lat, data.lng], {
                radius: data.radius,
                color: '#3b82f6',
                fillColor: '#3b82f6',
                fillOpacity: 0.2,
                dashArray: '5, 10'
            }).addTo(map);
        }
    });
}

function listenToBriefing() {
    const overlay = document.getElementById('briefing-overlay');
    const timerText = document.getElementById('briefing-timer-text');
    const statusText = document.getElementById('briefing-status');

    window.db.ref(`game/${window.currentRoom}/briefing`).on('value', snap => {
        const briefing = snap.val() || { active: false, timeLeft: 30, complete: false };
        
        isBriefingComplete = briefing.complete;
        
        if (isBriefingComplete) {
            overlay.style.display = 'none';
            if (policeStationCircle) policeStationCircle.setStyle({ opacity: 0, fillOpacity: 0 });
            return;
        }

        overlay.style.display = 'block';
        timerText.innerText = `00:${briefing.timeLeft < 10 ? '0' : ''}${briefing.timeLeft}`;
        
        if (briefing.active) {
            statusText.innerText = window.currentLang === 'he' ? "תדריך בעיצומו... אל תצאו מהתחנה!" : "Briefing in progress... Stay in the station!";
            statusText.style.color = "#10b981";
        } else {
            statusText.innerText = window.currentLang === 'he' ? "ממתין לכל השוטרים בתחנה..." : "Waiting for all cops in station...";
            statusText.style.color = "#facc15";
        }
    });
}

// ==========================================
// 4. Real GPS Tracking Logic
// ==========================================
function startRealGpsTracking() {
    if (!navigator.geolocation) return;

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
                    t: Date.now(),
                    inStation: false
                });
                window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).onDisconnect().remove();
            } else {
                updateRealPosition();
            }
        },
        null,
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
}

function updateRealPosition() {
    if(!map || myLat === null) return;
    map.panTo([myLat, myLng]);

    // Check if Cop is in Police Station
    if (window.playerRole === 'cop' && policeStationCoords) {
        const dist = map.distance([myLat, myLng], [policeStationCoords.lat, policeStationCoords.lng]);
        const inStation = dist <= policeStationCoords.radius;
        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ inStation: inStation });
    }
    
    // Thief Capture Logic (Blocked if briefing is not complete)
    if (window.playerRole === 'thief' && isBriefingComplete) {
        let movedEnough = true;
        if (thiefPath.length > 0) {
            const lastPoint = thiefPath[thiefPath.length - 1];
            const from = turf.point([lastPoint[1], lastPoint[0]]);
            const to = turf.point([myLng, myLat]);
            const distance = turf.distance(from, to, {units: 'meters'});
            if (distance < 3) movedEnough = false; 
        }

        if (movedEnough) {
            if (typeof checkCaptureProgress === "function" && checkCaptureProgress(thiefPath, [myLat, myLng])) {
                let isValidPolygon = true;
                try {
                    const coords = [...thiefPath, [myLat, myLng]].map(p => [p[1], p[0]]);
                    coords.push([...coords[0]]); 
                    const polygon = turf.polygon([coords]);
                    const area = turf.area(polygon);
                    if (area < 20) isValidPolygon = false;
                } catch(err) { isValidPolygon = false; }

                if (isValidPolygon) {
                    const areaId = 'area_' + Date.now();
                    window.db.ref(`game/${window.currentRoom}/capturedAreas/` + areaId).set({ 
                        points: [...thiefPath, [myLat, myLng]], 
                        capturedBy: window.playerId 
                    });
                    alert(window.currentLang === 'he' ? "שטח נכבש!" : "Area Captured!");
                }
                thiefPath = []; 
                if (trailLayer) trailLayer.setLatLngs([]);
            } else {
                thiefPath.push([myLat, myLng]);
                if (trailLayer) trailLayer.setLatLngs(thiefPath);
            }
        }
    }
    
    window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ 
        lat: myLat, 
        lng: myLng, 
        t: Date.now() 
    });

    if (window.isHost) manageBriefingLogic();
}

// ==========================================
// 5. Host Logic: Briefing Manager
// ==========================================
let briefingInterval = null;
function manageBriefingLogic() {
    if (!window.isHost || isBriefingComplete) return;

    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        const cops = Object.values(players).filter(p => p.role === 'cop');
        const allCopsIn = cops.length > 0 && cops.every(c => c.inStation === true);

        window.db.ref(`game/${window.currentRoom}/briefing`).once('value', bSnap => {
            let bData = bSnap.val() || { active: false, timeLeft: 30, complete: false };

            if (allCopsIn && !bData.active) {
                // Start Timer
                bData.active = true;
                window.db.ref(`game/${window.currentRoom}/briefing`).update(bData);
                
                if (briefingInterval) clearInterval(briefingInterval);
                briefingInterval = setInterval(() => {
                    bData.timeLeft--;
                    if (bData.timeLeft <= 0) {
                        bData.complete = true;
                        bData.active = false;
                        clearInterval(briefingInterval);
                    }
                    window.db.ref(`game/${window.currentRoom}/briefing`).set(bData);
                }, 1000);

            } else if (!allCopsIn && bData.active) {
                // Reset Timer if anyone leaves
                bData.active = false;
                bData.timeLeft = 30;
                if (briefingInterval) clearInterval(briefingInterval);
                window.db.ref(`game/${window.currentRoom}/briefing`).set(bData);
            }
        });
    });
}

// ==========================================
// 6. Cop Mechanics (Capture Button)
// ==========================================
function triggerCapture() {
    if (!isBriefingComplete) return; // Block catch during briefing

    const btn = document.getElementById('capture-btn');
    const timerText = document.getElementById('cooldown-timer');
    const circle = document.getElementById('cooldown-circle');
    const circumference = 326.7;

    if (btn.disabled) return;

    btn.disabled = true;
    btn.classList.add('active-sonar'); // Visual Feedback: Sonar On[cite: 3]
    
    const captureTime = Date.now();
    broadcastCapture(captureTime); 

    // Remove sonar active style after 10 seconds[cite: 3]
    setTimeout(() => {
        btn.classList.remove('active-sonar');
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
                window.db.ref(`game/${window.currentRoom}/captureSignal`).remove();
            }
        }, 1000);
    }, 10000); 
}

// ==========================================
// 7. Firebase Listeners & Victory Conditions
// ==========================================
function listenToVictory() {
    window.db.ref(`game/${window.currentRoom}/winner`).on('value', snap => {
        const winner = snap.val();
        if (winner && typeof showVictoryScreen === 'function') showVictoryScreen(winner);
    });
}

function listenToCapturedAreas() {
    window.db.ref(`game/${window.currentRoom}/capturedAreas`).on('value', snap => {
        const areas = snap.val();
        if (typeof renderAreas === "function") areaLayers = renderAreas(map, areas, areaLayers);
        
        if (areas) {
            let totalAreaSqMeters = 0;
            Object.values(areas).forEach(area => {
                if (area.points && area.points.length >= 3) {
                    try {
                        const coords = area.points.map(p => [p[1], p[0]]);
                        if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) coords.push([...coords[0]]); 
                        totalAreaSqMeters += turf.area(turf.polygon([coords]));
                    } catch (err) { }
                }
            });
            if (totalAreaSqMeters > 5000) {
                window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'thieves');
            }
        }
    });
}

function listenToOtherPlayers() {
    window.db.ref(`game/${window.currentRoom}/players`).on('value', snap => {
        const players = snap.val();
        for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
        playerMarkers = {};
        if (!players) return;

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
                radius: id === window.playerId ? 30 : 20, 
                color: '#fff', 
                weight: 3, 
                fillColor: p.role === 'cop' ? '#3b82f6' : '#ef4444', 
                fillOpacity: 1 
            }).addTo(map);
        });

        document.getElementById('players-count').innerText = window.currentLang === 'he' ? `שחקנים: ${activeCount}` : `Players: ${activeCount}`;
        if (thievesCount > 0) hasSeenThief = true;
        if (activeCount > 0 && hasSeenThief && thievesCount === 0) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'cops');
        }
    });
}