// qa.js - QA Sandbox Environment (Rooms 99999 / 88888) - Fix: Ancestor Path Conflict

function initQARoom(roomId) {
    console.log("Starting QA Init for room:", roomId);
    window.currentRoom = roomId;
    window.playerId = localStorage.getItem('tb_uuid') || 'p_qa_' + Date.now();
    window.playerName = localStorage.getItem('tb_name') || "QA Tester";
    window.currentLang = typeof currentLang !== 'undefined' ? currentLang : 'he';

    document.getElementById('login-screen').style.display = 'none';

    if (!navigator.geolocation) {
        alert("לא ניתן לגשת ל-GPS. חובה לאשר מיקום לטובת סביבת ה-QA.");
        return;
    }

    document.getElementById('briefing-status').innerText = "מייצר סביבת QA וטריטוריה של 2 קמ\"ר...";
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
        const center = turf.point([centerLng, centerLat]);
        const ne = turf.destination(center, 1, 45, {units: 'kilometers'}).geometry.coordinates;
        const se = turf.destination(center, 1, 135, {units: 'kilometers'}).geometry.coordinates;
        const sw = turf.destination(center, 1, 225, {units: 'kilometers'}).geometry.coordinates;
        const nw = turf.destination(center, 1, 315, {units: 'kilometers'}).geometry.coordinates;
        
        const arenaPoints = [
            [ne[1], ne[0]],
            [se[1], se[0]],
            [sw[1], sw[0]],
            [nw[1], nw[0]]
        ];

        const arenaData = {
            points: arenaPoints,
            totalArea: 2000000, 
            policeStation: { lat: centerLat, lng: centerLng, radius: 178 } 
        };

        const bots = {};
        for (let i = 1; i <= 4; i++) {
            bots['bot_cop_' + i] = { 
                name: 'שוטר בוט ' + i, 
                role: 'cop', 
                lat: centerLat + (Math.random() - 0.5)*0.005, 
                lng: centerLng + (Math.random() - 0.5)*0.005, 
                t: Date.now(), 
                inStation: true,
                isOffline: false 
            };
            bots['bot_thief_' + i] = { 
                name: 'גנב בוט ' + i, 
                role: 'thief', 
                lat: centerLat + (Math.random() - 0.5)*0.005, 
                lng: centerLng + (Math.random() - 0.5)*0.005, 
                t: Date.now(),
                isOffline: false,
                flashUntil: 0 
            };
        }
        
        window.playerRole = (roomId === '99999') ? 'thief' : 'cop';
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
        // עדכון שדות ספציפיים בחדר כדי למנוע התנגשות נתיבים[cite: 5]
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
            startBotEngine(roomId);
        });

    } catch (e) {
        alert("שגיאת חישוב: " + e.message);
    }
}

function startBotEngine(roomId) {
    setInterval(() => {
        if (!window.db) return;
        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;
            
            const botUpdates = {};
            Object.keys(players).forEach(id => {
                if (id.startsWith('bot_')) {
                    const latChange = (Math.random() - 0.5) * 0.0002;
                    const lngChange = (Math.random() - 0.5) * 0.0002;
                    botUpdates[`game/${roomId}/players/${id}/lat`] = (players[id].lat) + latChange;
                    botUpdates[`game/${roomId}/players/${id}/lng`] = (players[id].lng) + lngChange;
                    botUpdates[`game/${roomId}/players/${id}/t`] = Date.now(); 
                }
            });
            window.db.ref().update(botUpdates);
        });
    }, 4000);
}