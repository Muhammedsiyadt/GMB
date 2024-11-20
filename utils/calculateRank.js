async function calculateRank(apiKey, keyword, targetLocation, radius, gridSize) {
    try {
        // Fetch nearby places from the Google Places API
        const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
            params: {
                key: apiKey,
                keyword: keyword,
                location: `${targetLocation.lat},${targetLocation.lng}`,
                radius: radius
            }
        });

        // Calculate rank based on grid size
        const places = response.data.results;
        places.forEach(place => {
            const latDiff = Math.abs(targetLocation.lat - place.geometry.location.lat);
            const lngDiff = Math.abs(targetLocation.lng - place.geometry.location.lng);
            const gridX = Math.floor(latDiff / (360 / (gridSize * 2)));
            const gridY = Math.floor(lngDiff / (360 / (gridSize * 2)));
            place.rank = gridX * gridSize + gridY;
        });

        // Sort places by rank
        places.sort((a, b) => a.rank - b.rank);

        return places;
    } catch (error) {
        console.error('Error fetching places:', error);
        return null;
    }
}

module.exports = calculateRank;
