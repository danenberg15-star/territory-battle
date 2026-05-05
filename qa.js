// qa.js - QA Room Initialization with GPS Failsafe

function initQARoom(roomId) {
    window.currentRoom = roomId;
    window.playerId = 'p_qa_' + Date.now();
    window.playerName = "QA Tester";
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('briefing-overlay').style.display = 'flex';
    document.getElementById('briefing-status').innerText = "מכין זירת QA...";

    let locationResolved = false;

    // הפונקציה שבונה את המפה - מופעלת בין אם ה-GPS עבד ובין אם נכשל
    const setupQA = (lat, lng) => {
        if (locationResolved) return;
        locationResolved = true;
        
        // יצירת זירה מיידית בשרת סביב נקודת הציון
        const arenaData = {
            points: [[lat+0.001, lng+0.001], [lat+0.001, lng-0.001], [lat-0.001, lng-0.001], [lat-0.001, lng+0.001]],
            policeStation: { lat: lat, lng: lng, radius: 20 }
        };

        const updates = {};
        updates[`game/${roomId}/arena`] = arenaData;
        updates[`game/${roomId}/briefing/complete`] = true;
        updates[`rooms/${roomId}/status`] = 'playing';
        updates[`rooms/${roomId}/host`] = window.playerId; 
        updates[`rooms/${roomId}/players/${window.playerId}`] = { 
            name: "QA", 
            role: roomId === '99999' ? 'thief' : 'cop', 
            lat: lat, 
            lng: lng 
        };

        window.db.ref().update(updates).then(() => {
            enterGameScene();
        });
    };

    // GPS Failsafe: אם תוך 3 שניות אין תשובה מה-GPS, כנס לדיפולט
    setTimeout(() => {
        if (!locationResolved) {
            console.warn("GPS Timeout - Using default location");
            setupQA(32.0853, 34.7818); // תל אביב
        }
    }, 3000);

    // ניסיון משיכת GPS אמיתי
    navigator.geolocation.getCurrentPosition(
        (pos) => setupQA(pos.coords.latitude, pos.coords.longitude),
        (err) => setupQA(32.0853, 34.7818),
        { enableHighAccuracy: true, timeout: 2500 }
    );
}