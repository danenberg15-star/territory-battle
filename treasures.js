// treasures.js - Phase 6: Treasures & Game Freeze (Legal Release)

let treasuresData = {};
let treasureMarkers = {};
let isGameFrozen = false;
let freezeCheckInterval = null;

// 1. Initializing Treasures (Host Only) - מוגרל פעם אחת בתחילת המשחק
function initTreasuresMaster() {
    if (!window.isHost || !arenaData) return;
    
    window.db.ref(`game/${window.currentRoom}/treasures`).once('value', snap => {
        if (snap.exists()) return; // אוצרות כבר הוגרלו

        const polygonCoords = arenaData.points.map(p => [p[1], p[0]]);
        polygonCoords.push(polygonCoords[0]);
        const polygon = turf.polygon([polygonCoords]);
        const bbox = turf.bbox(polygon);

        let spawned = 0;
        const treasuresToSpawn = [
            { id: 't_cop', type: 'cop_radar', icon: '⚡' },
            { id: 't_thief', type: 'thief_jailcard', icon: '🛡️' }
        ];
        
        const treasures = {};

        // הגרלת נקודות בתוך הזירה, הרחק מתחנת המשטרה[cite: 10]
        while (spawned < 2) {
            const lng = Math.random() * (bbox[2] - bbox[0]) + bbox[0];
            const lat = Math.random() * (bbox[3] - bbox[1]) + bbox[1];
            const pt = turf.point([lng, lat]);
            
            if (turf.booleanPointInPolygon(pt, polygon)) {
                const stationPt = turf.point([arenaData.policeStation.lng, arenaData.policeStation.lat]);
                const distToStation = turf.distance(pt, stationPt, {units: 'meters'}) * 1000;
                
                // מוודאים שהאוצר לא נופל בתוך התחנה[cite: 10]
                if (distToStation > arenaData.policeStation.radius + 15) {
                    treasures[treasuresToSpawn[spawned].id] = {
                        lat: lat,
                        lng: lng,
                        type: treasuresToSpawn[spawned].type,
                        icon: treasuresToSpawn[spawned].icon,
                        collected: false
                    };
                    spawned++;
                }
            }
        }
        window.db.ref(`game/${window.currentRoom}/treasures`).set(treasures);
    });
}

// 2. Listening to Treasures & Freeze State[cite: 10]
function listenToTreasures() {
    window.db.ref(`game/${window.currentRoom}/treasures`).on('value', snap => {
        treasuresData = snap.val() || {};
        updateTreasureMarkers();
    });

    window.db.ref(`game/${window.currentRoom}/freeze`).on('value', snap => {
        handleFreezeState(snap.val());
    });
}

// 3. Proximity Display & Collection (מופעל ב-GPS Update)[cite: 10]
function checkTreasureProximity(lat, lng) {
    if (isGameFrozen || !window.playerRole) return;

    Object.keys(treasuresData).forEach(id => {
        const t = treasuresData[id];
        if (t.collected) return;

        // שוטר רואה רק אוצר שוטרים, גנב רואה רק אוצר גנבים[cite: 10]
        if (t.type === 'cop_radar' && window.playerRole !== 'cop') return;
        if (t.type === 'thief_jailcard' && window.playerRole !== 'thief') return;

        const dist = map.distance([lat, lng], [t.lat, t.lng]);

        // חשיפה פיזית במרחק 15 מטר[cite: 10]
        if (dist <= 15) {
            if (!treasureMarkers[id]) drawTreasureMarker(id, t);
        } else {
            if (treasureMarkers[id]) removeTreasureMarker(id);
        }

        // איסוף פיזי במרחק 3 מטר[cite: 10]
        if (dist <= 3) {
            collectTreasure(id, t.type);
        }
    });
}

function drawTreasureMarker(id, t) {
    const iconHtml = `<div style="background: #facc15; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 0 10px #facc15; border: 2px solid white;">${t.icon}</div>`;
    const customIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
    treasureMarkers[id] = L.marker([t.lat, t.lng], { icon: customIcon }).addTo(map);
}

function removeTreasureMarker(id) {
    if (treasureMarkers[id]) {
        map.removeLayer(treasureMarkers[id]);
        delete treasureMarkers[id];
    }
}

function updateTreasureMarkers() {
    Object.keys(treasuresData).forEach(id => {
        if (treasuresData[id].collected) {
            removeTreasureMarker(id);
        }
    });
}

// 4. Collection Logic[cite: 10]
function collectTreasure(id, type) {
    window.db.ref(`game/${window.currentRoom}/treasures/${id}`).transaction(current => {
        if (current && !current.collected) {
            current.collected = true;
            current.collectedBy = window.playerId;
            return current;
        }
        return;
    }, (error, committed) => {
        if (committed) {
            if (type === 'cop_radar') {
                activateCopRadar();
            } else if (type === 'thief_jailcard') {
                window.db.ref(`game/${window.currentRoom}/players/${window.playerId}/hasJailCard`).set(true);
                // הודעה קופצת לגנב[cite: 10]
                const overlay = document.getElementById('briefing-overlay');
                const text = document.getElementById('briefing-status');
                overlay.style.display = 'block';
                overlay.style.borderColor = '#10b981';
                text.innerText = "אספת כרטיס יציאה מהכלא! יש לך חסינות.";
                document.getElementById('briefing-timer-text').innerText = "🛡️";
                setTimeout(() => { overlay.style.display = 'none'; overlay.style.borderColor = '#facc15'; }, 5000);
            }
        }
    });
}

// 6.2 מכ"ם בזק - חשיפת גנבים לשוטר[cite: 10]
function activateCopRadar() {
    window.copRadarActiveUntil = Date.now() + 2000;
    const radar = document.getElementById('radar-overlay');
    if(radar) {
        radar.style.display = 'block';
        radar.style.background = 'rgba(250, 204, 21, 0.2)'; 
        setTimeout(() => { radar.style.display = 'none'; radar.style.background = 'rgba(56, 189, 248, 0.1)'; }, 2000);
    }
}

// 5. Game Freeze Logic (תחקיר משטרתי)[cite: 10]
function triggerGameFreeze(thiefId) {
    window.db.ref(`game/${window.currentRoom}/freeze`).set({
        active: true,
        triggeredBy: thiefId,
        timestamp: Date.now()
    });
    // מחיקת הכרטיס מהגנב לאחר שימוש[cite: 10]
    window.db.ref(`game/${window.currentRoom}/players/${thiefId}/hasJailCard`).remove();
}

function handleFreezeState(freezeData) {
    const freezeOverlay = document.getElementById('freeze-overlay');
    const timerEl = document.getElementById('freeze-timer');
    
    if (!freezeData || !freezeData.active) {
        isGameFrozen = false;
        if(freezeOverlay) freezeOverlay.style.display = 'none';
        if (window.isHost && freezeCheckInterval) {
            clearInterval(freezeCheckInterval);
            freezeCheckInterval = null;
        }
        return;
    }

    isGameFrozen = true;
    if(freezeOverlay) freezeOverlay.style.display = 'flex';
    
    // ניהול טיימר השחרור הציבורי[cite: 10]
    if (freezeData.readyTime) {
        const timeLeft = Math.ceil((freezeData.readyTime - Date.now()) / 1000);
        if (timeLeft > 0) {
            timerEl.innerText = `0${timeLeft}`;
        } else {
            timerEl.innerText = "00";
            if (window.isHost) {
                window.db.ref(`game/${window.currentRoom}/freeze`).update({ active: false, readyTime: null });
            }
        }
    } else {
        timerEl.innerText = "--"; 
    }

    if (window.isHost && !freezeCheckInterval) {
        freezeCheckInterval = setInterval(checkCopsInStation, 1000);
    }
}

// המנהל בודק האם כל השוטרים בתחנה[cite: 10]
function checkCopsInStation() {
    if (!isGameFrozen || !window.isHost) return;
    
    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        let allCopsIn = true;
        let hasCops = false;

        Object.values(players).forEach(p => {
            if (p.role === 'cop' && !p.isOffline) { 
                hasCops = true;
                if (!p.inStation) allCopsIn = false;
            }
        });

        window.db.ref(`game/${window.currentRoom}/freeze`).once('value', fSnap => {
            const fData = fSnap.val() || {};
            
            // אם כולם בפנים, מפעיל טיימר של 5 שניות[cite: 10]
            if (hasCops && allCopsIn) {
                if (!fData.readyTime) {
                    window.db.ref(`game/${window.currentRoom}/freeze/readyTime`).set(Date.now() + 5000);
                }
            } else {
                // אם שוטר יצא, מאפס את הטיימר[cite: 10]
                if (fData.readyTime) {
                    window.db.ref(`game/${window.currentRoom}/freeze/readyTime`).remove();
                }
            }
        });
    });
}

// 6. Support for Capturing Area with Treasure[cite: 10]
function checkTreasureInCapturedArea(polygonCoords) {
    if (window.playerRole !== 'thief') return;
    
    const polygonCoordsClosed = [...polygonCoords];
    polygonCoordsClosed.push(polygonCoordsClosed[0]);
    const polygon = turf.polygon([polygonCoordsClosed]);
    
    Object.keys(treasuresData).forEach(id => {
        const t = treasuresData[id];
        if (t.type === 'thief_jailcard' && !t.collected) {
            const pt = turf.point([t.lng, t.lat]);
            // אם התיבה נסגרה בתוך השטח, היא נאספת אוטומטית[cite: 10]
            if (turf.booleanPointInPolygon(pt, polygon)) {
                collectTreasure(id, t.type);
            }
        }
    });
}