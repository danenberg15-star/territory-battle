// thief-mechanics.js - Phase 1.8.8: "Steal the Street" & Game Freeze Integration

let outOfBoundsTimer = null;
let outOfBoundsSeconds = 10;
let lastProximityAlert = 0;

// פונקציה ראשית לניהול לוגיקת הגנב בכל עדכון מיקום
function updateThiefLogic(lat, lng) {
    if (window.playerRole !== 'thief' || !isBriefingComplete || !arenaData) return;

    checkArenaBoundaries(lat, lng);
    checkCopProximity(lat, lng);
    
    // אם יש תחקיר משטרתי (Game Freeze), הגנבים לא יכולים לגנוב שטחים!
    if (typeof isGameFrozen !== 'undefined' && isGameFrozen) return;

    handleThiefTrail(lat, lng);
}

// 4.2: בדיקת גבולות הזירה וטיימר פסילה
function checkArenaBoundaries(lat, lng) {
    const point = turf.point([lng, lat]);
    const polygon = turf.polygon([arenaData.points.map(p => [p[1], p[0]])]);
    const isInside = turf.booleanPointInPolygon(point, polygon);

    if (!isInside) {
        if (!outOfBoundsTimer) {
            console.warn("Out of bounds!");
            startOutOfBoundsTimer();
        }
    } else {
        if (outOfBoundsTimer) stopOutOfBoundsTimer();
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
            exitGame(); 
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

// 4.2: התראת קרבה לשוטר (20 מטר)
function checkCopProximity(lat, lng) {
    const now = Date.now();
    if (now - lastProximityAlert < 5000) return; 

    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        Object.keys(players).forEach(id => {
            const p = players[id];
            if (p.role === 'cop' && id !== window.playerId) {
                const distance = map.distance([lat, lng], [p.lat, p.lng]);
                if (distance <= 20) {
                    if (navigator.vibrate) navigator.vibrate(200); 
                    console.log("Cop nearby!");
                    lastProximityAlert = now;
                }
            }
        });
    });
}

// 4.1: ניהול שובלים וסגירת פוליגונים
function handleThiefTrail(lat, lng) {
    if (thiefPath.length > 0) {
        const last = thiefPath[thiefPath.length - 1];
        if (map.distance([lat, lng], last) < 3) return; 
    }

    if (thiefPath.length > 5) {
        for (let i = 0; i < thiefPath.length - 5; i++) {
            if (map.distance([lat, lng], thiefPath[i]) < 10) {
                tryCaptureArea([...thiefPath, [lat, lng]]);
                return;
            }
        }
    }

    thiefPath.push([lat, lng]);
    if (trailLayer) trailLayer.setLatLngs(thiefPath);
}

// 4.1 & 4.2: ניסיון סגירת שטח ובדיקת נוכחות שוטר
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
            thiefPath = [];
            if (trailLayer) trailLayer.setLatLngs([]);
            return;
        }

        const areaId = 'area_' + Date.now();
        window.db.ref(`game/${window.currentRoom}/capturedAreas/${areaId}`).set({
            points: points,
            capturedBy: window.playerId,
            t: Date.now()
        });

        // 4.1: הבהוב אדום לשוטרים
        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/flashUntil`).set(Date.now() + 3000);

        // 6.3: בדיקה האם הגנב כלא אוצר בתוך השטח שזה עתה יצר!
        if (typeof checkTreasureInCapturedArea === 'function') {
            checkTreasureInCapturedArea(points);
        }

        thiefPath = [];
        if (trailLayer) trailLayer.setLatLngs([]);
    });
}