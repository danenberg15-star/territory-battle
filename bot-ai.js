// bot-ai.js - Multi-Target Bot Engine with Age Profiles & Phased AI

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
        scanSpeed = 0.00002; // הוכפל פי 2
        runSpeed = 0.00003;  
        reactionTime = 2000; 
    } else if (difficulty === 'elite') { // בחור בן 20
        scanSpeed = 0.00004; // הוכפל פי 2
        runSpeed = 0.000075; 
        reactionTime = 400;  
    } else { // 'skilled' - ילד בן 14 (ברירת מחדל)
        scanSpeed = 0.00003; // הוכפל פי 2
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
        if (typeof isGameFrozen !== 'undefined' && isGameFrozen) return;

        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;

            const updates = {};

            Object.keys(players).forEach(botId => {
                if (botId.startsWith('bot_cop_')) {
                    let bot = players[botId];
                    
                    // אתחול בוט - זריקה לנקודה חוקית *בתוך* הזירה המדויקת
                    if (!bot.lat || bot.lat === 0) {
                        const startPoint = getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng);
                        bot.lat = startPoint.lat;
                        bot.lng = startPoint.lng;
                        
                        botStates[botId] = { mode: 'wander', target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng) };
                    }
                    
                    if (!botStates[botId]) {
                        botStates[botId] = { mode: 'wander', target: getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng) };
                    }

                    // 1. איתור הגנב הקרוב ביותר
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

                    // 2. לוגיקת תנועה (שיטוט לעומת התבייתות)
                    // רדיוס 30 מטר = ~0.0003 מעלות
                    // רדיוס 5 מטר  = ~0.00005 מעלות
                    let targetLat, targetLng, currentSpeed;

                    if (closestThief && minDist <= 0.0003) {
                        // שלב 2: התבייתות (Chase Mode) - הבוט בתוך 30 מטר מגנב!
                        targetLat = closestThief.lat;
                        targetLng = closestThief.lng;
                        currentSpeed = runSpeed;
                        botStates[botId].mode = 'chase';

                        // שלב 3: טייזר (Taser Phase) - הבוט בתוך 5 מטר מהגנב!
                        if (minDist <= 0.00005) {
                            triggerBotCapture(roomId, botId, bot, reactionTime);
                        }
                    } else {
                        // שלב 1: סריקה רנדומלית (Wander Mode)
                        currentSpeed = scanSpeed;
                        botStates[botId].mode = 'wander';
                        targetLat = botStates[botId].target.lat;
                        targetLng = botStates[botId].target.lng;

                        // בדיקה אם הבוט הגיע ליעד השיטוט שלו (בטווח של 2 מטר)
                        const distToTarget = Math.sqrt(Math.pow(targetLat - bot.lat, 2) + Math.pow(targetLng - bot.lng, 2));
                        if (distToTarget < 0.00002) {
                            botStates[botId].target = getValidPointInPolygon(arenaData.points, minLat, maxLat, minLng, maxLng);
                        }
                    }

                    // ביצוע התנועה אל עבר היעד הרלוונטי
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
                }
            });

            if (Object.keys(updates).length > 0) {
                window.db.ref().update(updates);
            }
        });
    }, 1000); 
}

// פונקציה חדשה שמוודאת שהנקודה נופלת בתוך הפוליגון (זירת המשחק) המדויק
function getValidPointInPolygon(arenaPoints, minLat, maxLat, minLng, maxLng) {
    try {
        const polyCoords = arenaPoints.map(p => [p[1], p[0]]);
        polyCoords.push(polyCoords[0]); // סגירת מעגל
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
    
    // חלופת חירום במקרה של זירה משונה מאוד (מחזיר את מרכז המפה)
    return {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2
    };
}

function triggerBotCapture(roomId, botId, botData, reactionTime) {
    if (botCooldowns[botId] && Date.now() - botCooldowns[botId] < 10000) return; 
    
    botCooldowns[botId] = Date.now();
    
    // מפעיל את הטייזר רק אחרי זמן התגובה המוגדר לפרופיל!
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
    if (botInterval) clearInterval(botInterval);
    botsActive = false;
}