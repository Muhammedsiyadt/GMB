const connection = require("../connection/db");
const bcrypt = require("bcryptjs");
const GenerateJWT = require('../utils/GenerateJWT');
const { default: axios } = require("axios");
require('dotenv').config();
const mysql = require('mysql2/promise');
const GMBController = require("./GMBControllers");

const AuthController = {

    login: async (req, res) => {


        const { email, password } = req.body


        if (!email || !password) {
            return res.status(400).json({ error: true, message: "All fields are required" });
        }

        const query = "SELECT * FROM users WHERE email = ?";

        try {
            const [results] = await connection.query(query, [email]);

            if (results.length === 0) {
                return res.status(400).json({ error: true, message: "Invalid email address or password" });
            }

            const user = results[0];

            // Compare the provided password with the stored hashed password
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.status(400).json({ error: true, message: "Invalid password" });
            }

            // Generate a JWT token
            const token = GenerateJWT(user.id);

            if (token) {
                return res.status(200).json({ success: true, message: "Logged in successfully", token });
            } else {
                return res.status(500).json({ error: true, message: "Token generation failed" });
            }
        } catch (error) {
            console.error("Error during login:", error);
            return res.status(500).json({ error: true, message: "Internal server error", debug: error.message });
        }


    },

    me: (req, res) => {
        try {
            res.json({ 'user': req.user });
        } catch (error) {

        }
    },

    GMBAccount: async (req, res) => {
        const accessToken = req.query.access_token;

        if (!accessToken) {
            return res.status(400).json({ error: 'Access token is required' });
        }

        try {
            const response = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const { accounts } = response.data;
            if (accounts && accounts.length > 0) {
                const accountName = accounts[0].name;
                const accountId = accounts[0].name.split('/')[1];
                res.json({ accountName, accountId });
            } else {
                res.json({ error: 'No accounts found' });
            }
        } catch (error) {
            console.error('Error fetching connected accounts:', error);
            res.status(500).json({ error: 'Failed to fetch connected accounts' });
        }
    },


    newAccessTokenGMB: async (req, res) => {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({ expired: true, error: 'Refresh token is required' });
            }

            const params = new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            });

            const response = await axios.post(
                'https://www.googleapis.com/oauth2/v4/token',
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );

            if (!response.data || response.status !== 200) {
                console.error('Response status:', response.status);
                console.error('Response data:', response.data);
                throw new Error(`Failed to get new access token: ${response.statusText}`);
            }

            const { access_token, error } = response.data;

            // Check if the refresh token is invalid or expired
            if (error === 'invalid_grant') {
                return res.status(400).json({ expired: true, error: 'Refresh token is expired or invalid' });
            }

            return res.status(200).json({ accessToken: access_token });
        } catch (error) {
            if (error.response) {
                console.error('Error response data:', error.response.data);
                console.error('Error response status:', error.response.status);
                console.error('Error response headers:', error.response.headers);

                // Check if the error is due to an invalid or expired refresh token
                if (error.response.data.error === 'invalid_grant') {
                    return res.status(400).json({ expired: true, error: 'Refresh token is expired or invalid' });
                }
            } else {
                console.error('Error message:', error.message);
            }

            return res.status(500).json({ expired: true, error: 'Failed to refresh token' });
        }
    },


    getLocations: async (accessToken, rows) => {

        const fetchLocationDetails = async (locationTitle) => {
            const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationTitle}?readMask=name,title,profile,websiteUri,categories,storefrontAddress`;
            const headers = {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            };

            let retryCount = 0;
            const maxRetries = 5;

            while (retryCount < maxRetries) {
                try {
                    const response = await axios.get(url, { headers });
                    return response.data;
                } catch (error) {
                    if (error.response && error.response.status === 429) {
                        // Wait and retry
                        const waitTime = Math.pow(2, retryCount) * 1000; // Exponential backoff
                        console.log(`Rate limit exceeded. Retrying in ${waitTime / 1000} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        retryCount++;
                    } else {
                        throw error; // Re-throw the error if it's not a rate limit error
                    }
                }
            }

            throw new Error('Exceeded maximum retry attempts');
        };

        try {
            // Fetch details for each location from the GMB API
            const locationDetailsPromises = rows.map(async (location) => {
                try {
                    const finalData = await fetchLocationDetails(location.title);
                    finalData.location_id = location.name;
                    return finalData;
                } catch (error) {
                    console.error(`Error fetching details for location ${location.title}:`, error.message);
                    return null;
                }
            });

            const locationDetails = await Promise.all(locationDetailsPromises);

            // Filter out any failed requests (null values)
            const validLocationDetails = locationDetails.filter(details => details !== null);

            // Return the detailed locations
            return validLocationDetails;

        } catch (error) {
            console.error('Error fetching locations from database:', error.message);
            return [];
        }

    },

    locationQuery: async (query, req) => {
        try {
            const [rows] = await connection.query(query, [req.user.id]);
            return rows;
        } catch (error) {
            throw error;
        }
    },

    gmbaccounts: async (req, res) => {
        const accountName = req.query.account_id;
        const accessToken = req.query.accessToken;
        try {
            // SQL query to fetch data from the locations table filtered by user_id
            const query = `SELECT location_id AS name, location_name AS title, website, categories, user_id, last_rank_updated 
                        FROM locations 
                        WHERE user_id = ?`;

            // Execute the query
            const rows = await AuthController.locationQuery(query, req);

            const accounts = await AuthController.getLocations(accessToken, rows);

            res.json({ accounts });
        } catch (error) {
            res.status(500).json({ error: 'Error fetching GMB accounts', debug: error.message });
        }
    },

    fetchKeywords: async (locationId, res) => {
        try {
            const query = `
                SELECT keywords.id, keywords.keyword, keywords.rank
                FROM keywords
                WHERE keywords.location_id = ?`;

            // Use the connection pool to query the database
            const [rows] = await connection.query(query, [locationId]);

            if (rows.length === 0) {
                return { error: true, message: "Keywords are not found for this location" };
            } else {
                return rows; // Return the keywords if successful
            }
        } catch (error) {
            console.error('Error fetching keywords from MySQL:', error);
            throw error; // Rethrow the error to be handled by the caller
        }
    },

    singleDetails: async (req, res) => {
        try {

            const accessToken = req.query.access_token;; // Use optional chaining to prevent error if 'authorization' header is missing
            const locationId = req.query.place_id; // The Google My Business location ID
            const gmb_account_id = req.query.gmb_account_id; // The Google My Business location ID
            const apiKey = process.env.GOOGLE_PLACES_API_KEY

            let keywordLocation = `locations/${locationId}`;

            if (!accessToken) {
                throw new Error('Authorization header is missing or invalid');
            }

            const response = await axios.get(`https://mybusinessaccountmanagement.googleapis.com/v1/locations/${locationId}?readMask=name,storeCode,profile,labels,metadata,categories`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.data;

            if (data == null || data == undefined) {
                res.status(404).json({ error: true, message: "Location is not found" });
            }

            const response3 = await axios.get(`https://mybusiness.googleapis.com/v4/accounts/${gmb_account_id}/locations/${locationId}/media`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const location = data;

            const url = `https://maps.googleapis.com/maps/api/place/details/json?placeid=${location?.metadata?.placeId}&key=${apiKey}`;
            const url1 = `https://mybusiness.googleapis.com/v4/accounts/${gmb_account_id}/locations/${locationId}/reviews`;

            const response1 = await axios.get(url);
            const response2 = await axios.get(url1, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const keywords = await AuthController.fetchKeywords(keywordLocation, res);
            const locationData = response1.data;
            const media = response3.data;


            res.json({ data: location, hasPermission: true, locationData: locationData?.result, reviews: response2.data, media: media, keywords: keywords });
        } catch (error) {

            if (error.response) {
                // Server responded with a status other than 200 range
                console.error('Error response:', error.response.data);
                console.error('Error status:', error.response.status);
                console.error('Error headers:', error.response.headers);
            } else if (error.request) {
                // Request was made but no response received
                console.error('No response received:', error.request);
            } else {
                // Something else caused the error
                console.error('Error message:', error.message);
            }
            console.error('Config:', error.config);


            res.status(500).json({ error: true, message: error.message });
        }
    },

    getPlaceDetailsById: async (req, res) => {
        console.log('function running');

        const placeId = req.query.place_id;
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        const placeDetailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,website,rating,geometry&key=${apiKey}`;

        try {
            // Make a request to the Google Places Details API
            const response = await axios.get(placeDetailsUrl);

            console.log(response)

            // Check for successful response
            if (response.data.status !== 'OK') {
                return res.status(400).json({
                    error: `Error: ${response.data.status}, ${response.data.error_message}`
                });
            }

            // Extract necessary details
            const details = response.data.result;
            const placeDetails = {
                name: details.name || 'N/A',
                address: details.formatted_address || 'N/A',
                phone: details.formatted_phone_number || 'N/A',
                website: details.website || 'N/A',
                rating: details.rating || 'N/A',
                location: details.geometry ? {
                    lat: details.geometry.location.lat,
                    lng: details.geometry.location.lng
                } : null
            };

            // Send the place details as JSON response
            res.json(placeDetails);
        } catch (error) {
            console.error('Error fetching place details:', error.message);
            // Send an error response with status 500
            res.status(500).json({
                error: `Failed to fetch place details: ${error.message}`
            });
        }
    },


    addReplay: async (req, res) => {
        const { accountId, locationId, selectedId, selectedText, accessToken } = req.query;

        if (!accessToken) {
            return res.status(400).json({ error: 'Access token is required' });
        }

        const response = await axios.put(
            `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews/${selectedId}/reply`,
            {
                comment: selectedText,
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        res.status(200).json(response.data);

        try {
        } catch (error) {
            console.error('Error fetching connected accounts:', error);
            res.status(500).json({ error: 'Failed to fetch connected accounts' });
        }
    },


    tokenVerify: (req, res) => {
        const token = req.body.token;

        if (!token) {
            return res.status(400).json({ valid: false, message: 'No token provided' });
        }

        try {
            const decoded = jwt.verify(token, process.env.SECRET);
            res.json({ valid: true, user: decoded });
        } catch (error) {
            res.status(401).json({ valid: false, message: 'Invalid token' });
        }
    },

    
    replayReview: async (req, res) => {
        const { accountId, locationId, selectedId } = req.params;

        const { reply } = req.body;
        const  accessToken  = req.headers['gmb_access_token'] 
        
    
        if (!accessToken) {
            return res.status(400).json({ error: 'Access token is required' });
        }
    
        try {
            const response = await axios.put(
                `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews/${selectedId}/reply`,
                { comment: reply }, 
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`, 
                        'gmb_access_token': accessToken,
                    },
                }
            );
            res.status(200).json(response.data);
        } catch (error) {
            console.error('Error submitting reply:', error);
            res.status(500).json({ error: 'Failed to submit reply' });
        }
    }
    



};

module.exports = AuthController;