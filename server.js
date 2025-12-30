require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const firebase = require('firebase/compat/app');
require('firebase/compat/database');

const app = express();
app.use(express.static(__dirname));
app.use(bodyParser.json());

// 1. FIREBASE INITIALIZATION (Compat mode for Node.js)
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    databaseURL: process.env.FIREBASE_DB_URL
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// 2. KICK API CONFIG
const KICK_API_BASE = "https://api.kick.com/v1";
let authToken = null;

async function refreshAccessToken() {
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', process.env.KICK_CLIENT_ID);
        params.append('client_secret', process.env.KICK_CLIENT_SECRET);
        params.append('scope', 'chat.message:write chat.message:read');

        const response = await axios.post('https://id.kick.com/oauth/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        authToken = response.data.access_token;
        console.log("🔑 [Kick API] Access Token yenilendi.");
    } catch (error) {
        const errorData = error.response?.data;
        console.error("❌ [Kick API] Token alınamadı:", errorData || error.message);
        if (errorData?.error === 'invalid_scope') {
            console.log("ℹ️ Scope hatası algılandı, scope'suz deneniyor...");
            // Scope'suz tekrar dene (bazı uygulamalarda scope gerekmez)
            try {
                const params = new URLSearchParams();
                params.append('grant_type', 'client_credentials');
                params.append('client_id', process.env.KICK_CLIENT_ID);
                params.append('client_secret', process.env.KICK_CLIENT_SECRET);
                const res = await axios.post('https://id.kick.com/oauth/token', params);
                authToken = res.data.access_token;
                console.log("🔑 [Kick API] Access Token (Scope'suz) başarıyla alındı.");
            } catch (e) {
                console.error("❌ [Kick API] Tamamen başarısız.");
            }
        }
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
        console.log(`📤 [Official API] Mesaj: ${content}`);
    } catch (e) { console.error("Mesaj gönderilemedi:", e.message); }
}

// 4. WEBHOOK HANDLER
app.post('/kick/webhook', async (req, res) => {
    const event = req.body;
    if (event.type === 'chat.message.sent') {
        const { content, sender } = event.data;
        const user = sender.username;
        const message = content.trim();
        const lowerMsg = message.toLowerCase();

        console.log(`📩 [Chat] ${user}: ${message}`);

        if (lowerMsg.startsWith('!selam')) await sendChatMessage(`Aleyküm selam @${user}! 👋`);
        if (lowerMsg.startsWith('!bakiye')) {
            const snap = await db.ref('users/' + user.toLowerCase()).once('value');
            const data = snap.val() || { balance: 1000 };
            await sendChatMessage(`@${user}, Bakiyeniz: ${data.balance.toLocaleString()} 💰`);
        }
        if (lowerMsg.startsWith('!market')) {
            await sendChatMessage(`@${user}, Mağaza & Market panelin: https://aloskegangbot-market.onrender.com 🛒`);
        }
    }
    res.status(200).send('OK');
});

// 5. ANA SAYFA
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'shop.html'));
});

// 6. SERVER START
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 KickBot Official API on Port ${PORT}`);
    await refreshAccessToken();
});
