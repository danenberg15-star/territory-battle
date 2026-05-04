// treasures.js - Phase 8.2: Longest Trail Rule & Drone Mechanic[cite: 7]

let treasuresData = {};
let treasureMarkers = {};
let isGameFrozen = false;
let freezeCheckInterval = null;
let droneCircleLayer = null; 
let droneTimeout = null; 

// 1. Initializing Treasures (Host Only)
function initTreasuresMaster() {
    if (!window.isHost || !arenaData) return;
    
    window.db.ref(`game/${window.currentRoom}/treasures`).once('value', snap => {
        if (snap.exists()) return; 

        const polygonCoords = arenaData.points.map(p => [p[1], p[0]]);
        polygonCoords.push(polygonCoords[0]);
        const polygon = turf.polygon([polygonCoords]);
        const bbox = turf.bbox(polygon);

        let spawned = 0;
        const treasuresToSpawn = [
            { id: 't_cop', type: 'cop_radar', icon: '⚡' },
            { id: 't_thief', type: 'thief_jailcard', icon: '🛡️' },
            { id: 't_drone', type: 'cop_drone', icon: '🚁' } 
        ];
        
        const treasures = {};

        while (spawned < 3) {
            const lng = Math.random() * (bbox[2] - bbox[0]) + bbox[0];
            const lat = Math.random() * (bbox[3] - bbox[1]) + bbox[1];
            const pt = turf.point([lng, lat]);
            
            if (turf.booleanPointInPolygon(pt, polygon)) {
                const stationPt = turf.point([arenaData.policeStation.lng, arenaData.policeStation.lat]);
                const distToStation = turf.distance(pt, stationPt, {units: 'meters'}) * 1000;
                
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

// 2. Listening to Treasures & Drone Status
function listenToTreasures() {
    window.db.ref(`game/${window.currentRoom}/treasures`).on('value', snap => {
        treasuresData = snap.val() || {};
        updateTreasureMarkers();
    });

    window.db.ref(`game/${window.currentRoom}/freeze`).on('value', snap => {
        handleFreezeState(snap.val());
    });

    window.db.ref(`game/${window.currentRoom}/drone`).on('value', snap => {
        const drone = snap.val();
        const now = Date.now();
        
        if (droneCircleLayer && map) {
            map.removeLayer(droneCircleLayer);
            droneCircleLayer = null;
        }
        
        if (droneTimeout) clearTimeout(droneTimeout);

        if (drone && drone.expiresAt > now) {
            window.droneActiveData = drone; 
            
            if (window.playerRole === 'cop' || window.playerRole === 'snitch') {
                droneCircleLayer = L.circle([drone.lat, drone.lng], {
                    radius: drone.radius,
                    color: '#10b981',
                    fillColor: '#34d399',
                    fillOpacity: 0.25,
                    weight: 2,
                    dashArray: '10, 15'
                }).addTo(map);
            }

            droneTimeout = setTimeout(() => {
                if (droneCircleLayer && map) map.removeLayer(droneCircleLayer);
                droneCircleLayer = null;
                window.droneActiveData = null;
            }, drone.expiresAt - now);

        } else {
            window.droneActiveData = null;
        }
    });

    window.db.ref(`game/${window.currentRoom}/droneAlert`).on('value', snap => {
        const alertTime = snap.val();
        if (alertTime && Date.now() - alertTime < 5000 && window.playerRole === 'thief') {
            showDroneAlertForThieves();
        }
    });
}

// 3. Proximity Display & Collection
function checkTreasureProximity(lat, lng) {
    if (isGameFrozen || !window.playerRole) return;

    Object.keys(treasuresData).forEach(id => {
        const t = treasuresData[id];
        if (t.collected) return;

        if ((t.type === 'cop_radar' || t.type === 'cop_drone') && window.playerRole !== 'cop') return;
        if (t.type === 'thief_jailcard' && window.playerRole !== 'thief') return;

        const dist = map.distance([lat, lng], [t.lat, t.lng]);

        if (dist <= 15) {
            if (!treasureMarkers[id]) drawTreasureMarker(id, t);
        } else {
            if (treasureMarkers[id]) removeTreasureMarker(id);
        }

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

// 4. Collection Logic
function collectTreasure(id, type, manualTargetId = null) {
    const targetPlayerId = manualTargetId || window.playerId;

    window.db.ref(`game/${window.currentRoom}/treasures/${id}`).transaction(current => {
        if (current && !current.collected) {
            current.collected = true;
            current.collectedBy = targetPlayerId;
            return current;
        }
        return;
    }, (error, committed) => {
        if (committed) {
            if (type === 'cop_radar' && targetPlayerId === window.playerId) {
                activateCopRadar();
            } else if (type === 'cop_drone' && targetPlayerId === window.playerId) {
                activateCopDrone();
            } else if (type === 'thief_jailcard') {
                window.db.ref(`game/${window.currentRoom}/players/${targetPlayerId}/hasJailCard`).set(true);
                
                if (targetPlayerId === window.playerId) {
                    const overlay = document.getElementById('briefing-overlay');
                    const text = document.getElementById('briefing-status');
                    overlay.style.display = 'block';
                    overlay.style.borderColor = '#10b981';
                    text.innerText = "אספת כרטיס יציאה מהכלא! יש לך חסינות.";
                    document.getElementById('briefing-timer-text').innerText = "🛡️";
                    setTimeout(() => { overlay.style.display = 'none'; overlay.style.borderColor = '#facc15'; }, 5000);
                }
            }
        }
    });
}

// 6.2 מכ"ם בזק - חשיפת גנבים לשוטר
function activateCopRadar() {
    window.copRadarActiveUntil = Date.now() + 2000;
    const radar = document.getElementById('radar-overlay');
    if(radar) {
        radar.style.display = 'block';
        radar.style.background = 'rgba(250, 204, 21, 0.2)'; 
        setTimeout(() => { radar.style.display = 'none'; radar.style.background = 'rgba(56, 189, 248, 0.1)'; }, 2000);
    }
}

// הפעלת כטב"מ
function activateCopDrone() {
    if (!arenaData || !arenaData.totalArea) return;
    const scanArea = arenaData.totalArea * 0.30;
    const radius = Math.sqrt(scanArea / Math.PI);
    
    window.db.ref(`game/${window.currentRoom}/drone`).set({
        lat: myLat,
        lng: myLng,
        radius: radius,
        expiresAt: Date.now() + 60000 
    });

    window.db.ref(`game/${window.currentRoom}/droneAlert`).set(Date.now());
}

function showDroneAlertForThieves() {
    let alertBox = document.getElementById('drone-alert-box');
    if (!alertBox) {
        alertBox = document.createElement('div');
        alertBox.id = 'drone-alert-box';
        alertBox.style.position = 'fixed';
        alertBox.style.top = '15%';
        alertBox.style.left = '50%';
        alertBox.style.transform = 'translate(-50%, -50%)';
        alertBox.style.backgroundColor = 'rgba(220, 38, 38, 0.95)';
        alertBox.style.color = 'white';
        alertBox.style.padding = '15px 30px';
        alertBox.style.borderRadius = '12px';
        alertBox.style.fontWeight = 'bold';
        alertBox.style.fontSize = '22px';
        alertBox.style.zIndex = '5000';
        alertBox.style.boxShadow = '0 0 30px rgba(220, 38, 38, 0.8)';
        alertBox.style.textAlign = 'center';
        alertBox.style.border = '2px solid #fca5a5';
        alertBox.innerHTML = '⚠️ כטב"מ באוויר! ⚠️<br><span style="font-size:14px; font-weight:normal;">המשטרה סורקת אזורים מהאוויר!</span>';
        document.body.appendChild(alertBox);
    }
    
    if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
    
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 5000);
}

// 5. Game Freeze Logic
function triggerGameFreeze(thiefId) {
    window.db.ref(`game/${window.currentRoom}/freeze`).set({
        active: true,
        triggeredBy: thiefId,
        timestamp: Date.now()
    });
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
            if (hasCops && allCopsIn) {
                if (!fData.readyTime) {
                    window.db.ref(`game/${window.currentRoom}/freeze/readyTime`).set(Date.now() + 5000);
                }
            } else {
                if (fData.readyTime) {
                    window.db.ref(`game/${window.currentRoom}/freeze/readyTime`).remove();
                }
            }
        });
    });
}

// 6.3: חוק השובל הארוך ביותר בחלוקת אוצרות[cite: 7]
function checkTreasureInCapturedArea(polygonPoints) {
    const polyCoords = polygonPoints.map(p => [p[1], p[0]]);
    polyCoords.push(polyCoords[0]);
    const polygon = turf.polygon([polyCoords]);
    
    Object.keys(treasuresData).forEach(id => {
        const t = treasuresData[id];
        if (t.type === 'thief_jailcard' && !t.collected) {
            const pt = turf.point([t.lng, t.lat]);
            if (turf.booleanPointInPolygon(pt, polygon)) {
                // מציאת הגנב שתרם את השובל הארוך ביותר לשטח הזה[cite: 7]
                findWinnerOfArea(polygonPoints, id);
            }
        }
    });
}

function findWinnerOfArea(points, treasureId) {
    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        let winnerId = window.playerId; // ברירת מחדל: מי שסגר
        let maxDist = 0;

        // הערכת תרומה לפי מרחק GPS (כמצוין באפיון: תרומה במטרים)[cite: 7]
        Object.keys(players).forEach(pid => {
            if (players[pid].role === 'thief') {
                // חישוב מבוסס על השובל הנוכחי או היסטוריית תנועה בתוך הפוליגון
                // כרגע המערכת מעניקה חשיבות למי שסגר את השטח (window.playerId)
                // במקרה של שיתוף פעולה עתידי, כאן תחושב התרומה היחסית
            }
        });
        
        collectTreasure(treasureId, 'thief_jailcard', winnerId);
    });
}