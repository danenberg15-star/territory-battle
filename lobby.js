// lobby.js - Screen 2: Waiting Lobby, Player Rendering, and Drag & Drop

// ==========================================
// 4. Lobby Logic & Rendering
// ==========================================
function joinRoomLogic(roomId) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('display-room-code').innerText = roomId;
    
    window.db.ref(`rooms/${roomId}`).on('value', snap => {
        const roomData = snap.val();
        if (!roomData) return;
        
        isHost = (roomData.host === playerId);
        if (isHost && roomData.status !== 'playing') {
            document.getElementById('btn-start-game').style.display = 'block';
        }
        
        if (roomData.status === 'playing') {
            window.db.ref(`rooms/${roomId}`).off(); 
            window.isHost = isHost; 
            window.playerRole = roomData.players[playerId]?.role || 'thief';
            window.currentRoom = currentRoom;
            window.playerId = playerId;
            window.currentLang = currentLang;
            if(typeof enterGameScene === 'function') enterGameScene();
            return;
        }
        renderLobbyPlayers(roomData.players || {}, roomData.gameMode);
    });
}

function renderLobbyPlayers(players, gameMode) {
    const copsDiv = document.getElementById('players-cops');
    const thievesDiv = document.getElementById('players-thieves');
    copsDiv.innerHTML = ""; 
    thievesDiv.innerHTML = "";
    
    Object.keys(players).forEach(id => {
        const p = players[id];
        const div = document.createElement('div');
        div.className = 'player-item';
        div.innerText = p.name + (id === playerId ? " (אתה)" : "");
        
        // במשחק קבוצה נגד בוטים, מונעים מהמנהל לגרור שחקנים לשוטרים
        if (isHost && !id.startsWith('bot_') && gameMode !== 'single') {
            div.classList.add('draggable');
            div.addEventListener('touchstart', (e) => handleTouchStart(e, id, div), { passive: false });
            div.addEventListener('touchmove', handleTouchMove, { passive: false });
            div.addEventListener('touchend', (e) => handleTouchEnd(e, id, div));
        }
        
        if (p.role === 'cop') copsDiv.appendChild(div); 
        else thievesDiv.appendChild(div);
    });
}

// ==========================================
// 5. Drag & Drop Logic
// ==========================================
function handleTouchStart(e, id, el) {
    activeTouchElement = el;
    activeTouchElement.dataset.playerId = id;
    const touch = e.touches[0];
    const rect = el.getBoundingClientRect();
    initialX = touch.clientX - rect.left;
    initialY = touch.clientY - rect.top;
    
    el.style.position = 'fixed';
    el.style.zIndex = '9999';
    el.style.opacity = '0.8';
    moveTouchElement(touch.clientX, touch.clientY);
}

function handleTouchMove(e) {
    if (!activeTouchElement) return;
    e.preventDefault();
    moveTouchElement(e.touches[0].clientX, e.touches[0].clientY);
}

function moveTouchElement(x, y) {
    activeTouchElement.style.left = (x - initialX) + 'px';
    activeTouchElement.style.top = (y - initialY) + 'px';
}

function handleTouchEnd(e, id, el) {
    if (!activeTouchElement) return;
    const touch = e.changedTouches[0];
    el.style.display = 'none';
    const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
    el.style.display = 'block';
    
    el.style.position = '';
    el.style.zIndex = '';
    el.style.left = '';
    el.style.top = '';
    el.style.opacity = '';
    activeTouchElement = null;

    if (dropTarget) {
        const copsList = document.getElementById('list-cops');
        const thievesList = document.getElementById('list-thieves');
        const pId = el.dataset.playerId;
        if (copsList.contains(dropTarget)) {
            window.db.ref(`rooms/${currentRoom}/players/${pId}`).update({ role: 'cop' });
        } else if (thievesList.contains(dropTarget)) {
            window.db.ref(`rooms/${currentRoom}/players/${pId}`).update({ role: 'thief' });
        }
    }
}

// ==========================================
// 6. Game Start & Bot Injection
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
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent("בואו לשחק! " + link)}`, '_blank');
}

function exitGame() { 
    location.reload(); 
}