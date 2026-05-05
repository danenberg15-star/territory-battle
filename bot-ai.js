// bot-ai.js - Single Player Bot Engine (Spawns on Territory Edge)

let botInterval = null;
let botsActive = false;
let botCooldowns = {};

function startSinglePlayerAI(roomId, difficulty, arenaData) {
    if (botsActive || !arenaData || !arenaData.points) return;
    botsActive = true;
    console.log(`Starting Single Player Bots (${difficulty})...`);

    let speed = 0.00005; 
    let reactionTime = 2000;
    
    if (difficulty === 'rookie') { speed = 0.00003; reactionTime = 3000; }
    else if (difficulty === 'elite') { speed = 0.00008; reactionTime = 1000; }

    // חישוב גבולות המלבן החוסם של הזירה כדי למקם את הבוטים על הקצה
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

            let thiefObj = null;
            Object.keys(players).forEach(id => {
                if (players[id].role === 'thief') {
                    thiefObj = players[id];
                }
            });

            if (!thiefObj) return;

            const updates = {};

            Object.keys(players).forEach(id => {
                if (id.startsWith('bot_cop_')) {
                    let bot = players[id];
                    
                    // שיגור בוט לקצה הזירה אם טרם מוקם
                    if (!bot.lat || !bot.lng) {
                        // בחירה אקראית של קצה (צפון, דרום, מזרח, מערב)
                        const edge = Math.floor(Math.random() * 4);
                        if (edge === 0) { bot.lat = maxLat; bot.lng = minLng + Math.random() * (maxLng - minLng); } // צפון
                        else if (edge === 1) { bot.lat = minLat; bot.lng = minLng + Math.random() * (maxLng - minLng); } // דרום
                        else if (edge === 2) { bot.lat = minLat + Math.random() * (maxLat - minLat); bot.lng = maxLng; } // מזרח
                        else { bot.lat = minLat + Math.random() * (maxLat - minLat); bot.lng = minLng; } // מערב
                    }

                    const latDiff = thiefObj.lat - bot.lat;
                    const lngDiff = thiefObj.lng - bot.lng;
                    const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

                    if (dist > 0.00001) {
                        bot.lat += (latDiff / dist) * speed;
                        bot.lng += (lngDiff / dist) * speed;
                    }
                    
                    updates[`game/${roomId}/players/${id}/lat`] = bot.lat;
                    updates[`game/${roomId}/players/${id}/lng`] = bot.lng;
                    updates[`game/${roomId}/players/${id}/t`] = Date.now();

                    if (dist < 0.00015) { 
                        triggerBotCapture(roomId, id, bot, reactionTime);
                    }
                }
            });

            if (Object.keys(updates).length > 0) {
                window.db.ref().update(updates);
            }
        });
    }, 2000); 
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
    }, reactionTime);
}

function stopSinglePlayerAI() {
    if (botInterval) clearInterval(botInterval);
    botsActive = false;
}