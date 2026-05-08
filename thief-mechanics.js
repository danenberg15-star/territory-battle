// thief-mechanics.js - Anti-Tangle Trail & Area Capture (Fully Synced & Fixed)

let outOfBoundsTimer = null;
let outOfBoundsSeconds = 10;
let lastProximityAlert = 0;

// דורס את הפונקציה הישנה ומוודא שהשובל מאותחל על המפה הגלובלית
window.startThiefMechanics = function() {
    if (window.trailLayer && window.map) {
        window.map.removeLayer(window.trailLayer);
    }
    if (window.map) {
        window.trailLayer = L.polyline([], { color: '#dc2626', weight: 6, dashArray: '5, 10', opacity: 0.8 }).addTo(window.map);
    }
    window.thiefPath = [];
};

function updateThiefLogic(lat, lng) {
    if (window.playerRole !== 'thief' || !window.isBriefingComplete || !window.arenaData) return;

    // הגנת ברזל: הדלקה בכוח של השובל במקרה שפספסנו את ההוראה מהתדריך
    if (!window.trailLayer && typeof window.startThiefMechanics === 'function') {
        window.startThiefMechanics();
    }

    checkArenaBoundaries(lat, lng);
    checkCopProximity(lat, lng);
    
    if (typeof window.isGameFrozen !== 'undefined' && window.isGameFrozen) return;

    handleThiefTrail(lat, lng);
}

function checkArenaBoundaries(lat, lng) {
    try {
        const point = turf.point([lng, lat]);
        const polyCoords = window.arenaData.points.map(p => [p[1], p[0]]);
        
        // התיקון הקריטי: Turf.js קורס אם הפוליגון לא "סגור" (הנקודה הראשונה חייבת להיות זהה לאחרונה)
        polyCoords.push(polyCoords[0]); 
        
        const polygon = turf.polygon([polyCoords]);
        const isInside = turf.booleanPointInPolygon(point, polygon);

        if (!isInside) {
            if (!outOfBoundsTimer) {
                startOutOfBoundsTimer();
            }
        } else {
            if (outOfBoundsTimer) stopOutOfBoundsTimer();
        }
    } catch (e) {
        console.error("Turf.js Polygon Error in Arena Check:", e);
    }
}

function startOutOfBoundsTimer() {
    outOfBoundsSeconds = 10;
    const overlay = document.getElementById('briefing-overlay');
    if(overlay) overlay.style.display = 'block';
    
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
            if(typeof exitGame === 'function') exitGame(); 
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

function checkCopProximity(lat, lng) {
    const now = Date.now();
    if (now - lastProximityAlert < 5000) return; 

    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        Object.keys(players).forEach(id => {
            const p = players[id];
            if (p.role === 'cop' && id !== window.playerId) {
                const distance = window.map.distance([lat, lng], [p.lat, p.lng]);
                if (distance <= 20) {
                    if (navigator.vibrate) navigator.vibrate(200); 
                    lastProximityAlert = now;
                }
            }
        });
    });
}

function handleThiefTrail(lat, lng) {
    if (window.thiefPath.length > 0) {
        const last = window.thiefPath[window.thiefPath.length - 1];
        if (window.map.distance([lat, lng], last) < 3) return; 
    }

    if (window.thiefPath.length > 5) {
        for (let i = 0; i < window.thiefPath.length - 5; i++) {
            if (window.map.distance([lat, lng], window.thiefPath[i]) < 6) {
                const areaCoords = window.thiefPath.slice(i);
                
                const areaSqM = calculatePathArea(areaCoords);

                if (areaSqM > 25) {
                    tryCaptureArea([...areaCoords, [lat, lng]]);
                } else {
                    console.log("Knot untied - cleaning trail");
                    window.thiefPath = window.thiefPath.slice(0, i + 1);
                    if (window.trailLayer) window.trailLayer.setLatLngs(window.thiefPath);
                }
                return;
            }
        }
    }

    window.thiefPath.push([lat, lng]);
    if (window.trailLayer) window.trailLayer.setLatLngs(window.thiefPath);
}

function calculatePathArea(points) {
    try {
        const coords = points.map(p => [p[1], p[0]]);
        coords.push(coords[0]);
        return turf.area(turf.polygon([coords]));
    } catch(e) { return 0; }
}

function tryCaptureArea(points) {
    const polygonCoords = points.map(p => [p[1], p[0]]);
    polygonCoords.push(polygonCoords[0]); 
    const polygon = turf.polygon([polygonCoords]);

    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        const copInside = Object.values(players).some(p => {
            if (p.role === 'cop') {
                const pt = turf.point([p.lng, p.lat]);
                return turf.booleanPointInPolygon(pt, polygon);
            }
            return false;
        });

        if (copInside) {
            alert(window.currentLang === 'he' ? "לא ניתן לגנוב - שוטר נמצא בשטח!" : "Cannot steal - Cop is inside!");
            window.thiefPath = [];
            if (window.trailLayer) window.trailLayer.setLatLngs([]);
            return;
        }

        const areaId = 'area_' + Date.now();
        window.db.ref(`game/${window.currentRoom}/capturedAreas/${areaId}`).set({
            points: points,
            capturedBy: window.playerId,
            t: Date.now()
        });

        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/flashUntil`).set(Date.now() + 3000);

        if (typeof checkTreasureInCapturedArea === 'function') {
            checkTreasureInCapturedArea(points);
        }

        window.thiefPath = [];
        if (window.trailLayer) window.trailLayer.setLatLngs([]);
    });
}