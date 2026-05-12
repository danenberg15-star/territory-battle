// game-play.js - Gameplay Logic, Bot Interactions & Single Player Rules

// ==========================================
// 6. Taser Trigger & Feedback (PARALLEL DETECTION v2.60)
// ==========================================

// מצב ניסיון תפיסה פעיל (מונע כפל)
window.captureAttemptActive = false;

function triggerCapture() {
    if (!window.isBriefingComplete || window.isGameFrozen === true) return;
    const btn = document.getElementById('capture-btn');
    if (!btn || btn.disabled) return;
    if (window.captureAttemptActive) return;

    window.captureAttemptActive = true;
    btn.classList.add('active-capture');

    // טבעת ויזואלית על המפה
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

    if (typeof broadcastCapture === 'function') broadcastCapture();

    const timestamp = Date.now();
    const copLat = window.myLat;
    const copLng = window.myLng;

    // שידור אות לגנבים
    window.db.ref(`game/${window.currentRoom}/captureSignal`).set({
        sender: window.playerId,
        t: timestamp,
        lat: copLat,
        lng: copLng
    });

    // ========== לוגיקת בוטים (Single Player) ==========
    // רדיוס 7מ' + 2 דגימות רצופות
    let botConsecutiveHits = {};
    let botCaught = false;
    let botGpsChecks = 0;

    const botGpsInterval = setInterval(() => {
        if (botCaught || botGpsChecks >= 10) {
            clearInterval(botGpsInterval);
            return;
        }
        botGpsChecks++;

        window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
            const players = snap.val() || {};
            Object.keys(players).forEach(id => {
                const p = players[id];
                if (p.role !== 'thief') return;
                const isBotThief = id.startsWith('bot_');
                if (!isBotThief && !p.isOffline) return; // רק בוטים כאן

                const dist = window.map.distance([copLat, copLng], [p.lat, p.lng]);
                if (dist <= 7) {
                    botConsecutiveHits[id] = (botConsecutiveHits[id] || 0) + 1;
                    if (botConsecutiveHits[id] >= 2 && !botCaught) {
                        botCaught = true;
                        clearInterval(botGpsInterval);
                        confirmCatch(id, timestamp, window.playerId);
                    }
                } else {
                    botConsecutiveHits[id] = 0;
                }
            });
        });
    }, 1000);

    // ========== סיום ניסיון אחרי 10 שניות ==========
    setTimeout(() => {
        clearInterval(botGpsInterval);
        botCaught = true;

        window.captureAttemptActive = false;
        btn.classList.remove('active-capture');

        if (window.taserVisualRing) {
            window.map.removeLayer(window.taserVisualRing);
            window.taserVisualRing = null;
        }

        btn.disabled = true;
        startCooldown(60);
    }, 10000);
}

// ==========================================
// זיהוי מקבילי בצד הגנב (Parallel Detection)
// ==========================================
function listenForCaptureSignals() {
    window.db.ref(`game/${window.currentRoom}/captureSignal`).on('value', snap => {
        const sig = snap.val();
        if (!sig || Date.now() - sig.t > 10000) return;
        if (window.playerRole !== 'thief') return;

        const distNow = window.map.distance([window.myLat, window.myLng], [sig.lat, sig.lng]);

        if (sig.sender && sig.sender.startsWith('bot_')) return;

        if (distNow > 30) return;

        if (window.activeParallelSignal === sig.t) return;
        window.activeParallelSignal = sig.t;

        console.log("Human cop fired taser. Starting Parallel Detection window...");

        let caught = false;
        const windowEnd = sig.t + 10000;

        // --- מונה GPS: 2.0 שניות מצטברות ב-5מ' ---
        let gpsAccumulatedMs = 0;
        const GPS_TARGET_MS = 2000;
        const GPS_CHECK_INTERVAL = 500;

        const gpsParallelInterval = setInterval(() => {
            if (caught || Date.now() > windowEnd) {
                clearInterval(gpsParallelInterval);
                return;
            }
            const d = window.map.distance([window.myLat, window.myLng], [sig.lat, sig.lng]);
            if (d <= 5) {
                gpsAccumulatedMs += GPS_CHECK_INTERVAL;
                if (gpsAccumulatedMs >= GPS_TARGET_MS) {
                    caught = true;
                    clearInterval(gpsParallelInterval);
                    console.log("GPS counter reached target. Confirming catch.");
                    confirmCatch(window.playerId, sig.t, sig.sender);
                }
            }
        }, GPS_CHECK_INTERVAL);

        // --- מונה אקוסטי: 0.8 שניות מצטברות ---
        if (typeof startListeningForCops === 'function') {
            startListeningForCops(() => {
                if (!caught && Date.now() <= windowEnd) {
                    caught = true;
                    clearInterval(gpsParallelInterval);
                    console.log("Acoustic counter reached target. Confirming catch.");
                    confirmCatch(window.playerId, sig.t, sig.sender);
                }
            });
        }

        setTimeout(() => {
            clearInterval(gpsParallelInterval);
            window.activeParallelSignal = null;
        }, windowEnd - Date.now() + 100);
    });

    // האזנה להתראות תפיסה לכולם
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

    // האזנה להתראות חשיפה (Snitch Reveal) — בצד הגנב
    window.db.ref(`game/${window.currentRoom}/snitchSignal`).on('value', snap => {
        const sig = snap.val();
        if (!sig || Date.now() - sig.t > 10000) return;
        if (window.playerRole !== 'thief') return;
        if (window.activeSnitchSignal === sig.t) return;
        window.activeSnitchSignal = sig.t;

        const distNow = window.map.distance([window.myLat, window.myLng], [sig.lat, sig.lng]);
        if (distNow > 30) return;

        console.log("Snitch signal detected. Starting Parallel Reveal window...");

        let revealed = false;
        const windowEnd = sig.t + 10000;

        // --- מונה GPS: 2.0 שניות ב-5מ' ---
        let gpsAccumulatedMs = 0;
        const GPS_TARGET_MS = 2000;
        const GPS_CHECK_INTERVAL = 500;

        const gpsRevealInterval = setInterval(() => {
            if (revealed || Date.now() > windowEnd) {
                clearInterval(gpsRevealInterval);
                return;
            }
            const d = window.map.distance([window.myLat, window.myLng], [sig.lat, sig.lng]);
            if (d <= 5) {
                gpsAccumulatedMs += GPS_CHECK_INTERVAL;
                if (gpsAccumulatedMs >= GPS_TARGET_MS) {
                    revealed = true;
                    clearInterval(gpsRevealInterval);
                    console.log("GPS reveal counter reached target.");
                    confirmReveal(window.playerId, sig.t, sig.sender);
                }
            }
        }, GPS_CHECK_INTERVAL);

        // --- מונה אקוסטי: 0.8 שניות מצטברות ---
        if (typeof startListeningForCops === 'function') {
            startListeningForCops(() => {
                if (!revealed && Date.now() <= windowEnd) {
                    revealed = true;
                    clearInterval(gpsRevealInterval);
                    console.log("Acoustic reveal counter reached target.");
                    confirmReveal(window.playerId, sig.t, sig.sender);
                }
            });
        }

        setTimeout(() => {
            clearInterval(gpsRevealInterval);
            window.activeSnitchSignal = null;
        }, windowEnd - Date.now() + 100);
    });

    // האזנה להתראת חשיפה — בצד השוטרים (רטט + toast)
    window.db.ref(`game/${window.currentRoom}/revealAlert`).on('value', snap => {
        const alertData = snap.val();
        if (!alertData || Date.now() - alertData.t > 8000) return;
        if (window.playerRole !== 'cop' && window.playerRole !== 'snitch') return;

        if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);

        let old = document.getElementById('reveal-toast');
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.id = 'reveal-toast';
        toast.style.cssText = `
            position: fixed; top: 15%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(234, 179, 8, 0.95); color: #0f172a;
            padding: 20px 40px; border-radius: 15px; font-size: 20px;
            font-weight: 900; z-index: 99999; text-align: center;
            pointer-events: none; box-shadow: 0 0 30px rgba(234,179,8,0.8);
        `;
        toast.innerText = window.currentLang === 'he'
            ? `🎯 ${alertData.thiefName} זוהה על ידי המלשין!`
            : `🎯 ${alertData.thiefName} was spotted by the snitch!`;
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
    });
}

// ==========================================
// אישור חשיפה (Reveal) — מופעל בצד הגנב
// ==========================================
function confirmReveal(thiefId, signalTime, snitchId) {
    // מניעת כפל עם transaction
    window.db.ref(`game/${window.currentRoom}/reveals/${thiefId}_${signalTime}`).transaction(current => {
        if (current) return;
        return { t: Date.now(), snitch: snitchId };
    }, (error, committed) => {
        if (!committed) return;

        // Flash למשך 5 שניות
        window.db.ref(`game/${window.currentRoom}/players/${thiefId}/flashUntil`)
            .set(Date.now() + 5000);

        // שם הגנב לצורך toast
        window.db.ref(`rooms/${window.currentRoom}/players/${thiefId}`).once('value', pSnap => {
            const thiefData = pSnap.val() || {};
            const thiefName = thiefData.name || 'גנב';

            // שידור revealAlert לכל השוטרים
            window.db.ref(`game/${window.currentRoom}/revealAlert`).set({
                thiefName,
                thiefId,
                t: Date.now()
            });
        });

        // התראה לגנב עצמו
        if (thiefId === window.playerId) {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            let old = document.getElementById('revealed-toast');
            if (old) old.remove();

            const toast = document.createElement('div');
            toast.id = 'revealed-toast';
            toast.style.cssText = `
                position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(220, 38, 38, 0.97); color: white;
                padding: 22px 38px; border-radius: 15px; font-size: 20px;
                font-weight: 900; z-index: 99999; text-align: center;
                pointer-events: none; box-shadow: 0 0 30px rgba(220,38,38,0.8);
            `;
            toast.innerText = window.currentLang === 'he'
                ? '⚠️ הוסגרת! המשטרה רואה אותך!'
                : '⚠️ You\'ve been revealed! Police can see you!';
            document.body.appendChild(toast);
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
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

// ==========================================
// Snitch Trigger v2.70 — Parallel Detection
// ==========================================
window.snitchAttemptActive = false;

function triggerSnitch() {
    if (window.isGameFrozen === true) return;
    const btn = document.getElementById('snitch-btn');
    if (!btn || btn.disabled) return;
    if (window.snitchAttemptActive) return;

    window.snitchAttemptActive = true;
    btn.classList.add('active-capture'); // אפקט פועם זהה לטייזר

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    const timestamp = Date.now();
    const snitchLat = window.myLat;
    const snitchLng = window.myLng;

    // שידור אות סניץ' לגנבים
    window.db.ref(`game/${window.currentRoom}/snitchSignal`).set({
        sender: window.playerId,
        t: timestamp,
        lat: snitchLat,
        lng: snitchLng
    });

    // שידור אקוסטי זהה לטייזר
    if (typeof broadcastCapture === 'function') broadcastCapture();

    // ========== לוגיקת בוטים (Single Player) — GPS בלבד ==========
    // רדיוס 10מ' + 2 דגימות רצופות
    let botConsecutiveHits = {};
    let botRevealed = false;
    let botGpsChecks = 0;

    const botSnitchInterval = setInterval(() => {
        if (botRevealed || botGpsChecks >= 10) {
            clearInterval(botSnitchInterval);
            return;
        }
        botGpsChecks++;

        window.db.ref(`game/${window.currentRoom}/players`).once('value', snap => {
            const players = snap.val() || {};
            Object.keys(players).forEach(id => {
                const p = players[id];
                if (p.role !== 'thief' || p.isOffline) return;
                const isBotThief = id.startsWith('bot_');
                if (!isBotThief) return; // רק בוטים כאן

                const dist = window.map.distance([snitchLat, snitchLng], [p.lat, p.lng]);
                if (dist <= 10) {
                    botConsecutiveHits[id] = (botConsecutiveHits[id] || 0) + 1;
                    if (botConsecutiveHits[id] >= 2 && !botRevealed) {
                        botRevealed = true;
                        clearInterval(botSnitchInterval);
                        confirmReveal(id, timestamp, window.playerId);
                    }
                } else {
                    botConsecutiveHits[id] = 0;
                }
            });
        });
    }, 1000);

    // ========== סיום ניסיון אחרי 10 שניות ==========
    setTimeout(() => {
        clearInterval(botSnitchInterval);
        botRevealed = true;

        window.snitchAttemptActive = false;
        btn.classList.remove('active-capture');

        btn.disabled = true;
        startSnitchCooldown(60);
    }, 10000);
}

function startSnitchCooldown(seconds) {
    const btn = document.getElementById('snitch-btn');
    if (!btn) return;
    let left = seconds;
    const originalText = btn.innerText;
    btn.innerText = `${left}s`;

    const interval = setInterval(() => {
        left--;
        btn.innerText = `${left}s`;
        if (left <= 0) {
            clearInterval(interval);
            btn.disabled = false;
            btn.innerText = originalText;
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }, 1000);
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