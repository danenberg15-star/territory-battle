// chat.js - Phase 5.2: Voice-Only Team Chat (Walkie-Talkie) - Optimized Layout

let recognition = null;
let chatVisible = true;

document.addEventListener('DOMContentLoaded', () => {
    const micBtn = document.getElementById('chat-mic-btn');
    const toggleBtn = document.getElementById('chat-toggle-btn');

    if (micBtn) {
        initSpeechRecognition();
        micBtn.addEventListener('click', toggleSpeechRecognition);
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleChatBody);
    }
});

/**
 * הסתרה/הצגה של גוף הצ'אט (הודעות + מיקרופון)
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
 * אתחול מנגנון זיהוי הדיבור של הדפדפן
 */
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.warn("Speech recognition not supported in this browser.");
        const micBtn = document.getElementById('chat-mic-btn');
        if (micBtn) micBtn.style.display = 'none';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = window.currentLang === 'he' ? 'he-IL' : 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
        const micBtn = document.getElementById('chat-mic-btn');
        if (micBtn) micBtn.classList.add('recording');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript && transcript.trim() !== "") {
            sendMessage(transcript.trim());
        }
    };

    recognition.onerror = (e) => {
        console.warn("Speech recognition error:", e.error);
        stopMicUI();
    };
    recognition.onend = () => stopMicUI();
}

function toggleSpeechRecognition() {
    if (!recognition) return;
    recognition.lang = window.currentLang === 'he' ? 'he-IL' : 'en-US';
    
    try {
        recognition.start();
    } catch (e) {
        recognition.stop();
    }
}

function stopMicUI() {
    const micBtn = document.getElementById('chat-mic-btn');
    if (micBtn) micBtn.classList.remove('recording');
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

    const senderHtml = `<span class="msg-sender">${data.senderName}:</span>`;
    
    msgEl.innerHTML = `${senderHtml} <span class="msg-text">${data.text}</span>`;

    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/**
 * שליטה על נראות הצ'אט במסך המשחק - תמיד מוצג
 */
function toggleChatVisibility(show) {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.style.display = 'flex';
        if (window.currentRoom) {
            initChat(window.currentRoom);
        }
    }
}