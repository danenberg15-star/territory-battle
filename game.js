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

const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([mockLat, mockLng], 18);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);

// חיווי GPS
navigator.geolocation.watchPosition(() => {
    document.getElementById('gps-status').innerText = "GPS ✅";
    document.getElementById('gps-status').style.color = "#10b981";
}, null, { enableHighAccuracy: true });

function startAs(role) {
    playerRole = role;
    document.getElementById('ui-container').style.display = 'none';
    document.getElementById('controls-container').style.display = 'block';
    
    if (role === 'cop') {
        document.getElementById('capture-btn').style.display = 'inline-block';
    } else {
        startListeningForCops(() => {
            alert("נתפסת על ידי השריף! 👮‍♂️");
            db.ref('players/' + playerId).update({ role: 'cop' }); // הפיכת צד לפי האפיון
            location.reload();
        });
        trailLayer = L.polyline([], { color: '#ef4444', weight: 5, opacity: 0.6, dashArray: '10, 10' }).addTo(map);
    }

    db.ref('players/' + playerId).onDisconnect().remove();
    updateMockPosition();
    listenToOtherPlayers();
    listenToCapturedAreas();
}

function moveMock(dir) {
    const s = 0.00015;
    if (dir === 'up') mockLat += s; if (dir === 'down') mockLat -= s;
    if (dir === 'left') mockLng -= s; if (dir === 'right') mockLng += s;
    updateMockPosition();
}

function updateMockPosition() {
    map.panTo([mockLat, mockLng]);
    if (playerRole === 'thief') {
        if (checkCaptureProgress(thiefPath, [mockLat, mockLng])) {
            const areaId = 'area_' + Date.now();
            db.ref('capturedAreas/' + areaId).set({ points: [...thiefPath, thiefPath[0]], capturedBy: playerId });
            thiefPath = []; trailLayer.setLatLngs([]);
            alert("השטח נכבש!");
        } else {
            thiefPath.push([mockLat, mockLng]);
            trailLayer.setLatLngs(thiefPath);
        }
    }
    db.ref('players/' + playerId).update({ role: playerRole, lat: mockLat, lng: mockLng, t: Date.now() });
}

function triggerCapture() {
    const btn = document.getElementById('capture-btn');
    btn.disabled = true;
    broadcastCapture(); // שידור סאונד
    setTimeout(() => { btn.disabled = false; }, 60000); // Cooldown של 60 שניות
}

function listenToCapturedAreas() {
    db.ref('capturedAreas').on('value', snap => {
        areaLayers = renderAreas(map, snap.val(), areaLayers);
    });
}

function listenToOtherPlayers() {
    db.ref('players').on('value', snap => {
        const players = snap.val();
        for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
        playerMarkers = {};
        if (!players) return;
        const ids = Object.keys(players);
        document.getElementById('players-count').innerText = `שחקנים: ${ids.length}`;
        ids.forEach(id => {
            const p = players[id];
            if (playerRole === 'cop' && p.role === 'thief' && id !== playerId) return;
            const color = p.role === 'cop' ? '#3b82f6' : '#ef4444';
            playerMarkers[id] = L.circleMarker([p.lat, p.lng], { radius: id === playerId ? 30 : 20, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 }).addTo(map);
        });
    });
}