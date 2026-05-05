// game-core.js - Infrastructure, Map & GPS Tracking

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
    console.log("Tactical Scene Initializing...");
    
    // ניקוי מסכים קודמים
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    
    const floatingStats = document.getElementById('floating-stats');
    if (floatingStats) floatingStats.style.display = 'flex';
    
    document.getElementById('map').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    // אתחול מפה - הגדרות אופטימליות למובייל
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

    // סנכרון זמן התחלה ובדיקת סטטוס ארנה
    window.db.ref(`rooms/${window.currentRoom}/gameStartTime`).once('value', snap => {
        gameStartTime = snap.val() || Date.now();
        if (typeof checkArenaStatus === 'function') checkArenaStatus();
    });

    // הפעלת מאזינים גלובליים
    startRealGpsTracking();
    
    if (typeof listenToOtherPlayers === 'function') listenToOtherPlayers();
    if (typeof listenToCapturedAreas === 'function') listenToCapturedAreas();
    if (typeof listenToVictory === 'function') listenToVictory(); 
    if (typeof listenForCaptureSignals === 'function') listenForCaptureSignals(); 
    
    if (typeof listenToTreasures === 'function') listenToTreasures();

    // ניהול שחקנים לא מקוונים על ידי המארח
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
// 5. GPS Tracking & Auto-Pan
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

        // מיקום ראשוני של המפה על השחקן
        if (map && !window.firstLoadDone) {
            map.setView([myLat, myLng], 18);
            window.firstLoadDone = true;
        }
        updateRealPosition();
    }, (err) => {
        console.warn("GPS Error:", err);
        const gpsEl = document.getElementById('gps-status');
        if (gpsEl) {
            gpsEl.innerText = "GPS ❌";
            gpsEl.style.color = "#ef4444";
        }
    }, { 
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000
    });
}

function updateRealPosition() {
    if(!map || myLat === null) return;
    
    const drawingEl = document.getElementById('drawing-container');
    const isDrawingMode = drawingEl && drawingEl.style.display === 'block';
    
    // מעקב מפה אוטומי - רק כשלא במצב ציור
    if (!isDrawingMode) {
        map.panTo([myLat, myLng], { animate: true, duration: 1.0 });
    }

    // בדיקת שהייה בתחנת משטרה לשוטרים ומלשינים
    if ((window.playerRole === 'cop' || window.playerRole === 'snitch') && arenaData) {
        const dist = map.distance([myLat, myLng], [arenaData.policeStation.lat, arenaData.policeStation.lng]);
        const inStation = dist <= arenaData.policeStation.radius;
        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/inStation`).set(inStation);
    }

    // הפעלת לוגיקת גנב אם רלוונטי
    if (window.playerRole === 'thief' && isBriefingComplete) {
        if (typeof updateThiefLogic === "function") updateThiefLogic(myLat, myLng);
    }
    
    // בדיקת אוצרות בקרבת מקום
    if (typeof checkTreasureProximity === 'function') {
        checkTreasureProximity(myLat, myLng);
    }

    // עדכון מיקום ב-Firebase
    window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ 
        lat: myLat, 
        lng: myLng, 
        t: Date.now(),
        role: window.playerRole 
    });

    // ניהול תדריך ע"י המארח
    if (window.isHost && typeof manageBriefingLogic === "function") manageBriefingLogic();
}