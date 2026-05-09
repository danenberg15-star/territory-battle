// bot-ai.js - Multi-Target Bot Engine with Age Profiles & Arena-Scaled Parameters

let botInterval = null;
let botsActive = false;
let botCooldowns = {};
let botStates = {};

// ============================================================
// פרופילי קושי לפי גיל - ערכים באחוזים מאלכסון הזירה
// ============================================================
const BOT_PROFILES = {
    rookie: {
        scanSpeedPct:   0.010,
        runSpeedPct:    0.015,
        radarRangePct:  0.20,
        reactionTime:   3000,
        catchRange:     0.00015
    },
    skilled: {
        scanSpeedPct:   0.015,
        runSpeedPct:    0.030,
        radarRangePct:  0.35,
        reactionTime:   1500,
        catchRange:     0.00015
    },
    elite: {
        scanSpeedPct:   0.025,
        runSpeedPct:    0.050,
        radarRangePct:  0.55,
        reactionTime:   400,
        catchRange:     0.00015
    }
};

function calcArenaDiagonal(minLat, maxLat, minLng, maxLng) {
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

function startSinglePlayerAI(roomId, difficulty, arenaData) {
    if (botsActive || !arenaData || !arenaData.points) return;
    botsActive = true;
    console.log(`Starting Co-op vs Bots (${difficulty})...`);

    const profile = BOT_PROFILES[difficulty] || BOT_PROFILES.skilled;

    const lats = arenaData.points.map(p => p[0]);
    const lngs = arenaData.points.map(p => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const diagonal = calcArenaDiagonal(minLat, maxLat, minLng, maxLng);

    const scanSpeed    = profile.scanSpeedPct  * diagonal;
    const runSpeed     = profile.runSpeedPct   * diagonal;
    const radarRange   = profile.radarRangePct * diagonal;
    const reactionTime = profile.reactionTime;
    const catchRange   = profile.catchRange;

    console.log(`Arena diagonal: ${(diagonal * 111000).toFixed(0)}m | radar: ${(radarRange * 111000).toFixed(0)}m | run: ${(runSpeed * 111000).toFixed(1)}m/step`);

    // נקודות הפתיחה של הבוטים שכבר הוצבו - לפיזור ביניהם
    const spawnedBotPositions = [];

    botInterval = setInterval(() => {
        if (window.isGameFrozen === true) return;

        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;

            const activeThieves = Object.values(players).filter(
                p => p.role === 'thief' && !p.isOffline && p.lat
            );

            if (activeThieves.length === 0) return;

            const updates = {};
            const botIds = Object.keys(players).filter(id => id.startsWith('bot_cop_'));

            botIds.forEach((botId, index) => {
                let bot = players[botId];

                // אתחול בוט - פריסה על גבול הזירה, מפוזר
                if (!bot.lat || bot.lat === 0) {
                    const spawnPt = getBorderSpawnPoint(
                        activeThieves, spawnedBotPositions,
                        arenaData.points
                    );
                    bot.lat = spawnPt.lat;
                    bot.lng = spawnPt.lng;
                    spawnedBotPositions.push({ lat: spawnPt.lat, lng: spawnPt.lng });

                    botStates[botId] = {
                        mode: 'wander',
                        target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng),
                        detectedAt: null
                    };
                }

                if (!botStates[botId]) {
                    botStates[botId] = {
                        mode: 'wander',
                        target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng),
                        detectedAt: null
                    };
                }

                // ============================================================
                // רדאר: הבוט עיוור לחלוטין - מזהה גנב רק כשנכנס לטווח שלו
                // ============================================================
                let detectedThief = null;
                let detectedDist = Infinity;

                activeThieves.forEach(thief => {
                    const latDiff = thief.lat - bot.lat;
                    const lngDiff = thief.lng - bot.lng;
                    const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

                    if (dist <= radarRange && dist < detectedDist) {
                        detectedDist = dist;
                        detectedThief = thief;
                    }
                });

                // לוגיקת תנועה
                let targetLat, targetLng, currentSpeed;

                if (detectedThief) {
                    // גנב זוהה בטווח הרדאר - עיכוב תגובה ואז מרדף
                    if (botStates[botId].mode !== 'chase') {
                        if (!botStates[botId].detectedAt) {
                            botStates[botId].detectedAt = Date.now();
                        }
                        const elapsed = Date.now() - botStates[botId].detectedAt;
                        if (elapsed >= reactionTime) {
                            botStates[botId].mode = 'chase';
                            botStates[botId].detectedAt = null;
                        }
                    }

                    if (botStates[botId].mode === 'chase') {
                        targetLat = detectedThief.lat;
                        targetLng = detectedThief.lng;
                        currentSpeed = runSpeed;

                        if (detectedDist <= catchRange) {
                            triggerBotCapture(roomId, botId, bot, 0);
                        }
                    } else {
                        // עדיין בעיכוב תגובה - ממשיך לשוטט
                        currentSpeed = scanSpeed;
                        targetLat = botStates[botId].target.lat;
                        targetLng = botStates[botId].target.lng;
                    }
                } else {
                    // אין גנב בטווח - שיטוט רנדומלי לחלוטין
                    botStates[botId].mode = 'wander';
                    botStates[botId].detectedAt = null;
                    currentSpeed = scanSpeed;
                    targetLat = botStates[botId].target.lat;
                    targetLng = botStates[botId].target.lng;

                    const distToTarget = Math.sqrt(
                        Math.pow(targetLat - bot.lat, 2) + Math.pow(targetLng - bot.lng, 2)
                    );
                    if (distToTarget < diagonal * 0.005) {
                        botStates[botId].target = getValidPointInPolygon(
                            arenaData.points, minLat, maxLat, minLng, maxLng
                        );
                    }
                }

                // ביצוע התנועה
                const moveLatDiff = targetLat - bot.lat;
                const moveLngDiff = targetLng - bot.lng;
                const moveDist = Math.sqrt(moveLatDiff * moveLatDiff + moveLngDiff * moveLngDiff);

                if (moveDist > 0) {
                    bot.lat += (moveLatDiff / moveDist) * currentSpeed;
                    bot.lng += (moveLngDiff / moveDist) * currentSpeed;
                }

                updates[`game/${roomId}/players/${botId}/lat`] = bot.lat;
                updates[`game/${roomId}/players/${botId}/lng`] = bot.lng;
                updates[`game/${roomId}/players/${botId}/t`] = Date.now();
            });

            if (Object.keys(updates).length > 0) {
                window.db.ref().update(updates);
            }
        });
    }, 1000);
}

// ============================================================
// פריסה על גבול הזירה בלבד
// עוברת על כל נקודות הגבול ובוחרת את זו שהיא:
// 1. הרחוקה ביותר מהגנבים
// 2. הרחוקה ביותר מבוטים שכבר הוצבו
// ============================================================
function getBorderSpawnPoint(activeThieves, existingBotPositions, arenaPoints) {
    let bestPoint = null;
    let bestScore = -1;

    // בניית רשימת נקודות לאורך כל צלעות הגבול (לא רק קודקודים)
    const borderPoints = [];
    const INTERPOLATION_STEPS = 10; // כמה נקודות בין כל שני קודקודים

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
        // מרחק מינימלי מכל הגנבים
        let minDistFromThieves = Infinity;
        activeThieves.forEach(thief => {
            const d = Math.sqrt(
                Math.pow(pt.lat - thief.lat, 2) +
                Math.pow(pt.lng - thief.lng, 2)
            );
            if (d < minDistFromThieves) minDistFromThieves = d;
        });

        // מרחק מינימלי מבוטים שכבר הוצבו
        let minDistFromBots = Infinity;
        existingBotPositions.forEach(bPos => {
            const d = Math.sqrt(
                Math.pow(pt.lat - bPos.lat, 2) +
                Math.pow(pt.lng - bPos.lng, 2)
            );
            if (d < minDistFromBots) minDistFromBots = d;
        });

        // ציון: 50% ריחוק מגנבים + 50% ריחוק מבוטים
        // אם אין בוטים עדיין - 100% ריחוק מגנבים
        const hasBots = existingBotPositions.length > 0;
        const score = hasBots
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

    // Fallback - קודקוד ראשון של הזירה
    return { lat: arenaPoints[0][0], lng: arenaPoints[0][1] };
}

// בחירת נקודת שיטוט חוקית בתוך הפוליגון
function getValidPointInPolygon(arenaPoints, minLat, maxLat, minLng, maxLng) {
    try {
        const polyCoords = arenaPoints.map(p => [p[1], p[0]]);
        polyCoords.push(polyCoords[0]);
        const polygon = turf.polygon([polyCoords]);

        let attempts = 0;
        while (attempts < 100) {
            const lat = minLat + Math.random() * (maxLat - minLat);
            const lng = minLng + Math.random() * (maxLng - minLng);
            const pt = turf.point([lng, lat]);

            if (turf.booleanPointInPolygon(pt, polygon)) {
                return { lat: lat, lng: lng };
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
            t: Date.now(),
            lat: botData.lat,
            lng: botData.lng
        });
        console.log(`Bot ${botId} fired Taser!`);
    }, reactionTime);
}

function stopSinglePlayerAI() {
    if (botInterval) {
        clearInterval(botInterval);
        botInterval = null;
    }
    botsActive = false;
    botStates = {};
    botCooldowns = {};
}