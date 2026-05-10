// chat.js - Phase 5.2: Team Chat with Native Keyboard Mic

let chatVisible = true;

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('chat-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleChatBody);
    }
});

/**
 * הסתרה/הצגה של גוף הצ'אט
 */
function toggleChatBody() {
    const body = document.getElementById('chat-body');
    const toggleBtn = document.getElementById('chat-toggle-btn');
    if (!body || !toggleBtn) return;

    chatVisible = !chatVisible;
    body.style.display = chatVisible ? 'flex' : 'none';
    toggleBtn.textContent = chatVisible ? '▲' : '▼';
}

/**
 * אתחול האזנה להודעות בערוץ של הקבוצה הנוכחית בלבד
 */
function initChat(roomId) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv || !window.db || !window.playerRole) return;

    messagesDiv.innerHTML = "";

    const teamChatPath = `game/${roomId}/chat_${window.playerRole}`;

    window.db.ref(teamChatPath).limitToLast(20).on('child_added', (snapshot) => {
        const msgData = snapshot.val();
        renderChatMessage(msgData);
    });

    const micBtn = document.getElementById('chat-mic-btn');
    const chatInput = document.getElementById('chat-input');

    if (micBtn && chatInput) {
        // לחיצה על כפתור המיקרופון - פותח מקלדת עם פוקוס
        // באנדרואיד המקלדת כוללת כפתור מיקרופון מובנה שעובד מיידית
        micBtn.addEventListener('click', () => {
            chatInput.focus();
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitChatInput();
            }
        });

        // זיהוי סיום הכתבה קולית - המקלדת מעדכנת את הערך ואז מאבדת פוקוס
        chatInput.addEventListener('blur', () => {
            const text = chatInput.value.trim();
            if (text) {
                submitChatInput();
            }
        });
    }
}

function submitChatInput() {
    const chatInput = document.getElementById('chat-input');
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (text) {
        sendMessage(text);
        chatInput.value = '';
    }
}

/**
 * שליחת הודעה לשרת לערוץ הקבוצתי
 */
function sendMessage(text) {
    if (!text || !window.currentRoom || !window.db || !window.playerRole) return;

    const newMessage = {
        senderId: window.playerId,
        senderName: window.playerName,
        role: window.playerRole,
        text: text,
        t: firebase.database.ServerValue.TIMESTAMP
    };

    const teamChatPath = `game/${window.currentRoom}/chat_${window.playerRole}`;

    window.db.ref(teamChatPath).push(newMessage)
        .catch(err => console.error("Team chat sync error:", err));
}

/**
 * הצגת ההודעה בממשק המשתמש
 */
function renderChatMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'msg';

    const isMine = data.senderId === window.playerId;
    msgEl.innerHTML = `<span class="msg-sender">${isMine ? 'אני' : data.senderName}:</span> <span class="msg-text">${data.text}</span>`;

    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/**
 * שליטה על נראות הצ'אט
 */
function toggleChatVisibility(show) {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.style.display = show ? 'flex' : 'none';
    }
}