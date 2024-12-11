require("dotenv").config();
const axios = require('axios');
const fs = require('fs');
var ImageKit = require("imagekit");
const moment = require('moment');
const connection = require("../connection/db");
const IMGKIT_API_KEY = "public_Dxc7A/F93rZhtobT9hWTmjftTEI="
const IMGKIT_API_ENDPOINT = "private_nYz4ss23qRkhOzxCHE1mvjtGKIk="
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');


var imagekit = new ImageKit({
    publicKey: IMGKIT_API_KEY,
    privateKey: IMGKIT_API_ENDPOINT,
    urlEndpoint: "https://ik.imagekit.io/9onnlplci"
});




const GMBController = {

    handleError: (error, res) => {
        if (error.response) {
            console.error('Error response data:', error.response.data);
            res.status(500).json({ error: error.response.data });
        } else if (error.request) {
            console.error('Error request data:', error.request);
            res.status(500).json({ error: 'No response received from the server' });
        } else {
            console.error('Error message:', error.message);
            res.status(500).json({ error: error.message });
        }
    },

    uploadToImgKit: async (fileOrBuffer, filename) => {
        try {
            let uploadParams;

            if (fileOrBuffer.path) {
                // If a file object is passed (from multer)
                uploadParams = {
                    file: fs.readFileSync(fileOrBuffer.path),
                    fileName: fileOrBuffer.originalname,
                };
            } else {
                // If a buffer and filename are passed separately
                uploadParams = {
                    file: fileOrBuffer,
                    fileName: filename,
                };
            }

            uploadParams.folder = '/uploads'; // Add the folder parameter

            const response = await imagekit.upload(uploadParams);
            return response.url;
        } catch (error) {
            console.error('Error uploading to ImageKit:', error);
            throw error;
        }
    },

    downloadAndUploadImage: async (imageUrl) => {
        try {
            // Generate a unique filename
            const uniqueFilename = crypto.randomBytes(16).toString('hex') + path.extname(imageUrl.split('?')[0]);

            // Download the image
            const response = await axios({
                url: imageUrl,
                method: 'GET',
                responseType: 'arraybuffer'
            });

            // Upload the image directly to ImageKit
            const uploadResponse = await imagekit.upload({
                file: response.data,
                fileName: uniqueFilename,
                folder: '/uploads'
            });

            return uploadResponse.url;
        } catch (error) {
            console.error('Error during download or upload:', error);
            throw error;
        }
    },

    getActionType: (actionButton) => {
        const actionTypes = {
            'book-a-visit': 'BOOK',
            'call': 'CALL',
            'read-more': 'LEARN_MORE',
            'place-an-order': 'ORDER',
            'shop': 'SHOP',
            'sign-up': 'SIGN_UP'
        };
        return actionTypes[actionButton] || 'ACTION_TYPE_UNSPECIFIED';
    },

    createCallToAction: (actionType, actionLink, callPhone) => {
        if (actionType === 'CALL') {
            return { actionType, phoneNumber: callPhone };
        } else if (actionType && actionLink) {
            return { actionType, url: actionLink };
        }
        return null;
    },

    uploadImage: async (account, location, file, accessToken) => {
        try {
            const response = await axios({
                method: 'post',
                url: `https://mybusiness.googleapis.com/v4/${account}/${location}/media`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                data: {
                    "mediaFormat": "PHOTO",
                    "locationAssociation": {
                        "category": "COVER"
                    },
                    "sourceUrl": "https://img.freepik.com/free-photo/wide-angle-shot-single-tree-growing-clouded-sky-during-sunset-surrounded-by-grass_181624-22807.jpg"
                }
            });

            console.log('Image uploaded successfully:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error uploading image to GMB:', error.response ? error.response.data : error.message);
            throw error;
        }
    },

    createPost: async (req, res) => {
        try {
            const {
                postContent,
                actionButton,
                publicationDate,
                actionLink,
                publicationTime,
                callPhone,
                account,
                location,
                accessToken,
                image_url,
                avatar
            } = req.body;

            let imageUrl;

            if (image_url) {
                // Download and upload the image from the provided URL
                imageUrl = await GMBController.downloadAndUploadImage(image_url);
            } else if (req.file) {
                // Use the uploaded file
                imageUrl = await GMBController.uploadToImgKit(req.file);
            } else {
                return res.status(400).json({ error: 'No image URL provided and no file uploaded' });
            }

            // Convert string "null" to actual null
            const actionButtonConverted = actionButton === "null" ? null : actionButton;
            const actionLinkConverted = actionLink === "null" ? null : actionLink;

            let actionType = GMBController.getActionType(actionButtonConverted);

            // Calculate the scheduled time for 2 days in the future
            const scheduledTime = new Date();
            scheduledTime.setDate(scheduledTime.getDate() + 2);
            const scheduledTimeISO = scheduledTime.toISOString();

            const postBody = {
                languageCode: "en-US",
                topicType: "STANDARD",
                summary: postContent,
                media: [
                    {
                        mediaFormat: 'PHOTO',
                        sourceUrl: imageUrl,
                    },
                ],
            };

            if (actionButtonConverted && actionLinkConverted) {
                const callToAction = GMBController.createCallToAction(actionType, actionLinkConverted, callPhone);
                if (callToAction) {
                    postBody.callToAction = callToAction;
                }
            }

            const response = await axios.post(
                `https://mybusiness.googleapis.com/v4/${account}/${location}/localPosts`,
                postBody,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            res.status(200).json(response.data);
        } catch (error) {
            GMBController.handleError(error, res);
        }
    },

    allPosts: async (req, res) => {

        const accessToken = req.query.accessToken;
        const locations = req.query.location;
        const accounts = req.query.account;

        if (!accessToken) {
            return res.status(400).json({ error: 'Access token is required' });
        }

        try {

            const response = await axios.get(`https://mybusiness.googleapis.com/v4/accounts/${accounts}/locations/${locations}/localPosts`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const { localPosts } = response.data;
            if (localPosts && localPosts.length > 0) {
                res.json({ 'posts': localPosts });
            } else {
                res.json({ error: 'No posts found' });
            }

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },


    addKeywords: async (req, res) => {
        const { locationId, tags } = req.body;
        const accountId = req.user.id;

        if (!locationId || !Array.isArray(tags) || tags.length === 0) {
            return res.status(400).json({ error: 'Invalid input data' });
        }

        const query = 'INSERT INTO keywords (user_id, location_id, keyword) VALUES (?, ?, ?)';

        try {
            // Function to insert a single tag into the database
            const insertTag = async (tag) => {
                try {
                    await connection.query(query, [accountId, locationId, tag]);
                } catch (err) {
                    throw err; // Rethrow the error to be caught by Promise.all
                }
            };

            // Insert all tags using Promise.all
            await Promise.all(tags.map(insertTag));
            res.status(200).json({ success: true, message: 'All keywords saved successfully' });
        } catch (error) {
            console.error('Error saving keywords:', error);
            res.status(500).json({ error: 'Failed to save all keywords to the database', debug: error.message });
        }
    },

    deleteKeyword: async (req, res) => {
        const keywordId = req.params.id;

        // Validate keywordId
        if (!keywordId) {
            return res.status(400).json({ error: 'Keyword ID is required' });
        }

        const query = 'DELETE FROM keywords WHERE id = ?';

        try {
            // Execute the query using the pool
            const [results] = await connection.query(query, [keywordId]);

            if (results.affectedRows === 0) {
                return res.status(404).json({ error: 'Keyword not found' });
            }

            res.status(200).json({ message: 'Keyword deleted successfully' });
        } catch (error) {
            console.error('Error deleting keyword:', error);
            res.status(500).json({ error: 'Failed to delete keyword', debug: error.message });
        }
    },




    checkPermission: async (req, res) => {
        const { placeId, gmbAccessToken, gmbAccountName } = req.body;

        try {
            const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${gmbAccountName}/locations?readMask=name,title,profile,websiteUri,categories,metadata&pageSize=100`;
            const headers = {
                Authorization: `Bearer ${gmbAccessToken}`,
                'Content-Type': 'application/json',
            };

            const response = await axios.get(url, { headers });
            const locations = response.data.locations;

            console.log(response.data.locations);


            if (!Array.isArray(locations) || locations.length === 0) {
                console.log('No locations found or invalid response structure');
                return res.status(200).json({ hasPermission: false, message: 'No locations found' });
            }

            console.log(`Searching for placeId: ${placeId}`);
            const location = locations.find(loc => loc.metadata && loc.metadata.placeId === placeId);

            if (location) {
                console.log(`Location found: ${JSON.stringify(location)}`);
                const locationName = location.name || '';

                const [checkRows] = await connection.execute(
                    'SELECT COUNT(*) AS count FROM locations WHERE location_id = ? AND user_id = ?',
                    [placeId, req.user.id]
                );

                if (checkRows[0].count > 0) {
                    return res.status(200).json({ hasPermission: true, exist: true, message: 'Location was already added' });
                }

                const [insertResult] = await connection.execute(
                    'INSERT INTO locations (location_id, location_name, user_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE location_name = VALUES(location_name), user_id = VALUES(user_id)',
                    [placeId, locationName, req.user.id]
                );
                return res.status(200).json({ hasPermission: true, exist: false });
            } else {
                console.log(`Location with placeId ${placeId} not found in the response`);
                return res.status(200).json({ hasPermission: false, message: 'Location not found in GMB account' });
            }
        } catch (error) {
            console.error('Error checking permission:', error.response ? error.response.data : error.message);
            return res.status(error.response ? error.response.status : 500).json({ error: 'An error occurred', details: error.message });
        }
    },

    calculateDistance: (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Radius of the Earth in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },


    fetchPlacesWithRank: async (keyword, lat, lng, accessToken) => {
        try {
            const url = 'https://mybusinessbusinessinformation.googleapis.com/v1/googleLocations:searchGoogleLocations';
            const response = await axios.post(url, {
                query: keyword,
                location: {
                    latlng: {
                        latitude: lat,
                        longitude: lng
                    }
                },
                radius: 5000, // search radius in meters
                rankBy: 'PROMINENCE', // or 'DISTANCE'
                pageSize: 20 // Adjust the page size as needed
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.data.googleLocations) {
                return response.data.googleLocations;
            } else {
                console.error('Error fetching places:', response.data);
            }
        } catch (error) {
            console.error('Error fetching places:', error);
        }
    },




    GMBRank: async (req, res) => {
        try {
            const { keyword, placeid, grid, accessToken } = req.body;
            const apiKey = process.env.GOOGLE_PLACES_API_KEY;
            const zoomLevel = 13; // Default zoom level

            // Default grid size is 3x3
            let gridSize = grid ? parseInt(grid) : 3;

            // Function to calculate latitude/longitude offset based on zoom level and grid size
            const calculateOffset = (zoomLevel, gridSize) => {
                const metersPerDegreeLat = 111320; // Approx. meters per degree latitude
                const gridCellSizeMeters = 1000 / (gridSize - 1); // Approx. 1km / grid size
                const gridCellSizeDegrees = gridCellSizeMeters / metersPerDegreeLat; // Convert meters to degrees
                return gridCellSizeDegrees;
            };

            let locations = GMBController.searchLocationsGrid(keyword, accessToken);

            // Fetch place details to get latitude and longitude
            const placeDetailsUrl = `https://maps.googleapis.com/maps/api/place/details/json`;
            const placeDetailsResponse = await axios.get(placeDetailsUrl, {
                params: {
                    place_id: placeid,
                    key: apiKey
                }
            });

            const location = placeDetailsResponse?.data?.result?.geometry?.location;
            if (!location) {
                return res.status(400).json({ error: 'Invalid place ID or unable to fetch location details' });
            }

            const lat = location.lat;
            const lng = location.lng;
            const offset = calculateOffset(zoomLevel, gridSize);

            // Generate offsets based on grid size
            const offsets = [];
            for (let i = -Math.floor(gridSize / 2); i <= Math.floor(gridSize / 2); i++) {
                for (let j = -Math.floor(gridSize / 2); j <= Math.floor(gridSize / 2); j++) {
                    offsets.push([i * offset, j * offset]);
                }
            }

            const fetchPlaces = async (lat, lng) => {
                const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
                const response = await axios.get(url, {
                    params: {
                        location: `${lat},${lng}`,
                        radius: 333,
                        keyword,
                        key: apiKey
                    }
                });
                return response.data.results;
            };

            // Fetch places for each cell
            const gridData = [];
            for (const [latOffset, lngOffset] of offsets) {
                const cellLat = lat + latOffset;
                const cellLng = lng + lngOffset;
                const places = await fetchPlaces(cellLat, cellLng);

                // Filter out places without directions
                const placesWithDirections = places.filter(place => place?.opening_hours?.open_now);

                if (placesWithDirections.length === 0) {
                    // If no places found with directions, insert a placeholder place
                    gridData.push({
                        center: { lat: cellLat, lng: cellLng },
                        places: [{ name: 'No places found with directions', rating: 0, rank: 20 }],
                        rank: 20
                    });
                } else {
                    // Rank the places based on relevance, rating, and proximity
                    placesWithDirections.sort((a, b) => {
                        // Rank primarily by rating, secondarily by proximity
                        const ratingDiff = (b.rating || 0) - (a.rating || 0);
                        const distanceDiff = GMBController.calculateDistance(cellLat, cellLng, a.geometry.location.lat, a.geometry.location.lng) -
                            GMBController.calculateDistance(cellLat, cellLng, b.geometry.location.lat, b.geometry.location.lng);
                        return ratingDiff + distanceDiff;
                    });

                    // Assign rank to places and check for selected place
                    let selectedPlaceRank = 20;
                    placesWithDirections.forEach((place, index) => {
                        const rank = index + 1;
                        place.rank = rank;
                        if (place.place_id === placeid) {
                            selectedPlaceRank = rank;
                        }
                    });

                    gridData.push({
                        center: { lat: cellLat, lng: cellLng },
                        places: placesWithDirections,
                        rank: selectedPlaceRank
                    });
                }
            }

            return res.json({ grid: gridData, location: location });
        } catch (error) {
            return res.status(500).json({ error: 'Internal server error' });
        }
    },

    searchLocationsGrid: async (keyword, newAccessToken) => {
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;

        if (!keyword) {
            throw new Error('Input query parameter is required');
        }

        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${keyword}&key=${apiKey}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${newAccessToken}`,
                    'Content-Type': 'application/json',
                }
            });

            // Return the results instead of sending a response
            return response.data.results;

        } catch (error) {
            throw new Error('Internal Server Error');
        }
    },


    searchLocations: async (req, res) => {
        const input = req.body.input;

        const newAccessToken = req.body.newAccessToken;

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;

        if (!input) {
            return res.status(400).send('Input query parameter is required');
        }

        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${input}&key=${apiKey}`;


        try {

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${newAccessToken}`,
                    'Content-Type': 'application/json',
                }
            });

            res.json(response.data);

        } catch (error) {
            res.status(500).json({
                status: true,
                message: 'Internal Server Error'
            });
        }
    },



    fetchKeywordRank: async (keyword, lat, lng) => {
        try {


            // Ensure the keyword is a string and not empty
            if (typeof keyword !== 'string' || keyword.trim() === '') {
                throw new Error('Invalid keyword. Must be a non-empty string.');
            }

            // Perform the search query
            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    key: process.env.GOOGLE_PROGRAM_SEARCH_API,
                    cx: process.env.BROWSER_KEY,
                    q: keyword,
                    location: `${lat},${lng}`,
                    num: 100
                },
            });

            console.log(response);


            // Check if the response is successful
            if (response.status === 200) {

                const items = response.data.items;
                let keywordRanks = [];

                // Convert keyword to lower case for case-insensitive matching
                const keywordLower = keyword.toLowerCase();
                const regex = new RegExp(`\\b${keywordLower}\\b`, 'i'); // Word boundary regex, case-insensitive

                // Process search results
                if (items && items.length > 0) {
                    for (let index = 0; index < items.length; index++) {
                        const item = items[index];
                        const title = item.title.toLowerCase();
                        const snippet = item.snippet ? item.snippet.toLowerCase() : '';
                        const url = item.link ? item.link.toLowerCase() : '';

                        // Check if the keyword appears in the title, snippet, or URL
                        if (regex.test(title) || regex.test(snippet) || regex.test(url)) {
                            keywordRanks.push(index + 1);
                            console.log(`Match found at rank ${index + 1}:`);
                            console.log(`Title: ${item.title}`);
                            console.log(`URL: ${item.link}`);
                            console.log(`Snippet: ${item.snippet}`);
                            console.log('---');
                        }
                    }
                } else {
                    console.log('No items found in the response');
                }

                console.log('All keyword ranks:', keywordRanks);

                if (keywordRanks.length > 0) {
                    return keywordRanks[0]; // Return the first (lowest) rank
                } else {
                    return 'Not found';
                }
            } else {
                console.error('Error fetching search results:', response.statusText);
                return 'Error fetching search results';
            }


        } catch (error) {
            if (error.response) {
                console.error('API Error:', error.response.data.error.message);
            } else {
                console.error('Error:', error.message);
            }
            throw error;
        }
    },

    updateKeywordRankInDb: async (locationId, keyword, rank) => {
        try {
            const query = `
                UPDATE keywords 
                SET rank = ?
                WHERE location_id = ? AND keyword = ?`;

            // Function to update the database
            const update = () => {
                return new Promise((resolve, reject) => {
                    connection.query(query, [rank, locationId, keyword], (err, results) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(results);
                        }
                    });
                });
            };

            const result = await update();
            return result;
        } catch (error) {
            console.error('Error updating keyword rank in database:', error.message);
            throw error;
        }
    },

    updateKeywordRank: async (req, res) => {
        try {
            const { locationId, lat, lng } = req.body;
            let location = `${lat},${lng}`;

            // Fetch keywords from GMBController
            const keywords = await GMBController.fetchKeywords(locationId);

            if (keywords.error) {
                return res.status(404).json(keywords);
            }

            // Prepare the current date
            const currentDate = new Date();

            // Define the query for updating the location
            const query = 'UPDATE locations SET last_rank_updated = ? WHERE location_id = ?';

            // Execute the update query using the pool
            await connection.query(query, [currentDate, locationId]);

            // Process each keyword
            for (const keyword of keywords) {
                // console.log(`Updating rank for keyword: ${keyword.keyword}`);
            }

            return res.json({ success: true, message: 'Keyword rank updated successfully' });

        } catch (error) {
            console.error('Error executing query:', error.message);
            return res.status(500).json({ error: true, message: 'Failed to update keyword rank', debug: error.message });
        }
    },

    fetchKeywords: async (locationId) => {
        const query = 'SELECT keywords.id, keywords.keyword, keywords.rank FROM keywords WHERE keywords.location_id = ?';

        try {
            // Execute the query using the promisified connection
            const [results] = await connection.query(query, [locationId]);

            if (results.length === 0) {
                return { error: true, message: "Keywords are not found for this location" };
            } else {
                return results;
            }
        } catch (error) {
            console.error('Error fetching keywords from MySQL:', error);
            throw error;
        }
    },

    getGMBAccountID: async (req, res) => {
        const accessToken = req.body.accessToken;

        if (!accessToken) {
            return res.status(400).json({ error: 'Access token is required' });
        }

        try {
            const response = await axios.get('https://mybusiness.googleapis.com/v1/accounts', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (response.status === 200) {
                const accounts = response.data.accounts;
                if (accounts && accounts.length > 0) {
                    const accountID = accounts[0].name;
                    return res.status(200).json({ accountID });
                } else {
                    return res.status(404).json({ error: 'No GMB accounts found' });
                }
            } else {
                return res.status(response.status).json({ error: response.statusText });
            }
        } catch (error) {
            console.error('Error listing GMB accounts:', error.message);
            return res.status(500).json({ error: 'Failed to fetch GMB account ID' });
        }
    },

    deleteLocation: async function (req, res) {
        const { id: locationName } = req.params;
        const userId = req.user.id;

        const executeQuery = async (query, params) => {
            try {
                const results = await connection.query(query, params);
                return results;
            } catch (err) {
                throw err;
            }
        };

        const checkConnection = async () => {
            try {
                await connection.query('SELECT 1');
            } catch (err) {
                throw err;
            }
        };

        try {
            await checkConnection();

            // Delete the location
            const deleteLocationQuery = 'DELETE FROM locations WHERE location_name = ? AND user_id = ?';
            const [locationResult] = await executeQuery(deleteLocationQuery, [`locations/${locationName}`, userId]);

            if (locationResult.affectedRows > 0) {
                // Delete associated keywords
                const deleteKeywordsQuery = 'DELETE FROM keywords WHERE location_id = (SELECT id FROM locations WHERE location_name = ? AND user_id = ?) AND user_id = ?';
                await executeQuery(deleteKeywordsQuery, [`locations/${locationName}`, userId, userId]);

                res.status(200).json({ message: 'Location and associated keywords deleted successfully' });
            } else {
                res.status(404).json({ message: 'Location not found or you do not have permission to delete this location' });
            }
        } catch (error) {
            res.status(500).json({ message: 'Internal server error', error: error.message });
        }
    },

    getAllViewers: async (req, res) => {
        const { id } = req.params;

        const gmbAccessToken = req.headers['gmb-access-token'];

        if (!gmbAccessToken) {
            return res.status(400).json({ error: true, message: "GMB access token is required" });
        }

        try {
            const api = `https://businessprofileperformance.googleapis.com/v1/locations/${id}:fetchMultiDailyMetricsTimeSeries?dailyMetrics=WEBSITE_CLICKS&dailyMetrics=CALL_CLICKS&dailyRange.start_date.year=2024&dailyRange.start_date.month=10&dailyRange.start_date.day=14&dailyRange.end_date.year=2024&dailyRange.end_date.month=10&dailyRange.end_date.day=14`;

            const response = await axios.get(api, {
                headers: {
                    'Authorization': `Bearer ${gmbAccessToken}`,
                    'Content-Type': 'application/json',
                },
            });


            // console.log(response.data.multiDailyMetricTimeSeries[0].dailyMetricTimeSeries[0].timeSeries.datedValues.length)

            return res.status(200).json(response.data);

        } catch (error) {
            console.error('Error fetching data from Google API:', error);

            if (error.response) {
                console.error('Error response data:', error.response.data);
            }

            return res.status(500).json({
                error: true,
                message: "Failed to fetch data from Google API",
                debug: error.message
            });
        }
    },

    getlocationData: async (req, res) => {
        const { locationId } = req.params; 
        const gmbAccessToken = req.headers['gmb_access_token'];
        
        if (!locationId) {
            return res.status(400).json({ error: 'Location ID is required' });
        }
        if (!gmbAccessToken) {
            return res.status(401).json({ error: 'Missing Authorization tokens' });
        }
    
        // Object to store the latest location data
        let locationData = {};
    
        const api = `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}?readMask=title`;
        
        try {
            const response = await axios.get(api, {
                headers: {
                    Authorization: `Bearer ${gmbAccessToken}`,
                    'Content-Type': 'application/json',
                },
            });
    
            // Assuming title is available in response.data.title
            const title = response.data.title;
    
            // Store the current location and name in the object
            locationData = {
                location: locationId,
                name: title
            };
    
            res.status(200).json({
                success: true,
                data: locationData
            });
    
        } catch (error) {
            console.error('Error fetching location data:', error);
    
            // Handle specific error responses
            if (error.response) {
                res.status(error.response.status).json({
                    success: false,
                    message: error.response.data.error.message,
                    details: error.response.data.error.details || null
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Internal Server Error'
                });
            }
        }
    }
    ,

    getAllReviews: async (req, res) => {
        try {
            const query = `SELECT * FROM locations`;
            const [locations] = await connection.query(query);

            if (!locations.length) {
                return res.status(404).json({ message: 'No locations found' });
            }

            const { id } = req.params;
            const gmbAccessToken = req.headers['gmb_access_token'];

            if (!gmbAccessToken) {
                return res.status(401).json({ message: 'Missing GMB access token' });
            }

            let allReviews = [];


            for (const location of locations) {
                const locationName = location.location_name;

                const api = `https://mybusiness.googleapis.com/v4/accounts/${id}/${locationName}/reviews`;

                try {
                    const response = await axios.get(api, {
                        headers: {
                            Authorization: `Bearer ${gmbAccessToken}`,
                        },
                    });


                    if (response.data.reviews) {
                        allReviews.push(...response.data.reviews);
                    }



                } catch (err) {
                    console.error(`Error fetching reviews for location ${locationName}:`, err.response?.data || err.message);
                }
            }





            return res.json({ reviews: allReviews });

        } catch (error) {
            console.error('Error fetching reviews:', error.response?.data || error.message);
            res.status(500).json({ message: 'Server error', error: error.message });
        }
    },

    createSchedulePost: async (req, res) => {
        try {
            const {
                postContent,
                actionButton,
                publicationDate,
                actionLink,
                callPhone,
                account,
                location,
                accessToken,
                image_url,
            } = req.body;


            if (!publicationDate || isNaN(new Date(publicationDate).getTime())) {
                return res.status(400).json({ error: 'A valid publication date is required' });
            }

            let imageUrl;
            if (image_url) {
                imageUrl = await GMBController.downloadAndUploadImage(image_url);
            } else if (req.file) {
                imageUrl = await GMBController.uploadToImgKit(req.file);
            } else {
                return res.status(400).json({ error: 'No image URL provided and no file uploaded' });
            }

            const actionButtonConverted = actionButton === "null" ? null : actionButton;
            const actionLinkConverted = actionLink === "null" ? null : actionLink;
            const actionType = GMBController.getActionType(actionButtonConverted);

            const postBody = {
                languageCode: "en-US",
                topicType: "STANDARD",
                summary: postContent,
                media: [
                    {
                        mediaFormat: 'PHOTO',
                        sourceUrl: imageUrl,
                    },
                ],
            };

            if (actionButtonConverted && actionLinkConverted) {
                const callToAction = GMBController.createCallToAction(actionType, actionLinkConverted, callPhone);
                if (callToAction) {
                    postBody.callToAction = callToAction;
                }
            }

            // Updated insert query to include 'account'
            const insertQuery = 'INSERT INTO scheduleposts (postContent, publicationDate, status, location_id, account, accessToken, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)';
            const [result] = await connection.query(insertQuery, [postContent, publicationDate, 'pending', location, account, accessToken, imageUrl]);
            const postId = result.insertId;

            console.log('Post inserted successfully');

            res.status(200).json({ message: 'Post scheduled successfully', scheduledAt: publicationDate });
        } catch (error) {
            GMBController.handleError(error, res);
        }
    },


    getAllScheledPosts: async (req, res) => {
        const locationId = req.params.id;


        try {
            const [rows] = await connection.query(
                'SELECT * FROM scheduleposts WHERE location_id = ?',
                [`locations/${locationId}`]
            );

            res.status(200).json(rows);
        } catch (error) {
            console.error('Error fetching scheduled posts:', error);
            res.status(500).json({ error: 'Failed to fetch scheduled posts' });
        }
    },


    createSchedulePost2: async (req, res) => {
        try {
            const {
                postContent,
                actionButton,
                publicationDate,
                actionLink,
                callPhone,
                account,
                location,
                accessToken,
                image_url,
            } = req.body;


            if (!publicationDate || isNaN(new Date(publicationDate).getTime())) {
                return res.status(400).json({ error: 'A valid publication date is required' });
            }

            let imageUrl;
            if (image_url) {
                imageUrl = await GMBController.downloadAndUploadImage(image_url);
            } else if (req.file) {
                imageUrl = await GMBController.uploadToImgKit(req.file);
            } else {
                return res.status(400).json({ error: 'No image URL provided and no file uploaded' });
            }

            const actionButtonConverted = actionButton === "null" ? null : actionButton;
            const actionLinkConverted = actionLink === "null" ? null : actionLink;
            const actionType = GMBController.getActionType(actionButtonConverted);

            const postBody = {
                languageCode: "en-US",
                topicType: "STANDARD",
                summary: postContent,
                media: [
                    {
                        mediaFormat: 'PHOTO',
                        sourceUrl: imageUrl,
                    },
                ],
            };

            if (actionButtonConverted && actionLinkConverted) {
                const callToAction = GMBController.createCallToAction(actionType, actionLinkConverted, callPhone);
                if (callToAction) {
                    postBody.callToAction = callToAction;
                }
            }

            // Updated insert query to include 'account'
            const insertQuery = 'INSERT INTO scheduleposts (postContent, publicationDate, status, location_id, account, accessToken, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)';
            const [result] = await connection.query(insertQuery, [postContent, publicationDate, 'pending', location, account, accessToken, imageUrl]);
            const postId = result.insertId;

            console.log('Post inserted successfully');

            res.status(200).json({ message: 'Post scheduled successfully', scheduledAt: publicationDate });
        } catch (error) {
            GMBController.handleError(error, res);
        }
    },


    editScheduledPosts: async (req, res) => {
        try {
            const postId = req.params.id;

            const {
                postContent = '',
                actionButton = 'none',
                publicationDate,
                actionLink = '',
                callPhone = '',
                account = '',
                location = '',
                accessToken = '',
            } = req.body;

            // Validate publication date
            if (!publicationDate || isNaN(new Date(publicationDate).getTime())) {
                return res.status(400).json({ error: 'A valid publication date is required' });
            }

            // Check if post exists and is still pending
            const [[existingPost]] = await connection.query(
                'SELECT * FROM scheduleposts WHERE id = ?',
                [postId]
            );

            if (!existingPost) {
                return res.status(404).json({ error: 'Scheduled post not found' });
            }

            if (existingPost.status === 'posted') {
                return res.status(400).json({ error: 'Cannot edit already posted content' });
            }

            // Handle image upload
            let imageUrl = existingPost.imageUrl; // Keep existing image by default
            if (req.file) {
                try {
                    imageUrl = await GMBController.uploadToImgKit(req.file);
                } catch (error) {
                    console.error('Image upload error:', error);
                    return res.status(400).json({ error: 'Failed to upload image' });
                }
            }

            // Prepare action button data
            const actionButtonConverted = actionButton === "none" ? null : actionButton;
            const actionLinkConverted = actionLink || null;
            const actionType = actionButtonConverted ? GMBController.getActionType(actionButtonConverted) : null;

            // Update database with all fields
            const updateQuery = `UPDATE scheduleposts  
                     SET 
                         postContent = ?,
                         publicationDate = ?,
                         status = 'pending',
                         imageUrl = ?, 
                         accessToken = ? 
                     WHERE id = ?`;



            await connection.query(updateQuery, [
                postContent,
                new Date(publicationDate),
                imageUrl,
                accessToken,
                postId
            ]);

            res.status(200).json({
                message: 'Scheduled post updated successfully',
                scheduledAt: publicationDate,
                imageUrl: imageUrl
            });
        } catch (error) {
            console.error('Controller error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    deleteScheledPosts: async (req, res) => {
        try {
            const postId = req.params.id;


            const [[scheduledPost]] = await connection.query(
                'SELECT status FROM scheduleposts WHERE id = ?',
                [postId]
            );

            if (!scheduledPost) {
                return res.status(404).json({
                    error: 'Scheduled post not found'
                });
            }

            if (scheduledPost.status === 'posted') {
                return res.status(400).json({
                    error: 'Cannot delete a post that has already been posted'
                });
            }


            const [deleteResult] = await connection.query(
                'DELETE FROM scheduleposts WHERE id = ?',
                [postId]
            );

            if (deleteResult.affectedRows === 0) {
                return res.status(404).json({
                    error: 'Failed to delete scheduled post'
                });
            }

            res.status(200).json({
                message: 'Scheduled post deleted successfully',
                deletedId: postId
            });

        } catch (error) {
            console.error('Error in deleteScheledPosts:', error);
            res.status(500).json({
                error: 'Internal server error while deleting scheduled post',
                details: error.message
            });
        }
    },

    findLocation: async (req, res) => {
        const id = req.params.locationId

        try {

            const url = `https://mybusiness.googleapis.com/v4/location/${id}?key=${GOOGLE_API_KEY}`;

            const response = await axios.get(url);


            res.status(200).json(response.data);
        } catch (error) {
            console.error('Error fetching location:', error.message);
            res.status(500).json({ error: 'Unable to fetch location details' });
        }
    },

    getKeywords: async (req, res) => {

        const locationId = `locations/${req.params.id}`;

        try {
            const query = 'SELECT * FROM keywords WHERE location_id = ?';
            const results = await connection.query(query, [locationId]);

            res.status(200).json(results);

        } catch (error) {
            console.log('Error');

        }
    },

    editKeyword: async (req, res) => {
        const itemId = req.body.id;
        const editedKeyword = req.body.keyword;

        try {

            const queryCheck = 'SELECT * FROM keywords WHERE id = ?';
            const [results] = await connection.query(queryCheck, [itemId]);

            if (results.length === 0) {
                return res.status(404).json({ message: 'Keyword not found.' });
            }


            const queryUpdate = 'UPDATE keywords SET keyword = ? WHERE id = ?';
            await connection.query(queryUpdate, [editedKeyword, itemId]);

            res.status(200).json({ message: 'Keyword updated successfully.' });
        } catch (error) {
            console.error('Error updating keyword:', error);
            res.status(500).json({ message: 'Failed to update keyword.', error });
        }
    },

    deleteKeyword: async (req, res) => {
        const id = req.params.id;

        try {

            const queryCheck = 'SELECT * FROM keywords WHERE id = ?';
            const [results] = await connection.query(queryCheck, [id]);

            if (results.length === 0) {
                return res.status(404).json({ message: 'Keyword not found' });
            }


            const queryDelete = 'DELETE FROM keywords WHERE id = ?';
            await connection.query(queryDelete, [id]);

            return res.status(200).json({ message: 'Keyword deleted successfully' });
        } catch (error) {
            console.error('Error deleting keyword:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },

    keywordCount: async (req, res) => {
        try {

            const query = `
                SELECT location_id, COUNT(*) as keyword_count 
                FROM keywords 
                GROUP BY location_id
            `;
            const keywordCounts = await connection.query(query);


            res.status(200).json(keywordCounts);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch keyword counts' });
        }
    },

    // fetchmapDetails: async (req, res) => {
    //     try {
    //         const { key } = req.body; 
    //         const googleApiKey = process.env.NEW_PLACE_API; 

    //         if (!googleApiKey) {
    //             return res.status(500).json({ 
    //                 error: 'Google API key is not configured' 
    //             });
    //         }

    //         const googlePlacesUrl = "https://places.googleapis.com/v1/places:searchText";

    //         const requestBody = {
    //             textQuery: key,
    //             maxResultCount: 5 // Optional: Limit number of results
    //         };

    //         const headers = {
    //             "Content-Type": "application/json",
    //             "X-Goog-Api-Key": googleApiKey,
    //             "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.priceLevel,places.location"
    //         };

    //         try {
    //             const response = await axios.post(googlePlacesUrl, requestBody, { 
    //                 headers,
    //                 timeout: 10000 // 10 second timeout
    //             });

    //             // Validate response
    //             if (!response.data || !response.data.places) {
    //                 return res.status(404).json({ 
    //                     error: 'No places found',
    //                     searchQuery: key 
    //                 });
    //             }

    //             res.status(200).json({
    //                 places: response.data.places,
    //                 totalResults: response.data.places.length
    //             });
    //         } catch (apiError) {
    //             console.error('Google Places API Error:', {
    //                 status: apiError.response?.status,
    //                 data: apiError.response?.data,
    //                 message: apiError.message
    //             });

    //             res.status(apiError.response?.status || 500).json({ 
    //                 error: 'Failed to fetch map details',
    //                 details: apiError.response?.data || 'Unknown error occurred'
    //             });
    //         }
    //     } catch (error) {
    //         console.error('Server-side Error:', error.message);
    //         res.status(500).json({ 
    //             error: 'Internal server error',
    //             message: error.message 
    //         });
    //     }
    // }




}

module.exports = GMBController;