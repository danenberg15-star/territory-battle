// bot-ai.js - Multi-Target Bot Engine with Age Profiles & Arena-Scaled Parameters

let botInterval = null;
let botsActive = false;
let botCooldowns = {};
let botStates = {}; // זוכר את נקודות השיטוט והסטטוס של כל בוט

// ============================================================
// פרופילי קושי לפי גיל - ערכים באחוזים מאלכסון הזירה
// כך הבוטים מאוזנים בכל גודל זירה
// ============================================================
const BOT_PROFILES = {
    rookie: {
        // טירון - ילד בן 10
        scanSpeedPct:   0.010,  // 1.0% מאלכסון הזירה לצעד
        runSpeedPct:    0.015,  // 1.5% מאלכסון הזירה לצעד
        radarRangePct:  0.20,   // רדיוס זיהוי = 20% מאלכסון הזירה
        reactionTime:   3000,   // 3 שניות לפני תחילת מרדף (לא תלוי גודל)
        catchRange:     0.00015 // תפיסה אוטומטית ב-~15 מטר (פיזי, לא יחסי)
    },
    skilled: {
        // מיומן - ילד בן 14 (ברירת מחדל)
        scanSpeedPct:   0.015,  // 1.5% מאלכסון הזירה לצעד
        runSpeedPct:    0.030,  // 3.0% מאלכסון הזירה לצעד
        radarRangePct:  0.35,   // רדיוס זיהוי = 35% מאלכסון הזירה
        reactionTime:   1500,   // 1.5 שניות לפני תחילת מרדף
        catchRange:     0.00015 // תפיסה אוטומטית ב-~15 מטר
    },
    elite: {
        // עילית - נער בן 18
        scanSpeedPct:   0.025,  // 2.5% מאלכסון הזירה לצעד
        runSpeedPct:    0.050,  // 5.0% מאלכסון הזירה לצעד
        radarRangePct:  0.55,   // רדיוס זיהוי = 55% מאלכסון הזירה
        reactionTime:   400,    // 0.4 שניות - כמעט מיידי
        catchRange:     0.00015 // תפיסה אוטומטית ב-~15 מטר
    }
};

// ============================================================
// חישוב אלכסון הזירה ב-GPS units
// זהו המרחק הגדול ביותר בין שתי נקודות בתוך הזירה (bbox)
// ============================================================
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

    // חישוב אלכסון הזירה פעם אחת בלבד
    const diagonal = calcArenaDiagonal(minLat, maxLat, minLng, maxLng);

    // תרגום אחוזים לערכי GPS אמיתיים לפי גודל הזירה
    const scanSpeed    = profile.scanSpeedPct  * diagonal;
    const runSpeed     = profile.runSpeedPct   * diagonal;
    const radarRange   = profile.radarRangePct * diagonal;
    const reactionTime = profile.reactionTime;
    const catchRange   = profile.catchRange;

    console.log(`Arena diagonal: ${(diagonal * 111000).toFixed(0)}m | radar: ${(radarRange * 111000).toFixed(0)}m | run: ${(runSpeed * 111000).toFixed(1)}m/step`);

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

                        // תפיסה אוטומטית בטווח קרוב (15 מטר פיזי)
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
                    // החלפת יעד שיטוט כשמגיע אליו (5% מאלכסון = "קרוב מספיק")
                    if (distToTarget < diagonal * 0.005) {
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
        const SAMPLES = 40;

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

            // בונוס פיזור בין הבוטים עצמם
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