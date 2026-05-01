// game.js - GPS Penalty & Ghost Cleanup Version
const firebaseConfig = {
    apiKey: "AIzaSyCC3-6oLBu7OrhnC5Kh6t-mkuo3v4gYN4Q",
    authDomain: "territory-battle-56887.firebaseapp.com",
    databaseURL: "https://territory-battle-56887-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "territory-battle-56887",
    storageBucket: "territory-battle-56887.firebasestorage.app",
    messagingSenderId: "1094082573020",
    appId: "1:1094082573020:web:b3ba4455f1636437c33a19"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const playerId = 'p_' + Math.floor(Math.random() * 9999);
let playerRole = null;
let playerMarkers = {};
let areaLayers = [];
let mockLat = 32.1714;
let mockLng = 34.9083;
let thiefPath = []; 
let trailLayer = null;
let lastGpsTimestamp = Date.now();

const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([mockLat, mockLng], 18);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);

document.getElementById('players-count').insertAdjacentHTML('afterend', `<div style="font-size:10px; color:#94a3b8">ID: ${playerId}</div>`);

// מעקב GPS עם עדכון זמן אחרון
navigator.geolocation.watchPosition(() => {
    lastGpsTimestamp = Date.now();
    const gpsEl = document.getElementById('gps-status');
    if (gpsEl) {
        gpsEl.innerText = "GPS ✅";
        gpsEl.style.color = "#10b981";
    }
}, null, { enableHighAccuracy: true });

// בדיקת "עונש GPS" כל 5 שניות
setInterval(() => {
    if (playerRole && (Date.now() - lastGpsTimestamp > 60000)) {
        alert("נזרקת מהמשחק! אין קליטת GPS מעל דקה (יצאת מהבניין?)");
        exitGame();
    }
}, 5000);

function startAs(role) {
    playerRole = role;
    document.getElementById('ui-container').style.display = 'none';
    document.getElementById('controls-container').style.display = 'block';
    document.getElementById('exit-btn').style.display = 'flex';
    
    db.ref('players/' + playerId).set({ role: playerRole, lat: mockLat, lng: mockLng, t: Date.now() });

    if (role === 'cop') {
        document.getElementById('capture-btn-container').style.display = 'block';
        document.getElementById('audio-status').innerText = "רמקול ✅";
        document.getElementById('audio-status').style.color = "#10b981";
    } else {
        startListeningForCops(() => {
            alert("נתפסת! 👮‍♂️");
            db.ref('players/' + playerId).update({ role: 'cop' }).then(() => location.reload());
        });
        trailLayer = L.polyline([], { color: '#ef4444', weight: 5, opacity: 0.6, dashArray: '10, 10' }).addTo(map);
    }

    db.ref('players/' + playerId).onDisconnect().remove();
    updateMockPosition();
}

function exitGame() {
    db.ref('players/' + playerId).remove().then(() => {
        location.reload();
    });
}

function moveMock(dir) {
    const s = 0.00015;
    if (dir === 'up') mockLat += s; if (dir === 'down') mockLat -= s;
    if (dir === 'left') mockLng -= s; if (dir === 'right') mockLng += s;
    lastGpsTimestamp = Date.now(); // לצורך בדיקת כפתורי ה-Dev
    updateMockPosition();
}

function updateMockPosition() {
    map.panTo([mockLat, mockLng]);
    if (playerRole === 'thief') {
        if (typeof checkCaptureProgress === "function" && checkCaptureProgress(thiefPath, [mockLat, mockLng])) {
            const areaId = 'area_' + Date.now();
            db.ref('capturedAreas/' + areaId).set({ points: [...thiefPath, thiefPath[0]], capturedBy: playerId });
            thiefPath = []; 
            if (trailLayer) trailLayer.setLatLngs([]);
            alert("שטח נכבש!");
        } else {
            thiefPath.push([mockLat, mockLng]);
            if (trailLayer) trailLayer.setLatLngs(thiefPath);
        }
    }
    db.ref('players/' + playerId).update({ lat: mockLat, lng: mockLng, t: Date.now() });
}

function triggerCapture() {
    const btn = document.getElementById('capture-btn');
    const timerText = document.getElementById('cooldown-timer');
    const circle = document.getElementById('cooldown-circle');
    const circumference = 326.7;

    if (btn.disabled) return;

    btn.disabled = true;
    broadcastCapture();

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
    }, 10000);
}

function listenToCapturedAreas() {
    db.ref('capturedAreas').on('value', snap => {
        if (typeof renderAreas === "function") {
            areaLayers = renderAreas(map, snap.val(), areaLayers);
        }
    });
}

function listenToOtherPlayers() {
    db.ref('players').on('value', snap => {
        const players = snap.val();
        for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
        playerMarkers = {};
        
        if (!players) {
            document.getElementById('players-count').innerText = `שחקנים: 0`;
            return;
        }

        const now = Date.now();
        let activeCount = 0;

        Object.keys(players).forEach(id => {
            const p = players[id];
            
            // ניקוי שחקנים לא פעילים (מעל דקה)
            if (now - p.t > 60000) {
                db.ref('players/' + id).remove();
                return;
            }

            activeCount++;
            if (playerRole === 'cop' && p.role === 'thief' && id !== playerId) return;
            
            const color = p.role === 'cop' ? '#3b82f6' : '#ef4444';
            playerMarkers[id] = L.circleMarker([p.lat, p.lng], { 
                radius: id === playerId ? 30 : 20, 
                color: '#fff', 
                weight: 3, 
                fillColor: color, 
                fillOpacity: 1 
            }).addTo(map);
        });

        document.getElementById('players-count').innerText = `שחקנים: ${activeCount}`;
    });
}

listenToOtherPlayers();
listenToCapturedAreas();