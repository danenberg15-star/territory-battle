// game-arena.js - Arena Management, Drawing & Early GPS Load

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

            // הפעלת מנוע הבוטים לשחקן יחיד
            window.db.ref(`rooms/${window.currentRoom}`).once('value', rSnap => {
                const rData = rSnap.val();
                if (rData && rData.gameMode === 'single' && window.isHost) {
                    if (typeof startSinglePlayerAI === 'function') {
                        startSinglePlayerAI(window.currentRoom, rData.difficulty || 'skilled', arenaData);
                    }
                }
            });

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
    // הסרת מסך ה-briefing הכהה שנתקע
    const overlay = document.getElementById('briefing-overlay');
    if (overlay) overlay.style.display = 'none';

    if (myLat && myLng) map.setView([myLat, myLng], 17); // זום קרוב לציור
    document.getElementById('setup-ui').style.display = 'flex';
    document.getElementById('map-controls').style.display = 'flex';
    document.getElementById('zoom-controls').style.display = 'flex';
    if (typeof initDrawingCanvas === "function") initDrawingCanvas(map); 
}

function confirmDrawing() {
    if (typeof finalizeDrawing === "function") {
        const results = finalizeDrawing(); 
        if (results) {
            window.db.ref(`game/${window.currentRoom}/arena`).set(results).then(() => {
                // העלמה מיידית של ממשק הציור
                document.getElementById('setup-ui').style.display = 'none';
                document.getElementById('drawing-container').style.display = 'none';

                // בדיקה אם זה משחק מרובה משתתפים או שחקן יחיד
                window.db.ref(`rooms/${window.currentRoom}`).once('value', snap => {
                    const roomData = snap.val();
                    if (roomData && roomData.gameMode === 'single') {
                        // בשחקן יחיד מדלגים על טיימר התדריך ומתחילים ישר
                        window.db.ref(`game/${window.currentRoom}/briefing/complete`).set(true);
                    } else {
                        // ברב משתתפים, מפעילים את טיימר התדריך של ה-30 שניות כרגיל
                        if (typeof window.startBriefingTimer === 'function') {
                            window.startBriefingTimer();
                        } else {
                            window.db.ref(`game/${window.currentRoom}/briefing/complete`).set(true);
                        }
                    }
                });
            });
        }
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