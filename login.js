// login.js - Screen 1: Tactical Dashboard UI, Auth, and Room Management

// ==========================================
// 1. Globals & Persistence
// ==========================================
let playerId = localStorage.getItem('tb_uuid');
if (!playerId) {
    playerId = 'p_' + Math.floor(Math.random() * 999999);
    localStorage.setItem('tb_uuid', playerId);
}

let playerName = localStorage.getItem('tb_name') || "";
let currentRoom = null;
let isHost = false;
let wakeLock = null;

let currentLang = 'he'; 
const i18n = {
    'he': { mainTitle: "Territory Battle", btnJoin: "הצטרף", btnCreate: "צור משחק חדש" },
    'en': { mainTitle: "Territory Battle", btnJoin: "Join", btnCreate: "Create Room" }
};

// ==========================================
// 2. Tactical UI Injection (Glassmorphism)
// ==========================================
function renderLoginScreen() {
    const loginContainer = document.getElementById('login-screen');
    if (!loginContainer) return;

    if (!document.getElementById('tactical-login-style')) {
        const style = document.createElement('style');
        style.id = 'tactical-login-style';
        style.innerHTML = `
            #login-screen {
                direction: rtl;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
            }
            .glass-panel {
                background: rgba(15, 23, 42, 0.5);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(56, 189, 248, 0.2);
                border-radius: 24px;
                padding: 40px 30px;
                width: 90%;
                max-width: 380px;
                display: flex;
                flex-direction: column;
                align-items: center;
                box-shadow: 0 15px 35px rgba(0, 0, 0, 0.6);
                box-sizing: border-box;
            }
            .logo-tactical {
                width: 140px; height: 140px; object-fit: contain; margin-bottom: 5px;
                animation: breathe 3s infinite ease-in-out;
            }
            @keyframes breathe {
                0%, 100% { filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.3)); transform: scale(1); }
                50% { filter: drop-shadow(0 0 20px rgba(56, 189, 248, 0.8)); transform: scale(1.03); }
            }
            .game-title {
                color: #e0f2fe; font-size: 24px; font-weight: 900; margin-bottom: 25px;
                text-transform: uppercase; letter-spacing: 2px;
                text-shadow: 0 0 10px rgba(56,189,248,0.5); text-align: center;
            }
            .tactical-input {
                width: 100%; padding: 15px; margin-bottom: 15px; border-radius: 12px;
                border: 1px solid rgba(56, 189, 248, 0.3); background: rgba(30, 41, 59, 0.7);
                color: white; font-size: 16px; text-align: center; box-sizing: border-box;
                transition: all 0.3s ease; outline: none; font-family: inherit;
            }
            .tactical-input:focus {
                border-color: #38bdf8; box-shadow: 0 0 15px rgba(56, 189, 248, 0.4);
                background: rgba(30, 41, 59, 0.9);
            }

            /* Toggle Switch — תיקון RTL: האפשרות הימנית היא ברירת מחדל (שוטרים מול גנבים) */
            .mode-toggle-wrapper {
                display: flex; align-items: center; justify-content: space-between; width: 100%;
                background: rgba(15, 23, 42, 0.6); padding: 12px 20px; border-radius: 50px;
                border: 1px solid rgba(56, 189, 248, 0.2); margin-bottom: 20px; box-sizing: border-box;
            }
            .mode-lbl {
                font-size: 13px; font-weight: 700; color: #64748b;
                transition: 0.3s; flex: 1; text-align: center; cursor: pointer;
            }
            .mode-lbl.active { color: #38bdf8; text-shadow: 0 0 8px rgba(56,189,248,0.5); }
            .switch {
                position: relative; display: inline-block;
                width: 54px; height: 30px; margin: 0 10px; flex-shrink: 0;
            }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider-round {
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background-color: #334155; transition: .4s; border-radius: 30px;
                border: 1px solid #475569;
            }
            .slider-round:before {
                position: absolute; content: ""; height: 22px; width: 22px;
                left: 3px; bottom: 3px; background-color: #94a3b8;
                transition: .4s; border-radius: 50%;
            }
            input:checked + .slider-round { background-color: #0f172a; border-color: #38bdf8; }
            input:checked + .slider-round:before {
                transform: translateX(24px); background-color: #38bdf8; box-shadow: 0 0 8px #38bdf8;
            }

            /* Bot Settings */
            .bot-settings {
                width: 100%; display: none; flex-direction: column;
                align-items: center; animation: fade-in 0.3s ease-out; margin-bottom: 5px;
            }
            @keyframes fade-in {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }

            /* Dial (חוגת רדיו) */
            .dial-wrapper {
                width: 100%; display: flex; flex-direction: column;
                align-items: center; margin-bottom: 18px;
            }
            .dial-label {
                font-size: 12px; font-weight: 700; color: #94a3b8;
                margin-bottom: 10px; letter-spacing: 1px;
            }
            .dial-control {
                display: flex; align-items: center; justify-content: center;
                gap: 0; width: 100%;
                background: rgba(15, 23, 42, 0.7);
                border: 1px solid rgba(56, 189, 248, 0.25);
                border-radius: 50px; overflow: hidden;
            }
            .dial-btn {
                background: transparent; border: none; color: #38bdf8;
                font-size: 22px; font-weight: 900; cursor: pointer;
                padding: 10px 20px; transition: background 0.15s;
                flex-shrink: 0; line-height: 1;
            }
            .dial-btn:active { background: rgba(56, 189, 248, 0.15); }
            .dial-value {
                flex: 1; text-align: center; font-size: 28px; font-weight: 900;
                color: #38bdf8; text-shadow: 0 0 10px rgba(56,189,248,0.5);
                min-width: 80px; padding: 8px 0; line-height: 1;
            }
            .dial-value.text-val {
                font-size: 16px; font-weight: 800; color: #e0f2fe; text-shadow: none;
            }

            /* Buttons */
            .btn-tactical {
                width: 100%; padding: 16px; border-radius: 12px; border: none;
                font-size: 17px; font-weight: 800; color: white; cursor: pointer;
                margin-bottom: 12px; transition: all 0.2s ease;
                display: flex; align-items: center; justify-content: center; letter-spacing: 1px;
            }
            .btn-primary {
                background: linear-gradient(135deg, #1e40af, #3b82f6);
                box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
            }
            .btn-primary:active { transform: translateY(2px); box-shadow: 0 2px 5px rgba(59, 130, 246, 0.4); }
            .btn-danger {
                background: linear-gradient(135deg, #991b1b, #ef4444);
                box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
                margin-top: 10px; margin-bottom: 0;
            }
            .btn-danger:active { transform: translateY(2px); box-shadow: 0 2px 5px rgba(239, 68, 68, 0.4); }

            #multi-inputs { width: 100%; display: flex; flex-direction: column; }
            .divider { width: 100%; height: 1px; background: rgba(255,255,255,0.1); margin: 15px 0; }
        `;
        document.head.appendChild(style);
    }

    loginContainer.innerHTML = `
        <div class="glass-panel">
            <img src="LOGO 512.webp" alt="Logo" class="logo-tactical">
            <div class="game-title" id="lbl-main-title">Territory Battle</div>
            
            <input type="text" id="player-name" class="tactical-input"
                placeholder="הכנס שם שחקן" value="${playerName}" autocomplete="off" />

            <!-- תיקון RTL: שוטרים מול גנבים בצד ימין (ברירת מחדל, unchecked) -->
            <!-- שחק נגד בוטים בצד שמאל (checked) -->
            <div class="mode-toggle-wrapper">
                <span id="lbl-single" class="mode-lbl"
                    onclick="document.getElementById('mode-toggle').checked=true; updateModeUI();">
                    שחק נגד בוטים
                </span>
                <label class="switch">
                    <input type="checkbox" id="mode-toggle" onchange="updateModeUI()">
                    <span class="slider-round"></span>
                </label>
                <span id="lbl-multi" class="mode-lbl active"
                    onclick="document.getElementById('mode-toggle').checked=false; updateModeUI();">
                    שוטרים מול גנבים
                </span>
            </div>

            <!-- הגדרות בוטים -->
            <div id="bot-settings" class="bot-settings">

                <!-- חוגת כמות שוטרים -->
                <div class="dial-wrapper">
                    <div class="dial-label">כמות שוטרים (בוטים)</div>
                    <div class="dial-control">
                        <button class="dial-btn" onclick="changeBotCount(-1)">‹</button>
                        <div class="dial-value" id="bot-count-display">3</div>
                        <button class="dial-btn" onclick="changeBotCount(1)">›</button>
                    </div>
                </div>

                <!-- חוגת רמת קושי -->
                <div class="dial-wrapper">
                    <div class="dial-label">רמת קושי</div>
                    <div class="dial-control">
                        <button class="dial-btn" onclick="changeDifficulty(-1)">‹</button>
                        <div class="dial-value text-val" id="difficulty-display">מיומן</div>
                        <button class="dial-btn" onclick="changeDifficulty(1)">›</button>
                    </div>
                </div>

                <!-- שדות נסתרים לשמירת הערכים -->
                <input type="hidden" id="bot-slider" value="3">
                <input type="hidden" id="bot-difficulty" value="skilled">
            </div>

            <div id="multi-inputs">
                <input type="number" id="room-code-input" class="tactical-input"
                    placeholder="קוד משחק" autocomplete="off" />
                <button class="btn-tactical btn-primary" id="btn-join" onclick="joinRoom()">הצטרף</button>
            </div>
            
            <div class="divider"></div>
            
            <button class="btn-tactical btn-danger" id="btn-create" onclick="createRoom()">צור משחק חדש</button>
        </div>
    `;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('room')) {
        document.getElementById('room-code-input').value = urlParams.get('room');
    }

    setLanguage('he');
}

// ==========================================
// 3. Dial Controls
// ==========================================
const BOT_MIN = 1;
const BOT_MAX = 5;
let botCount = 3;

const DIFFICULTIES = ['rookie', 'skilled', 'elite'];
const DIFFICULTY_LABELS = { rookie: 'טירון', skilled: 'מיומן', elite: 'עילית' };
let difficultyIndex = 1; // ברירת מחדל: מיומן

function changeBotCount(delta) {
    botCount = Math.min(BOT_MAX, Math.max(BOT_MIN, botCount + delta));
    const display = document.getElementById('bot-count-display');
    const hidden = document.getElementById('bot-slider');
    if (display) display.innerText = botCount;
    if (hidden) hidden.value = botCount;
}

function changeDifficulty(delta) {
    difficultyIndex = (difficultyIndex + delta + DIFFICULTIES.length) % DIFFICULTIES.length;
    const key = DIFFICULTIES[difficultyIndex];
    const display = document.getElementById('difficulty-display');
    const hidden = document.getElementById('bot-difficulty');
    if (display) display.innerText = DIFFICULTY_LABELS[key];
    if (hidden) hidden.value = key;
}

// ==========================================
// 4. Logic & Handlers
// ==========================================
window.onload = () => {
    renderLoginScreen();
};

function updateModeUI() {
    // תיקון: checked = נגד בוטים (שמאל), unchecked = שוטרים מול גנבים (ימין)
    const isSingle = document.getElementById('mode-toggle').checked;
    document.getElementById('bot-settings').style.display = isSingle ? 'flex' : 'none';
    document.getElementById('multi-inputs').style.display = isSingle ? 'none' : 'flex';

    document.getElementById('lbl-multi').classList.toggle('active', !isSingle);
    document.getElementById('lbl-single').classList.toggle('active', isSingle);
}

function setLanguage(lang) {
    currentLang = lang;
    document.dir = lang === 'he' ? 'rtl' : 'ltr';
    const t = i18n[lang];

    const mainTitle = document.getElementById('lbl-main-title');
    if (mainTitle) mainTitle.innerHTML = t.mainTitle;
    const btnJoin = document.getElementById('btn-join');
    if (btnJoin) btnJoin.innerHTML = t.btnJoin;
    const btnCreate = document.getElementById('btn-create');
    if (btnCreate) btnCreate.innerHTML = t.btnCreate;
}

function toggleLanguage() { setLanguage(currentLang === 'he' ? 'en' : 'he'); }

async function enableWakeLock() {
    try {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
        console.warn("WakeLock failed");
    }
}

// ==========================================
// 5. Room Actions (Auth & Setup)
// ==========================================
function createRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    if (!inputName) return alert("הכנס שם");
    playerName = inputName;
    localStorage.setItem('tb_name', playerName);

    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    currentRoom = roomId;
    isHost = true;
    enableWakeLock();

    const isSingle = document.getElementById('mode-toggle').checked;
    const gameMode = isSingle ? 'single' : 'multi';

    const roomData = {
        status: 'lobby',
        host: playerId,
        createdAt: Date.now(),
        gameMode: gameMode,
        players: {}
    };

    if (isSingle) {
        roomData.difficulty = document.getElementById('bot-difficulty').value;
        roomData.botCount = parseInt(document.getElementById('bot-slider').value) || 3;
    }

    roomData.players[playerId] = {
        name: playerName,
        role: 'thief',
        t: Date.now(),
        isOffline: false,
        disconnectedAt: null
    };

    if (isSingle) {
        for (let i = 1; i <= roomData.botCount; i++) {
            roomData.players[`bot_cop_${i}`] = {
                name: `שוטר ${i} (בוט)`,
                role: 'cop',
                t: Date.now()
            };
        }
    }

    window.db.ref(`rooms/${roomId}`).set(roomData).then(() => {
        if (typeof joinRoomLogic === 'function') joinRoomLogic(roomId);
    });
}

function joinRoom() {
    const inputName = document.getElementById('player-name').value.trim();
    const roomId = document.getElementById('room-code-input').value.trim();
    if (!inputName || !roomId) return alert("מלא שם וקוד משחק");

    if (roomId === '99999' || roomId === '88888') {
        playerName = inputName;
        currentRoom = roomId;
        enableWakeLock();
        if (typeof initQARoom === 'function') initQARoom(roomId);
        return;
    }

    playerName = inputName;
    currentRoom = roomId;
    localStorage.setItem('tb_name', playerName);
    enableWakeLock();

    window.db.ref(`rooms/${roomId}`).once('value', snap => {
        if (!snap.exists()) return alert("המשחק לא נמצא");

        window.db.ref(`rooms/${roomId}/players/${playerId}`).update({
            name: playerName,
            role: 'thief',
            t: Date.now(),
            isOffline: false,
            disconnectedAt: null
        }).then(() => {
            if (typeof joinRoomLogic === 'function') joinRoomLogic(roomId);
        });
    });
}