// bot-ai.js - Single Player Bot Engine

let botInterval = null;
let botsActive = false;
let botCooldowns = {};

function startSinglePlayerAI(roomId, difficulty, arena) {
    if (botsActive) return;
    botsActive = true;
    console.log(`Starting Single Player Bots (${difficulty})...`);

    // הגדרת מהירות וזמן תגובה לטייזר לפי רמת קושי
    let speed = 0.00005; 
    let reactionTime = 2000;
    
    if (difficulty === 'rookie') { speed = 0.00003; reactionTime = 3000; }
    else if (difficulty === 'elite') { speed = 0.00008; reactionTime = 1000; }

    botInterval = setInterval(() => {
        if (typeof isGameFrozen !== 'undefined' && isGameFrozen) return;

        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;

            let thiefObj = null;
            let thiefId = null;
            Object.keys(players).forEach(id => {
                if (players[id].role === 'thief') {
                    thiefObj = players[id];
                    thiefId = id;
                }
            });

            if (!thiefObj) return;

            const updates = {};

            Object.keys(players).forEach(id => {
                if (id.startsWith('bot_cop_')) {
                    let bot = players[id];
                    
                    // שיגור לתחנת המשטרה אם טרם מוקמו
                    if (!bot.lat || !bot.lng) {
                        bot.lat = arena.policeStation.lat + (Math.random() * 0.0002 - 0.0001);
                        bot.lng = arena.policeStation.lng + (Math.random() * 0.0002 - 0.0001);
                    }

                    // תנועה לעבר הגנב (וקטור פשוט)
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

                    // אם הבוט קרוב לגנב (כ-15 מטר), הוא ינסה לירות טייזר
                    if (dist < 0.00015) { 
                        triggerBotCapture(roomId, id, bot, reactionTime);
                    }
                }
            });

            if (Object.keys(updates).length > 0) {
                window.db.ref().update(updates);
            }
        });
    }, 2000); // הבוטים מעדכנים מיקום כל 2 שניות כדי לחסוך קריאות לשרת
}

function triggerBotCapture(roomId, botId, botData, reactionTime) {
    if (botCooldowns[botId] && Date.now() - botCooldowns[botId] < 10000) return; // Cooldown לבוטים
    
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