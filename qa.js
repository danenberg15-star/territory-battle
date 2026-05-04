// qa.js - Automated QA Sandbox Simulator (Rooms 99999 / 88888) - Standard Arena (1500 sqm)[cite: 11, 22]

/**
 * מאתחל חדר QA לפי מספר החדר (99999 או 88888)
 */
function initQARoom(roomId) {
    console.log("Starting Automated QA Simulator for room:", roomId);
    window.currentRoom = roomId;
    window.playerId = localStorage.getItem('tb_uuid') || 'p_qa_' + Date.now();
    window.playerName = localStorage.getItem('tb_name') || "QA Tester";
    window.currentLang = typeof currentLang !== 'undefined' ? currentLang : 'he';

    document.getElementById('login-screen').style.display = 'none';

    if (!navigator.geolocation) {
        alert("לא ניתן לגשת ל-GPS. חובה לאשר מיקום לטובת סביבת ה-QA.");
        return;
    }

    document.getElementById('briefing-status').innerText = "מייצר זירת סימולציה (1500 מ\"ר) ובוטים...";
    document.getElementById('briefing-overlay').style.display = 'block';

    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        
        if (typeof turf === 'undefined') {
            alert("שגיאה: ספריית החישובים (Turf.js) לא נטענה. אנא רענן את העמוד.");
            return;
        }
        
        setupQAServerData(roomId, lat, lng);
    }, (err) => {
        alert("שגיאת GPS: " + err.message);
    }, { 
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
}

/**
 * הקמת נתוני השרת לסימולציה עם זירה של 1500 מ"ר[cite: 11, 22]
 */
function setupQAServerData(roomId, centerLat, centerLng) {
    try {
        // יצירת ריבוע בשטח של 1500 מ"ר סביב המיקום הנוכחי[cite: 11, 22]
        // צלע הריבוע = שורש של 1500 (כ-38.73 מטר).
        // המרחק מהמרכז לפינה (אלכסון) הוא שורש של (750) = כ-27.38 מטר.
        const center = turf.point([centerLng, centerLat]);
        const distToCornerKm = Math.sqrt(750) / 1000; 

        const ne = turf.destination(center, distToCornerKm, 45, {units: 'kilometers'}).geometry.coordinates;
        const se = turf.destination(center, distToCornerKm, 135, {units: 'kilometers'}).geometry.coordinates;
        const sw = turf.destination(center, distToCornerKm, 225, {units: 'kilometers'}).geometry.coordinates;
        const nw = turf.destination(center, distToCornerKm, 315, {units: 'kilometers'}).geometry.coordinates;
        
        const arenaPoints = [
            [ne[1], ne[0]],
            [se[1], se[0]],
            [sw[1], sw[0]],
            [nw[1], nw[0]]
        ];

        const arenaData = {
            points: arenaPoints,
            totalArea: 1500, // הגדרת השטח המעודכן ל-1500 מ"ר[cite: 11, 22]
            policeStation: { lat: centerLat, lng: centerLng, radius: 10 } // תחנה בגודל 10 מטר רדיוס
        };

        const bots = {};
        
        // הגדרת תפקידים לפי דרישה:
        // חדר 99999: שחקן = גנב, בוטים = 4 שוטרים
        // חדר 88888: שחקן = שוטר, בוטים = 4 גנבים[cite: 11, 22]
        if (roomId === '99999') {
            window.playerRole = 'thief';
            var botRole = 'cop';
        } else {
            window.playerRole = 'cop';
            var botRole = 'thief';
        }

        // יצירת 4 בוטים ממוקמים בתוך הזירה המורחבת
        for (let i = 1; i <= 4; i++) {
            const botId = `bot_${botRole}_${i}`;
            bots[botId] = { 
                name: `בוט ${botRole === 'cop' ? 'שוטר' : 'גנב'} ${i}`, 
                role: botRole, 
                // מיקום ראשוני בטווח רנדומלי של 10 מטר מהמרכז
                lat: centerLat + (Math.random() - 0.5) * 0.0001, 
                lng: centerLng + (Math.random() - 0.5) * 0.0001, 
                t: Date.now(), 
                isOffline: false,
                inStation: (botRole === 'cop'),
                flashUntil: 0
            };
        }
        
        window.isHost = false; 
        bots[window.playerId] = { 
            name: window.playerName + ' (QA)', 
            role: window.playerRole, 
            lat: centerLat, 
            lng: centerLng, 
            t: Date.now(),
            isOffline: false,
            inStation: (window.playerRole === 'cop')
        };

        const updates = {};
        updates[`rooms/${roomId}/status`] = 'playing';
        updates[`rooms/${roomId}/gameStartTime`] = Date.now();
        updates[`rooms/${roomId}/host`] = 'qa_host';
        updates[`rooms/${roomId}/players`] = bots; 
        
        updates[`game/${roomId}/arena`] = arenaData;
        updates[`game/${roomId}/players`] = bots;
        updates[`game/${roomId}/briefing`] = { active: false, timeLeft: 0, complete: true }; 

        window.db.ref().update(updates).then(() => {
            document.getElementById('briefing-overlay').style.display = 'none';
            if (typeof enterGameScene === 'function') enterGameScene();
            
            // הפעלת מנוע הבוטים עם שמירה על גבולות ה-1500 מ"ר[cite: 22]
            startBotEngine(roomId, arenaData);
        });

    } catch (e) {
        alert("שגיאת חישוב QA: " + e.message);
    }
}

/**
 * מנוע תנועת בוטים - מותאם לזירה של 1500 מ"ר[cite: 22]
 */
function startBotEngine(roomId, arenaData) {
    const polyCoords = [...arenaData.points.map(p => [p[1], p[0]]), [arenaData.points[0][1], arenaData.points[0][0]]];
    const polygon = turf.polygon([polyCoords]);
    
    setInterval(() => {
        if (!window.db || !window.currentRoom) return;
        
        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;
            
            const botUpdates = {};
            Object.keys(players).forEach(id => {
                if (id.startsWith('bot_')) {
                    const b = players[id];
                    
                    // תזוזה בצעדים בינוניים (כ-3 עד 5 מטר לכל עדכון)[cite: 22]
                    let nextLat = b.lat + (Math.random() - 0.5) * 0.00006;
                    let nextLng = b.lng + (Math.random() - 0.5) * 0.00006;
                    
                    const nextPt = turf.point([nextLng, nextLat]);
                    if (turf.booleanPointInPolygon(nextPt, polygon)) {
                        botUpdates[`game/${roomId}/players/${id}/lat`] = nextLat;
                        botUpdates[`game/${roomId}/players/${id}/lng`] = nextLng;
                        botUpdates[`game/${roomId}/players/${id}/t`] = Date.now();
                    } else {
                        // אם הבוט עומד לצאת, הוא חוזר לכיוון המרכז
                        botUpdates[`game/${roomId}/players/${id}/lat`] = arenaData.policeStation.lat;
                        botUpdates[`game/${roomId}/players/${id}/lng`] = arenaData.policeStation.lng;
                        botUpdates[`game/${roomId}/players/${id}/t`] = Date.now();
                    }
                }
            });
            window.db.ref().update(botUpdates);
        });
    }, 2500);
}