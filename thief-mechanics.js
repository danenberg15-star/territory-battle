// thief-mechanics.js - Enhanced "Steal the Street" with Untangling & Safe Closure

let lastProximityAlert = 0;

// פונקציה ראשית לניהול לוגיקת הגנב - גבולות הזירה מנוהלים כעת ב-game-core.js
function updateThiefLogic(lat, lng) {
    if (window.playerRole !== 'thief' || !isBriefingComplete || !arenaData) return;

    checkCopProximity(lat, lng);
    
    if (typeof isGameFrozen !== 'undefined' && isGameFrozen) return;

    handleThiefTrail(lat, lng);
}

// התראת קרבה לשוטר (20 מטר)
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
                    lastProximityAlert = now;
                }
            }
        });
    });
}

// ניהול שובלים עם "התרת פלונטרים" ורגישות משופרת
function handleThiefTrail(lat, lng) {
    if (thiefPath.length > 0) {
        const last = thiefPath[thiefPath.length - 1];
        if (map.distance([lat, lng], last) < 2) return; // מניעת כפל נקודות צמודות מדי
    }

    if (thiefPath.length > 5) {
        for (let i = 0; i < thiefPath.length - 5; i++) {
            // רגישות חיתוך של 6 מטרים למניעת סגירות שגויות
            if (map.distance([lat, lng], thiefPath[i]) < 6) {
                const areaCoords = thiefPath.slice(i);
                
                // חישוב שטח מינימלי למניעת "שטחי רפאים" (פחות מ-25 מ"ר יחשב כפלונטר)
                if (calculatePathArea(areaCoords) > 25) {
                    tryCaptureArea([...areaCoords, [lat, lng]]);
                } else {
                    // התרת פלונטר: חיתוך המסלול עד לנקודת המפגש במקום מחיקה מלאה
                    thiefPath = thiefPath.slice(i);
                }
                return;
            }
        }
    }

    thiefPath.push([lat, lng]);
    if (trailLayer) trailLayer.setLatLngs(thiefPath);
}

// פונקציית עזר לחישוב שטח מהיר בתוך המסלול
function calculatePathArea(points) {
    try {
        const coords = points.map(p => [p[1], p[0]]);
        coords.push(coords[0]);
        return turf.area(turf.polygon([coords]));
    } catch(e) { return 0; }
}

// ניסיון סגירת שטח עם מנגנון הגנה מפני קריסות
function tryCaptureArea(points) {
    if (!points || points.length < 3) return;

    try {
        const polygonCoords = points.map(p => [p[1], p[0]]);
        
        // מנגנון Polygon Closure: וידוא שהנקודה האחרונה זהה לראשונה לפני Turf
        if (polygonCoords[0][0] !== polygonCoords[polygonCoords.length-1][0] || 
            polygonCoords[0][1] !== polygonCoords[polygonCoords.length-1][1]) {
            polygonCoords.push([polygonCoords[0][0], polygonCoords[0][1]]);
        }

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

            window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/flashUntil`).set(Date.now() + 3000);

            if (typeof checkTreasureInCapturedArea === 'function') {
                checkTreasureInCapturedArea(points);
            }

            thiefPath = [];
            if (trailLayer) trailLayer.setLatLngs([]);
        });
    } catch (err) {
        console.error("Polygon calculation crash prevented:", err);
        thiefPath = [];
        if (trailLayer) trailLayer.setLatLngs([]);
    }
}