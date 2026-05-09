// bot-ai.js - Multi-Target Bot Engine with Age Profiles & Smart Spawning

let botInterval = null;
let botsActive = false;
let botCooldowns = {};
let botStates = {}; // זוכר את נקודות השיטוט והסטטוס של כל בוט

// ============================================================
// פרופילי קושי לפי גיל - כל הערכים ב-GPS units (0.00001 ≈ 1 מטר)
// ============================================================
const BOT_PROFILES = {
    rookie: {
        // טירון - ילד בן 10
        scanSpeed:     0.000015,  // שיטוט איטי (~1.5 מ' לצעד)
        runSpeed:      0.000025,  // ריצה איטית (~2.5 מ' לצעד)
        radarRange:    0.00020,   // רדיוס זיהוי ~20 מטר
        reactionTime:  3000,      // 3 שניות לפני תחילת מרדף
        catchRange:    0.00015,   // תפיסה אוטומטית ב-~15 מטר
    },
    skilled: {
        // מיומן - ילד בן 14 (ברירת מחדל)
        scanSpeed:     0.000025,  // שיטוט בינוני (~2.5 מ' לצעד)
        runSpeed:      0.000050,  // ריצה בינונית (~5 מ' לצעד)
        radarRange:    0.00035,   // רדיוס זיהוי ~35 מטר
        reactionTime:  1500,      // 1.5 שניות לפני תחילת מרדף
        catchRange:    0.00015,   // תפיסה אוטומטית ב-~15 מטר
    },
    elite: {
        // עילית - נער בן 18
        scanSpeed:     0.000040,  // שיטוט מהיר (~4 מ' לצעד)
        runSpeed:      0.000080,  // ריצה אגרסיבית (~8 מ' לצעד)
        radarRange:    0.00055,   // רדיוס זיהוי ~55 מטר
        reactionTime:  400,       // 0.4 שניות - כמעט מיידי
        catchRange:    0.00015,   // תפיסה אוטומטית ב-~15 מטר
    }
};

function startSinglePlayerAI(roomId, difficulty, arenaData) {
    if (botsActive || !arenaData || !arenaData.points) return;
    botsActive = true;
    console.log(`Starting Co-op vs Bots (${difficulty})...`);

    const profile = BOT_PROFILES[difficulty] || BOT_PROFILES.skilled;
    const { scanSpeed, runSpeed, radarRange, reactionTime, catchRange } = profile;

    const lats = arenaData.points.map(p => p[0]);
    const lngs = arenaData.points.map(p => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    botInterval = setInterval(() => {
        if (window.isGameFrozen === true) return;

        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;

            // איסוף כל הגנבים הפעילים עם מיקום
            const activeThieves = Object.values(players).filter(
                p => p.role === 'thief' && !p.isOffline && p.lat
            );

            // אם אף גנב עדיין לא קיבל מיקום GPS, הבוטים ימתינו
            if (activeThieves.length === 0) return;

            const updates = {};
            const botIds = Object.keys(players).filter(id => id.startsWith('bot_cop_'));
            const numBots = botIds.length;

            botIds.forEach((botId, index) => {
                let bot = players[botId];

                // אתחול בוט - פריסה הרחק מהגנבים
                if (!bot.lat || bot.lat === 0) {
                    const spawnPt = getFarthestSpawnPoint(
                        activeThieves, index, numBots,
                        arenaData.points, minLat, maxLat, minLng, maxLng
                    );
                    bot.lat = spawnPt.lat;
                    bot.lng = spawnPt.lng;
                    botStates[botId] = {
                        mode: 'wander',
                        target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng),
                        chaseDelay: false
                    };
                }

                if (!botStates[botId]) {
                    botStates[botId] = {
                        mode: 'wander',
                        target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng),
                        chaseDelay: false
                    };
                }

                // איתור הגנב הקרוב ביותר
                let closestThief = null;
                let minDist = Infinity;

                activeThieves.forEach(thief => {
                    const latDiff = thief.lat - bot.lat;
                    const lngDiff = thief.lng - bot.lng;
                    const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
                    if (dist < minDist) {
                        minDist = dist;
                        closestThief = thief;
                    }
                });

                // לוגיקת תנועה
                let targetLat, targetLng, currentSpeed;

                const inRadar = closestThief && minDist <= radarRange;

                if (inRadar) {
                    // גנב בטווח הרדאר - עיכוב ואז מרדף
                    if (botStates[botId].mode !== 'chase') {
                        // זיהוי ראשוני - מצב המתנה לפני מרדף
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
                        targetLat = closestThief.lat;
                        targetLng = closestThief.lng;
                        currentSpeed = runSpeed;

                        // תפיסה אוטומטית בטווח קרוב
                        if (minDist <= catchRange) {
                            triggerBotCapture(roomId, botId, bot, 0);
                        }
                    } else {
                        // עדיין בעיכוב תגובה - ממשיך לשוטט
                        currentSpeed = scanSpeed;
                        targetLat = botStates[botId].target.lat;
                        targetLng = botStates[botId].target.lng;
                    }
                } else {
                    // גנב מחוץ לרדאר - שיטוט רנדומלי
                    botStates[botId].mode = 'wander';
                    botStates[botId].detectedAt = null;
                    currentSpeed = scanSpeed;
                    targetLat = botStates[botId].target.lat;
                    targetLng = botStates[botId].target.lng;

                    const distToTarget = Math.sqrt(
                        Math.pow(targetLat - bot.lat, 2) + Math.pow(targetLng - bot.lng, 2)
                    );
                    if (distToTarget < 0.00002) {
                        botStates[botId].target = getValidPointInPolygon(
                            arenaData.points, minLat, maxLat, minLng, maxLng
                        );
                    }
                }

                // ביצוע התנועה אל היעד
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
// פריסת בוט הרחק מכל הגנבים הפעילים
// מנסה למצוא נקודה בתוך הזירה שהיא הרחוקה ביותר מהגנבים
// ============================================================
function getFarthestSpawnPoint(activeThieves, botIndex, numBots, arenaPoints, minLat, maxLat, minLng, maxLng) {
    try {
        const polyCoords = arenaPoints.map(p => [p[1], p[0]]);
        polyCoords.push(polyCoords[0]);
        const polygon = turf.polygon([polyCoords]);

        let bestPoint = null;
        let bestDist = -1;
        const SAMPLES = 40; // מספר נקודות מדגם בזירה

        for (let i = 0; i < SAMPLES; i++) {
            const lat = minLat + Math.random() * (maxLat - minLat);
            const lng = minLng + Math.random() * (maxLng - minLng);
            const pt = turf.point([lng, lat]);

            if (!turf.booleanPointInPolygon(pt, polygon)) continue;

            // חשב מרחק מינימלי מכל הגנבים
            let minDistFromThieves = Infinity;
            activeThieves.forEach(thief => {
                const d = Math.sqrt(Math.pow(lat - thief.lat, 2) + Math.pow(lng - thief.lng, 2));
                if (d < minDistFromThieves) minDistFromThieves = d;
            });

            // גם התחשב בפיזור בין הבוטים עצמם (בונוס זווית)
            const angleOffset = (botIndex / numBots) * 0.0001;
            const score = minDistFromThieves + angleOffset;

            if (score > bestDist) {
                bestDist = score;
                bestPoint = { lat, lng };
            }
        }

        if (bestPoint) return bestPoint;
    } catch (e) {
        console.error("Spawn calculation error:", e);
    }

    // Fallback - מרכז הזירה
    return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
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