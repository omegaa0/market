// shop.js - Dynamic Channel Market Implementation
const firebaseConfig = {
    apiKey: "AIzaSyCfAiqV9H8I8pyusMyDyxSbjJ6a3unQaR8",
    authDomain: "kickbot-market.firebaseapp.com",
    databaseURL: "https://kickbot-market-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "kickbot-market",
    storageBucket: "kickbot-market.firebasestorage.app",
    messagingSenderId: "301464297024",
    appId: "1:301464297024:web:7cdf849aa950b8ba0649a5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentUser = null;
let currentChannelId = null;

const FREE_COMMANDS = [
    { cmd: "!bakiye", desc: "Mevcut paranı sorgula" },
    { cmd: "!günlük", desc: "Günlük hediye paranı al" },
    { cmd: "!çalış", desc: "Mesleğinde çalışıp para kazan" },
    { cmd: "!slot [miktar]", desc: "Slot makinesinde şansını dene" },
    { cmd: "!yazitura [miktar] [yazı/tura]", desc: "Yazı-tura bahis oyunu" },
    { cmd: "!kutu [miktar]", desc: "Gizemli kutu aç" },
    { cmd: "!duello @isim [miktar]", desc: "Başkasına meydan oku" },
    { cmd: "!soygun", desc: "Bebeklerle banka soy" },
    { cmd: "!zenginler", desc: "Kanalın en zenginlerini gör" },
    { cmd: "!fal", desc: "Geleceğine dair ipucu al" },
    { cmd: "!ship @isim", desc: "Aşk uyumunuzu test et" },
    { cmd: "!hava [şehir]", desc: "Hava durumunu öğren" }
];

// UI Elements
const authContainer = document.getElementById('auth-container');
const mainContent = document.getElementById('main-content');
const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const usernameInput = document.getElementById('username-input');
const codeDisplay = document.getElementById('auth-code');
const cmdExample = document.getElementById('cmd-example');
const marketGrid = document.getElementById('market-items');
const toast = document.getElementById('toast');
const channelBadge = document.getElementById('channel-badge');
const freeCmdContainer = document.getElementById('free-commands');

let currentPreview = null;
let currentPreviewTimeout = null;

function init() {
    const savedUser = localStorage.getItem('aloskegang_user');
    renderFreeCommands();
    if (savedUser) { login(savedUser); } else { showAuth(); }
    document.getElementById('generate-code-btn').addEventListener('click', startAuth);
    document.getElementById('back-btn').addEventListener('click', showAuth);
    document.getElementById('logout-btn').addEventListener('click', logout);
}

function renderFreeCommands() {
    freeCmdContainer.innerHTML = "";
    FREE_COMMANDS.forEach(c => {
        const item = document.createElement('div');
        item.style.padding = "10px";
        item.style.background = "rgba(255,255,255,0.02)";
        item.style.borderRadius = "8px";
        item.style.border = "1px solid var(--glass-border)";
        item.innerHTML = `
            <div style="color:var(--primary); font-weight:600; font-size:0.9rem;">${c.cmd}</div>
            <div style="color:#777; font-size:0.75rem; margin-top:2px;">${c.desc}</div>
        `;
        freeCmdContainer.appendChild(item);
    });
}

async function fetchKickPFP(username) {
    try {
        const pfpImg = document.getElementById('user-pfp');
        const fallback = document.getElementById('user-pfp-fallback');

        // We use a proxy because Kick API has CORS protection
        const res = await fetch(`https://kick.com/api/v2/channels/${username}`);
        const data = await res.json();

        if (data.user && data.user.profile_pic) {
            pfpImg.src = data.user.profile_pic;
            pfpImg.style.display = 'block';
            fallback.style.display = 'none';
        }
    } catch (e) {
        console.log("PFP fetch error (CORS or server)", e);
        // Fallback remains visible
    }
}

function showAuth() {
    authContainer.classList.remove('hidden');
    mainContent.classList.add('hidden');
    step1.classList.remove('hidden');
    step2.classList.add('hidden');
    db.ref('pending_auth').off();
}

function startAuth() {
    const user = usernameInput.value.toLowerCase().trim();
    if (user.length < 3) return showToast("Geçersiz kullanıcı adı!", "error");
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    db.ref('pending_auth/' + user).set({ code, timestamp: Date.now() }).then(() => {
        codeDisplay.innerText = code;
        cmdExample.innerText = `!doğrulama ${code}`;
        step1.classList.add('hidden');
        step2.classList.remove('hidden');
        db.ref('auth_success/' + user).on('value', (snap) => {
            if (snap.val()) { db.ref('auth_success/' + user).remove(); login(user); }
        });
    });
}

function login(user) {
    currentUser = user;
    localStorage.setItem('aloskegang_user', user);
    authContainer.classList.add('hidden');
    mainContent.classList.remove('hidden');
    document.getElementById('display-name').innerText = user.toUpperCase();
    document.getElementById('hero-name').innerText = user.toUpperCase();

    // Setup PFP
    const fallback = document.getElementById('user-pfp-fallback');
    fallback.innerText = user[0].toUpperCase();
    fetchKickPFP(user);

    db.ref('users/' + user).on('value', (snap) => {
        const data = snap.val() || { balance: 0, auth_channel: null };
        document.getElementById('user-balance').innerText = `${(data.balance || 0).toLocaleString()} 💰`;
        if (data.auth_channel && data.auth_channel !== currentChannelId) {
            currentChannelId = data.auth_channel;
            loadChannelMarket(currentChannelId);
        } else if (!data.auth_channel) {
            document.getElementById('no-channel-msg').classList.remove('hidden');
            marketGrid.innerHTML = "";
            channelBadge.classList.add('hidden');
            document.getElementById('market-status').innerText = "Market ürünlerini görmek için herhangi bir kanalda !doğrulama yapmalısın.";
        }
    });
}

async function loadChannelMarket(channelId) {
    document.getElementById('no-channel-msg').classList.add('hidden');
    channelBadge.classList.remove('hidden');
    const snap = await db.ref('channels/' + channelId).once('value');
    const channelData = snap.val() || {};
    const settings = channelData.settings || {};
    const sounds = settings.custom_sounds || {};

    const chanName = channelData.username || "Kick Kanalı";
    document.getElementById('chan-name').innerText = chanName;

    // Broadcaster PFP Fetch
    try {
        const res = await fetch(`https://kick.com/api/v2/channels/${chanName}`);
        const data = await res.json();
        if (data.user && data.user.profile_pic) {
            document.getElementById('chan-pfp').src = data.user.profile_pic;
        }
    } catch (e) { console.log("Broadcaster PFP error", e); }

    // Side GIFs Update
    const leftGif = settings.left_gif || "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHlxYnV4YzB6MzB6bmR4bmR4bmR4bmR4bmR4bmR4bmR4bmR4bmR4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKMGpxPucV0G3S0/giphy.gif";
    const rightGif = settings.right_gif || "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHlxYnV4YzB6MzB6bmR4bmR4bmR4bmR4bmR4bmR4bmR4bmR4bmR4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKMGpxPucV0G3S0/giphy.gif";

    const leftGifEl = document.querySelector('.side-gif.left img');
    const rightGifEl = document.querySelector('.side-gif.right img');
    if (leftGifEl) leftGifEl.src = leftGif;
    if (rightGifEl) rightGifEl.src = rightGif;

    document.getElementById('market-status').innerText = `${chanName} market ürünleri yönetiliyor.`;
    marketGrid.innerHTML = "";

    // 1. MUTE
    const muteCost = settings.mute_cost || 10000;
    renderItem("🚫 Kullanıcı Sustur", "Hedeflenen kişiyi 10 dakika boyunca susturur.", muteCost, "mute");

    // 2. TTS
    const ttsCost = settings.tts_cost || 2500;
    renderItem("🎙️ TTS (Sesli Mesaj)", "Mesajınızı yayında seslendirir.", ttsCost, "tts");

    // 3. SOUNDS
    Object.entries(sounds).forEach(([name, data]) => {
        renderItem(`🎵 Ses: !ses ${name}`, "Kanalda özel ses efekti çalar.", data.cost, "sound", name, data.url, data.duration || 0);
    });
}

function renderItem(name, desc, price, type, trigger = "", soundUrl = "", duration = 0) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div class="item-icon">${type === 'tts' ? '🎙️' : (type === 'mute' ? '🚫' : '🎵')}</div>
            ${type === 'sound' ? `
                <div style="display:flex; gap:10px;">
                    <button onclick="previewShopSound('${soundUrl}', ${duration})" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:1.5rem; padding:0;">▶️</button>
                    <button onclick="stopAllPreviews()" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.5rem; padding:0;">⏹️</button>
                </div>
            ` : ''}
        </div>
        <h3>${name}</h3>
        <p>${desc}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <span class="price-tag" style="margin:0;">${parseInt(price).toLocaleString()} 💰</span>
            ${duration > 0 ? `<small style="color:#666">${duration}sn</small>` : ''}
        </div>
        <button class="buy-btn" onclick="executePurchase('${type}', '${trigger}', ${price})">Hemen Uygula</button>
    `;
    marketGrid.appendChild(card);
}

function previewShopSound(url, duration) {
    stopAllPreviews();

    currentPreview = new Audio(url);
    currentPreview.volume = 0.5;
    currentPreview.play().catch(e => console.error("Önizleme hatası:", e));

    if (duration > 0) {
        currentPreviewTimeout = setTimeout(() => {
            stopAllPreviews();
        }, duration * 1000);
    }
}

function stopAllPreviews() {
    if (currentPreview) {
        currentPreview.pause();
        currentPreview.currentTime = 0;
        currentPreview = null;
    }
    if (currentPreviewTimeout) {
        clearTimeout(currentPreviewTimeout);
        currentPreviewTimeout = null;
    }
}


async function executePurchase(type, trigger, price) {
    if (!currentUser || !currentChannelId) return;
    const userSnap = await db.ref('users/' + currentUser).once('value');
    const userData = userSnap.val() || { balance: 0 };
    const isInf = userData.is_infinite;
    if (!isInf && (userData.balance || 0) < price) { return showToast("Bakiye yetersiz! ❌", "error"); }

    let userInput = "";
    if (type === 'tts') {
        userInput = prompt("Mesajınızı girin:");
        if (!userInput) return;
    } else if (type === 'mute') {
        userInput = prompt("Susturulacak kullanıcının adını girin (Örn: aloske):");
        if (!userInput) return;
        userInput = userInput.replace('@', '').toLowerCase().trim();
    } else {
        if (!confirm(`"${trigger}" sesi çalınsın mı?`)) return;
    }

    if (!isInf) {
        await db.ref('users/' + currentUser).transaction(u => { if (u) u.balance -= price; return u; });
    }

    if (type === 'tts') {
        await db.ref(`channels/${currentChannelId}/stream_events/tts`).push({
            text: `@${currentUser} (Market) diyor ki: ${userInput}`,
            played: false, notified: false, source: "market", timestamp: Date.now(), broadcasterId: currentChannelId
        });
    } else if (type === 'sound') {
        const snap = await db.ref(`channels/${currentChannelId}/settings/custom_sounds/${trigger}`).once('value');
        const sound = snap.val();
        if (sound) {
            await db.ref(`channels/${currentChannelId}/stream_events/sound`).push({
                soundId: trigger, url: sound.url, volume: sound.volume || 100, duration: sound.duration || 0,
                buyer: currentUser, source: "market",
                played: false, notified: false, timestamp: Date.now(), broadcasterId: currentChannelId
            });
        }
    } else if (type === 'mute') {
        await db.ref(`channels/${currentChannelId}/stream_events/mute`).push({
            user: currentUser, target: userInput, timestamp: Date.now(), broadcasterId: currentChannelId
        });
        await db.ref(`users/${userInput}/bans/${currentChannelId}`).transaction(c => (c || 0) + 1);
    }
    showToast("İşlem Başarılı! 🚀", "success");
}

function logout() { localStorage.removeItem('aloskegang_user'); location.reload(); }
function showToast(msg, type) {
    toast.innerText = msg; toast.className = `toast ${type}`; toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}
// TABS LOGIC
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('tab-' + id).classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');

    if (id === 'leaderboard') loadLeaderboard();
    if (id === 'quests') loadQuests();
    if (id === 'profile') loadProfile();
}

let lbType = 'global';
async function switchLB(type) {
    lbType = type;
    document.querySelectorAll('#tab-leaderboard .primary-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');
    loadLeaderboard();
}

async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    container.innerHTML = `<div class="loading-spinner"></div>`;
    try {
        const res = await fetch('/api/leaderboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: lbType, channelId: currentChannelId })
        });
        const list = await res.json();
        container.innerHTML = "";
        list.forEach((u, i) => {
            const item = document.createElement('div');
            item.className = 'leader-item';
            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px;">
                    <span class="rank">${i + 1}.</span>
                    <span style="font-weight:600;">${u.name.toUpperCase()}</span>
                </div>
                <span style="color:var(--primary); font-weight:800;">${u.balance.toLocaleString()} 💰</span>
            `;
            container.appendChild(item);
        });
    } catch (e) {
        console.error("Leaderboard Tablosu Hatası:", e);
        container.innerHTML = "<p>Leaderboard şu an yüklenemiyor.</p>";
    }
}

async function loadQuests() {
    if (!currentUser) return;
    const container = document.getElementById('quests-container');
    container.innerHTML = `<div class="loading-spinner"></div>`;

    try {
        const qRes = await fetch('/admin-api/get-quests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'PUBLIC' })
        });
        const globalQuests = await qRes.json();

        db.ref('users/' + currentUser).once('value', snap => {
            const u = snap.val() || {};
            const today = new Date().toLocaleDateString('tr-TR').replace(/\./g, '-');
            const userToday = u.quests?.[today] || { m: 0, g: 0, d: 0, claimed: {} };

            container.innerHTML = "";
            if (Object.keys(globalQuests).length === 0) {
                container.innerHTML = "<p style='text-align:center; color:var(--muted);'>Şu an aktif görev yok.</p>";
                return;
            }

            Object.entries(globalQuests).forEach(([id, q]) => {
                const currentProgress = userToday[q.type] || 0;
                const isClaimed = userToday.claimed?.[id];
                const isDone = currentProgress >= q.goal;
                const percent = Math.min(100, (currentProgress / q.goal) * 100);

                const card = document.createElement('div');
                card.className = 'quest-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3>${q.name}</h3>
                        <span style="color:var(--primary); font-weight:700;">+${q.reward.toLocaleString()} 💰</span>
                    </div>
                    <p>Görev Türü: ${q.type === 'm' ? 'Sohbet' : q.type === 'g' ? 'Kumar' : q.type === 'w' ? '👁️ İzleme' : '⚔️ Düello'}</p>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${percent}%"></div></div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <small>${currentProgress}/${q.goal} ${q.type === 'm' ? 'Mesaj' : 'İşlem'}</small>
                        <button class="primary-btn" style="width:auto; padding:8px 20px;" 
                            ${isDone && !isClaimed ? '' : 'disabled'} onclick="claimQuest('${id}')">
                            ${isClaimed ? 'ALINDI' : (isDone ? 'ÖDÜLÜ AL' : 'TAMAMLA')}
                        </button>
                    </div>
                `;
                container.appendChild(card);
            });
        });
    } catch (e) { container.innerHTML = "<p>Görevler yüklenemedi.</p>"; }
}

async function claimQuest(questId) {
    if (!currentUser) return;
    try {
        const res = await fetch('/api/claim-quest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser, questId })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`🎉 +${data.reward} 💰 aldın!`, "success");
            loadQuests();
            loadProfile();
        } else {
            showToast(data.error, "error");
        }
    } catch (e) { showToast("Bağlantı hatası!", "error"); }
}

async function loadProfile() {
    if (!currentUser) return;
    const container = document.getElementById('profile-card');
    db.ref('users/' + currentUser).once('value', snap => {
        const u = snap.val() || { balance: 0 };
        container.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:25px;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                    <div class="stat-box">
                        <label>Cüzdan</label>
                        <div class="val">${u.balance.toLocaleString()} 💰</div>
                    </div>
                    <div class="stat-box">
                        <label>Meslek</label>
                        <div class="val">${u.job || 'İşsiz'}</div>
                    </div>
                    <div class="stat-box">
                        <label>Kayıt Tarihi</label>
                        <div class="val">${new Date(u.created_at || Date.now()).toLocaleDateString('tr-TR')}</div>
                    </div>
                    <div class="stat-box">
                        <label>Durum</label>
                        <div class="val">${u.is_infinite ? '♾️ Sınırsız' : '👤 Oyuncu'}</div>
                    </div>
                </div>
                
                <div class="stats-section">
                    <h3 style="margin-bottom:15px; font-size:1rem; opacity:0.8;">📈 Ömür Boyu İstatistikler</h3>
                    <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:15px; margin-bottom:15px;">
                        <div class="stat-mini">
                            <label>Mesaj</label>
                            <div class="v">${u.lifetime_m || 0}</div>
                        </div>
                        <div class="stat-mini">
                            <label>Kumar</label>
                            <div class="v">${u.lifetime_g || 0}</div>
                        </div>
                        <div class="stat-mini">
                            <label>Düello</label>
                            <div class="v">${u.lifetime_d || 0}</div>
                        </div>
                        <div class="stat-mini" style="background:rgba(255,255,255,0.05); border:1px solid var(--primary);">
                            <label style="color:var(--primary);">Günlük İzleme</label>
                            <div class="v" style="color:var(--primary);">${u.quests?.[new Date().toLocaleDateString('tr-TR').replace(/\./g, '-')]?.w || 0} dk</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

init();
