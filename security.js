// security.js - Privacy, Anti-Cheat, and Accidental Exit Prevention

// ==========================================
// 1. Prevent Accidental Exit (beforeunload)
// ==========================================
window.addEventListener('beforeunload', function (e) {
    // מציג אזהרה רק אם השחקן כבר נכנס לחדר (לובי או משחק פעיל)[cite: 9]
    if (window.currentRoom) {
        const confirmationMessage = window.currentLang === 'he' 
            ? "האם אתה בטוח שברצונך לעזוב? פעולה זו תנתק אותך מהמשחק." 
            : "Are you sure you want to leave? This will disconnect you from the game.";
        
        e.returnValue = confirmationMessage; // תקן לרוב הדפדפנים המודרניים[cite: 9]
        return confirmationMessage;          // תקן לדפדפנים ישנים[cite: 9]
    }
});

// ==========================================
// 2. Privacy & Anti-Cheat: Screen Blur
// ==========================================
function updateWatermark() {
    const watermarkEl = document.getElementById('watermark-content');
    if (watermarkEl) {
        const room = window.currentRoom || "----";
        const name = window.playerName || "Player";
        // הצגת קוד החדר ושם השחקן על גבי סימן המים[cite: 9]
        watermarkEl.innerText = `Room: ${room}\nPlayer: ${name}`;
    }
}

function handleVisibilityChange() {
    const overlay = document.getElementById('security-overlay');
    if (!overlay) return;

    // אם המסמך מאבד פוקוס / ממוזער[cite: 9]
    if (document.hidden) {
        if (window.currentRoom) updateWatermark();
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

// מאזינים מובנים של הדפדפן לשינויי פוקוס ונראות[cite: 9]
document.addEventListener("visibilitychange", handleVisibilityChange);

window.addEventListener("blur", () => {
    const overlay = document.getElementById('security-overlay');
    // גיבוי לדפדפני מובייל שבהם blur מופעל לפני ש-document.hidden מתעדכן
    if (overlay && window.currentRoom) {
        updateWatermark();
        overlay.style.display = 'flex';
    }
});

window.addEventListener("focus", () => {
    const overlay = document.getElementById('security-overlay');
    if (overlay) overlay.style.display = 'none';
});