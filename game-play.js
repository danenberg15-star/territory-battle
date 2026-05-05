// game-play.js - Gameplay Logic, Bot Interactions & Single Player Rules

// ==========================================
// 6. Taser Trigger & Feedback
// ==========================================
function triggerCapture() {
    if (!isBriefingComplete || (typeof isGameFrozen !== 'undefined' && isGameFrozen)) return;
    const btn = document.getElementById('capture-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.classList.add('active-capture'); 
    
    if (taserVisualRing) map.removeLayer(taserVisualRing);
    taserVisualRing = L.circle([myLat, myLng], {
        radius: 10,
        color: '#7dd3fc',
        weight: 5,
        fillColor: '#0ea5e9',
        fillOpacity: 0.4,
        className: 'electric-arc-pulse' 
    }).addTo(map);

    if (navigator.vibrate) navigator.vibrate([150, 50, 150]);
    
    const timestamp = Date.now();
    window.db.ref(`game/${window.currentRoom}/captureSignal`).set({
        sender: window.playerId,
        t: timestamp,
        lat: myLat,
        lng: myLng
    });

    let gpsChecks = 0;
    const gpsInterval = setInterval(() => {
        checkGpsCatch(myLat, myLng, timestamp);
        gpsChecks++;
        if (gpsChecks >= 10) {
            clearInterval(gpsInterval);
            if (taserVisualRing) { map.removeLayer(taserVisualRing); taserVisualRing = null; }
        }
    }, 1000);

    setTimeout(() => {
        btn.classList.remove('active-capture');
        startCooldown(60); 
    }, 10000);
}

function checkGpsCatch(copLat, copLng, signalTime) {
    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        Object.keys(players).forEach(id => {
            const p = players[id];
            if (p.role === 'thief') {
                const dist = map.distance([copLat, copLng], [p.lat, p.lng]);
                if (dist <= 10) confirmCatch(id, signalTime, window.playerId);
            }
        });
    });
}

function listenForCaptureSignals() {
    window.db.ref(`game/${window.currentRoom}/captureSignal`).on('value', snap => {
        const sig = snap.val();
        // בדיקת אות בתוקף (5 שניות אחרונות)
        if (!sig || Date.now() - sig.t > 5000) return;
        
        if (window.playerRole === 'thief') {
            // הגנב בודק אם הוא קרוב למיקום ממנו נשלח האות (בוט או שוטר)
            const dist = map.distance([myLat, myLng], [sig.lat, sig.lng]);
            if (dist <= 12) { // רדיוס פגיעה של 12 מטר
                console.log("Caught by signal from:", sig.sender);
                confirmCatch(window.playerId, sig.t, sig.sender);
            }
        }
    });
}

function confirmCatch(victimId, signalTime, copId) {
    window.db.ref(`game/${window.currentRoom}/players/${victimId}/hasJailCard`).once('value', snap => {
        if (snap.val()) {
            if (typeof triggerGameFreeze === 'function') triggerGameFreeze(victimId);
            return; 
        }
        
        window.db.ref(`game/${window.currentRoom}/catches/${victimId}_${signalTime}`).transaction(current => {
            if (current) return;
            return { t: Date.now(), cop: copId };
        }, (error, committed) => {
            if (committed) {
                if (victimId === window.playerId) {
                    playArrestAnimation(() => {
                        window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'snitch' })
                            .then(() => location.reload());
                    });
                }
            }
        });
    });
}

function playArrestAnimation(callback) {
    const overlay = document.getElementById('arrest-overlay');
    const bars = document.getElementById('jail-bars');
    const text = document.getElementById('arrest-text');
    
    if (overlay) overlay.style.display = 'flex';
    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
    
    setTimeout(() => { if (bars) bars.style.top = '0'; }, 100);
    setTimeout(() => { if (text) text.style.opacity = '1'; }, 600);
    setTimeout(() => { if (callback) callback(); }, 3500); 
}

// ==========================================
// 7. Victory & Offline Handling
// ==========================================
function checkOfflinePlayers() {
    if (!window.isHost || !window.currentRoom) return;
    const now = Date.now();
    window.db.ref(`rooms/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        let activeThieves = 0;
        let activeCops = 0;

        Object.keys(players).forEach(id => {
            const p = players[id];
            const isBot = id.startsWith('bot_');
            if (!isBot && p.isOffline && p.disconnectedAt && (now - p.disconnectedAt > 180000)) {
                window.db.ref(`rooms/${window.currentRoom}/players/${id}`).remove();
                window.db.ref(`game/${window.currentRoom}/players/${id}`).remove();
            } else {
                if (!p.isOffline || isBot) {
                    if (p.role === 'thief') activeThieves++;
                    else if (p.role === 'cop') activeCops++;
                }
            }
        });

        if (activeThieves === 0 && hasSeenThief) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'cops');
        } else if (activeCops === 0 && activeThieves > 0) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'thieves');
        }
    });
}

function listenToVictory() {
    window.db.ref(`game/${window.currentRoom}/winner`).on('value', snap => {
        if (snap.val() && typeof showVictoryScreen === 'function') showVictoryScreen(snap.val());
    });
}

function listenToCapturedAreas() {
    window.db.ref(`game/${window.currentRoom}/capturedAreas`).on('value', snap => {
        const areas = snap.val();
        if (typeof renderAreas === "function") areaLayers = renderAreas(map, areas, areaLayers);
    });
}

function listenToOtherPlayers() {
    window.db.ref(`rooms/${window.currentRoom}/players`).on('value', snapRooms => {
        const roomPlayers = snapRooms.val() || {};
        
        // חוק שחקן יחיד: הסתרת צ'אט אם יש רק בן אדם אחד
        const humans = Object.keys(roomPlayers).filter(id => !id.startsWith('bot_'));
        const chatUI = document.getElementById('chat-container');
        const micUI = document.getElementById('chat-mic-btn');
        if (humans.length <= 1) {
            if (chatUI) chatUI.style.display = 'none';
            if (micUI) micUI.style.display = 'none';
        }

        window.db.ref(`game/${window.currentRoom}/players`).on('value', snapGame => {
            const gamePlayers = snapGame.val() || {};
            for (let id in playerMarkers) map.removeLayer(playerMarkers[id]);
            playerMarkers = {};
            
            let activeCount = 0;
            let thievesCount = 0;
            let isThiefNearby = false; 

            Object.keys(gamePlayers).forEach(id => {
                const gp = gamePlayers[id];
                const rp = roomPlayers[id] || {}; 
                const role = rp.role || gp.role;
                const isBot = id.startsWith('bot_');
                const isOffline = !isBot && (rp.isOffline || false);
                const isFlashing = gp.flashUntil && gp.flashUntil > Date.now();
                
                if (!isOffline) {
                    activeCount++;
                    if (role === 'thief') thievesCount++;
                }

                if (window.playerRole === 'cop' && role === 'thief' && !isOffline && myLat && myLng) {
                    if (map.distance([myLat, myLng], [gp.lat, gp.lng]) <= 30) isThiefNearby = true;
                }
                
                if (id === window.playerId) {
                    const starIcon = L.divIcon({
                        html: `<div style="font-size: 32px; filter: drop-shadow(0 0 8px gold); animation: star-glow 2s infinite alternate;">⭐</div>`,
                        className: '',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    });
                    playerMarkers[id] = L.marker([gp.lat, gp.lng], { icon: starIcon }).addTo(map);
                } else {
                    let markerColor = (role === 'cop') ? '#2563eb' : (role === 'snitch' ? '#f59e0b' : '#dc2626');
                    if (isOffline) markerColor = '#6b7280'; 
                    
                    if ((window.playerRole === 'cop' || window.playerRole === 'snitch') && role === 'thief' && !isFlashing) return;

                    playerMarkers[id] = L.circleMarker([gp.lat, gp.lng], {
                        radius: 15, fillColor: markerColor, fillOpacity: isOffline ? 0.5 : 1,
                        color: isFlashing ? '#ffff00' : '#fff', weight: isFlashing ? 6 : 3 
                    }).addTo(map);
                }
            });

            const countEl = document.getElementById('players-count');
            if (countEl) countEl.innerText = `שחקנים: ${activeCount}`;
            if (thievesCount > 0) hasSeenThief = true;
            
            if (window.playerRole === 'cop' || window.playerRole === 'snitch') {
                const radar = document.getElementById('radar-overlay');
                if (radar) radar.style.display = isThiefNearby ? 'block' : 'none';
            }
        });
    });
}

function startCooldown(seconds) {
    const circle = document.getElementById('cooldown-circle');
    if (!circle) return;
    let left = seconds;
    const totalOffset = 358; 
    const interval = setInterval(() => {
        left--;
        const offset = totalOffset - (left / seconds) * totalOffset;
        circle.style.strokeDashoffset = offset;
        if (left <= 0) {
            clearInterval(interval);
            const btn = document.getElementById('capture-btn');
            if (btn) { btn.disabled = false; if (navigator.vibrate) navigator.vibrate(50); }
            circle.style.strokeDashoffset = totalOffset; 
        }
    }, 1000);
}

function startThiefMechanics() {
    if (trailLayer) map.removeLayer(trailLayer);
    trailLayer = L.polyline([], { color: '#dc2626', weight: 6, dashArray: '5, 10', opacity: 0.8 }).addTo(map);
}