// qa.js - Automated QA Sandbox Simulator (Rooms 99999 / 88888)[cite: 7, 24]

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

    document.getElementById('briefing-status').innerText = "מייצר זירת סימולציה ובוטים...";
    document.getElementById('briefing-overlay').style.display = 'block';

    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        
        if (typeof turf === 'undefined') {
            alert("שגיאה: ספריית החישובים לא נטענה. אנא רענן את העמוד.");
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
 * הקמת נתוני השרת לסימולציה
 */
function setupQAServerData(roomId, centerLat, centerLng) {
    try {
        // יצירת ריבוע של 1 ק"מ רבוע (500 מטר לכל כיוון מהמרכז)[cite: 7]
        const center = turf.point([centerLng, centerLat]);
        const ne = turf.destination(center, 0.5, 45, {units: 'kilometers'}).geometry.coordinates;
        const se = turf.destination(center, 0.5, 135, {units: 'kilometers'}).geometry.coordinates;
        const sw = turf.destination(center, 0.5, 225, {units: 'kilometers'}).geometry.coordinates;
        const nw = turf.destination(center, 0.5, 315, {units: 'kilometers'}).geometry.coordinates;
        
        const arenaPoints = [
            [ne[1], ne[0]],
            [se[1], se[0]],
            [sw[1], sw[0]],
            [nw[1], nw[0]]
        ];

        const arenaData = {
            points: arenaPoints,
            totalArea: 1000000, // 1 קמ"ר
            policeStation: { lat: centerLat, lng: centerLng, radius: 50 } 
        };

        const bots = {};
        
        // הגדרת תפקידים לפי דרישה:
        // חדר 99999: שחקן = גנב, בוטים = 4 שוטרים
        // חדר 88888: שחקן = שוטר, בוטים = 4 גנבים
        if (roomId === '99999') {
            window.playerRole = 'thief';
            var botRole = 'cop';
        } else {
            window.playerRole = 'cop';
            var botRole = 'thief';
        }

        // יצירת 4 בוטים פעילים[cite: 7]
        for (let i = 1; i <= 4; i++) {
            const botId = `bot_${botRole}_${i}`;
            bots[botId] = { 
                name: `בוט ${botRole === 'cop' ? 'שוטר' : 'גנב'} ${i}`, 
                role: botRole, 
                lat: centerLat + (Math.random() - 0.5) * 0.004, 
                lng: centerLng + (Math.random() - 0.5) * 0.004, 
                t: Date.now(), 
                isOffline: false,
                inStation: (botRole === 'cop'),
                flashUntil: 0
            };
        }
        
        // הוספת השחקן האנושי למערך השחקנים בשרת
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
            
            // הפעלת מנוע הבוטים עם שמירה על גבולות הגזרה[cite: 24]
            startBotEngine(roomId, arenaData);
        });

    } catch (e) {
        alert("שגיאת חישוב QA: " + e.message);
    }
}

/**
 * מנוע תנועת בוטים - מוודא שהם תמיד בזירה ולא יוצאים ממנה[cite: 24]
 */
function startBotEngine(roomId, arenaData) {
    const polyCoords = [...arenaData.points.map(p => [p[1], p[0]]), [arenaData.points[0][1], arenaData.points[0][0]]];
    const polygon = turf.polygon([polyCoords]);
    
    // תנועה רציפה כל 2.5 שניות
    setInterval(() => {
        if (!window.db || !window.currentRoom) return;
        
        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;
            
            const botUpdates = {};
            Object.keys(players).forEach(id => {
                if (id.startsWith('bot_')) {
                    const b = players[id];
                    
                    // חישוב צעד רנדומלי
                    let nextLat = b.lat + (Math.random() - 0.5) * 0.0006;
                    let nextLng = b.lng + (Math.random() - 0.5) * 0.0006;
                    
                    // בדיקה: האם הבוט חורג מהטריטוריה?[cite: 24]
                    const nextPt = turf.point([nextLng, nextLat]);
                    if (turf.booleanPointInPolygon(nextPt, polygon)) {
                        botUpdates[`game/${roomId}/players/${id}/lat`] = nextLat;
                        botUpdates[`game/${roomId}/players/${id}/lng`] = nextLng;
                        botUpdates[`game/${roomId}/players/${id}/t`] = Date.now();
                    } else {
                        // אם חרג, הבוט מחשב מסלול מחדש לכיוון המרכז
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