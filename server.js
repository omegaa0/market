require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const firebase = require('firebase/compat/app');
require('firebase/compat/database');

const app = express();
app.use(express.static(__dirname));
app.use(bodyParser.json());

// 1. FIREBASE INITIALIZATION
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    databaseURL: process.env.FIREBASE_DB_URL
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;
const REDIRECT_URI = "https://aloskegangbot-market.onrender.com/auth/kick/callback";

// PKCE
function base64UrlEncode(str) { return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''); }
function generatePKCE() {
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}

// ---------------------------------------------------------
// 2. AUTH & DİNAMİK KANAL TESPİTİ (YÜKLENİYOR...)
// ---------------------------------------------------------
app.get('/login', async (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const { verifier, challenge } = generatePKCE();
    await db.ref('temp_auth/' + state).set({ verifier, createdAt: Date.now() });
    const scopes = "chat:write events:subscribe user:read channel:read";
    const authUrl = `https://id.kick.com/oauth/authorize?client_id=${KICK_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    res.redirect(authUrl);
});

app.get('/auth/kick/callback', async (req, res) => {
    const { code, state } = req.query;
    const tempAuth = (await db.ref('temp_auth/' + state).once('value')).val();
    if (!tempAuth) return res.send("Oturum zaman aşımı.");
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('client_id', KICK_CLIENT_ID);
        params.append('client_secret', KICK_CLIENT_SECRET);
        params.append('redirect_uri', REDIRECT_URI);
        params.append('code_verifier', tempAuth.verifier);

        const response = await axios.post('https://id.kick.com/oauth/token', params);
        const { access_token, refresh_token } = response.data;

        // 🔥 DÜZELTİLEN KISIM: 'users' (çoğul) ve veri yolu
        const userRes = await axios.get('https://api.kick.com/public/v1/users', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        // Kick API, users endpointinden bir DİZİ (Array) döndürür.
        const userData = userRes.data.data[0];
        const broadcasterId = userData.user_id;
        const username = userData.name;

        await db.ref('bot_tokens').set({
            access_token,
            refresh_token,
            broadcaster_id: broadcasterId,
            bot_username: username,
            updatedAt: Date.now()
        });

        await subscribeToChat(access_token, broadcasterId);

        res.send(`<body style='background:#111;color:lime;text-align:center;padding-top:100px;font-family:sans-serif;'>
            <h1 style='font-size:4rem'>✅ BAŞARILI!</h1>
            <p style='font-size:1.5rem'>Bot <b>@${username}</b> hesabıyla bağlandı.</p>
            <p style='color:#888'>Artık kanaldaki chat mesajlarını dinliyor.</p>
        </body>`);
    } catch (e) {
        console.error("KRİTİK HATA:", e.response?.data || e.message);
        res.status(500).json({ error: "Giriş başarısız", detay: e.response?.data || e.message });
    }
});

async function subscribeToChat(token, broadcasterId) {
    try {
        await axios.post('https://api.kick.com/public/v1/events/subscriptions', {
            broadcaster_user_id: parseInt(broadcasterId),
            events: [{ name: "chat.message.sent", version: 1 }],
            method: "webhook"
        }, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        console.log(`✅ ${broadcasterId} için abonelik kuruldu.`);
    } catch (e) { console.error("Abonelik hatası:", e.response?.data || e.message); }
}

// ---------------------------------------------------------
// 3. MESAJ MOTORU
// ---------------------------------------------------------
async function sendChatMessage(content) {
    const snap = await db.ref('bot_tokens').once('value');
    const data = snap.val();
    if (!data) return;
    try {
        await axios.post(`https://api.kick.com/public/v1/chat`, {
            content: content,
            type: "user",
            broadcaster_user_id: parseInt(data.broadcaster_id)
        }, {
            headers: { 'Authorization': `Bearer ${data.access_token}` }
        });
    } catch (e) {
        if (e.response?.status === 401) {
            await refreshMyToken();
            return sendChatMessage(content);
        }
    }
}

async function refreshMyToken() {
    const snap = await db.ref('bot_tokens').once('value');
    const tokenData = snap.val();
    if (!tokenData) return;
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', tokenData.refresh_token);
    params.append('client_id', KICK_CLIENT_ID);
    params.append('client_secret', KICK_CLIENT_SECRET);
    const res = await axios.post('https://id.kick.com/oauth/token', params);
    await db.ref('bot_tokens').update({ access_token: res.data.access_token, refresh_token: res.data.refresh_token });
}

// ---------------------------------------------------------
// 4. WEBHOOK (KOMUTLAR)
// ---------------------------------------------------------
app.post('/kick/webhook', async (req, res) => {
    const event = req.body;
    res.status(200).send('OK');

    if (event.type === 'chat.message.sent') {
        const user = event.data.sender.username;
        const msg = event.data.content.trim().toLowerCase();

        if (msg === '!selam' || msg === 'sa') {
            await sendChatMessage(`Aleyküm selam @${user}! Sunucu botu emrinde. 🦾`);
        }
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'shop.html')); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Akıllı Bot v16.1 Yayında!`));
