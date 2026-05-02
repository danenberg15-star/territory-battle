// territory.js - Arena Definition & Math Logic

let arenaPoints = [];
let arenaLayers = [];
let arenaPolygon = null;

// ==========================================
// 1. Arena Setup (Host Only)
// ==========================================
function initArenaSetup(map) {
    arenaPoints = [];
    arenaLayers = [];
    
    document.getElementById('setup-ui').style.display = 'flex';

    map.on('click', (e) => {
        if (window.arenaDefined) return;

        const latlng = [e.latlng.lat, e.latlng.lng];
        arenaPoints.push(latlng);

        // Visual marker for the corner
        const marker = L.circleMarker(latlng, { 
            radius: 8, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 1 
        }).addTo(map);
        arenaLayers.push(marker);

        // Draw connecting lines
        if (arenaPoints.length > 1) {
            const line = L.polyline(arenaPoints, { color: '#38bdf8', weight: 3 }).addTo(map);
            arenaLayers.push(line);
        }

        if (arenaPoints.length >= 3) {
            document.getElementById('btn-confirm-arena').style.display = 'block';
            if (arenaPolygon) map.removeLayer(arenaPolygon);
            arenaPolygon = L.polygon(arenaPoints, { color: '#38bdf8', fillOpacity: 0.1 }).addTo(map);
        }
    });
}

// ==========================================
// 2. Calculation Logic
// ==========================================
function finalizeArena() {
    if (arenaPoints.length < 3) return null;

    // Close the polygon for calculation
    const coords = arenaPoints.map(p => [p[1], p[0]]);
    coords.push(coords[0]);

    try {
        const polygon = turf.polygon([coords]);
        const areaSqMeters = turf.area(polygon); // Total Arena Area
        
        // Calculate Station Radius (5% of Area)
        // Area of circle = PI * r^2  => r = sqrt(Area / PI)
        const stationArea = areaSqMeters * 0.05;
        const stationRadius = Math.sqrt(stationArea / Math.PI);

        // Station Center (Centroid of Arena)
        const centroid = turf.centroid(polygon);
        const centerCoords = {
            lat: centroid.geometry.coordinates[1],
            lng: centroid.geometry.coordinates[0],
            radius: Math.max(15, stationRadius) // Minimum 15m for gameplay
        };

        return {
            points: arenaPoints,
            totalArea: areaSqMeters,
            policeStation: centerCoords
        };
    } catch (err) {
        console.error("Arena Calculation Error:", err);
        return null;
    }
}

// ==========================================
// 3. Helper: Check if point is inside
// ==========================================
function isPointInArena(lat, lng, arenaPoints) {
    if (!arenaPoints || arenaPoints.length < 3) return true;
    const pt = turf.point([lng, lat]);
    const polyCoords = arenaPoints.map(p => [p[1], p[0]]);
    polyCoords.push(polyCoords[0]);
    const poly = turf.polygon([polyCoords]);
    return turf.booleanPointInPolygon(pt, poly);
}