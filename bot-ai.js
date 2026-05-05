// bot-ai.js - Single Player Bot Engine (Spawns on Territory Edge)

let botInterval = null;
let botsActive = false;
let botCooldowns = {};

function startSinglePlayerAI(roomId, difficulty, arenaData) {
    if (botsActive || !arenaData || !arenaData.points) return;
    botsActive = true;
    console.log(`Starting Single Player Bots (${difficulty})...`);

    // הגדרת מהירות וזמן תגובה לפי רמת קושי
    let speed = 0.00005; 
    let reactionTime = 2000;
    
    if (difficulty === 'rookie') { 
        speed = 0.00003; 
        reactionTime = 3000; 
    } else if (difficulty === 'elite') { 
        speed = 0.00008; 
        reactionTime = 1000; 
    }

    // חישוב גבולות המלבן החוסם של הזירה
    const lats = arenaData.points.map(p => p[0]);
    const lngs = arenaData.points.map(p => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    botInterval = setInterval(() => {
        // בדיקה אם המשחק קפוא (למשל אחרי שימוש בכרטיס שחרור)
        if (typeof isGameFrozen !== 'undefined' && isGameFrozen) return;

        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;

            // איתור הגנב (השחקן האנושי)
            let thiefObj = null;
            Object.keys(players).forEach(id => {
                if (players[id].role === 'thief') {
                    thiefObj = players[id];
                }
            });

            if (!thiefObj || !thiefObj.lat) return;

            const updates = {};

            Object.keys(players).forEach(id => {
                if (id.startsWith('bot_cop_')) {
                    let bot = players[id];
                    
                    // מיקום ראשוני של בוט על קצה הזירה
                    if (!bot.lat || bot.lat === 0) {
                        const edge = Math.floor(Math.random() * 4);
                        if (edge === 0) { bot.lat = maxLat; bot.lng = minLng + Math.random() * (maxLng - minLng); }
                        else if (edge === 1) { bot.lat = minLat; bot.lng = minLng + Math.random() * (maxLng - minLng); }
                        else if (edge === 2) { bot.lat = minLat + Math.random() * (maxLat - minLat); bot.lng = maxLng; }
                        else { bot.lat = minLat + Math.random() * (maxLat - minLat); bot.lng = minLng; }
                    }

                    // חישוב כיוון תנועה לעבר הגנב
                    const latDiff = thiefObj.lat - bot.lat;
                    const lngDiff = thiefObj.lng - bot.lng;
                    const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

                    // תנועה רק אם הבוט לא ממש על הגנב
                    if (dist > 0.00001) {
                        bot.lat += (latDiff / dist) * speed;
                        bot.lng += (lngDiff / dist) * speed;
                    }
                    
                    updates[`game/${roomId}/players/${id}/lat`] = bot.lat;
                    updates[`game/${roomId}/players/${id}/lng`] = bot.lng;
                    updates[`game/${roomId}/players/${id}/t`] = Date.now();

                    // אם הבוט מספיק קרוב, הוא מנסה לבצע מעצר
                    // 0.00015 מעלות זה בערך 15-16 מטרים
                    if (dist < 0.00015) { 
                        triggerBotCapture(roomId, id, bot, reactionTime);
                    }
                }
            });

            if (Object.keys(updates).length > 0) {
                window.db.ref().update(updates);
            }
        });
    }, 1000); // עדכון בוטים כל שנייה לחוויה חלקה יותר
}

function triggerBotCapture(roomId, botId, botData, reactionTime) {
    // בדיקת Cooldown לבוט (מניעת הצפת אותות)
    if (botCooldowns[botId] && Date.now() - botCooldowns[botId] < 10000) return; 
    
    botCooldowns[botId] = Date.now();
    
    // הבוט "מגיב" ושולח אות טייזר אחרי זמן תגובה מסוים
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