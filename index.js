require("dotenv").config();
const express = require('express');
const cron = require('node-cron');  // Import node-cron for scheduling
const axios = require('axios');
const app = express();
const cors = require('cors');
const connection = require('./connection/db');
const AuthRoutes = require('./routes/AuthRoutes');
const GMBRoutes = require('./routes/GMBRoutes');
const multer = require('multer');
const upload = multer();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', AuthRoutes);
app.use('/api/gmb', GMBRoutes);

app.get('/', (req, res) => {
    const serverInfo = {
        status: 'running',
        serverTime: new Date().toISOString(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        databaseConnection: connection.state === 'authenticated' ? 'connected' : 'disconnected',
    };
    res.json(serverInfo);
});


cron.schedule('*/10 * * * * *', async () => {
    try {

        // console.log('Crone checking every 10 seconds...')
        
        const [posts] = await connection.query('SELECT * FROM scheduleposts WHERE status = "pending"');



        for (const post of posts) {
            const { id, publicationDate, account, location_id, postContent, accessToken , imageUrl} = post;
            
            const currentDate = new Date();

            
            if (currentDate >= new Date(publicationDate)) {
                const postBody = {
                    languageCode: "en-US",
                    topicType: "STANDARD",
                    summary: postContent,
                    media: [
                        {
                            mediaFormat: 'PHOTO',
                            sourceUrl: post.imageUrl,
                        },
                    ], 
                };  
                
  
                 
                try {
                    const response = await axios.post( 
                        `https://mybusiness.googleapis.com/v4/${account}/${location_id}/localPosts`,
                        postBody,
                        {
                            headers: {
                                Authorization: `Bearer ${accessToken}`,
                            },
                        }
                    ); 
                    await connection.query(
                        'UPDATE scheduleposts SET status = ? WHERE id = ?',
                        ['posted', id]
                    ); 

                    console.log(`Post ID ${id} posted successfully at ${new Date().toISOString()}`);
                } catch (error) {
                    // console.error(`Error posting ID ${id}:`, error);
                    console.log('Crone error in index.js');
                    
                }
            }
        }
    } catch (error) {
        // console.error('Error fetching scheduled posts:', error);
        console.log('Crone error in index.js'); 

    }
});

app.listen(process.env.PORT || 5000, (error) => {
    if (error) {
        throw new Error(error.message);
    }
    console.log('Server listening on port: ' + process.env.PORT);
});
