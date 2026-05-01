// territory.js - GPS & Area Logic
function checkCaptureProgress(path, currentPos) {
    if (path.length < 10) return false;

    const startPoint = turf.point([path[0][1], path[0][0]]);
    const endPoint = turf.point([currentPos[1], currentPos[0]]);
    const distance = turf.distance(startPoint, endPoint, {units: 'meters'});

    return distance < 15; // סגירת מעגל ברדיוס 15 מטר
}

function renderAreas(map, areas, currentAreaLayers) {
    currentAreaLayers.forEach(l => map.removeLayer(l));
    const newLayers = [];

    if (!areas) return [];

    Object.values(areas).forEach(area => {
        const poly = L.polygon(area.points, {
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.4,
            weight: 2
        }).addTo(map);
        newLayers.push(poly);
    });
    return newLayers;
}