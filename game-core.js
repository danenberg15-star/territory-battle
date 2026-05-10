// game-core.js - Infrastructure, Map & GPS Tracking

// ==========================================
// 1. Game Globals (Shared via window to prevent scoping issues)
// ==========================================
window.playerMarkers = {};
window.areaLayers = [];
window.thiefPath = []; 
window.trailLayer = null;
window.map = null;
window.taserVisualRing = null; 

window.myLat = null;
window.myLng = null;
window.gpsWatchId = null;

window.hasSeenThief = false; 
window.gameStartTime = 0;
window.isBriefingComplete = false;
window.arenaData = null;
window.policeStationCircle = null;
window.arenaPolygonLayer = null;

// משתנה גלובלי לשמירת ה-WakeLock הפעיל
window.wakeLockSentinel = null;

// שכבות שובלי גנבים אחרים (מפת id -> polyline)
window.otherTrailLayers = {};

let lastFirebaseUpdate = 0;

// ==========================================
// 1.5. Browser Wake-Up & GPS Unfreeze Mechanism
// ==========================================
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible' && window.currentRoom) {
        console.log("App returned to foreground. Restarting GPS...");
        startRealGpsTracking();
        reacquireWakeLock();
    }
});

// ==========================================
// 1.6. WakeLock Management
// ==========================================
async function reacquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (window.wakeLockSentinel && !window.wakeLockSentinel.released) return;

    try {
        window.wakeLockSentinel = await navigator.wakeLock.request('screen');
        console.log("WakeLock reacquired.");
        window.wakeLockSentinel.addEventListener('release', () => {
            console.log("WakeLock released by system.");
        });
    } catch (err) {
        console.warn("WakeLock reacquire failed:", err);
    }
}

// ==========================================
// 2. Game Scene Initialization
// ==========================================
function enterGameScene() {
    console.log("Tactical Scene Initializing...");
    
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    
    const floatingStats = document.getElementById('floating-stats');
    if (floatingStats) floatingStats.style.display = 'flex';
    
    document.getElementById('map').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';

    if (typeof audioCtx !== 'undefined' && !audioCtx) initAudio();
    if (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    if (window.map) {
        window.map.remove();
        window.map = null;
    }

    const startLat = window.myLat || 32.0853; 
    const startLng = window.myLng || 34.7818;

    window.map = L.map('map', { 
        zoomControl: false, attributionControl: false, dragging: true, touchZoom: true, 
        doubleClickZoom: false, scrollWheelZoom: false, boxZoom: false, keyboard: false
    }).setView([startLat, startLng], 18);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(window.map);

    reacquireWakeLock();

    window.db.ref(`rooms/${window.currentRoom}/gameStartTime`).once('value', snap => {
        window.gameStartTime = snap.val() || Date.now();
        if (typeof checkArenaStatus === 'function') checkArenaStatus();
    });

    startRealGpsTracking();
    
    if (typeof listenToOtherPlayers === 'function') listenToOtherPlayers();
    if (typeof listenToCapturedAreas === 'function') listenToCapturedAreas();
    if (typeof listenToVictory === 'function') listenToVictory(); 
    if (typeof listenForCaptureSignals === 'function') listenForCaptureSignals(); 
    if (typeof listenToTreasures === 'function') listenToTreasures();

    // האזנה להודעת יציאה מטריטוריה — לכל השחקנים
    if (typeof window.listenToOutOfBoundsAlert === 'function') window.listenToOutOfBoundsAlert();

    // האזנה ל-Toast כיבוש שטח — לכל השחקנים (לא רק גנבים)
    if (typeof window.listenToCaptureToast === 'function') window.listenToCaptureToast();

    // האזנה לשובלי גנבים אחרים
    listenToOtherTrails();

    setInterval(() => {
        if (typeof checkOfflinePlayers === 'function') checkOfflinePlayers();
    }, 10000); 
}

// ==========================================
// 2.5. ציור שובלי גנבים אחרים מ-Firebase
// ==========================================
function listenToOtherTrails() {
    if (!window.currentRoom || !window.db) return;

    window.db.ref(`game/${window.currentRoom}/trails`).on('value', snap => {
        const allTrails = snap.val() || {};

        // עדכון / יצירה של polyline לכל גנב אחר
        Object.keys(allTrails).forEach(id => {
            if (id === window.playerId) return; // את השובל שלי אני מצייר בעצמי

            const trailData = allTrails[id];
            if (!trailData || !trailData.path || trailData.path.length < 2) return;

            // אם השובל ישן מ-5 דקות — מתעלמים
            if (Date.now() - trailData.t > 300000) return;

            if (window.otherTrailLayers[id]) {
                // עדכון שובל קיים
                window.otherTrailLayers[id].setLatLngs(trailData.path);
            } else {
                // יצירת שובל חדש לגנב זה
                window.otherTrailLayers[id] = L.polyline(trailData.path, {
                    color: '#f97316', // כתום — להבדיל מהשובל שלי (אדום)
                    weight: 5,
                    dashArray: '5, 10',
                    opacity: 0.8,
                    pane: 'markerPane'
                }).addTo(window.map);
            }
        });

        // הסרת שובלי שחקנים שכבר לא קיימים
        Object.keys(window.otherTrailLayers).forEach(id => {
            if (!allTrails[id]) {
                window.map.removeLayer(window.otherTrailLayers[id]);
                delete window.otherTrailLayers[id];
            }
        });
    });
}

// ==========================================
// 3. Map Control Functions
// ==========================================
function panMap(direction) {
    if (!window.map) return;
    const offset = 100; 
    switch (direction) {
        case 'up': window.map.panBy([0, -offset]); break;
        case 'down': window.map.panBy([0, offset]); break;
        case 'left': window.map.panBy([-offset, 0]); break;
        case 'right': window.map.panBy([offset, 0]); break;
    }
}

function zoomMap(delta) {
    if (!window.map) return;
    if (delta > 0) window.map.zoomIn();
    else window.map.zoomOut();
}

// ==========================================
// 5. GPS Tracking (v2.2 Stubborn Mode)
// ==========================================
function startRealGpsTracking() {
    if (!navigator.geolocation) return;

    if (window.gpsWatchId !== null) {
        navigator.geolocation.clearWatch(window.gpsWatchId);
    }
    
    window.gpsWatchId = navigator.geolocation.watchPosition((pos) => {
        window.myLat = pos.coords.latitude;
        window.myLng = pos.coords.longitude;
        
        const gpsEl = document.getElementById('gps-status');
        if (gpsEl) {
            gpsEl.innerText = "GPS ✅";
            gpsEl.style.color = "#10b981"; 
        }

        if (window.map && !window.firstLoadDone) {
            window.map.setView([window.myLat, window.myLng], 18);
            window.firstLoadDone = true;
        }
        updateRealPosition();
    }, (err) => {
        console.warn("GPS Hardware Error:", err);
        const gpsEl = document.getElementById('gps-status');
        if (gpsEl) {
            gpsEl.innerText = "GPS ❌";
            gpsEl.style.color = "#ef4444";
        }
    }, { 
        enableHighAccuracy: true, 
        maximumAge: 0,            
        timeout: 10000 
    });
}

function updateRealPosition() {
    if(!window.map || window.myLat === null) return;
    
    const drawingEl = document.getElementById('drawing-container');
    const isDrawingMode = drawingEl && drawingEl.style.display === 'block';
    
    if (!isDrawingMode) {
        window.map.panTo([window.myLat, window.myLng], { animate: true, duration: 0.25 });
    }

    if (window.currentRoom && window.playerId) {
        
        const now = Date.now();
        if (now - lastFirebaseUpdate >= 500) {
            window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({ 
                lat: window.myLat, 
                lng: window.myLng, 
                t: now,
                role: window.playerRole 
            });
            lastFirebaseUpdate = now;
        }

        if ((window.playerRole === 'cop' || window.playerRole === 'snitch') && window.arenaData) {
            const dist = window.map.distance([window.myLat, window.myLng], [window.arenaData.policeStation.lat, window.arenaData.policeStation.lng]);
            const inStation = dist <= window.arenaData.policeStation.radius;
            window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/inStation`).set(inStation);

            if (window.isBriefingComplete && typeof window.checkArenaBoundariesForCop === 'function') {
                window.checkArenaBoundariesForCop(window.myLat, window.myLng);
            }
        }

        if (window.playerRole === 'thief' && window.isBriefingComplete) {
            if (typeof updateThiefLogic === "function") updateThiefLogic(window.myLat, window.myLng);
        }
        
        if (typeof checkTreasureProximity === 'function') {
            checkTreasureProximity(window.myLat, window.myLng);
        }
    }

    if (window.isHost && typeof manageBriefingLogic === "function") manageBriefingLogic();
}