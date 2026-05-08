// game-arena.js - Arena Management & Briefing Sync

// ==========================================
// 0. Early GPS Activation (Login Screen)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const nameInput = document.getElementById('player-name');
    if (nameInput) {
        // ברגע שהשחקן מתחיל להקליד את שמו, ה-GPS מתחיל לעבוד ברקע
        nameInput.addEventListener('input', () => {
            if (typeof startRealGpsTracking === 'function' && !window.earlyGpsStarted) {
                window.earlyGpsStarted = true;
                console.log("Early GPS tracking started from login screen...");
                startRealGpsTracking();
            }
        }, { once: true });
    }
});

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
                if (overlay) overlay.style.display = 'flex';
                if (status) status.innerText = window.currentLang === 'he' ? "ממתין למנהל שיצייר זירה..." : "Waiting for host...";
            }
        } else {
            window.arenaData = data;
            document.getElementById('setup-ui').style.display = 'none';
            document.getElementById('drawing-container').style.display = 'none';
            document.getElementById('map-controls').style.display = 'none';
            document.getElementById('zoom-controls').style.display = 'none';

            if (window.map) {
                window.map.dragging.enable();
                window.map.touchZoom.enable();
            }

            drawArenaOnMap();
            setupPoliceStation();

            if (window.isHost && typeof initTreasuresMaster === 'function') {
                initTreasuresMaster();
            }

            // הפעלת מנוע הבוטים
            if (!window.aiStarted) {
                window.aiStarted = true;
                window.db.ref(`rooms/${window.currentRoom}`).once('value', rSnap => {
                    const rData = rSnap.val();
                    if (rData && rData.gameMode === 'single' && window.isHost) {
                        if (typeof startSinglePlayerAI === 'function') {
                            startSinglePlayerAI(window.currentRoom, rData.difficulty || 'skilled', window.arenaData);
                        }
                    }
                });
            }

            // סנכרון גלובלי: מוודא שברגע שהמשחק מתחיל, כל הקבצים יודעים והשובל מופעל
            if (!window.briefingListenerAttached) {
                window.briefingListenerAttached = true;
                window.db.ref(`game/${window.currentRoom}/briefing/complete`).on('value', bSnap => {
                    if (bSnap.val() === true) {
                        window.isBriefingComplete = true; 
                        document.getElementById('briefing-overlay').style.display = 'none';
                        
                        // הבטחת ציור השובל לגנב ברגע שהמשחק מתחיל
                        if (window.playerRole === 'thief') {
                            if (!window.trailLayer && typeof startThiefMechanics === 'function') {
                                startThiefMechanics();
                            }
                        }
                    } else {
                        if (typeof listenToBriefing === "function") listenToBriefing();
                    }
                });
            }
            
            // בקרת UI לפי תפקיד
            const controls = document.getElementById('controls-container');
            const captureContainer = document.getElementById('capture-btn-container');
            const snitchContainer = document.getElementById('snitch-btn-container');
            const micBtn = document.getElementById('chat-mic-btn');
            const chatUI = document.getElementById('chat-container');

            if (controls) controls.style.display = 'block';

            if (window.playerRole === 'cop') {
                if (captureContainer) captureContainer.style.display = 'block'; 
                if (snitchContainer) snitchContainer.style.display = 'none';
            } else if (window.playerRole === 'snitch') {
                if (captureContainer) captureContainer.style.display = 'none';
                if (snitchContainer) snitchContainer.style.display = 'block';
            } else {
                if (captureContainer) captureContainer.style.display = 'none'; 
                if (snitchContainer) snitchContainer.style.display = 'none';
            }

            // הגדרות צ'אט
            if (!window.chatSetupDone) {
                window.chatSetupDone = true;
                window.db.ref(`rooms/${window.currentRoom}/players`).once('value', pSnap => {
                    const roomPlayers = pSnap.val() || {};
                    let myTeamHumans = 0;
                    const amICop = (window.playerRole === 'cop');
                    
                    Object.keys(roomPlayers).forEach(id => {
                        if (!id.startsWith('bot_')) {
                            const isCop = (roomPlayers[id].role === 'cop');
                            if (isCop === amICop) myTeamHumans++;
                        }
                    });

                    if (myTeamHumans > 1) {
                        if (micBtn) micBtn.style.display = 'flex';
                        if (chatUI) chatUI.style.display = 'flex';
                    } else {
                        if (micBtn) micBtn.style.display = 'none';
                        if (chatUI) chatUI.style.display = 'none';
                    }
                });
            }
        }
    });
}

function setupHostDrawingMode() {
    const overlay = document.getElementById('briefing-overlay');
    if (overlay) overlay.style.display = 'none';
    if (window.myLat && window.myLng && window.map) window.map.setView([window.myLat, window.myLng], 17);
    document.getElementById('setup-ui').style.display = 'flex';
    document.getElementById('map-controls').style.display = 'flex';
    document.getElementById('zoom-controls').style.display = 'flex';
    if (typeof initDrawingCanvas === "function") initDrawingCanvas(window.map); 
}

function confirmDrawing() {
    if (typeof finalizeDrawing === "function") {
        const results = finalizeDrawing(); 
        if (results) {
            window.db.ref(`game/${window.currentRoom}/arena`).set(results).then(() => {
                document.getElementById('setup-ui').style.display = 'none';
                document.getElementById('drawing-container').style.display = 'none';
                
                window.db.ref(`rooms/${window.currentRoom}`).once('value', snap => {
                    const roomData = snap.val();
                    if (roomData && roomData.gameMode === 'single') {
                        window.db.ref(`game/${window.currentRoom}/briefing/complete`).set(true);
                    } else if (typeof window.startBriefingTimer === 'function') {
                        window.startBriefingTimer();
                    } else {
                        window.db.ref(`game/${window.currentRoom}/briefing/complete`).set(true);
                    }
                });
            });
        }
    }
}

function drawArenaOnMap() {
    if (!window.arenaData || !window.map) return;
    if (window.arenaPolygonLayer) window.map.removeLayer(window.arenaPolygonLayer);
    window.arenaPolygonLayer = L.polygon(window.arenaData.points, { color: '#1d4ed8', weight: 4, fillOpacity: 0.1, dashArray: '5, 10' }).addTo(window.map);
}

function setupPoliceStation() {
    const data = window.arenaData.policeStation;
    if (window.policeStationCircle) window.map.removeLayer(window.policeStationCircle);
    window.policeStationCircle = L.circle([data.lat, data.lng], { radius: data.radius, color: '#1e40af', fillColor: '#3b82f6', fillOpacity: 0.3 }).addTo(window.map);
}