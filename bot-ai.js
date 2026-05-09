// bot-ai.js - Multi-Target Bot Engine with Radial Spawning & Age Profiles

let botInterval = null;
let botsActive = false;
let botCooldowns = {};
let botStates = {}; // זוכר את נקודות השיטוט והסטטוס של כל בוט

function startSinglePlayerAI(roomId, difficulty, arenaData) {
    if (botsActive || !arenaData || !arenaData.points) return;
    botsActive = true;
    console.log(`Starting Co-op vs Bots (${difficulty})...`);

    // הגדרות פרופילים לפי גיל מתורגמות ל-GPS (0.00001 = ~1 מטר)
    let scanSpeed, runSpeed, reactionTime;
    
    if (difficulty === 'rookie') { // ילד בן 10
        scanSpeed = 0.00002; 
        runSpeed = 0.00003;  
        reactionTime = 2000; 
    } else if (difficulty === 'elite') { // בחור בן 20
        scanSpeed = 0.00004; 
        runSpeed = 0.000075; 
        reactionTime = 400;  
    } else { // 'skilled' - ילד בן 14 (ברירת מחדל)
        scanSpeed = 0.00003; 
        runSpeed = 0.00005;   
        reactionTime = 1000;  
    }

    const lats = arenaData.points.map(p => p[0]);
    const lngs = arenaData.points.map(p => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    botInterval = setInterval(() => {
        // תיקון: בדיקה נכונה של מצב הקפאה
        if (window.isGameFrozen === true) return;

        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;

            // חיפוש הגנב כעוגן לפריסת הבוטים בתחילת המשחק
            let anchorThief = null;
            Object.keys(players).forEach(id => {
                if (players[id].role === 'thief' && !players[id].isOffline && players[id].lat) {
                    anchorThief = players[id];
                }
            });

            // אם אף גנב עדיין לא קיבל מיקום GPS, הבוטים ימתינו
            if (!anchorThief) return;

            const updates = {};
            const botIds = Object.keys(players).filter(id => id.startsWith('bot_cop_'));
            const numBots = botIds.length;

            botIds.forEach((botId, index) => {
                let bot = players[botId];
                
                // אתחול בוט - פריסה במעגל סביב הגנב הראשון (100 מטר)
                if (!bot.lat || bot.lat === 0) {
                    const angle = (index / numBots) * 2 * Math.PI;
                    const spawnPt = getDirectionalSpawnPoint(anchorThief.lat, anchorThief.lng, angle, arenaData.points);
                    
                    bot.lat = spawnPt.lat;
                    bot.lng = spawnPt.lng;
                    
                    botStates[botId] = { mode: 'wander', target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng) };
                }
                
                if (!botStates[botId]) {
                    botStates[botId] = { mode: 'wander', target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng) };
                }

                // איתור הגנב הקרוב ביותר
                let closestThief = null;
                let minDist = Infinity;

                Object.keys(players).forEach(id => {
                    if (players[id].role === 'thief' && !players[id].isOffline && players[id].lat) {
                        const latDiff = players[id].lat - bot.lat;
                        const lngDiff = players[id].lng - bot.lng;
                        const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
                        
                        if (dist < minDist) {
                            minDist = dist;
                            closestThief = players[id];
                        }
                    }
                });

                // לוגיקת תנועה
                let targetLat, targetLng, currentSpeed;

                if (closestThief && minDist <= 0.0003) {
                    // שלב התבייתות (בתוך 30 מטר)
                    targetLat = closestThief.lat;
                    targetLng = closestThief.lng;
                    currentSpeed = runSpeed;
                    botStates[botId].mode = 'chase';

                    // טייזר (בתוך 5 מטר)
                    if (minDist <= 0.00005) {
                        triggerBotCapture(roomId, botId, bot, reactionTime);
                    }
                } else {
                    // שלב סריקה (Wander)
                    currentSpeed = scanSpeed;
                    botStates[botId].mode = 'wander';
                    targetLat = botStates[botId].target.lat;
                    targetLng = botStates[botId].target.lng;

                    const distToTarget = Math.sqrt(Math.pow(targetLat - bot.lat, 2) + Math.pow(targetLng - bot.lng, 2));
                    if (distToTarget < 0.00002) {
                        botStates[botId].target = getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng);
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

// מחשבת נקודה בטווח 100 מטר בזווית ספציפית, בתוך הזירה
function getDirectionalSpawnPoint(centerLat, centerLng, angle, arenaPoints) {
    try {
        const polyCoords = arenaPoints.map(p => [p[1], p[0]]);
        polyCoords.push(polyCoords[0]);
        const polygon = turf.polygon([polyCoords]);

        let dist = 0.0009; 
        
        while (dist > 0) {
            const lat = centerLat + Math.cos(angle) * dist;
            const lng = centerLng + Math.sin(angle) * dist;
            const pt = turf.point([lng, lat]);
            
            if (turf.booleanPointInPolygon(pt, polygon)) {
                return { lat: lat, lng: lng };
            }
            dist -= 0.0001;
        }
    } catch (e) {
        console.error("Spawn calculation error:", e);
    }
    
    return { lat: centerLat, lng: centerLng };
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
    // ניקוי זיכרון הבוטים כדי שלא ישארו נתונים ישנים
    botStates = {};
    botCooldowns = {};
}