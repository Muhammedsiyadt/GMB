const getLocations = async (accountName, accessToken) => {
    try {
        const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,profile,websiteUri,categories`;
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        };

        const response = await axios.get(url, { headers });
        const { data } = response;

        return data.locations || [];
    } catch (error) {
        if (error.response && error.response.data && error.response.data.error && error.response.data.error.details.fieldViolations) {
            console.error('Error fetching locations:', error.response.data.error.details);
        } else {
            console.error('Error fetching locations:', error.message);
        }
        return [];
    }
};


module.exports = getLocations;