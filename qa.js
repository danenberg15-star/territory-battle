// qa.js - QA Sandbox Environment (Rooms 99999 / 88888)

function initQARoom(roomId) {
    if (!navigator.geolocation) {
        alert("לא ניתן לגשת ל-GPS. חובה לאשר מיקום לטובת סביבת ה-QA.");
        return;
    }

    document.getElementById('briefing-status').innerText = "מייצר סביבת QA וטריטוריה של 2 קמ\"ר...";
    document.getElementById('briefing-overlay').style.display = 'block';

    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setupQAServerData(roomId, lat, lng);
    }, (err) => {
        alert("שגיאת GPS: " + err.message);
    }, { enableHighAccuracy: true });
}

function setupQAServerData(roomId, centerLat, centerLng) {
    // 1. חישוב זירה של 2 קמ"ר סביב המשתמש (מרחק של 1 ק"מ מהמרכז לכל פינה ייצר ריבוע בשטח הזה)
    const center = turf.point([centerLng, centerLat]);
    const ne = turf.destination(center, 1, 45, {units: 'kilometers'}).geometry.coordinates;
    const se = turf.destination(center, 1, 135, {units: 'kilometers'}).geometry.coordinates;
    const sw = turf.destination(center, 1, 225, {units: 'kilometers'}).geometry.coordinates;
    const nw = turf.destination(center, 1, 315, {units: 'kilometers'}).geometry.coordinates;
    
    // Leaflet משתמש ב-[lat, lng] בניגוד ל-Turf
    const arenaPoints = [
        [ne[1], ne[0]],
        [se[1], se[0]],
        [sw[1], sw[0]],
        [nw[1], nw[0]]
    ];

    const arenaData = {
        points: arenaPoints,
        totalArea: 2000000, // 2 קמ"ר במ"ר
        policeStation: { lat: centerLat, lng: centerLng, radius: 178 } // 5% מהשטח הכולל
    };

    // 2. הכנת הבוטים
    const bots = {};
    for (let i = 1; i <= 4; i++) {
        bots['bot_cop_' + i] = { name: 'שוטר בוט ' + i, role: 'cop', lat: centerLat + (Math.random() - 0.5)*0.005, lng: centerLng + (Math.random() - 0.5)*0.005, t: Date.now(), inStation: true };
        bots['bot_thief_' + i] = { name: 'גנב בוט ' + i, role: 'thief', lat: centerLat + (Math.random() - 0.5)*0.005, lng: centerLng + (Math.random() - 0.5)*0.005, t: Date.now() };
    }
    
    // הוספת המשתמש הנוכחי בהתאם לקוד החדר
    window.playerRole = (roomId === '99999') ? 'thief' : 'cop';
    window.isHost = false; // ביטול הרשאות מנהל לטובת בדיקה נקייה
    bots[window.playerId] = { name: window.playerName + ' (QA)', role: window.playerRole, lat: centerLat, lng: centerLng, t: Date.now() };
    if (window.playerRole === 'cop') bots[window.playerId].inStation = true;

    // 3. הזרקת הנתונים ישירות ל-Firebase
    const updates = {};
    updates[`rooms/${roomId}`] = { status: 'playing', gameStartTime: Date.now() };
    updates[`game/${roomId}/arena`] = arenaData;
    updates[`game/${roomId}/players`] = bots;
    // דילוג על זמן תדריך בסביבת הבדיקות
    updates[`game/${roomId}/briefing`] = { active: false, timeLeft: 0, complete: true }; 

    window.db.ref().update(updates).then(() => {
        // 4. אתחול ממשק המשחק
        document.getElementById('briefing-overlay').style.display = 'none';
        if (typeof enterGameScene === 'function') enterGameScene();
        
        // 5. התחלת מנוע תנועת הבוטים
        startBotEngine(roomId);
    });
}

function startBotEngine(roomId) {
    setInterval(() => {
        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;
            
            const botUpdates = {};
            Object.keys(players).forEach(id => {
                if (id.startsWith('bot_')) {
                    // הזזת הבוט באופן רנדומלי (כמה מטרים בודדים)
                    const latChange = (Math.random() - 0.5) * 0.0002;
                    const lngChange = (Math.random() - 0.5) * 0.0002;
                    botUpdates[`game/${roomId}/players/${id}/lat`] = players[id].lat + latChange;
                    botUpdates[`game/${roomId}/players/${id}/lng`] = players[id].lng + lngChange;
                    botUpdates[`game/${roomId}/players/${id}/t`] = Date.now();
                }
            });
            window.db.ref().update(botUpdates);
        });
    }, 4000);
}