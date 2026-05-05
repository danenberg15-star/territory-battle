// game-arena.js - Arena Management & Drawing

// ==========================================
// 4. Arena Setup & Role-Based Visibility
// ==========================================
function checkArenaStatus() {
    window.db.ref(`game/${window.currentRoom}/arena`).on('value', snap => {
        const data = snap.val();
        if (!data) {
            if (window.isHost) setupHostDrawingMode();
            else {
                const overlay = document.getElementById('briefing-overlay');
                const status = document.getElementById('briefing-status');
                if (overlay) overlay.style.display = 'block';
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
            
            if (window.isHost && typeof initTreasuresMaster === 'function') {
                initTreasuresMaster();
            }

            window.db.ref(`game/${window.currentRoom}/briefing/complete`).once('value', bSnap => {
                if (bSnap.val() === true) {
                    isBriefingComplete = true; 
                    document.getElementById('briefing-overlay').style.display = 'none';
                    if (window.playerRole === 'thief') startThiefMechanics();
                } else {
                    if (typeof listenToBriefing === "function") listenToBriefing();
                }
            });
            
            // בקרת UI לפי תפקיד
            const controls = document.getElementById('controls-container');
            const captureContainer = document.getElementById('capture-btn-container');
            const snitchContainer = document.getElementById('snitch-btn-container');
            const micBtn = document.getElementById('chat-mic-btn');

            if (controls) controls.style.display = 'block';
            if (micBtn) micBtn.style.display = 'flex'; // הווקי-טוקי תמיד מופיע

            if (window.playerRole === 'cop') {
                if (captureContainer) captureContainer.style.display = 'block'; // רק שוטר רואה טייזר
                if (snitchContainer) snitchContainer.style.display = 'none';
            } else if (window.playerRole === 'snitch') {
                if (captureContainer) captureContainer.style.display = 'none';
                if (snitchContainer) snitchContainer.style.display = 'block';
            } else {
                if (captureContainer) captureContainer.style.display = 'none'; // גנב לא רואה טייזר
                if (snitchContainer) snitchContainer.style.display = 'none';
                if (isBriefingComplete) startThiefMechanics();
            }

            if (typeof toggleChatVisibility === "function") {
                toggleChatVisibility(true);
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