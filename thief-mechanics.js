// thief-mechanics.js - Phase 1.8.2: "Steal the Street" & Advanced Thief Rules

let outOfBoundsTimer = null;
let outOfBoundsSeconds = 10;
let lastProximityAlert = 0;

// פונקציה ראשית לניהול לוגיקת הגנב בכל עדכון מיקום
function updateThiefLogic(lat, lng) {
    if (window.playerRole !== 'thief' || !isBriefingComplete || !arenaData) return;

    checkArenaBoundaries(lat, lng);
    checkCopProximity(lat, lng);
    handleThiefTrail(lat, lng);
}

// 4.2: בדיקת גבולות הזירה וטיימר פסילה[cite: 2]
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
    document.getElementById('briefing-overlay').style.display = 'block';
    document.getElementById('briefing-timer-text').style.color = "#ef4444";
    
    outOfBoundsTimer = setInterval(() => {
        outOfBoundsSeconds--;
        document.getElementById('briefing-status').innerText = window.currentLang === 'he' ? 
            "חזור לזירה מיד!" : "Return to Arena!";
        document.getElementById('briefing-timer-text').innerText = `00:${outOfBoundsSeconds < 10 ? '0' : ''}${outOfBoundsSeconds}`;
        
        if (outOfBoundsSeconds <= 0) {
            stopOutOfBoundsTimer();
            alert(window.currentLang === 'he' ? "נפסלת עקב יציאה מהזירה!" : "Disqualified for leaving the arena!");
            exitGame(); // פסילה[cite: 2]
        }
    }, 1000);
}

function stopOutOfBoundsTimer() {
    clearInterval(outOfBoundsTimer);
    outOfBoundsTimer = null;
    document.getElementById('briefing-overlay').style.display = 'none';
    document.getElementById('briefing-timer-text').style.color = "#facc15";
}

// 4.2: התראת קרבה לשוטר (20 מטר)[cite: 2]
function checkCopProximity(lat, lng) {
    const now = Date.now();
    if (now - lastProximityAlert < 5000) return; // מניעת הצפה של התראות

    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        Object.keys(players).forEach(id => {
            const p = players[id];
            if (p.role === 'cop' && id !== window.playerId) {
                const distance = map.distance([lat, lng], [p.lat, p.lng]);
                if (distance <= 20) {
                    if (navigator.vibrate) navigator.vibrate(200); // רטט[cite: 2]
                    console.log("Cop nearby!");
                    lastProximityAlert = now;
                }
            }
        });
    });
}

// 4.1: ניהול שובלים וסגירת פוליגונים[cite: 2]
function handleThiefTrail(lat, lng) {
    if (thiefPath.length > 0) {
        const last = thiefPath[thiefPath.length - 1];
        if (map.distance([lat, lng], last) < 3) return; // רגישות תנועה
    }

    // בדיקה האם הגנב סגר מעגל (חזר לנקודה קרובה לשובל שלו)
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

// 4.1 & 4.2: ניסיון סגירת שטח ובדיקת נוכחות שוטר[cite: 2]
function tryCaptureArea(points) {
    // יצירת פוליגון לצורך בדיקה
    const polygonCoords = points.map(p => [p[1], p[0]]);
    polygonCoords.push(polygonCoords[0]); // סגירת הפוליגון
    const polygon = turf.polygon([polygonCoords]);

    // בדיקה האם יש שוטר בתוך השטח ברגע הסגירה[cite: 2]
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

        // הצלחה - שמירת השטח וחשיפת הגנב ל-3 שניות[cite: 2]
        const areaId = 'area_' + Date.now();
        window.db.ref(`game/${window.currentRoom}/capturedAreas/${areaId}`).set({
            points: points,
            capturedBy: window.playerId,
            t: Date.now()
        });

        // 4.1: הבהוב אדום לשוטרים[cite: 2]
        window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/flashUntil`).set(Date.now() + 3000);

        thiefPath = [];
        if (trailLayer) trailLayer.setLatLngs([]);
    });
}