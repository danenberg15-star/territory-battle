// chat.js - Phase 5.2: Operational Chat Logic

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    if (sendBtn && chatInput) {
        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
});

// אתחול האזנה להודעות חדשות בחדר
function initChat(roomId) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    // האזנה ל-20 ההודעות האחרונות בלבד לחסכון בביצועים[cite: 6]
    window.db.ref(`game/${roomId}/chat`).limitToLast(20).on('child_added', (snapshot) => {
        const msgData = snapshot.val();
        renderMessage(msgData);
    });
}

// שליחת הודעה ל-Firebase[cite: 6]
function sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const text = chatInput.value.trim();

    if (!text || !window.currentRoom) return;

    const newMessage = {
        senderId: window.playerId,
        senderName: window.playerName,
        role: window.playerRole,
        text: text,
        t: firebase.database.ServerValue.TIMESTAMP
    };

    window.db.ref(`game/${window.currentRoom}/chat`).push(newMessage)
        .then(() => {
            chatInput.value = ""; // ניקוי שדה ההזנה
        })
        .catch(err => console.error("Chat error:", err));
}

// הצגת הודעה על המסך[cite: 6]
function renderMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    const isSelf = data.senderId === window.playerId;
    const msgEl = document.createElement('div');
    msgEl.className = `msg ${isSelf ? 'msg-self' : 'msg-other'}`;

    // הוספת שם השולח אם זה לא המשתמש עצמו
    const senderHtml = isSelf ? "" : `<span class="msg-sender">${data.senderName}</span>`;
    
    msgEl.innerHTML = `
        ${senderHtml}
        <span class="msg-text">${data.text}</span>
    `;

    messagesDiv.appendChild(msgEl);
    
    // גלילה אוטומטית להודעה האחרונה
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// פונקציה להצגת/הסתרת הצ'אט לפי מצב המשחק
function toggleChatVisibility(show) {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.style.display = show ? 'flex' : 'none';
        if (show) initChat(window.currentRoom);
    }
}