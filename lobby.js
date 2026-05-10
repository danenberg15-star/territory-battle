// lobby.js - Screen 2: Waiting Lobby, Player Rendering, and Drag & Drop

let activeTouchElement = null;
let initialX = 0;
let initialY = 0;

// ==========================================
// 1. UI Injection (Exact original design)
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
    
    if (typeof setLanguage === 'function') setLanguage(currentLang);
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

        const updates = {};
        updates[`rooms/${currentRoom}/status`] = 'playing';
        updates[`rooms/${currentRoom}/gameStartTime`] = Date.now();
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