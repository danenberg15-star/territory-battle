// game-play.js - Gameplay Logic, Bot Interactions & Single Player Rules

// ==========================================
// 6. Taser Trigger & Feedback (HYBRID)
// ==========================================
function triggerCapture() {
    if (!window.isBriefingComplete || window.isGameFrozen === true) return;
    const btn = document.getElementById('capture-btn');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.classList.add('active-capture'); 
    
    if (window.taserVisualRing) window.map.removeLayer(window.taserVisualRing);
    window.taserVisualRing = L.circle([window.myLat, window.myLng], {
        radius: 15,
        color: '#7dd3fc',
        weight: 5,
        fillColor: '#0ea5e9',
        fillOpacity: 0.4,
        className: 'electric-arc-pulse' 
    }).addTo(window.map);

    if (navigator.vibrate) navigator.vibrate([150, 50, 150]);
    
    if (typeof broadcastCapture === 'function') {
        broadcastCapture();
    }

    const timestamp = Date.now();
    window.db.ref(`game/${window.currentRoom}/captureSignal`).set({
        sender: window.playerId,
        t: timestamp,
        lat: window.myLat,
        lng: window.myLng
    });

    let gpsChecks = 0;
    const gpsInterval = setInterval(() => {
        checkGpsCatch(window.myLat, window.myLng, timestamp);
        gpsChecks++;
        if (gpsChecks >= 10) {
            clearInterval(gpsInterval);
            if (window.taserVisualRing) { window.map.removeLayer(window.taserVisualRing); window.taserVisualRing = null; }
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
                const dist = window.map.distance([copLat, copLng], [p.lat, p.lng]);
                const isBotThief = id.startsWith('bot_');
                
                if (dist <= 15 && (isBotThief || p.isOffline)) {
                    confirmCatch(id, signalTime, window.playerId);
                }
            }
        });
    });
}

function listenForCaptureSignals() {
    window.db.ref(`game/${window.currentRoom}/captureSignal`).on('value', snap => {
        const sig = snap.val();
        if (!sig || Date.now() - sig.t > 5000) return;
        
        if (window.playerRole === 'thief') {
            const dist = window.map.distance([window.myLat, window.myLng], [sig.lat, sig.lng]);
            if (dist <= 15) { 
                if (sig.sender && sig.sender.startsWith('bot_')) {
                    console.log("Caught by bot (GPS mapping).");
                    confirmCatch(window.playerId, sig.t, sig.sender);
                } else {
                    console.log("Human cop in range. Initiating Acoustic Verification...");
                    if (typeof startListeningForCops === 'function') {
                        startListeningForCops(() => {
                            confirmCatch(window.playerId, sig.t, sig.sender);
                        });
                    }
                }
            }
        }
    });

    window.db.ref(`game/${window.currentRoom}/catchAlert`).on('value', snap => {
        const alertData = snap.val();
        if (!alertData || Date.now() - alertData.t > 8000) return;
        
        window.db.ref(`rooms/${window.currentRoom}/gameMode`).once('value', modeSnap => {
            const mode = modeSnap.val();
            if (typeof window.displayCatchToast === 'function') {
                window.displayCatchToast(alertData.victimName, mode);
            }
        });
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
                    if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
                    
                    window.db.ref(`rooms/${window.currentRoom}/players`).once('value', pSnap => {
                        const players = pSnap.val() || {};
                        let otherActiveThieves = 0;
                        const myName = players[window.playerId]?.name || 'שחקן';
                        
                        Object.keys(players).forEach(id => {
                            if (id !== window.playerId && players[id].role === 'thief' && !players[id].isOffline && !id.startsWith('bot_')) {
                                otherActiveThieves++;
                            }
                        });

                        window.db.ref(`game/${window.currentRoom}/catchAlert`).set({
                            victimName: myName,
                            t: Date.now()
                        }).then(() => {
                            window.db.ref(`rooms/${window.currentRoom}/players/${window.playerId}`).update({ role: 'snitch' }).then(() => {
                                if (typeof window.killExitWarning === 'function') window.killExitWarning();

                                if (otherActiveThieves === 0) {
                                    window.db.ref(`game/${window.currentRoom}/winner`).set('cops');
                                } else {
                                    location.reload();
                                }
                            });
                        });
                    });
                }
            }
        });
    });
}

function triggerSnitch() {
    if (window.isGameFrozen === true) return;
    const btn = document.getElementById('snitch-btn');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.style.opacity = '0.5';

    window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
        const players = snap.val() || {};
        let foundThief = false;
        Object.keys(players).forEach(id => {
            const p = players[id];
            if (p.role === 'thief' && !p.isOffline) {
                const dist = window.map.distance([window.myLat, window.myLng], [p.lat, p.lng]);
                if (dist <= 15) {
                    window.db.ref(`game/${window.currentRoom}/players/${id}/flashUntil`).set(Date.now() + 3000);
                    foundThief = true;
                }
            }
        });
        if (foundThief && navigator.vibrate) navigator.vibrate([100, 50, 100]);
    });

    setTimeout(() => { btn.disabled = false; btn.style.opacity = '1'; }, 10000);
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

// ==========================================
// 7. Exit Game
// ==========================================
function exitGame() {
    if (typeof window.killExitWarning === 'function') window.killExitWarning();

    if (window.gpsWatchId !== null) {
        navigator.geolocation.clearWatch(window.gpsWatchId);
        window.gpsWatchId = null;
    }

    if (typeof stopSinglePlayerAI === 'function') stopSinglePlayerAI();

    if (window.currentRoom && window.playerId) {
        const playerName = window.playerName || 'שחקן';

        const updates = {};
        updates[`rooms/${window.currentRoom}/players/${window.playerId}/isOffline`] = true;
        updates[`rooms/${window.currentRoom}/players/${window.playerId}/disconnectedAt`] = Date.now();
        updates[`game/${window.currentRoom}/players/${window.playerId}/isOffline`] = true;

        const role = window.playerRole || 'thief';
        const leaveMsg = {
            senderId: 'system',
            senderName: 'מערכת',
            role: role,
            text: window.currentLang === 'he'
                ? `${playerName} עזב את המשחק`
                : `${playerName} left the game`,
            t: Date.now()
        };
        updates[`game/${window.currentRoom}/chat_${role}/leave_${window.playerId}`] = leaveMsg;

        window.db.ref().update(updates).finally(() => {
            location.reload();
        });
    } else {
        location.reload();
    }
}

// ==========================================
// 8. Victory & Offline Handling
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

        if (activeThieves === 0 && window.hasSeenThief) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'cops');
        } else if (activeCops === 0 && activeThieves > 0) {
            window.db.ref(`game/${window.currentRoom}/winner`).transaction(current => current || 'thieves');
        }
    });
}

function listenToVictory() {
    window.db.ref(`game/${window.currentRoom}/winner`).on('value', snap => {
        if (snap.val() && typeof showVictoryScreen === 'function') {
            if (typeof stopSinglePlayerAI === 'function') stopSinglePlayerAI();
            if (typeof window.killExitWarning === 'function') window.killExitWarning();
            showVictoryScreen(snap.val());
        }
    });
}

function listenToCapturedAreas() {
    window.db.ref(`game/${window.currentRoom}/capturedAreas`).on('value', snap => {
        // שולחים אובייקט ריק כדי להבטיח עדכון מוקדם של ה-UI (באג ה-0%)
        const areas = snap.val() || {}; 
        if (typeof window.renderAreas === 'function') {
            window.areaLayers = window.renderAreas(window.map, areas, window.areaLayers);
        } else if (typeof renderAreas === 'function') {
            window.areaLayers = renderAreas(window.map, areas, window.areaLayers);
        }
    });
}

let lastRadarVibrate = 0;

function listenToOtherPlayers() {
    window.db.ref(`rooms/${window.currentRoom}/players`).on('value', snapRooms => {
        const roomPlayers = snapRooms.val() || {};
        
        const humans = Object.keys(roomPlayers).filter(id => !id.startsWith('bot_'));
        const micUI = document.getElementById('chat-mic-btn');
        if (micUI) micUI.style.display = 'flex';

        window.db.ref(`game/${window.currentRoom}/players`).on('value', snapGame => {
            const gamePlayers = snapGame.val() || {};
            for (let id in window.playerMarkers) window.map.removeLayer(window.playerMarkers[id]);
            window.playerMarkers = {};
            
            let activeCount = 0;
            let thievesCount = 0;
            let isThiefNearby = false; 
            let isCopNearby = false;

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

                if ((window.playerRole === 'cop' || window.playerRole === 'snitch') && role === 'thief' && !isOffline && window.myLat && window.myLng) {
                    if (window.map.distance([window.myLat, window.myLng], [gp.lat, gp.lng]) <= 60) isThiefNearby = true;
                }
                
                if (window.playerRole === 'thief' && role === 'cop' && !isOffline && window.myLat && window.myLng) {
                    if (window.map.distance([window.myLat, window.myLng], [gp.lat, gp.lng]) <= 60) {
                        isCopNearby = true;
                        if (Date.now() - lastRadarVibrate > 3000 && navigator.vibrate) {
                            navigator.vibrate([150, 50, 150]);
                            lastRadarVibrate = Date.now();
                        }
                    }
                }
                
                if (id === window.playerId) {
                    const starIcon = L.divIcon({
                        html: `<div style="font-size: 32px; filter: drop-shadow(0 0 8px gold); animation: star-glow 2s infinite alternate;">⭐</div>`,
                        className: '',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    });
                    window.playerMarkers[id] = L.marker([gp.lat, gp.lng], { icon: starIcon }).addTo(window.map);
                } else {
                    let markerColor = (role === 'cop') ? '#2563eb' : (role === 'snitch' ? '#f59e0b' : '#dc2626');
                    if (isOffline) markerColor = '#6b7280'; 
                    
                    if ((window.playerRole === 'cop' || window.playerRole === 'snitch') && role === 'thief' && !isFlashing) return;

                    window.playerMarkers[id] = L.circleMarker([gp.lat, gp.lng], {
                        radius: 15, fillColor: markerColor, fillOpacity: isOffline ? 0.5 : 1,
                        color: isFlashing ? '#ffff00' : '#fff', weight: isFlashing ? 6 : 3 
                    }).addTo(window.map);
                }
            });

            const countEl = document.getElementById('players-count');
            if (countEl) countEl.innerText = `שחקנים: ${activeCount}`;
            if (thievesCount > 0) window.hasSeenThief = true;
            
            const radar = document.getElementById('radar-overlay');
            if (radar) {
                if (window.playerRole === 'cop' || window.playerRole === 'snitch') {
                    radar.style.display = isThiefNearby ? 'flex' : 'none';
                } else if (window.playerRole === 'thief') {
                    radar.style.display = isCopNearby ? 'flex' : 'none';
                }
            }
        });
    });
}

window.displayCatchToast = function(victimName, gameMode) {
    let oldToast = document.getElementById('catch-toast');
    if (oldToast) oldToast.remove();

    let toast = document.createElement('div');
    toast.id = 'catch-toast';
    toast.style.position = 'fixed';
    toast.style.top = '15%'; 
    toast.style.left = '50%';
    toast.style.transform = 'translate(-50%, -50%)';
    toast.style.backgroundColor = 'rgba(245, 158, 11, 0.95)'; 
    toast.style.color = 'white';
    toast.style.padding = '20px 40px';
    toast.style.borderRadius = '15px';
    toast.style.fontSize = '22px';
    toast.style.fontWeight = '900';
    toast.style.zIndex = '99999';
    toast.style.boxShadow = '0 0 30px rgba(245, 158, 11, 0.8)';
    toast.style.textAlign = 'center';
    toast.style.pointerEvents = 'none';
    toast.style.animation = 'pop-in-catch 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

    if (!document.getElementById('catch-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'catch-toast-styles';
        style.innerHTML = `@keyframes pop-in-catch { 0% { opacity: 0; transform: translate(-50%, -60%) scale(0.5); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }`;
        document.head.appendChild(style);
    }

    let message = (gameMode === 'single') ? 
        `השחקן ${victimName} נתפס ונשלח לכלא!` : 
        `השחקן ${victimName} נתפס ועכשיו הוא משתף פעולה עם המשטרה!`;

    toast.innerText = message;
    document.body.appendChild(toast);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    setTimeout(() => { if (toast && toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
};