// lobby.js - Phase 9.5: Single Player Module & Zero-Latency Transition

let playerId = localStorage.getItem('tb_uuid') || 'p_' + Math.floor(Math.random() * 999999);
localStorage.setItem('tb_uuid', playerId);

let playerName = localStorage.getItem('tb_name') || "";
let currentRoom = null;

/**
 * החלפת תצוגת הגדרות לפי מצב משחק (שחקן יחיד/רב-משתתפים)
 */
function toggleSinglePlayerOpts() {
    const radio = document.querySelector('input[name="gameMode"]:checked');
    const mode = radio ? radio.value : 'multi';
    const opts = document.getElementById('single-player-opts');
    const roomInput = document.getElementById('room-code-input');
    const joinBtn = document.getElementById('btn-join');

    if (mode === 'single') {
        if(opts) opts.style.display = 'block';
        if(roomInput) roomInput.style.display = 'none';
        if(joinBtn) joinBtn.style.display = 'none';
    } else {
        if(opts) opts.style.display = 'none';
        if(roomInput) roomInput.style.display = 'block';
        if(joinBtn) joinBtn.style.display = 'flex';
    }
}

/**
 * יצירת חדר חדש - תמיכה בבוטים וב-Zero Latency
 */
function createRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    if (!inputName) return alert("הכנס שם");
    playerName = inputName;
    localStorage.setItem('tb_name', playerName);

    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoom = roomId;
    window.currentRoom = roomId;
    window.playerId = playerId;

    const gameMode = document.querySelector('input[name="gameMode"]:checked').value;
    const roomData = { 
        status: 'lobby', 
        host: playerId, 
        createdAt: Date.now(), 
        gameMode: gameMode 
    };

    if (gameMode === 'single') {
        roomData.difficulty = document.getElementById('bot-difficulty').value;
        roomData.botCount = parseInt(document.getElementById('bot-count').value) || 3;
    }

    // Zero-Latency: שולחים את נתוני החדר ומיד ממשיכים ליצירת השחקנים
    window.db.ref(`rooms/${roomId}`).set(roomData);

    const updates = {};
    updates[`rooms/${roomId}/players/${playerId}`] = { name: playerName, role: 'thief', t: Date.now() };

    // הזרקת בוטים למפה במידה ונבחר מצב שחקן יחיד
    if (gameMode === 'single') {
        for (let i = 1; i <= roomData.botCount; i++) {
            updates[`rooms/${roomId}/players/bot_cop_${i}`] = { 
                name: `שוטר ${i} (בוט)`, 
                role: 'cop', 
                t: Date.now() 
            };
        }
    }

    // שליחת כל העדכונים במכה אחת ומעבר מיידי ללובי
    window.db.ref().update(updates);
    joinRoomLogic(roomId);
}

function joinRoom() {
    const roomId = document.getElementById('room-code-input').value.trim();
    // תמיכה בכניסה ישירה לחדרי QA
    if (roomId === '99999' || roomId === '88888') return initQARoom(roomId);
    
    window.db.ref(`rooms/${roomId}`).once('value', snap => {
        if (!snap.exists()) return alert("חדר לא נמצא");
        joinRoomLogic(roomId);
    });
}

/**
 * לוגיקת המעבר ללובי והאזנה לתחילת משחק
 */
function joinRoomLogic(roomId) {
    window.currentRoom = roomId;
    window.playerId = playerId;
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('display-room-code').innerText = roomId;

    window.db.ref(`rooms/${roomId}`).on('value', snap => {
        const data = snap.val();
        if (!data) return;

        const isHost = data.host === playerId;
        if (isHost && data.status !== 'playing') {
            document.getElementById('btn-start-game').style.display = 'block';
        }

        // ברגע שהסטטוס משתנה ל-Playing, עוברים לסצנה הטקטית
        if (data.status === 'playing') {
            window.db.ref(`rooms/${roomId}`).off();
            window.playerRole = data.players[playerId].role;
            enterGameScene();
        }
    });
}

function startGame() {
    if (!currentRoom) return;
    window.db.ref(`rooms/${currentRoom}`).update({ 
        status: 'playing', 
        gameStartTime: Date.now() 
    });
}