const axios = require('axios');
require('dotenv').config();

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;

async function testFetch() {
    // We need a real token for this, but maybe we can find a public one or use the one from DB if we could.
    // Since I can't easily get a valid token right now without reading DB, 
    // I'll just try the public ones with different formats to see which one doesn't 404.

    const endpoints = [
        'https://kickstats.com/api/v1/channel/aloskegang',
        'https://kick.com/api/v1/channels/aloskegang',
        'https://kick.com/api/v2/channels/aloskegang'
    ];

    const uas = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
    ];

    for (const url of endpoints) {
        try {
            console.log(`Testing ${url}...`);
            const res = await axios.get(url, {
                headers: { 'User-Agent': uas[1] }, // Use iPhone UA
                timeout: 5000
            });
            console.log(`SUCCESS [${res.status}]: ${JSON.stringify(res.data).substring(0, 100)}`);
        } catch (err) {
            console.log(`FAIL [${err.response?.status || err.message}]`);
        }
    }
}

testFetch();
