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
let areaLayers = []; // שכבות השטחים הכבושים
let mockLat = 32.1714;
let mockLng = 34.9083;
let thiefPath = []; 
let trailLayer = null;

const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([mockLat, mockLng], 18);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);

db.ref(".info/connected").on("value", (snap) => {
    const statusEl = document.getElementById('conn-status');
    if (snap.val() === true) {
        statusEl.innerText = "מחובר לשרת ✅";
        statusEl.style.color = "#10b981";
    } else {
        statusEl.innerText = "מנסה להתחבר... ❌";
        statusEl.style.color = "#ef4444";
    }
});

function startAs(role) {
    playerRole = role;
    document.getElementById('ui-container').style.display = 'none';
    document.getElementById('dev-controls').style.display = 'block';
    db.ref('players/' + playerId).onDisconnect().remove();
    
    if (playerRole === 'thief') {
        trailLayer = L.polyline([], { color: '#ef4444', weight: 5, opacity: 0.6, dashArray: '10, 10' }).addTo(map);
    }

    updateMockPosition();
    listenToOtherPlayers();
    listenToCapturedAreas(); // האזנה לשטחים כבושים
}

function moveMock(direction) {
    const step = 0.00015; 
    if (direction === 'up') mockLat += step;
    if (direction === 'down') mockLat -= step;
    if (direction === 'left') mockLng -= step;
    if (direction === 'right') mockLng += step;
    updateMockPosition();
}

function updateMockPosition() {
    map.panTo([mockLat, mockLng]);

    if (playerRole === 'thief') {
        const currentPos = [mockLat, mockLng];
        
        // בדיקה אם חזרנו לנקודת ההתחלה לסגירת מעגל
        if (thiefPath.length > 5) {
            const startPoint = turf.point([thiefPath[0][1], thiefPath[0][0]]);
            const endPoint = turf.point([mockLng, mockLat]);
            const distance = turf.distance(startPoint, endPoint, {units: 'meters'});

            if (distance < 15) { // אם הגנב ברדיוס של 15 מטר מההתחלה
                captureArea();
                return;
            }
        }

        thiefPath.push(currentPos);
        if (trailLayer) trailLayer.setLatLngs(thiefPath);
    }

    db.ref('players/' + playerId).set({
        role: playerRole, lat: mockLat, lng: mockLng, t: Date.now()
    });
}

function captureArea() {
    if (thiefPath.length < 3) return;

    // הוספת נקודת הסגירה
    const finalPath = [...thiefPath, thiefPath[0]];
    
    // שליחה ל-Firebase
    const areaId = 'area_' + Date.now();
    db.ref('capturedAreas/' + areaId).set({
        points: finalPath,
        capturedBy: playerId,
        timestamp: Date.now()
    });

    // איפוס המסלול המקומי
    thiefPath = [];
    if (trailLayer) trailLayer.setLatLngs([]);
    alert("שטח נכבש! 🏁");
}

function listenToCapturedAreas() {
    db.ref('capturedAreas').on('value', (snapshot) => {
        const areas = snapshot.val();
        
        // ניקוי שטחים קיימים
        areaLayers.forEach(layer => map.removeLayer(layer));
        areaLayers = [];

        if (!areas) return;

        Object.values(areas).forEach(area => {
            const polygon = L.polygon(area.points, {
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.4,
                weight: 2
            }).addTo(map);
            areaLayers.push(polygon);
        });
    });
}

function listenToOtherPlayers() {
    db.ref('players').on('value', (snapshot) => {
        const players = snapshot.val();
        for (let id in playerMarkers) { map.removeLayer(playerMarkers[id]); }
        playerMarkers = {};
        if (!players) return;

        const ids = Object.keys(players);
        document.getElementById('players-count').innerText = `שחקנים בשרת: ${ids.length}`;

        ids.forEach(id => {
            const p = players[id];
            if (playerRole === 'cop' && p.role === 'thief' && id !== playerId) return;
            const color = p.role === 'cop' ? '#3b82f6' : '#ef4444';
            playerMarkers[id] = L.circleMarker([p.lat, p.lng], {
                radius: id === playerId ? 30 : 20,
                color: '#fff', weight: 3, fillColor: color, fillOpacity: 1
            }).addTo(map);
        });
    });
}