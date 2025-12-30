require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const firebase = require('firebase/app');
require('firebase/database');

const app = express();

// 1. STATİK DOSYALAR (Resimdeki bozuk görünümü düzeltmek için kritik)
app.use(express.static(__dirname));
app.use(bodyParser.json());

// 2. FIREBASE INITIALIZATION
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    databaseURL: process.env.FIREBASE_DB_URL
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// 3. KICK API CONFIG
const KICK_API_BASE = "https://api.kick.com/v1";
let authToken = null;

async function refreshAccessToken() {
    try {
        const response = await axios.post('https://id.kick.com/oauth/token', {
            grant_type: 'client_credentials',
            client_id: process.env.KICK_CLIENT_ID,
            client_secret: process.env.KICK_CLIENT_SECRET,
            scope: 'chat.message:write chat.message:read'
        });
        authToken = response.data.access_token;
        console.log("🔑 [Kick API] Access Token yenilendi.");
    } catch (error) {
        console.error("❌ [Kick API] Token alınamadı:", error.response?.data || error.message);
    }
}

async function sendChatMessage(content) {
    if (!authToken) await refreshAccessToken();
    try {
        await axios.post(`${KICK_API_BASE}/chat`, {
            content: content
        }, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (e) { console.error("Mesaj gönderilemedi:", e.message); }
}

// 4. WEBHOOK (KICK BURAYA VERİ GÖNDERECEK)
app.post('/kick/webhook', async (req, res) => {
    const event = req.body;
    console.log("📩 Yeni Event Geldi:", event.type);

    if (event.type === 'chat.message.sent') {
        const user = event.data.sender.username;
        const message = event.data.content;
        const lowerMsg = message.toLowerCase().trim();

        if (lowerMsg === '!selam') {
            await sendChatMessage(`Aleyküm selam @${user}, hoş geldin kardeş! 👋`);
        }
        // Diğer komutları buraya ekleyeceğiz...
    }
    res.status(200).send('OK');
});

// 5. MARKET SAYFASI (ANA SAYFA)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'shop.html'));
});

// 6. SERVER START
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 KickBot API Active on Port ${PORT}`);
    await refreshAccessToken();
});
