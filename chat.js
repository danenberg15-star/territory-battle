// chat.js - Phase 5.2: Operational Chat & Voice-to-Text Engine

let recognition = null;

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    const micBtn = document.getElementById('chat-mic-btn');

    // מאזינים למקלדת וכפתור שליחה רגיל
    if (sendBtn && chatInput) {
        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // מאזין לכפתור הכתבה קולית
    if (micBtn) {
        initSpeechRecognition();
        micBtn.addEventListener('click', toggleSpeechRecognition);
    }
});

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
    
    // הגדרת שפה דינמית לפי הגדרות המשחק (עברית או אנגלית)[cite: 9]
    recognition.lang = window.currentLang === 'he' ? 'he-IL' : 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
        const micBtn = document.getElementById('chat-mic-btn');
        if (micBtn) micBtn.classList.add('recording');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.value = transcript;
            // שליחה אוטומטית מיד עם סיום ההכתבה לחיסכון בזמן בזירה
            sendMessage(); 
        }
    };

    recognition.onerror = () => stopMicUI();
    recognition.onend = () => stopMicUI();
}

function toggleSpeechRecognition() {
    if (!recognition) return;
    
    // עדכון שפה לפני כל הפעלה למקרה שהמשתמש שינה שפה באמצע המשחק[cite: 9]
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
 * אתחול האזנה להודעות בחדר הנוכחי
 */
function initChat(roomId) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv || !window.db) return;

    // ניקוי הודעות ישנות מתצוגה מקומית (אם קיימות)
    messagesDiv.innerHTML = "";

    // האזנה ל-20 ההודעות האחרונות בלבד ב-Firebase
    window.db.ref(`game/${roomId}/chat`).limitToLast(20).on('child_added', (snapshot) => {
        const msgData = snapshot.val();
        renderChatMessage(msgData);
    });
}

/**
 * שליחת הודעה לשרת
 */
function sendMessage() {
    const chatInput = document.getElementById('chat-input');
    const text = chatInput.value.trim();

    if (!text || !window.currentRoom || !window.db) return;

    const newMessage = {
        senderId: window.playerId,
        senderName: window.playerName,
        role: window.playerRole,
        text: text,
        t: firebase.database.ServerValue.TIMESTAMP
    };

    window.db.ref(`game/${window.currentRoom}/chat`).push(newMessage)
        .then(() => {
            chatInput.value = ""; 
        })
        .catch(err => console.error("Chat sync error:", err));
}

/**
 * הצגת ההודעה בממשק המשתמש (עיצוב מינימליסטי וזהה לכל ההודעות)
 */
function renderChatMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    const msgEl = document.createElement('div');
    // עיצוב אחיד ללא תלות במי השולח[cite: 10]
    msgEl.className = 'msg';

    // הצגת שם השולח בכל הודעה (כולל הודעות עצמיות)
    const senderHtml = `<span class="msg-sender">${data.senderName}:</span>`;
    
    msgEl.innerHTML = `
        ${senderHtml} <span class="msg-text">${data.text}</span>
    `;

    messagesDiv.appendChild(msgEl);
    
    // גלילה אוטומטית להודעה הכי חדשה
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

/**
 * שליטה על נראות הצ'אט במסך המשחק
 */
function toggleChatVisibility(show) {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.style.display = show ? 'flex' : 'none';
        if (show && window.currentRoom) {
            initChat(window.currentRoom);
        }
    }
}