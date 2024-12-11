const axios = require('axios');

const fetchRank = async (req, res) => {
    try {
        const keywords = req.body.data.keywords;
        const apiKey = process.env.SERPAPI_KEY;
        
        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No keywords provided'
            });
        }

        const organicResults = [];

        for (const keywordObj of keywords) {
            const keyword = keywordObj.keyword;
            
            if (!keyword) {
                console.warn('Skipping empty keyword');
                continue;
            }
            
            try {
                const response = await axios.get('https://serpapi.com/search.json', {
                    params: {
                        engine: 'google_local',
                        q: keyword,
                        api_key: apiKey
                    },
                    timeout: 10000
                });

                const resultsWithKeyword = response.data.local_results.map(result => ({
                    ...result,
                    originalKeyword: keyword,  // Add original keyword info
                    position: result.position || 'Not Found'
                }));

                organicResults.push(...resultsWithKeyword);

            } catch (keywordError) {
                console.error(`Error fetching rank for keyword ${keyword}:`, keywordError.message);
                organicResults.push({
                    originalKeyword: keyword,
                    position: 'Error',
                    error: keywordError.message
                });
            }
        }

        res.status(200).send({
            success: true,
            local_results: organicResults
        });

    } catch (error) {
        console.error('Unexpected error in fetchRank:', error);
        res.status(500).json({
            success: false,
            message: 'Unexpected error fetching ranks',
            error: error.message
        });
    }
};

module.exports = { fetchRank };
