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
    
    // הסתרת הכפתור ברגע שמתחילים לצייר מחדש
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
    
    // חשיפת כפתור האישור רק אם צויר שטח מינימלי חוקי
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
    
    // הסתרת כפתור האישור כשמנקים את המסך
    const btn = document.getElementById('btn-confirm-drawing');
    if (btn) btn.style.display = 'none';
}

// ==========================================
// 2. Finalize & Calculate Arena
// ==========================================
function finalizeDrawing() {
    if (drawingPath.length < 10) return null;

    const coords = drawingPath.map(p => [p[1], p[0]]);
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

        return {
            points: drawingPath,
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
// 3. Render Captured Areas & Update Progress
// ==========================================
window.renderAreas = function(mapInstance, areasData, currentLayers) {
    if (currentLayers && currentLayers.length > 0) {
        currentLayers.forEach(layer => mapInstance.removeLayer(layer));
    }
    
    let newLayers = [];
    let totalCapturedSqMeters = 0;

    if (areasData) {
        Object.values(areasData).forEach(area => {
            if (area.points && area.points.length >= 3) {
                const poly = L.polygon(area.points, { 
                    color: '#ef4444', 
                    fillColor: '#ef4444', 
                    fillOpacity: 0.5, 
                    weight: 3,
                    dashArray: null
                }).addTo(mapInstance);
                
                newLayers.push(poly);

                try {
                    const coords = area.points.map(p => [p[1], p[0]]);
                    coords.push(coords[0]); // חובה לסגור ל-Turf
                    const turfPoly = turf.polygon([coords]);
                    totalCapturedSqMeters += turf.area(turfPoly);
                } catch(e) {
                    console.error("Error calculating single captured area size:", e);
                }
            }
        });
    }

    if (window.arenaData && window.arenaData.totalArea) {
        const percentage = (totalCapturedSqMeters / window.arenaData.totalArea) * 100;
        const safePercentage = Math.min(100, Math.max(0, percentage)).toFixed(1); 
        
        const progressEl = document.getElementById('capture-progress-text');
        if (progressEl) {
            progressEl.innerText = `${safePercentage}%`;
        }
        
        const progressBar = document.getElementById('capture-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${safePercentage}%`;
        }

        if (safePercentage >= 80 && window.isHost && window.currentRoom) {
            window.db.ref(`game/${window.currentRoom}/winner`).set('thieves');
        }
    }

    return newLayers;
};