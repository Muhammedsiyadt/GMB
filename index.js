require("dotenv").config();
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const morgan = require('morgan');  // Import morgan for logging
const app = express();
const cors = require('cors');
const connection = require('./connection/db');
const AuthRoutes = require('./routes/AuthRoutes');
const GMBRoutes = require('./routes/GMBRoutes');
const multer = require('multer');
const upload = multer();
const bodyParser = require('body-parser');

app.use(cors({
    origin: 'https://xenproductions.co.in',
    credentials: true,
}));
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use morgan for logging requests in 'dev' format
app.use(morgan('dev')); 

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

app.use(morgan('dev', {
    skip: (req, res) => req.method !== 'GET'  // Only log GET requests
}));


cron.schedule('*/10 * * * * *', async () => {
    try {
        const [posts] = await connection.query('SELECT * FROM scheduleposts WHERE status = "pending"');
        // if (posts.length === 0) {
        //     console.log('No pending posts found.');
        // } else {
        //     console.log(`Found ${posts.length} pending post(s).`);
        // }

        for (const post of posts) {
            const { id, publicationDate, account, location_id, postContent, accessToken, imageUrl } = post;

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
                    console.log('Post ID', id, 'posted successfully');
                    await connection.query(
                        'UPDATE scheduleposts SET status = ? WHERE id = ?',
                        ['posted', id]
                    );
                } catch (error) {
                    console.log('Error posting to API for Post ID', id, error.message);
                }
            } else {
                // console.log(`Post ID ${id} not yet ready for publication.`);
            }
        }
    } catch (error) {
        console.log('Cron job error:', error.message);
    }
});


app.listen(process.env.PORT || 5000, (error) => {
    if (error) {
        throw new Error(error.message);
    }
    console.log('Server listening on port: ' + process.env.PORT);
});
