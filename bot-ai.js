// bot-ai.js - Multi-Target Bot Engine (Co-op Support)

let botInterval = null;
let botsActive = false;
let botCooldowns = {};

function startSinglePlayerAI(roomId, difficulty, arenaData) {
    if (botsActive || !arenaData || !arenaData.points) return;
    botsActive = true;
    console.log(`Starting Co-op vs Bots (${difficulty})...`);

    let speed = 0.00005; 
    let reactionTime = 2000;
    
    if (difficulty === 'rookie') { 
        speed = 0.00003; 
        reactionTime = 3000; 
    } else if (difficulty === 'elite') { 
        speed = 0.00008; 
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

            // לולאה על כל הבוטים במשחק
            Object.keys(players).forEach(botId => {
                if (botId.startsWith('bot_cop_')) {
                    let bot = players[botId];
                    
                    if (!bot.lat || bot.lat === 0) {
                        const edge = Math.floor(Math.random() * 4);
                        if (edge === 0) { bot.lat = maxLat; bot.lng = minLng + Math.random() * (maxLng - minLng); }
                        else if (edge === 1) { bot.lat = minLat; bot.lng = minLng + Math.random() * (maxLng - minLng); }
                        else if (edge === 2) { bot.lat = minLat + Math.random() * (maxLat - minLat); bot.lng = maxLng; }
                        else { bot.lat = minLat + Math.random() * (maxLat - minLat); bot.lng = minLng; }
                    }

                    // סריקת שטח: חיפוש הגנב *הקרוב ביותר* לבוט הספציפי הזה
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

                    // תנועה רק אם נמצא יעד חי ופעיל
                    if (closestThief) {
                        const latDiff = closestThief.lat - bot.lat;
                        const lngDiff = closestThief.lng - bot.lng;
                        const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

                        if (dist > 0.00001) {
                            bot.lat += (latDiff / dist) * speed;
                            bot.lng += (lngDiff / dist) * speed;
                        }
                        
                        updates[`game/${roomId}/players/${botId}/lat`] = bot.lat;
                        updates[`game/${roomId}/players/${botId}/lng`] = bot.lng;
                        updates[`game/${roomId}/players/${botId}/t`] = Date.now();

                        if (dist < 0.00015) { 
                            triggerBotCapture(roomId, botId, bot, reactionTime);
                        }
                    }
                }
            });

            if (Object.keys(updates).length > 0) {
                window.db.ref().update(updates);
            }
        });
    }, 1000); 
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
    if (botInterval) clearInterval(botInterval);
    botsActive = false;
}