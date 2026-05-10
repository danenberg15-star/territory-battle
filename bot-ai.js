// bot-ai.js - Multi-Target Bot Engine with Age Profiles & Arena-Scaled Parameters

let botInterval = null;
let botsActive = false;
let botCooldowns = {};
let botStates = {};

// ============================================================
// תקרות מהירות אנושיות מוחלטות - בלי קשר לגודל הזירה
// ============================================================
const MAX_SPEEDS = {
    rookie: {
        scan: 0.0000125,
        run:  0.0000278
    },
    skilled: {
        scan: 0.0000194,
        run:  0.0000417
    },
    elite: {
        scan: 0.0000250,
        run:  0.0000556
    }
};

// ============================================================
// פרופילי קושי לפי גיל
// ============================================================
const BOT_PROFILES = {
    rookie: {
        scanSpeedPct:   0.010,
        runSpeedPct:    0.015,
        radarRangePct:  0.20,
        reactionTime:   3000,
        memoryTime:     4000,
        catchRange:     0.00015
    },
    skilled: {
        scanSpeedPct:   0.015,
        runSpeedPct:    0.030,
        radarRangePct:  0.35,
        reactionTime:   1500,
        memoryTime:     6000,
        catchRange:     0.00015
    },
    elite: {
        scanSpeedPct:   0.025,
        runSpeedPct:    0.050,
        radarRangePct:  0.55,
        reactionTime:   400,
        memoryTime:     10000,
        catchRange:     0.00015
    }
};

function calcArenaDiagonal(minLat, maxLat, minLng, maxLng) {
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

// ============================================================
// מצב רדאר גלובלי לכל הבוטים — מופעל בעת כיבוש שטח
// ============================================================
let captureRadarTarget = null;     // { lat, lng } של הגנב שכבש
let captureRadarUntil  = 0;        // timestamp שבו מסתיים מצב הרדאר

function activateCaptureRadar(thiefLat, thiefLng) {
    captureRadarTarget = { lat: thiefLat, lng: thiefLng };
    captureRadarUntil  = Date.now() + 3000; // 3 שניות
    console.log(`[BotAI] Capture Radar activated → [${thiefLat.toFixed(5)}, ${thiefLng.toFixed(5)}]`);
}

function startSinglePlayerAI(roomId, difficulty, arenaData) {
    if (botsActive || !arenaData || !arenaData.points) return;
    botsActive = true;
    console.log(`Starting Co-op vs Bots (${difficulty})...`);

    const profile  = BOT_PROFILES[difficulty]  || BOT_PROFILES.skilled;
    const maxSpeed = MAX_SPEEDS[difficulty]     || MAX_SPEEDS.skilled;

    const lats = arenaData.points.map(p => p[0]);
    const lngs = arenaData.points.map(p => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const diagonal = calcArenaDiagonal(minLat, maxLat, minLng, maxLng);

    const scanSpeed    = Math.min(profile.scanSpeedPct * diagonal, maxSpeed.scan);
    const runSpeed     = Math.min(profile.runSpeedPct  * diagonal, maxSpeed.run);
    const radarRange   = profile.radarRangePct * diagonal;
    const reactionTime = profile.reactionTime;
    const memoryTime   = profile.memoryTime;
    const catchRange   = profile.catchRange;

    console.log(
        `Arena diagonal: ${(diagonal * 111000).toFixed(0)}m | ` +
        `radar: ${(radarRange * 111000).toFixed(0)}m | ` +
        `scan: ${(scanSpeed * 111000 * 3.6).toFixed(1)}km/h | ` +
        `run: ${(runSpeed * 111000 * 3.6).toFixed(1)}km/h`
    );

    // ============================================================
    // האזנה לכיבוש שטח — מפעיל מצב רדאר לבוטים
    // ============================================================
    window.db.ref(`game/${roomId}/capturedAreas`).on('child_added', snap => {
        const area = snap.val();
        if (!area || !area.capturedBy || !area.t) return;
        if (Date.now() - area.t > 5000) return; // כיבוש ישן — מתעלמים

        // מוצאים את מיקום הגנב שכבש
        window.db.ref(`game/${roomId}/players/${area.capturedBy}`).once('value', pSnap => {
            const thief = pSnap.val();
            if (thief && thief.lat && thief.lng) {
                activateCaptureRadar(thief.lat, thief.lng);
            }
        });
    });

    const spawnedBotPositions = [];
    let spawnReady = false;

    botInterval = setInterval(() => {
        if (window.isGameFrozen === true) return;

        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;

            const activeThieves = Object.values(players).filter(
                p => p.role === 'thief' && !p.isOffline && p.lat
            );

            const allThieves = Object.values(players).filter(
                p => p.role === 'thief' && !p.isOffline
            );
            if (!spawnReady) {
                const allHaveGPS = allThieves.length > 0 &&
                    allThieves.every(p => p.lat && p.lat !== 0);
                if (!allHaveGPS) return;
                spawnReady = true;
                console.log('All thieves have GPS – spawning bots now');
            }

            if (activeThieves.length === 0) return;

            const updates = {};
            const botIds = Object.keys(players).filter(id => id.startsWith('bot_cop_'));

            // בדיקה האם מצב רדאר כיבוש פעיל
            const isInCaptureRadar = Date.now() < captureRadarUntil && captureRadarTarget;

            botIds.forEach((botId) => {
                let bot = players[botId];

                if (!bot.lat || bot.lat === 0) {
                    const spawnPt = getBorderSpawnPoint(
                        activeThieves, spawnedBotPositions, arenaData.points
                    );
                    bot.lat = spawnPt.lat;
                    bot.lng = spawnPt.lng;
                    spawnedBotPositions.push({ lat: spawnPt.lat, lng: spawnPt.lng });

                    botStates[botId] = {
                        mode: 'wander',
                        target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng),
                        detectedAt: null,
                        lastSeenThief: null,
                        lastSeenAt: null
                    };
                }

                if (!botStates[botId]) {
                    botStates[botId] = {
                        mode: 'wander',
                        target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng),
                        detectedAt: null,
                        lastSeenThief: null,
                        lastSeenAt: null
                    };
                }

                const state = botStates[botId];
                const now   = Date.now();

                // ============================================================
                // מצב רדאר כיבוש: הבוט מתקדם ישירות לעבר הגנב שכבש
                // מבטל שיטוט ורדאר רגיל למשך 3 שניות
                // ============================================================
                if (isInCaptureRadar) {
                    const targetLat  = captureRadarTarget.lat;
                    const targetLng  = captureRadarTarget.lng;
                    const moveLatDiff = targetLat - bot.lat;
                    const moveLngDiff = targetLng - bot.lng;
                    const moveDist    = Math.sqrt(moveLatDiff * moveLatDiff + moveLngDiff * moveLngDiff);

                    if (moveDist > 0) {
                        bot.lat += (moveLatDiff / moveDist) * runSpeed;
                        bot.lng += (moveLngDiff / moveDist) * runSpeed;
                    }

                    state.mode       = 'chase';
                    state.detectedAt = null;

                    // תפיסה אם הגיע לטווח
                    if (moveDist <= catchRange) {
                        triggerBotCapture(roomId, botId, bot, 0);
                    }

                    updates[`game/${roomId}/players/${botId}/lat`] = bot.lat;
                    updates[`game/${roomId}/players/${botId}/lng`] = bot.lng;
                    updates[`game/${roomId}/players/${botId}/t`]   = now;
                    return; // דילוג על שאר הלוגיקה
                }

                // ============================================================
                // רדאר רגיל: זיהוי גנב בטווח
                // ============================================================
                let detectedThief = null;
                let detectedDist  = Infinity;

                activeThieves.forEach(thief => {
                    const latDiff = thief.lat - bot.lat;
                    const lngDiff = thief.lng - bot.lng;
                    const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

                    if (dist <= radarRange && dist < detectedDist) {
                        detectedDist  = dist;
                        detectedThief = thief;
                    }
                });

                // ============================================================
                // זיכרון קצר
                // ============================================================
                if (detectedThief) {
                    state.lastSeenThief = { lat: detectedThief.lat, lng: detectedThief.lng };
                    state.lastSeenAt    = now;
                } else if (state.lastSeenThief && state.lastSeenAt) {
                    const timeSinceSeen = now - state.lastSeenAt;
                    if (timeSinceSeen <= memoryTime) {
                        detectedThief = state.lastSeenThief;
                        detectedDist  = Infinity;
                    } else {
                        state.lastSeenThief = null;
                        state.lastSeenAt    = null;
                    }
                }

                let targetLat, targetLng, currentSpeed;

                if (detectedThief) {
                    if (state.mode !== 'chase') {
                        if (!state.detectedAt) {
                            state.detectedAt = now;
                        }
                        const elapsed = now - state.detectedAt;
                        if (elapsed >= reactionTime) {
                            state.mode       = 'chase';
                            state.detectedAt = null;
                        }
                    }

                    if (state.mode === 'chase') {
                        targetLat    = detectedThief.lat;
                        targetLng    = detectedThief.lng;
                        currentSpeed = runSpeed;

                        if (detectedDist <= catchRange) {
                            triggerBotCapture(roomId, botId, bot, 0);
                        }
                    } else {
                        currentSpeed = scanSpeed;
                        targetLat    = state.target.lat;
                        targetLng    = state.target.lng;
                    }
                } else {
                    state.mode       = 'wander';
                    state.detectedAt = null;
                    currentSpeed     = scanSpeed;
                    targetLat        = state.target.lat;
                    targetLng        = state.target.lng;

                    const distToTarget = Math.sqrt(
                        Math.pow(targetLat - bot.lat, 2) +
                        Math.pow(targetLng - bot.lng, 2)
                    );
                    if (distToTarget < diagonal * 0.005) {
                        state.target = getValidPointInPolygon(
                            arenaData.points, minLat, maxLat, minLng, maxLng
                        );
                    }
                }

                const moveLatDiff = targetLat - bot.lat;
                const moveLngDiff = targetLng - bot.lng;
                const moveDist    = Math.sqrt(moveLatDiff * moveLatDiff + moveLngDiff * moveLngDiff);

                if (moveDist > 0) {
                    bot.lat += (moveLatDiff / moveDist) * currentSpeed;
                    bot.lng += (moveLngDiff / moveDist) * currentSpeed;
                }

                updates[`game/${roomId}/players/${botId}/lat`] = bot.lat;
                updates[`game/${roomId}/players/${botId}/lng`] = bot.lng;
                updates[`game/${roomId}/players/${botId}/t`]   = now;
            });

            if (Object.keys(updates).length > 0) {
                window.db.ref().update(updates);
            }
        });
    }, 1000);
}

// ============================================================
// פריסה על גבול הזירה
// ============================================================
function getBorderSpawnPoint(activeThieves, existingBotPositions, arenaPoints) {
    let bestPoint = null;
    let bestScore = -1;

    const borderPoints = [];
    const INTERPOLATION_STEPS = 10;

    for (let i = 0; i < arenaPoints.length; i++) {
        const p1 = arenaPoints[i];
        const p2 = arenaPoints[(i + 1) % arenaPoints.length];

        for (let s = 0; s < INTERPOLATION_STEPS; s++) {
            const t = s / INTERPOLATION_STEPS;
            borderPoints.push({
                lat: p1[0] + (p2[0] - p1[0]) * t,
                lng: p1[1] + (p2[1] - p1[1]) * t
            });
        }
    }

    borderPoints.forEach(pt => {
        let minDistFromThieves = Infinity;
        activeThieves.forEach(thief => {
            const d = Math.sqrt(
                Math.pow(pt.lat - thief.lat, 2) +
                Math.pow(pt.lng - thief.lng, 2)
            );
            if (d < minDistFromThieves) minDistFromThieves = d;
        });

        let minDistFromBots = Infinity;
        existingBotPositions.forEach(bPos => {
            const d = Math.sqrt(
                Math.pow(pt.lat - bPos.lat, 2) +
                Math.pow(pt.lng - bPos.lng, 2)
            );
            if (d < minDistFromBots) minDistFromBots = d;
        });

        const hasBots = existingBotPositions.length > 0;
        const score   = hasBots
            ? (minDistFromThieves * 0.5) + (minDistFromBots * 0.5)
            : minDistFromThieves;

        if (score > bestScore) {
            bestScore = score;
            bestPoint = pt;
        }
    });

    if (bestPoint) {
        console.log(`Bot spawned on border at [${bestPoint.lat.toFixed(5)}, ${bestPoint.lng.toFixed(5)}]`);
        return bestPoint;
    }

    return { lat: arenaPoints[0][0], lng: arenaPoints[0][1] };
}

function getValidPointInPolygon(arenaPoints, minLat, maxLat, minLng, maxLng) {
    try {
        const polyCoords = arenaPoints.map(p => [p[1], p[0]]);
        polyCoords.push(polyCoords[0]);
        const polygon = turf.polygon([polyCoords]);

        let attempts = 0;
        while (attempts < 100) {
            const lat = minLat + Math.random() * (maxLat - minLat);
            const lng = minLng + Math.random() * (maxLng - minLng);
            const pt  = turf.point([lng, lat]);

            if (turf.booleanPointInPolygon(pt, polygon)) {
                return { lat, lng };
            }
            attempts++;
        }
    } catch (e) {
        console.error("Polygon mapping error:", e);
    }
    return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

function triggerBotCapture(roomId, botId, botData, reactionTime) {
    if (botCooldowns[botId] && Date.now() - botCooldowns[botId] < 10000) return;

    botCooldowns[botId] = Date.now();

    setTimeout(() => {
        window.db.ref(`game/${roomId}/captureSignal`).set({
            sender: botId,
            t:      Date.now(),
            lat:    botData.lat,
            lng:    botData.lng
        });
        console.log(`Bot ${botId} fired Taser!`);
    }, reactionTime);
}

function stopSinglePlayerAI() {
    if (botInterval) {
        clearInterval(botInterval);
        botInterval = null;
    }
    botsActive        = false;
    botStates         = {};
    botCooldowns      = {};
    captureRadarTarget = null;
    captureRadarUntil  = 0;
}