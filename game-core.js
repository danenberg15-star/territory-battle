// game-core.js - Infrastructure, Global Boundaries & Stability Locks

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

// תיקון יציבות: מנעול למניעת טעינה כפולה של המפה
let isGameSceneLoaded = false;
let outOfBoundsTimer = null;
let outOfBoundsSeconds = 10;

// ==========================================
// 2. Game Scene Initialization
// ==========================================
function enterGameScene() {
    // מנעול יציבות: אם הסצנה כבר נטענה, אל תטען אותה שוב (מונע קריסת Double Trigger)
    if (isGameSceneLoaded) return;
    isGameSceneLoaded = true;

    console.log("Tactical Scene Initializing...");
    document.getElementById('lobby-screen').style.display = 'none';
    
    const floatingStats = document.getElementById('floating-stats');
    if (floatingStats) floatingStats.style.display = 'flex';
    
    document.getElementById('map').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // ניקוי מפה קודמת אם קיימת בזיכרון
    if (map !== null) { map.remove(); map = null; }

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

    // וידוא מנהל אקטיבי: שולף מהשרת כדי למנוע את מצב "ממתין למנהל"
    window.db.ref(`rooms/${window.currentRoom}/host`).once('value', snap => {
        if (snap.val() === window.playerId) window.isHost = true;
        
        window.db.ref(`rooms/${window.currentRoom}/gameStartTime`).once('value', tSnap => {
            gameStartTime = tSnap.val() || Date.now();
            checkArenaStatus(); 
        });
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
// 3. Global Boundaries Logic (אכיפה לכולם)
// ==========================================
function checkArenaBoundaries(lat, lng) {
    if (!arenaData || !isBriefingComplete) return;

    try {
        const point = turf.point([lng, lat]);
        const coords = arenaData.points.map(p => [p[1], p[0]]);
        
        // סגירת פוליגון לצורך החישוב
        if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
            coords.push([...coords[0]]);
        }
        
        const polygon = turf.polygon([coords]);
        const isInside = turf.booleanPointInPolygon(point, polygon);

        if (!isInside) {
            if (!outOfBoundsTimer) startOutOfBoundsTimer();
        } else {
            if (outOfBoundsTimer) stopOutOfBoundsTimer();
        }
    } catch (e) {
        console.error("Boundary Check Error:", e);
    }
}

function startOutOfBoundsTimer() {
    outOfBoundsSeconds = 10;
    const overlay = document.getElementById('briefing-overlay');
    if(overlay) overlay.style.display = 'flex'; 
    
    const timerText = document.getElementById('briefing-timer-text');
    if(timerText) timerText.style.color = "#ef4444";
    
    outOfBoundsTimer = setInterval(() => {
        outOfBoundsSeconds--;
        const statusText = document.getElementById('briefing-status');
        if(statusText) statusText.innerText = window.currentLang === 'he' ? "חזור לזירה מיד!" : "Return to Arena!";
        
        if(timerText) timerText.innerText = `00:${outOfBoundsSeconds < 10 ? '0' : ''}${outOfBoundsSeconds}`;
        
        if (outOfBoundsSeconds <= 0) {
            stopOutOfBoundsTimer();
            alert(window.currentLang === 'he' ? "נפסלת עקב יציאה מהזירה!" : "Disqualified for leaving the arena!");
            exitGame(); 
        }
    }, 1000);
}

function stopOutOfBoundsTimer() {
    clearInterval(outOfBoundsTimer);
    outOfBoundsTimer = null;
    const overlay = document.getElementById('briefing-overlay');
    if(overlay) overlay.style.display = 'none';
    
    const timerText = document.getElementById('briefing-timer-text');
    if(timerText) timerText.style.color = "#facc15";
}

// ==========================================
// 4. GPS Tracking & Auto-Pan
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

    // אכיפת גבולות לכולם
    if (isBriefingComplete && arenaData) {
        checkArenaBoundaries(myLat, myLng);
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
// 5. Shared UI Controls
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

function exitGame() { location.reload(); }