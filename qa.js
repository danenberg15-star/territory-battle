// qa.js - Automated QA Sandbox Simulator (Rooms 99999 / 88888) - Large Arena (10,000 sqm)

// ==========================================
// משתנים גלובליים ל-QA
// ==========================================
window.qaMode = false;
window.qaBotEngineInterval = null;

/**
 * מאתחל חדר QA לפי מספר החדר (99999 או 88888)
 */
function initQARoom(roomId) {
    console.log("Starting Automated QA Simulator for room:", roomId);
    window.currentRoom = roomId;
    window.qaMode = true;
    window.playerId = localStorage.getItem('tb_uuid') || 'p_qa_' + Date.now();
    window.playerName = localStorage.getItem('tb_name') || "QA Tester";
    window.currentLang = typeof currentLang !== 'undefined' ? currentLang : 'he';

    document.getElementById('login-screen').style.display = 'none';

    document.getElementById('briefing-status').innerText = "מייצר זירת סימולציה (10,000 מ\"ר) ובוטים...";
    document.getElementById('briefing-overlay').style.display = 'flex';

    // במצב QA לא צריך GPS אמיתי — משתמשים במיקום ברירת מחדל (תל אביב)
    // אך אם GPS זמין נשתמש בו למיקום ראשוני בלבד
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            setupQAServerData(roomId, pos.coords.latitude, pos.coords.longitude);
        }, () => {
            // fallback: תל אביב
            setupQAServerData(roomId, 32.0853, 34.7818);
        }, { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 });
    } else {
        setupQAServerData(roomId, 32.0853, 34.7818);
    }
}

/**
 * הקמת נתוני השרת לסימולציה עם זירה של 10,000 מ"ר
 */
function setupQAServerData(roomId, centerLat, centerLng) {
    try {
        if (typeof turf === 'undefined') {
            alert("שגיאה: ספריית החישובים (Turf.js) לא נטענה. אנא רענן את העמוד.");
            return;
        }

        // ריבוע 100x100 מטר = 10,000 מ"ר סביב המיקום
        const center = turf.point([centerLng, centerLat]);
        const distToCornerKm = Math.sqrt(5000) / 1000;

        const ne = turf.destination(center, distToCornerKm, 45,  { units: 'kilometers' }).geometry.coordinates;
        const se = turf.destination(center, distToCornerKm, 135, { units: 'kilometers' }).geometry.coordinates;
        const sw = turf.destination(center, distToCornerKm, 225, { units: 'kilometers' }).geometry.coordinates;
        const nw = turf.destination(center, distToCornerKm, 315, { units: 'kilometers' }).geometry.coordinates;

        const arenaPoints = [
            [ne[1], ne[0]],
            [se[1], se[0]],
            [sw[1], sw[0]],
            [nw[1], nw[0]]
        ];

        const arenaData = {
            points: arenaPoints,
            totalArea: 10000,
            policeStation: { lat: centerLat, lng: centerLng, radius: 25 }
        };

        // חדר 88888: שחקן = שוטר, 4 גנבי-בוט
        // חדר 99999: שחקן = גנב, 1 שוטר-בוט
        const is88888 = (roomId === '88888');
        window.playerRole = is88888 ? 'cop' : 'thief';
        const botRole   = is88888 ? 'thief' : 'cop';
        const botCount  = is88888 ? 4 : 1;

        const bots = {};

        for (let i = 1; i <= botCount; i++) {
            const botId = `bot_${botRole}_${i}`;
            bots[botId] = {
                name: `בוט ${botRole === 'cop' ? 'שוטר' : 'גנב'} ${i}`,
                role: botRole,
                lat: centerLat + (Math.random() - 0.5) * 0.0005,
                lng: centerLng + (Math.random() - 0.5) * 0.0005,
                t: Date.now(),
                isOffline: false,
                inStation: (botRole === 'cop'),
                flashUntil: 0
            };
        }

        // השחקן עצמו
        window.myLat = centerLat;
        window.myLng = centerLng;
        window.isHost = false;

        bots[window.playerId] = {
            name: window.playerName + ' (QA)',
            role: window.playerRole,
            lat: centerLat,
            lng: centerLng,
            t: Date.now(),
            isOffline: false,
            inStation: (window.playerRole === 'cop')
        };

        const updates = {};
        updates[`rooms/${roomId}/status`]        = 'playing';
        updates[`rooms/${roomId}/gameStartTime`] = Date.now();
        updates[`rooms/${roomId}/host`]          = 'qa_host';
        updates[`rooms/${roomId}/players`]       = bots;

        updates[`game/${roomId}/arena`]    = arenaData;
        updates[`game/${roomId}/players`]  = bots;
        updates[`game/${roomId}/briefing`] = { active: false, timeLeft: 0, complete: true };

        window.db.ref().update(updates).then(() => {
            document.getElementById('briefing-overlay').style.display = 'none';
            if (typeof enterGameScene === 'function') enterGameScene();

            // מבטלים את ה-GPS הרגיל — במצב QA השחקן נע בחצים
            disableRealGpsForQA();

            // מציגים חצי ניווט
            showQAArrows(roomId, arenaData);

            // מפעילים מנוע בוטים
            startQABotEngine(roomId, arenaData, botRole);

            // חדר 88888: מאלצים חשיפת גנבים לשוטר
            if (is88888) {
                forceThiefVisibilityForCop();
            }
        });

    } catch (e) {
        alert("שגיאת חישוב QA: " + e.message);
        console.error(e);
    }
}

// ==========================================
// ביטול GPS אמיתי במצב QA
// ==========================================
function disableRealGpsForQA() {
    if (window.gpsWatchId !== null) {
        navigator.geolocation.clearWatch(window.gpsWatchId);
        window.gpsWatchId = null;
    }
    // patch: מונעים הפעלה מחדש של GPS אמיתי
    window._realStartGpsTracking = window.startRealGpsTracking;
    window.startRealGpsTracking = function() {
        console.log("[QA] GPS tracking disabled in QA mode.");
    };

    const gpsEl = document.getElementById('gps-status');
    if (gpsEl) {
        gpsEl.innerText = "QA 🎮";
        gpsEl.style.color = "#f59e0b";
    }
}

// ==========================================
// חצי ניווט על המסך
// ==========================================
function showQAArrows(roomId, arenaData) {
    // מסיר אם כבר קיים
    let existing = document.getElementById('qa-arrow-pad');
    if (existing) existing.remove();

    const pad = document.createElement('div');
    pad.id = 'qa-arrow-pad';
    pad.style.cssText = `
        position: fixed;
        bottom: 40px;
        right: 20px;
        z-index: 9000;
        display: grid;
        grid-template-columns: repeat(3, 52px);
        grid-template-rows: repeat(3, 52px);
        gap: 6px;
        pointer-events: auto;
    `;

    // 5 מטר בדרגות — ~0.000045 lat, ~0.000055 lng (קירוב סביר)
    const STEP_LAT = 0.000045;
    const STEP_LNG = 0.000055;

    const polyCoords = [
        ...arenaData.points.map(p => [p[1], p[0]]),
        [arenaData.points[0][1], arenaData.points[0][0]]
    ];
    const polygon = turf.polygon([polyCoords]);

    function movePlayer(dLat, dLng) {
        const newLat = window.myLat + dLat;
        const newLng = window.myLng + dLng;

        // בדיקת גבולות זירה
        const pt = turf.point([newLng, newLat]);
        if (!turf.booleanPointInPolygon(pt, polygon)) return;

        window.myLat = newLat;
        window.myLng = newLng;

        // עדכון מפה
        if (window.map) window.map.panTo([newLat, newLng], { animate: true, duration: 0.15 });

        // עדכון Firebase
        if (window.db && window.currentRoom && window.playerId) {
            window.db.ref(`game/${window.currentRoom}/players/${window.playerId}`).update({
                lat: newLat,
                lng: newLng,
                t: Date.now(),
                role: window.playerRole
            });
        }

        // הפעלת לוגיקת גנב אם צריך
        if (window.playerRole === 'thief' && window.isBriefingComplete && typeof updateThiefLogic === 'function') {
            updateThiefLogic(newLat, newLng);
        }
    }

    // עיצוב כפתור חץ
    function makeArrowBtn(label, dLat, dLng, gridArea) {
        const btn = document.createElement('button');
        btn.innerText = label;
        btn.style.cssText = `
            grid-area: ${gridArea};
            width: 52px;
            height: 52px;
            background: rgba(15, 23, 42, 0.88);
            border: 2px solid #38bdf8;
            color: #38bdf8;
            border-radius: 12px;
            font-size: 22px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            -webkit-user-select: none;
            touch-action: manipulation;
            box-shadow: 0 4px 14px rgba(0,0,0,0.7);
            transition: background 0.1s, transform 0.1s;
        `;
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            btn.style.background = 'rgba(56, 189, 248, 0.3)';
            btn.style.transform = 'scale(0.93)';
            movePlayer(dLat, dLng);
        });
        btn.addEventListener('pointerup', () => {
            btn.style.background = 'rgba(15, 23, 42, 0.88)';
            btn.style.transform = 'scale(1)';
        });
        return btn;
    }

    // סידור גריד 3x3: רק 4 כפתורי כיוון + אמצע ריק
    pad.style.gridTemplateAreas = `
        ". up ."
        "left . right"
        ". down ."
    `;

    pad.appendChild(makeArrowBtn('↑',  STEP_LAT,  0,        'up'));
    pad.appendChild(makeArrowBtn('↓', -STEP_LAT,  0,        'down'));
    pad.appendChild(makeArrowBtn('←',  0,        -STEP_LNG, 'left'));
    pad.appendChild(makeArrowBtn('→',  0,         STEP_LNG, 'right'));

    document.body.appendChild(pad);

    // label QA
    const label = document.createElement('div');
    label.style.cssText = `
        position: fixed;
        bottom: 175px;
        right: 20px;
        z-index: 9000;
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid #38bdf8;
        color: #38bdf8;
        font-size: 11px;
        font-weight: bold;
        padding: 4px 10px;
        border-radius: 8px;
        pointer-events: none;
        letter-spacing: 0.5px;
    `;
    label.innerText = `🎮 QA Mode — ${window.currentRoom}`;
    document.body.appendChild(label);
}

// ==========================================
// חשיפת גנבים לשוטר בחדר 88888
// ==========================================
function forceThiefVisibilityForCop() {
    // patch listenToOtherPlayers כך שגנבים תמיד מוצגים (ללא הסתרה)
    // עושים זאת על ידי override של הבדיקה שמסתירה גנבים ממפה
    window._qaForceShowThieves = true;
}

// ==========================================
// מנוע בוטים QA — הליכה איטית ורנדומלית
// ==========================================
function startQABotEngine(roomId, arenaData, botRole) {
    if (window.qaBotEngineInterval) clearInterval(window.qaBotEngineInterval);

    const polyCoords = [
        ...arenaData.points.map(p => [p[1], p[0]]),
        [arenaData.points[0][1], arenaData.points[0][0]]
    ];
    const polygon = turf.polygon([polyCoords]);

    // הליכה איטית: ~2-3 מטר לכל tick (tick כל 2 שניות)
    // 0.000025 lat/lng ~ 2.5 מטר
    const BOT_STEP = 0.000025;

    // כיווני הליכה לכל בוט (זוית אקראית שמשתנה מדי פעם)
    const botDirections = {};

    window.qaBotEngineInterval = setInterval(() => {
        if (!window.db || !window.currentRoom) return;

        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;

            const botUpdates = {};

            Object.keys(players).forEach(id => {
                if (!id.startsWith('bot_')) return;
                const b = players[id];

                // שינוי כיוון אקראי מדי ~5 tick
                if (!botDirections[id] || Math.random() < 0.2) {
                    botDirections[id] = Math.random() * 2 * Math.PI; // זוית ברדיאנים
                }

                const angle = botDirections[id];
                const nextLat = b.lat + Math.cos(angle) * BOT_STEP;
                const nextLng = b.lng + Math.sin(angle) * BOT_STEP;

                const nextPt = turf.point([nextLng, nextLat]);

                if (turf.booleanPointInPolygon(nextPt, polygon)) {
                    botUpdates[`game/${roomId}/players/${id}/lat`] = nextLat;
                    botUpdates[`game/${roomId}/players/${id}/lng`] = nextLng;
                    botUpdates[`game/${roomId}/players/${id}/t`]   = Date.now();

                    // עדכון שובל גנב-בוט ב-Firebase (לחדר 88888)
                    if (botRole === 'thief') {
                        updateBotThiefTrail(roomId, id, nextLat, nextLng);
                    }
                } else {
                    // הפוך כיוון
                    botDirections[id] = angle + Math.PI;
                }
            });

            if (Object.keys(botUpdates).length > 0) {
                window.db.ref().update(botUpdates);
            }
        });
    }, 2000);
}

// ==========================================
// שובל גנבי-בוט (חדר 88888)
// ==========================================
const _botTrails = {}; // id -> [{lat,lng}, ...]

function updateBotThiefTrail(roomId, botId, lat, lng) {
    if (!_botTrails[botId]) _botTrails[botId] = [];

    const trail = _botTrails[botId];
    trail.push([lat, lng]);

    // שמירה ל-Firebase (כל 3 נקודות כדי לא להציף)
    if (trail.length % 3 === 0) {
        window.db.ref(`game/${roomId}/trails/${botId}`).set({
            path: trail,
            t: Date.now()
        });
    }
}

// ==========================================
// Override: חשיפת גנבים תמיד בחדר 88888
// ==========================================
// נשמור פאטש על listenToOtherPlayers לאחר טעינת הסצנה
// הלוגיקה ב-game-play.js מסתירה גנבים ממשתמש שוטר אלא אם יש flashUntil
// במצב QA 88888 — נגדיר flashUntil מתמשך לכל גנב-בוט
function qaKeepThievesVisible(roomId) {
    if (window.playerRole !== 'cop' || roomId !== '88888') return;

    setInterval(() => {
        if (!window.db || !window.currentRoom) return;
        window.db.ref(`game/${roomId}/players`).once('value', snap => {
            const players = snap.val();
            if (!players) return;
            const updates = {};
            Object.keys(players).forEach(id => {
                if (id.startsWith('bot_thief')) {
                    // flashUntil תמיד בעתיד הרחוק → גנב תמיד "מהבהב" (נראה)
                    updates[`game/${roomId}/players/${id}/flashUntil`] = Date.now() + 10000;
                }
            });
            if (Object.keys(updates).length > 0) window.db.ref().update(updates);
        });
    }, 5000);
}

// ==========================================
// טייזר QA — בחדר 88888 בלבד, טווח 10 מטר
// ==========================================
// ה-triggerCapture הרגיל כבר קיים ועובד.
// רק נוודא שה-checkGpsCatch בודק 10 מטר במצב QA:
window.qaCaptureDist = 10; // מטר — משמש ב-checkGpsCatch אם מזוהה qaMode

// ==========================================
// ניקוי QA
// ==========================================
window.stopQAMode = function() {
    if (window.qaBotEngineInterval) {
        clearInterval(window.qaBotEngineInterval);
        window.qaBotEngineInterval = null;
    }
    const pad = document.getElementById('qa-arrow-pad');
    if (pad) pad.remove();
    if (window._realStartGpsTracking) {
        window.startRealGpsTracking = window._realStartGpsTracking;
    }
    window.qaMode = false;
};