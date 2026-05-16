// lobby.js - Screen 2: Waiting Lobby, Player Rendering, and Drag & Drop

let activeTouchElement = null;
let initialX = 0;
let initialY = 0;

// ==========================================
// 1. UI Injection
// ==========================================
function renderLobbyScreenUI(roomId) {
    const lobbyContainer = document.getElementById('lobby-screen');
    if (!lobbyContainer) return;

    lobbyContainer.innerHTML = `
        <h2 id="lbl-lobby-title">לובי המתנה</h2>
        <div style="display: flex; align-items: center; width: 100%; max-width: 350px; margin-bottom: 20px;">
            <div class="room-code-box">קוד: <span id="display-room-code">${roomId}</span></div>
            <button class="btn-whatsapp-icon" onclick="shareWhatsApp()">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="white">
                    <path d="M12.031 0C5.385 0 0 5.385 0 12.031c0 2.128.552 4.195 1.6 6.02L.053 24l6.113-1.603c1.764.954 3.754 1.458 5.865 1.458 6.646 0 12.031-5.385 12.031-12.031S18.677 0 12.031 0zm3.626 17.15c-.156.44-1.295.992-1.847 1.054-.537.06-1.127.186-3.413-.761-2.92-1.21-4.787-4.225-4.93-4.417-.143-.192-1.178-1.568-1.178-2.986 0-1.418.736-2.115 1.002-2.392.266-.277.674-.352.887-.352.213 0 .426.002.605.009.213.008.497-.083.775.589.284.685.952 2.321 1.036 2.493.084.172.143.376.035.592-.108.216-.164.352-.326.544-.164.192-.345.426-.497.589-.168.176-.347.37-.148.712.199.342.885 1.463 1.895 2.361 1.305 1.159 2.404 1.516 2.748 1.673.344.157.545.132.748-.101.203-.233.882-1.025 1.118-1.378.236-.353.473-.294.787-.176.314.118 1.986.937 2.327 1.107.341.17.568.256.653.398.085.142.085.83-.071 1.27z"/>
                </svg>
            </button>
        </div>

        <!-- טוגל מצב משחק -->
        <div id="game-mode-toggle-container" style="width:100%; max-width:350px; margin-bottom:14px;">
            <div style="display:flex; background:rgba(30,41,59,0.9); border-radius:12px; border:1px solid rgba(56,189,248,0.3); overflow:hidden;">
                <button id="mode-btn-territory" onclick="setLobbyGameMode('territory')"
                    style="flex:1; padding:11px 6px; border:none; border-radius:12px 0 0 12px; font-size:13px; font-weight:bold; cursor:pointer; transition:0.2s; background:#1e40af; color:white;">
                    🗺️ כיבוש שטח
                </button>
                <button id="mode-btn-timer" onclick="setLobbyGameMode('timer')"
                    style="flex:1; padding:11px 6px; border:none; border-radius:0 12px 12px 0; font-size:13px; font-weight:bold; cursor:pointer; transition:0.2s; background:rgba(15,23,42,0.6); color:#94a3b8;">
                    ⏱️ משחק על זמן
                </button>
            </div>
        </div>

        <!-- סלידר זמן משחק (מוסתר כברירת מחדל) -->
        <div id="timer-duration-container" style="width:100%; max-width:350px; margin-bottom:14px; display:none;">
            <div style="background:rgba(30,41,59,0.85); border-radius:12px; border:1px solid rgba(56,189,248,0.25); padding:14px 18px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-size:13px; color:#94a3b8; font-weight:bold;">⏱️ זמן משחק</span>
                    <span id="timer-duration-label" style="font-size:18px; font-weight:900; color:#38bdf8;">10 דקות</span>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <button onclick="adjustTimerDuration(-1)"
                        style="width:36px; height:36px; border-radius:50%; background:#1e293b; border:2px solid #38bdf8; color:#38bdf8; font-size:20px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0;">−</button>
                    <input type="range" id="timer-duration-slider" min="1" max="60" value="10" step="1"
                        oninput="onTimerSliderChange(this.value)"
                        style="flex:1; height:6px; accent-color:#38bdf8; cursor:pointer;" />
                    <button onclick="adjustTimerDuration(1)"
                        style="width:36px; height:36px; border-radius:50%; background:#1e293b; border:2px solid #38bdf8; color:#38bdf8; font-size:20px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0;">+</button>
                </div>
            </div>
        </div>

        <div style="display: flex; width: 100%; max-width: 350px; flex-grow: 1;">
            <div class="team-list" id="list-cops">
                <div style="color:#3b82f6; font-weight:bold; text-align:center; margin-bottom: 10px;" id="lbl-cops-team">שוטרים 👮‍♂️</div>
                <div id="players-cops"></div>
            </div>
            <div class="team-list" id="list-thieves">
                <div style="color:#ef4444; font-weight:bold; text-align:center; margin-bottom: 10px;" id="lbl-thieves-team">גנבים 🥷</div>
                <div id="players-thieves"></div>
            </div>
        </div>
        <button class="btn btn-green" id="btn-start-game" style="display:none;" onclick="startGame()">התחל משחק</button>
    `;

    // אתחול מצב ברירת מחדל
    window._lobbyGameMode = 'territory';
    window._lobbyTimerMinutes = 10;

    if (typeof setLanguage === 'function') setLanguage(currentLang);
}

// ==========================================
// טוגל מצב משחק
// ==========================================
function setLobbyGameMode(mode) {
    window._lobbyGameMode = mode;

    const btnTerritory = document.getElementById('mode-btn-territory');
    const btnTimer = document.getElementById('mode-btn-timer');
    const timerContainer = document.getElementById('timer-duration-container');

    if (mode === 'territory') {
        if (btnTerritory) { btnTerritory.style.background = '#1e40af'; btnTerritory.style.color = 'white'; }
        if (btnTimer) { btnTimer.style.background = 'rgba(15,23,42,0.6)'; btnTimer.style.color = '#94a3b8'; }
        if (timerContainer) timerContainer.style.display = 'none';
    } else {
        if (btnTimer) { btnTimer.style.background = '#0f766e'; btnTimer.style.color = 'white'; }
        if (btnTerritory) { btnTerritory.style.background = 'rgba(15,23,42,0.6)'; btnTerritory.style.color = '#94a3b8'; }
        if (timerContainer) timerContainer.style.display = 'block';
    }
}

function onTimerSliderChange(val) {
    window._lobbyTimerMinutes = parseInt(val);
    const label = document.getElementById('timer-duration-label');
    if (label) label.innerText = `${val} דקות`;
}

function adjustTimerDuration(delta) {
    const slider = document.getElementById('timer-duration-slider');
    if (!slider) return;
    let val = parseInt(slider.value) + delta;
    val = Math.max(1, Math.min(60, val));
    slider.value = val;
    onTimerSliderChange(val);
}

// ==========================================
// 2. Lobby Logic & Rendering
// ==========================================
function joinRoomLogic(roomId) {
    renderLobbyScreenUI(roomId);

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';

    window.db.ref(`rooms/${roomId}`).on('value', snap => {
        const roomData = snap.val();
        if (!roomData) return;

        isHost = (roomData.host === playerId);
        const startBtn = document.getElementById('btn-start-game');
        if (isHost && roomData.status !== 'playing' && startBtn) {
            startBtn.style.display = 'block';
        }

        // רק המנהל רואה את כפתורי הטוגל
        const toggleContainer = document.getElementById('game-mode-toggle-container');
        const timerContainer = document.getElementById('timer-duration-container');
        if (toggleContainer) toggleContainer.style.display = isHost ? 'block' : 'none';

        if (roomData.status === 'playing') {
            window.db.ref(`rooms/${roomId}`).off();
            window.isHost = isHost;
            window.playerRole = roomData.players[playerId]?.role || 'thief';
            window.currentRoom = roomId;
            window.playerId = playerId;
            window.playerName = playerName;
            window.currentLang = currentLang;
            if (typeof enterGameScene === 'function') enterGameScene();
            return;
        }
        renderLobbyPlayers(roomData.players || {}, roomData.gameMode);
    });
}

function renderLobbyPlayers(players, gameMode) {
    const copsDiv = document.getElementById('players-cops');
    const thievesDiv = document.getElementById('players-thieves');
    if (!copsDiv || !thievesDiv) return;

    copsDiv.innerHTML = '';
    thievesDiv.innerHTML = '';

    Object.keys(players).forEach(id => {
        const p = players[id];
        const pDiv = document.createElement('div');
        pDiv.className = 'player-entry';
        pDiv.innerText = p.name + (id === playerId ? " (אתה)" : "");

        if (gameMode !== 'single' && !id.startsWith('bot_')) {
            pDiv.draggable = true;
            pDiv.setAttribute('data-id', id);
            pDiv.addEventListener('touchstart', handleTouchStart, { passive: false });
            pDiv.addEventListener('touchmove', handleTouchMove, { passive: false });
            pDiv.addEventListener('touchend', handleTouchEnd, { passive: false });
        }

        if (p.role === 'cop') copsDiv.appendChild(pDiv);
        else thievesDiv.appendChild(pDiv);
    });
}

// ==========================================
// 3. Drag & Drop Handlers (Touch Support)
// ==========================================
function handleTouchStart(e) {
    activeTouchElement = e.currentTarget;
    const touch = e.touches[0];
    initialX = touch.clientX;
    initialY = touch.clientY;
    activeTouchElement.style.zIndex = "1000";
}

function handleTouchMove(e) {
    if (!activeTouchElement) return;
    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - initialX;
    const dy = touch.clientY - initialY;
    activeTouchElement.style.transform = `translate(${dx}px, ${dy}px)`;
}

function handleTouchEnd(e) {
    if (!activeTouchElement) return;
    const pId = activeTouchElement.getAttribute('data-id');
    const touch = e.changedTouches[0];
    activeTouchElement.style.transform = "";
    activeTouchElement.style.zIndex = "";

    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    const copsList = document.getElementById('list-cops');
    const thievesList = document.getElementById('list-thieves');

    if (dropTarget && currentRoom) {
        if (copsList.contains(dropTarget)) {
            window.db.ref(`rooms/${currentRoom}/players/${pId}`).update({ role: 'cop' });
        } else if (thievesList.contains(dropTarget)) {
            window.db.ref(`rooms/${currentRoom}/players/${pId}`).update({ role: 'thief' });
        }
    }
    activeTouchElement = null;
}

// ==========================================
// 4. Game Operations
// ==========================================
function startGame() {
    window.db.ref(`rooms/${currentRoom}`).once('value', snap => {
        const roomData = snap.val();
        if (!roomData) return;

        const gamePlayers = {};
        Object.keys(roomData.players).forEach(id => {
            gamePlayers[id] = {
                role: roomData.players[id].role,
                name: roomData.players[id].name,
                t: Date.now(),
                lat: 0,
                lng: 0
            };
        });

        const lobbyMode = window._lobbyGameMode || 'territory';
        const lobbyTimer = window._lobbyTimerMinutes || 10;

        const updates = {};
        updates[`rooms/${currentRoom}/status`] = 'playing';
        updates[`rooms/${currentRoom}/gameStartTime`] = Date.now();
        updates[`rooms/${currentRoom}/victoryMode`] = lobbyMode;
        if (lobbyMode === 'timer') {
            updates[`rooms/${currentRoom}/timerMinutes`] = lobbyTimer;
        }
        updates[`game/${currentRoom}/players`] = gamePlayers;

        window.db.ref().update(updates);
    });
}

function shareWhatsApp() {
    const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    const text = currentLang === 'he' ?
        `בואו לשחק איתי ב-Territory Battle! כנסו לקישור: ${link}` :
        `Come play Territory Battle with me! Join here: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}