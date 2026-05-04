// qa.js - Automated QA Sandbox Simulator (Rooms 99999 / 88888)[cite: 7]

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
        // חדר 99999 = אתה גנב נגד 4 שוטרים. חדר 88888 = אתה שוטר נגד 4 גנבים.[cite: 7]
        const botRole = (roomId === '99999') ? 'cop' : 'thief';
        window.playerRole = (roomId === '99999') ? 'thief' : 'cop';

        for (let i = 1; i <= 4; i++) {
            bots[`bot_${botRole}_${i}`] = { 
                name: `בוט ${botRole === 'cop' ? 'שוטר' : 'גנב'} ${i}`, 
                role: botRole, 
                lat: centerLat + (Math.random() - 0.5)*0.005, 
                lng: centerLng + (Math.random() - 0.5)*0.005, 
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
            isOffline: false
        };
        if (window.playerRole === 'cop') bots[window.playerId].inStation = true;

        const updates = {};
        updates[`rooms/${roomId}/status`] = 'playing';
        updates[`rooms/${roomId}/gameStartTime`] = Date.now();
        updates[`rooms/${roomId}/host`] = 'qa_host';
        updates[`rooms/${roomId}/players`] = bots; 
        
        updates[`game/${roomId}/arena`] = arenaData;
        updates[`game/${roomId}/players`] = bots;
        
        // עקיפה אגרסיבית של מנגנון התחקיר (Briefing)[cite: 7]
        updates[`game/${roomId}/briefing`] = { active: false, timeLeft: 0, complete: true }; 

        window.db.ref().update(updates).then(() => {
            document.getElementById('briefing-overlay').style.display = 'none';
            // טעינת הזירה מיד
            if (typeof enterGameScene === 'function') enterGameScene();
            // הפעלת מנוע הבוטים
            startBotEngine(roomId, arenaData);
        });

    } catch (e) {
        alert("שגיאת חישוב QA: " + e.message);
    }
}

function startBotEngine(roomId, arenaData) {
    const polygon = turf.polygon([[...arenaData.points.map(p => [p[1], p[0]]), [arenaData.points[0][1], arenaData.points[0][0]]]]);
    
    // מזיז את הבוטים כל 3 שניות
    setInterval(() => {
        if (!window.db) return;
        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;
            
            const botUpdates = {};
            Object.keys(players).forEach(id => {
                if (id.startsWith('bot_')) {
                    // תזוזה אקראית קטנה
                    let newLat = (players[id].lat) + (Math.random() - 0.5) * 0.0003;
                    let newLng = (players[id].lng) + (Math.random() - 0.5) * 0.0003;
                    
                    // מניעת יציאה מגבולות הזירה (בוט חוקי)
                    const pt = turf.point([newLng, newLat]);
                    if (!turf.booleanPointInPolygon(pt, polygon)) {
                        newLat = players[id].lat; // ביטול תזוזה
                        newLng = players[id].lng;
                    }

                    botUpdates[`game/${roomId}/players/${id}/lat`] = newLat;
                    botUpdates[`game/${roomId}/players/${id}/lng`] = newLng;
                    botUpdates[`game/${roomId}/players/${id}/t`] = Date.now(); 
                }
            });
            window.db.ref().update(botUpdates);
        });
    }, 3000);
}