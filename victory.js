// victory.js - Handles the Victory Screen and Confetti Animation

function showVictoryScreen(winningTeam) {
    // Hide Game UI Elements
    document.getElementById('game-header').style.display = 'none';
    document.getElementById('map').style.display = 'none';
    document.getElementById('controls-container').style.display = 'none';
    document.getElementById('exit-btn').style.display = 'none';

    // Show Victory Screen
    const victoryScreen = document.getElementById('victory-screen');
    victoryScreen.style.display = 'flex';

    // Set Content Based on Winner & Language
    const iconEl = document.getElementById('victory-icon');
    const titleEl = document.getElementById('victory-title');
    const btnEl = document.getElementById('btn-back-lobby');

    const isHebrew = window.currentLang === 'he';
    btnEl.innerText = isHebrew ? "חזור ללובי" : "Back to Lobby";

    if (winningTeam === 'cops') {
        iconEl.innerText = '👮‍♂️';
        titleEl.innerText = isHebrew ? "השוטרים ניצחו!" : "Cops Win!";
        titleEl.style.color = '#3b82f6'; // Blue
    } else if (winningTeam === 'thieves') {
        iconEl.innerText = '🥷';
        titleEl.innerText = isHebrew ? "הגנבים ניצחו!" : "Thieves Win!";
        titleEl.style.color = '#ef4444'; // Red
    }

    // Fire Confetti Animation
    fireConfetti();
}

function fireConfetti() {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 5000 };

    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
            return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        
        // Fire from two random sources (left and right)
        confetti(Object.assign({}, defaults, { 
            particleCount, 
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } 
        }));
        confetti(Object.assign({}, defaults, { 
            particleCount, 
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } 
        }));
    }, 250);
}