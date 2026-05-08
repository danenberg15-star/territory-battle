// login.js - Screen 1: UI Injection, Logic, and Room Management

// ==========================================
// 1. UI Injection (CSS & HTML)
// ==========================================
function injectLoginUI() {
    // הזרקת עיצוב (CSS) ישירות לקובץ כדי לא לגעת ב-index.html
    const style = document.createElement('style');
    style.innerHTML = `
        #login-screen { 
            direction: rtl; 
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 20px; text-align: center;
        }
        .logo-main { width: 150px; height: 150px; margin-bottom: 20px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.4)); }
        .login-input { width: 100%; max-width: 320px; padding: 15px; margin-bottom: 15px; border-radius: 12px; border: 1px solid #38bdf8; background: #1e293b; color: white; font-size: 18px; text-align: center; box-sizing: border-box; }
        
        /* Toggle Switch */
        .mode-container { display: flex; align-items: center; justify-content: center; gap: 15px; margin-bottom: 25px; background: rgba(30, 41, 59, 0.5); padding: 10px 20px; border-radius: 50px; border: 1px solid rgba(56, 189, 248, 0.2); }
        .switch { position: relative; display: inline-block; width: 60px; height: 34px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider-round { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #334155; transition: .4s; border-radius: 34px; }
        .slider-round:before { position: absolute; content: ""; height: 26px; width: 26px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider-round { background-color: #38bdf8; }
        input:checked + .slider-round:before { transform: translateX(26px); }
        .mode-label { font-size: 14px; font-weight: bold; color: #94a3b8; }
        .mode-label.active { color: #38bdf8; }

        /* Range Slider */
        .bot-range-wrap { width: 100%; max-width: 300px; display: none; flex-direction: column; align-items: center; margin-bottom: 20px; }
        .range-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 5px; background: #334155; outline: none; margin: 20px 0; }
        .range-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 30px; height: 30px; border-radius: 50%; background: #38bdf8; cursor: pointer; border: 2px solid white; box-shadow: 0 0 10px rgba(56, 189, 248, 0.5); }
        .bot-count-display { font-size: 24px; font-weight: bold; color: #38bdf8; }
    `;
    document.head.appendChild(style);

    // בניית ה-HTML של המסך
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
        loginScreen.innerHTML = `
            <img src="LOGO 512.webp" alt="Logo" class="logo-main">
            <h1>Territory Battle</h1>
            
            <input type="text" id="player-name" class="login-input" placeholder="הכנס שם שחקן" value="${localStorage.getItem('tb_name') || ''}">

            <div class="mode-container">
                <span id="lbl-multi" class="mode-label active">רב משתתפים</span>
                <label class="switch">
                    <input type="checkbox" id="mode-toggle" onchange="updateModeUI()">
                    <span class="slider-round"></span>
                </label>
                <span id="lbl-single" class="mode-label">נגד בוטים</span>
            </div>

            <div id="bot-settings" class="bot-range-wrap">
                <label style="color:#38bdf8; font-size:14px;">כמות שוטרים (בוטים):</label>
                <input type="range" id="bot-slider" class="range-slider" min="1" max="5" value="3" oninput="document.getElementById('bot-val').innerText = this.value">
                <div id="bot-val" class="bot-count-display">3</div>
                <select id="bot-difficulty" class="login-input" style="margin-top:10px;">
                    <option value="rookie">רמת טירון</option>
                    <option value="skilled" selected>רמת מיומן</option>
                    <option value="elite">רמת עילית</option>
                </select>
            </div>

            <div id="multi-inputs" style="width:100%; max-width:320px; display: flex; flex-direction: column; align-items: center;">
                <input type="number" id="room-code-input" class="login-input" placeholder="קוד משחק">
                <button class="btn btn-blue" onclick="joinRoom()">הצטרף למשחק</button>
            </div>
            
            <button class="btn btn-red" onclick="createRoom()">צור משחק חדש</button>
        `;
    }
}

// ==========================================
// 2. UI Logic
// ==========================================
function updateModeUI() {
    const isSingle = document.getElementById('mode-toggle').checked;
    document.getElementById('bot-settings').style.display = isSingle ? 'flex' : 'none';
    document.getElementById('multi-inputs').style.display = isSingle ? 'none' : 'flex';
    
    document.getElementById('lbl-multi').classList.toggle('active', !isSingle);
    document.getElementById('lbl-single').classList.toggle('active', isSingle);
}

// ==========================================
// 3. Room & Player Logic
// ==========================================
let playerId = localStorage.getItem('tb_uuid') || 'p_' + Math.floor(Math.random() * 999999);
localStorage.setItem('tb_uuid', playerId);

let playerName = "";
let currentRoom = null;
let isHost = false;

function createRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    if (!inputName) return alert("הכנס שם");
    
    playerName = inputName;
    localStorage.setItem('tb_name', playerName);
    
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    const isSingle = document.getElementById('mode-toggle').checked;
    
    const roomData = {
        host: playerId,
        status: 'lobby',
        gameMode: isSingle ? 'single' : 'multi',
        botCount: isSingle ? parseInt(document.getElementById('bot-slider').value) : 0,
        botDifficulty: isSingle ? document.getElementById('bot-difficulty').value : 'skilled',
        players: {}
    };

    roomData.players[playerId] = { name: playerName, role: 'cop', t: Date.now() };

    window.db.ref(`rooms/${roomId}`).set(roomData).then(() => {
        isHost = true;
        currentRoom = roomId;
        window.location.hash = roomId;
        // התיקון הקריטי: קריאה ללוגיקה של הלובי מהקובץ lobby.js
        if (typeof joinRoomLogic === 'function') {
            joinRoomLogic(roomId);
        }
    });
}

function joinRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    const roomId = document.getElementById('room-code-input').value.trim();
    if (!inputName || !roomId) return alert("מלא שם וקוד חדר");

    playerName = inputName;
    localStorage.setItem('tb_name', playerName);
    
    window.db.ref(`rooms/${roomId}`).once('value', snap => {
        if (!snap.exists()) return alert("חדר לא נמצא");
        currentRoom = roomId;
        window.location.hash = roomId;
        
        window.db.ref(`rooms/${roomId}/players/${playerId}`).set({
            name: playerName,
            role: 'thief',
            t: Date.now()
        }).then(() => {
            // התיקון הקריטי: קריאה ללוגיקה של הלובי
            if (typeof joinRoomLogic === 'function') {
                joinRoomLogic(roomId);
            }
        });
    });
}

// הפעלת הזרקת ה-UI כשהדף נטען
document.addEventListener('DOMContentLoaded', injectLoginUI);