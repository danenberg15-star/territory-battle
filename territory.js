// territory.js - Canvas Drawing to GPS Mapping & Arena Math (Fully Synced)

let drawingPath = [];
let isDrawing = false;
let canvas, ctx;

// ==========================================
// 1. Canvas Drawing Initialization
// ==========================================
function initDrawingCanvas(mapInstance) {
    canvas = document.getElementById('drawing-canvas');
    ctx = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    document.getElementById('drawing-container').style.display = 'block';
    
    canvas.addEventListener('touchstart', (e) => startDrawing(e, mapInstance), { passive: false });
    canvas.addEventListener('touchmove', (e) => draw(e, mapInstance), { passive: false });
    canvas.addEventListener('touchend', stopDrawing);

    window.addEventListener('resize', () => {
        if (canvas && document.getElementById('drawing-container').style.display === 'block') {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            clearDrawing(); 
        }
    });
}

function startDrawing(e, mapInstance) {
    isDrawing = true;
    drawingPath = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const btn = document.getElementById('btn-confirm-drawing');
    if (btn) btn.style.display = 'none';
    
    const touch = e.touches[0];
    const pt = mapInstance.containerPointToLatLng([touch.clientX, touch.clientY]);
    drawingPath.push([pt.lat, pt.lng]);
    
    ctx.beginPath();
    ctx.moveTo(touch.clientX, touch.clientY);
}

function draw(e, mapInstance) {
    if (!isDrawing) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const pt = mapInstance.containerPointToLatLng([touch.clientX, touch.clientY]);
    drawingPath.push([pt.lat, pt.lng]);
    
    ctx.lineTo(touch.clientX, touch.clientY);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4;
    ctx.stroke();
}

function stopDrawing() {
    isDrawing = false;
    ctx.closePath();
    
    if (drawingPath.length >= 10) {
        const btn = document.getElementById('btn-confirm-drawing');
        if (btn) btn.style.display = 'block';
    }
}

function clearDrawing() {
    if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    drawingPath = [];
    
    const btn = document.getElementById('btn-confirm-drawing');
    if (btn) btn.style.display = 'none';
}

// ==========================================
// 2. Simplify path - מסנן נקודות עודפות
// ==========================================
function simplifyPath(path, toleranceDeg) {
    if (path.length < 3) return path;
    const tol = toleranceDeg || 0.00003; // ~3 מטר בקירוב
    const result = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
        const prev = result[result.length - 1];
        const curr = path[i];
        const dLat = curr[0] - prev[0];
        const dLng = curr[1] - prev[1];
        if (Math.sqrt(dLat * dLat + dLng * dLng) >= tol) {
            result.push(curr);
        }
    }
    result.push(path[path.length - 1]);
    return result;
}

// ==========================================
// 3. Finalize & Calculate Arena
// ==========================================
function finalizeDrawing() {
    if (drawingPath.length < 10) return null;

    // סינון נקודות עודפות לפוליגון נקי
    const simplified = simplifyPath(drawingPath, 0.00003);

    const coords = simplified.map(p => [p[1], p[0]]);
    coords.push(coords[0]);

    try {
        const polygon = turf.polygon([coords]);
        const areaSqMeters = turf.area(polygon); 
        
        const stationArea = areaSqMeters * 0.05;
        const stationRadius = Math.sqrt(stationArea / Math.PI);

        const centroid = turf.centroid(polygon);
        const centerCoords = {
            lat: centroid.geometry.coordinates[1],
            lng: centroid.geometry.coordinates[0],
            radius: Math.max(15, stationRadius) 
        };

        console.log(`Arena total area: ${areaSqMeters.toFixed(1)} sqm, points: ${simplified.length}`);

        return {
            points: simplified,
            totalArea: areaSqMeters,
            policeStation: centerCoords
        };
    } catch (err) {
        console.error("Area Calculation Error:", err);
        alert(window.currentLang === 'he' ? "השטח שצויר אינו תקין. נסה לצייר צורה סגורה וברורה יותר." : "Invalid drawing. Try a clear closed shape.");
        return null;
    }
}

function isPointInArena(lat, lng, arenaPoints) {
    if (!arenaPoints || arenaPoints.length < 3) return true;
    try {
        const pt = turf.point([lng, lat]);
        const polyCoords = arenaPoints.map(p => [p[1], p[0]]);
        polyCoords.push(polyCoords[0]);
        const polygon = turf.polygon([polyCoords]);
        return turf.booleanPointInPolygon(pt, polygon);
    } catch(e) {
        return true;
    }
}

// ==========================================
// 4. Render Captured Areas & Update Progress
// ==========================================
window.renderAreas = function(mapInstance, areasData, currentLayers) {
    if (currentLayers && currentLayers.length > 0) {
        currentLayers.forEach(layer => mapInstance.removeLayer(layer));
    }
    
    let newLayers = [];
    let totalCapturedSqMeters = 0;

    if (areasData) {
        const validPolygons = [];

        Object.values(areasData).forEach(area => {
            if (area.points && area.points.length >= 3) {
                const poly = L.polygon(area.points, { 
                    color: '#ef4444', 
                    fillColor: '#ef4444', 
                    fillOpacity: 0.45,
                    weight: 2,
                    dashArray: null,
                    pane: 'overlayPane'
                }).addTo(mapInstance);
                
                newLayers.push(poly);

                try {
                    const coords = area.points.map(p => [p[1], p[0]]);
                    coords.push(coords[0]);
                    validPolygons.push(turf.polygon([coords]));
                } catch(e) {
                    console.error("Error building captured polygon:", e);
                }
            }
        });

        // איחוד כל השטחים למניעת ספירה כפולה של חפיפות
        if (validPolygons.length > 0) {
            try {
                let united = validPolygons[0];
                for (let i = 1; i < validPolygons.length; i++) {
                    try {
                        const u = turf.union(united, validPolygons[i]);
                        if (u) united = u;
                    } catch(e) {
                        // אם union נכשל על פוליגון ספציפי - מדלגים
                    }
                }
                totalCapturedSqMeters = turf.area(united);
            } catch(e) {
                // fallback: סכום פשוט אם union נכשל לחלוטין
                validPolygons.forEach(p => { totalCapturedSqMeters += turf.area(p); });
                console.warn("Union failed, using simple sum:", e);
            }
        }
    }

    if (window.trailLayer) {
        window.trailLayer.bringToFront();
    }

    let safePercentage = 0;
    if (window.arenaData && window.arenaData.totalArea) {
        const percentage = (totalCapturedSqMeters / window.arenaData.totalArea) * 100;
        safePercentage = Math.min(100, Math.max(0, percentage)).toFixed(1);

        console.log(`Captured: ${totalCapturedSqMeters.toFixed(1)} sqm / ${window.arenaData.totalArea.toFixed(1)} sqm = ${safePercentage}%`);

        const progressEl = document.getElementById('capture-progress-text');
        if (progressEl) {
            progressEl.innerText = `${safePercentage}%`;
        }

        // ניצחון גנבים ב-51%
        if (parseFloat(safePercentage) >= 51 && window.isHost && window.currentRoom) {
            window.db.ref(`game/${window.currentRoom}/winner`).once('value', snap => {
                if (!snap.val()) {
                    window.db.ref(`game/${window.currentRoom}/winner`).set('thieves');
                }
            });
        }
    }

    return newLayers;
};

// ==========================================
// 5. כתיבת Toast כיבוש ל-Firebase (כל גנב שכובש)
// ==========================================
window.broadcastCaptureToast = function(percentage) {
    if (!window.currentRoom || !window.db) return;
    window.db.ref(`game/${window.currentRoom}/captureToast`).set({
        percentage: percentage,
        t: Date.now()
    });
};

// ==========================================
// 6. האזנה ל-Toast מ-Firebase (כל השחקנים)
// ==========================================
window.listenToCaptureToast = function() {
    if (!window.currentRoom || !window.db) return;
    if (window._captureToastListenerAttached) return;
    window._captureToastListenerAttached = true;

    window.db.ref(`game/${window.currentRoom}/captureToast`).on('value', snap => {
        const data = snap.val();
        if (!data) return;
        if (Date.now() - data.t > 6000) return;
        window.displayCaptureToast(data.percentage);
    });
};

// ==========================================
// 7. Toast Notification UI
// ==========================================
window.displayCaptureToast = function(percentage) {
    let oldToast = document.getElementById('capture-toast');
    if (oldToast) oldToast.remove();

    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.innerHTML = `@keyframes pop-in { 0% { opacity: 0; transform: translate(-50%, -60%) scale(0.5); } 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); } }`;
        document.head.appendChild(style);
    }

    let toast = document.createElement('div');
    toast.id = 'capture-toast';
    toast.style.position = 'fixed';
    toast.style.top = '25%';
    toast.style.left = '50%';
    toast.style.transform = 'translate(-50%, -50%)';
    toast.style.backgroundColor = 'rgba(220, 38, 38, 0.95)';
    toast.style.color = 'white';
    toast.style.padding = '20px 40px';
    toast.style.borderRadius = '15px';
    toast.style.fontSize = '24px';
    toast.style.fontWeight = '900';
    toast.style.zIndex = '99999';
    toast.style.boxShadow = '0 0 30px rgba(220, 38, 38, 0.8)';
    toast.style.textAlign = 'center';
    toast.style.pointerEvents = 'none';
    toast.style.animation = 'pop-in 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

    toast.innerText = window.currentLang === 'he'
        ? `הגנבים כבשו ${percentage}% מהשטח!`
        : `Thieves captured ${percentage}%!`;

    document.body.appendChild(toast);

    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    setTimeout(() => {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
};