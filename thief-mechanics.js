// thief-mechanics.js - Anti-Tangle Trail & Area Capture (Fully Synced & Fixed)

let outOfBoundsTimer = null;
let outOfBoundsSeconds = 10;
let lastProximityAlert = 0;
let localCapturedAreas = null;

// ==========================================
// 1. Initialization
// ==========================================
window.startThiefMechanics = function() {
    if (window.trailLayer && window.map) {
        window.map.removeLayer(window.trailLayer);
    }
    if (window.map) {
        // השובל מצויר על pane גבוה יותר כדי שיהיה מעל השטחים הכבושים
        window.trailLayer = L.polyline([], {
            color: '#dc2626',
            weight: 6,
            dashArray: '5, 10',
            opacity: 0.9,
            pane: 'markerPane'
        }).addTo(window.map);
    }
    window.thiefPath = [];

    // האזנה לשטחים כבושים (להשלמת פאות)
    if (window.currentRoom) {
        // הוסר ה-off('value') שדרס את מאזין הציור! הוספת בקרת כפילויות במקום.
        if (!window.localCapturedAreasListenerAttached) {
            window.db.ref(`game/${window.currentRoom}/capturedAreas`).on('value', snap => {
                localCapturedAreas = snap.val() || {};
            });
            window.localCapturedAreasListenerAttached = true;
        }
    }

    // תיקון: הפעלת האזנה ל-Toast כדי שכל השחקנים יראו הודעת כיבוש
    if (typeof window.listenToCaptureToast === 'function') {
        window.listenToCaptureToast();
    }
};

// ==========================================
// 2. Core Logic Loop
// ==========================================
function updateThiefLogic(lat, lng) {
    if (window.playerRole !== 'thief' || !window.isBriefingComplete || !window.arenaData) return;

    if (!window.trailLayer && typeof window.startThiefMechanics === 'function') {
        window.startThiefMechanics();
    }

    checkArenaBoundaries(lat, lng);
    checkCopProximity(lat, lng);

    // תיקון: בדיקה נכונה של מצב הקפאה
    if (window.isGameFrozen === true) return;

    handleThiefTrail(lat, lng);
}

// ==========================================
// 3. Rules & Boundaries
// ==========================================
function checkArenaBoundaries(lat, lng) {
    try {
        const point = turf.point([lng, lat]);
        const polyCoords = window.arenaData.points.map(p => [p[1], p[0]]);
        polyCoords.push(polyCoords[0]);

        const polygon = turf.polygon([polyCoords]);
        const isInside = turf.booleanPointInPolygon(point, polygon);

        if (!isInside) {
            if (!outOfBoundsTimer) startOutOfBoundsTimer();
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
    if (overlay) overlay.style.display = 'flex';

    const timerText = document.getElementById('briefing-timer-text');
    if (timerText) timerText.style.color = "#ef4444";

    outOfBoundsTimer = setInterval(() => {
        outOfBoundsSeconds--;
        const statusText = document.getElementById('briefing-status');
        if (statusText) statusText.innerText = window.currentLang === 'he' ? "חזור לזירה מיד!" : "Return to Arena!";

        const timerEl = document.getElementById('briefing-timer-text');
        if (timerEl) timerEl.innerText = `00:${outOfBoundsSeconds < 10 ? '0' : ''}${outOfBoundsSeconds}`;

        if (outOfBoundsSeconds <= 0) {
            stopOutOfBoundsTimer();
            // תיקון: החלפת alert() בטוסט שלא חוסם את ה-GPS
            showOutOfBoundsToast();
            setTimeout(() => {
                if (typeof exitGame === 'function') exitGame();
            }, 2000);
        }
    }, 1000);
}

function stopOutOfBoundsTimer() {
    clearInterval(outOfBoundsTimer);
    outOfBoundsTimer = null;
    const overlay = document.getElementById('briefing-overlay');
    if (overlay) overlay.style.display = 'none';

    const timerText = document.getElementById('briefing-timer-text');
    if (timerText) timerText.style.color = "#facc15";
}

// תיקון: toast במקום alert — לא חוסם GPS או Firebase
function showOutOfBoundsToast() {
    let old = document.getElementById('oob-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'oob-toast';
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(220, 38, 38, 0.97);
        color: white;
        padding: 24px 40px;
        border-radius: 16px;
        font-size: 22px;
        font-weight: 900;
        z-index: 99999;
        text-align: center;
        pointer-events: none;
        box-shadow: 0 0 40px rgba(220,38,38,0.8);
    `;
    toast.innerText = window.currentLang === 'he'
        ? "נפסלת עקב יציאה מהזירה!"
        : "Disqualified for leaving the arena!";
    document.body.appendChild(toast);
}

// תיקון: toast במקום alert — לא חוסם GPS או Firebase
function showCopInsideToast() {
    let old = document.getElementById('cop-inside-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'cop-inside-toast';
    toast.style.cssText = `
        position: fixed;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(30, 64, 175, 0.97);
        color: white;
        padding: 20px 36px;
        border-radius: 16px;
        font-size: 20px;
        font-weight: 900;
        z-index: 99999;
        text-align: center;
        pointer-events: none;
        box-shadow: 0 0 30px rgba(30,64,175,0.8);
    `;
    toast.innerText = window.currentLang === 'he'
        ? "לא ניתן לגנוב — שוטר נמצא בשטח!"
        : "Cannot steal — Cop is inside!";
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
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

// ==========================================
// 4. Trail & Polygon Detection (The "P" & Territory Rules)
// ==========================================
function isPointInAnyCapturedArea(checkLat, checkLng) {
    if (!localCapturedAreas) return false;
    const pt = turf.point([checkLng, checkLat]);

    for (let key in localCapturedAreas) {
        const pts = localCapturedAreas[key].points;
        if (!pts || pts.length < 3) continue;

        const coords = pts.map(p => [p[1], p[0]]);
        coords.push(coords[0]);
        try {
            const poly = turf.polygon([coords]);
            if (turf.booleanPointInPolygon(pt, poly)) return true;
        } catch(e) {}
    }
    return false;
}

function handleThiefTrail(lat, lng) {
    if (window.thiefPath.length > 0) {
        const last = window.thiefPath[window.thiefPath.length - 1];
        if (window.map.distance([lat, lng], last) < 3) return;
    }

    let captured = false;

    if (window.thiefPath.length > 5) {
        // חוק האות P — חיתוך עצמי
        for (let i = 0; i < window.thiefPath.length - 5; i++) {
            if (window.map.distance([lat, lng], window.thiefPath[i]) < 6) {
                const areaCoords = window.thiefPath.slice(i);
                const areaSqM = calculatePathArea(areaCoords);

                if (areaSqM > 25) {
                    tryCaptureArea([...areaCoords, [lat, lng]], i);
                    captured = true;
                    break;
                }
            }
        }
    }

    // חוק השלמת הפאות — שימוש בטריטוריות קיימות לסגירת שטחים
    if (!captured && localCapturedAreas && window.thiefPath.length > 5) {
        if (isPointInAnyCapturedArea(lat, lng)) {
            for (let i = 0; i < window.thiefPath.length - 5; i++) {
                if (isPointInAnyCapturedArea(window.thiefPath[i][0], window.thiefPath[i][1])) {
                    const areaCoords = window.thiefPath.slice(i);
                    const areaSqM = calculatePathArea(areaCoords);

                    if (areaSqM > 25) {
                        tryCaptureArea([...areaCoords, [lat, lng]], i);
                        captured = true;
                        break;
                    }
                }
            }
        }
    }

    if (!captured) {
        window.thiefPath.push([lat, lng]);
        if (window.trailLayer) window.trailLayer.setLatLngs(window.thiefPath);
    }
}

function calculatePathArea(points) {
    try {
        const coords = points.map(p => [p[1], p[0]]);
        coords.push(coords[0]);
        return turf.area(turf.polygon([coords]));
    } catch(e) { return 0; }
}

function tryCaptureArea(points, splitIndex) {
    const polygonCoords = points.map(p => [p[1], p[0]]);
    polygonCoords.push(polygonCoords[0]);
    const polygon = turf.polygon([polygonCoords]);

    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        const copInside = Object.values(players).some(p => {
            if (p.role === 'cop' && !p.isOffline) {
                const pt = turf.point([p.lng, p.lat]);
                return turf.booleanPointInPolygon(pt, polygon);
            }
            return false;
        });

        if (copInside) {
            // תיקון: toast במקום alert
            showCopInsideToast();
            if (splitIndex !== undefined) {
                window.thiefPath = window.thiefPath.slice(0, splitIndex + 1);
            } else {
                window.thiefPath = [];
            }
            if (window.trailLayer) window.trailLayer.setLatLngs(window.thiefPath);
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

        // משאירים את ה"רגל" כנקודת עוגן להמשך
        if (splitIndex !== undefined) {
            window.thiefPath = window.thiefPath.slice(0, splitIndex + 1);
        } else {
            window.thiefPath = [];
        }

        if (window.trailLayer) window.trailLayer.setLatLngs(window.thiefPath);
    });
}