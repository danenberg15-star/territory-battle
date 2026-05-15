// thief-mechanics.js - Anti-Tangle Trail & Area Capture (Fully Synced & Fixed)

let outOfBoundsTimer = null;
let outOfBoundsSeconds = 20;
let lastProximityAlert = 0;
let localCapturedAreas = null;

// ==========================================
// 1. Initialization
// ==========================================
window.startThiefMechanics = function() {
    // במצב "על זמן" — אין שובל ואין כיבוש שטח
    if (window.victoryMode === 'timer') return;

    if (window.trailLayer && window.map) {
        window.map.removeLayer(window.trailLayer);
    }
    if (window.map) {
        window.trailLayer = L.polyline([], {
            color: '#dc2626',
            weight: 6,
            dashArray: '5, 10',
            opacity: 0.9,
            pane: 'markerPane'
        }).addTo(window.map);
    }
    window.thiefPath = [];

    if (window.currentRoom) {
        if (!window.localCapturedAreasListenerAttached) {
            window.db.ref(`game/${window.currentRoom}/capturedAreas`).on('value', snap => {
                localCapturedAreas = snap.val() || {};
            });
            window.localCapturedAreasListenerAttached = true;
        }
    }

    restoreTrailFromFirebase();
};

// ==========================================
// 1.5 שחזור שובל מ-Firebase
// ==========================================
function restoreTrailFromFirebase() {
    if (!window.currentRoom || !window.playerId || !window.db) return;

    window.db.ref(`game/${window.currentRoom}/trails/${window.playerId}`).once('value', snap => {
        const savedTrail = snap.val();
        if (!savedTrail || !savedTrail.path || savedTrail.path.length < 2) return;
        if (window.thiefPath && window.thiefPath.length > 0) return;

        window.thiefPath = savedTrail.path;
        if (window.trailLayer) {
            window.trailLayer.setLatLngs(window.thiefPath);
        }
        console.log(`Trail restored: ${window.thiefPath.length} points`);
    });
}

// ==========================================
// 1.6 שמירת שובל ל-Firebase (תקופתית)
// ==========================================
let lastTrailSave = 0;

function saveTrailToFirebase() {
    if (!window.currentRoom || !window.playerId || !window.db) return;
    const now = Date.now();
    if (now - lastTrailSave < 3000) return;
    lastTrailSave = now;

    window.db.ref(`game/${window.currentRoom}/trails/${window.playerId}`).set({
        path: window.thiefPath || [],
        t: now
    });
}

// ==========================================
// 2. Core Logic Loop
// ==========================================
function updateThiefLogic(lat, lng) {
    if (window.playerRole !== 'thief' || !window.isBriefingComplete || !window.arenaData) return;

    if (window.victoryMode !== 'timer') {
        if (!window.trailLayer && typeof window.startThiefMechanics === 'function') {
            window.startThiefMechanics();
        }
    }

    checkArenaBoundaries(lat, lng);
    checkCopProximity(lat, lng);

    if (window.isGameFrozen === true) return;

    // במצב "על זמן" — לא מעדכנים שובל
    if (window.victoryMode === 'timer') return;

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

window.checkArenaBoundariesForCop = function(lat, lng) {
    if (!window.isBriefingComplete || !window.arenaData) return;
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
        console.error("Turf.js Polygon Error in Cop Arena Check:", e);
    }
};

// ==========================================
// Territory Overlay
// ==========================================
function getTerritoryOverlay() {
    let overlay = document.getElementById('territory-exit-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'territory-exit-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.55);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 99990;
        pointer-events: none;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
        background: rgba(15, 15, 20, 0.97);
        border: 3px solid #ef4444;
        border-radius: 22px;
        padding: 32px 44px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        box-shadow: 0 0 60px rgba(239, 68, 68, 0.6), 0 0 20px rgba(239, 68, 68, 0.3);
        animation: territory-pulse-border 1s ease-in-out infinite alternate;
    `;

    if (!document.getElementById('territory-exit-styles')) {
        const style = document.createElement('style');
        style.id = 'territory-exit-styles';
        style.innerHTML = `
            @keyframes territory-pulse-border {
                0%  { box-shadow: 0 0 40px rgba(239,68,68,0.5), 0 0 15px rgba(239,68,68,0.2); border-color: #ef4444; }
                100%{ box-shadow: 0 0 80px rgba(239,68,68,0.9), 0 0 30px rgba(239,68,68,0.5); border-color: #fca5a5; }
            }
            @keyframes territory-timer-pulse {
                0%  { transform: scale(1);   color: #ef4444; }
                50% { transform: scale(1.12); color: #fca5a5; }
                100%{ transform: scale(1);   color: #ef4444; }
            }
        `;
        document.head.appendChild(style);
    }

    const label = document.createElement('div');
    label.id = 'territory-exit-label';
    label.style.cssText = `
        color: #ffffff;
        font-size: clamp(20px, 5vw, 28px);
        font-weight: 900;
        letter-spacing: 1px;
        text-align: center;
        text-shadow: 0 0 12px rgba(239,68,68,0.8);
    `;
    label.innerText = window.currentLang === 'he' ? '⚠️ חזור לטריטוריה' : '⚠️ Return to Territory';

    const timer = document.createElement('div');
    timer.id = 'territory-exit-timer';
    timer.style.cssText = `
        color: #ef4444;
        font-size: clamp(48px, 12vw, 80px);
        font-weight: 900;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        animation: territory-timer-pulse 1s ease-in-out infinite;
        text-shadow: 0 0 20px rgba(239,68,68,0.8);
    `;
    timer.innerText = '20';

    box.appendChild(label);
    box.appendChild(timer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    return overlay;
}

function startOutOfBoundsTimer() {
    outOfBoundsSeconds = 20;

    const overlay = getTerritoryOverlay();
    overlay.style.display = 'flex';

    const timerEl = document.getElementById('territory-exit-timer');
    if (timerEl) timerEl.innerText = outOfBoundsSeconds;

    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);

    outOfBoundsTimer = setInterval(() => {
        outOfBoundsSeconds--;

        const tEl = document.getElementById('territory-exit-timer');
        if (tEl) tEl.innerText = outOfBoundsSeconds;

        if (outOfBoundsSeconds <= 0) {
            stopOutOfBoundsTimer();
            handleTerritoryExit();
        }
    }, 1000);
}

function stopOutOfBoundsTimer() {
    clearInterval(outOfBoundsTimer);
    outOfBoundsTimer = null;

    const overlay = document.getElementById('territory-exit-overlay');
    if (overlay) overlay.style.display = 'none';
}

function handleTerritoryExit() {
    showOutOfBoundsToast();

    if (window.currentRoom && window.playerId) {
        const playerName = window.playerName || 'שחקן';
        const role = window.playerRole || 'thief';

        const exitMsg = {
            senderId: 'system',
            senderName: 'מערכת',
            role: role,
            text: window.currentLang === 'he'
                ? `${playerName} יצא מהמשחק כי היה מחוץ לטריטוריה`
                : `${playerName} left the game for being outside the territory`,
            t: Date.now()
        };

        const updates = {};
        updates[`game/${window.currentRoom}/chat_cop/oob_${window.playerId}_${Date.now()}`] = exitMsg;
        updates[`game/${window.currentRoom}/chat_thief/oob_${window.playerId}_${Date.now() + 1}`] = exitMsg;
        updates[`game/${window.currentRoom}/outOfBoundsAlert`] = {
            playerName: playerName,
            role: role,
            t: Date.now()
        };

        window.db.ref().update(updates).finally(() => {
            setTimeout(() => {
                if (typeof exitGame === 'function') exitGame();
            }, 2000);
        });
    } else {
        setTimeout(() => {
            if (typeof exitGame === 'function') exitGame();
        }, 2000);
    }
}

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
        ? "נפסלת עקב יציאה מהטריטוריה!"
        : "Disqualified for leaving the territory!";
    document.body.appendChild(toast);
}

window.listenToOutOfBoundsAlert = function() {
    if (!window.currentRoom) return;
    window.db.ref(`game/${window.currentRoom}/outOfBoundsAlert`).on('value', snap => {
        const data = snap.val();
        if (!data) return;
        if (Date.now() - data.t > 8000) return;
        if (data.playerName === (window.playerName || '')) return;

        let old = document.getElementById('oob-broadcast-toast');
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.id = 'oob-broadcast-toast';
        toast.style.cssText = `
            position: fixed;
            top: 18%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(120, 20, 20, 0.97);
            color: white;
            padding: 18px 36px;
            border-radius: 16px;
            font-size: 18px;
            font-weight: 900;
            z-index: 99998;
            text-align: center;
            pointer-events: none;
            box-shadow: 0 0 30px rgba(220,38,68,0.7);
        `;
        toast.innerText = window.currentLang === 'he'
            ? `⚠️ ${data.playerName} יצא מהמשחק — היה מחוץ לטריטוריה`
            : `⚠️ ${data.playerName} left — was outside the territory`;
        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
        }, 5000);
    });
};

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
// 4. Trail & Polygon Detection
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
        saveTrailToFirebase();
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
        }).then(() => {
            if (window.arenaData && window.arenaData.totalArea) {
                window.db.ref(`game/${window.currentRoom}/capturedAreas`).once('value', areasSnap => {
                    const allAreas = areasSnap.val() || {};
                    let totalSqM = 0;
                    Object.values(allAreas).forEach(area => {
                        if (area.points && area.points.length >= 3) {
                            try {
                                const coords = area.points.map(p => [p[1], p[0]]);
                                coords.push(coords[0]);
                                totalSqM += turf.area(turf.polygon([coords]));
                            } catch(e) {}
                        }
                    });
                    const pct = Math.min(100, (totalSqM / window.arenaData.totalArea) * 100).toFixed(1);
                    if (typeof window.broadcastCaptureToast === 'function') {
                        window.broadcastCaptureToast(pct);
                    }
                });
            }
        });

        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/flashUntil`).set(Date.now() + 3000);

        if (typeof checkTreasureInCapturedArea === 'function') {
            checkTreasureInCapturedArea(points);
        }

        if (splitIndex !== undefined) {
            window.thiefPath = window.thiefPath.slice(0, splitIndex + 1);
        } else {
            window.thiefPath = [];
        }
        if (window.trailLayer) window.trailLayer.setLatLngs(window.thiefPath);
        saveTrailToFirebase();
    });
}