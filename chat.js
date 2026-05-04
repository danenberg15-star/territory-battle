// chat.js - Phase 5.2: Voice-Only Team Chat (Walkie-Talkie)

let recognition = null;

document.addEventListener('DOMContentLoaded', () => {
    const micBtn = document.getElementById('chat-mic-btn');

    // מאזין רק לכפתור מכשיר הקשר (הכתבה קולית)
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
    
    // הגדרת שפה דינמית לפי הגדרות המשחק (עברית או אנגלית)
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
            // שליחה ישירה לשרת ללא צורך בשורת קלט
            sendMessage(transcript.trim()); 
        }
    };

    recognition.onerror = () => stopMicUI();
    recognition.onend = () => stopMicUI();
}

function toggleSpeechRecognition() {
    if (!recognition) return;
    
    // עדכון שפה לפני כל הפעלה למקרה שהמשתמש שינה שפה באמצע המשחק
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

    // ניקוי הודעות ישנות מתצוגה מקומית (אם קיימות)
    messagesDiv.innerHTML = "";

    // האזנה רק לערוץ של התפקיד הנוכחי (chat_cop או chat_thief)
    const teamChatPath = `game/${roomId}/chat_${window.playerRole}`;
    
    window.db.ref(teamChatPath).limitToLast(20).on('child_added', (snapshot) => {
        const msgData = snapshot.val();
        renderChatMessage(msgData);
    });
}

/**
 * שליחת הודעה לשרת לערוץ הקבוצתי
 * @param {string} text - הטקסט שזוהה על ידי המיקרופון
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

    // שליחה רק לערוץ של התפקיד הנוכחי (chat_cop או chat_thief)
    const teamChatPath = `game/${window.currentRoom}/chat_${window.playerRole}`;

    window.db.ref(teamChatPath).push(newMessage)
        .catch(err => console.error("Team chat sync error:", err));
}

/**
 * הצגת ההודעה בממשק המשתמש (עיצוב מינימליסטי)
 */
function renderChatMessage(data) {
    const messagesDiv = document.getElementById('chat-messages');
    if (!messagesDiv) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'msg';

    // הצגת שם השולח בכל הודעה
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