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

function getTodayKey() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

let currentUser = null;
let currentChannelId = null;

const FREE_COMMANDS = [
    { cmd: "!bakiye", desc: "Mevcut paranı sorgular" },
    { cmd: "!günlük", desc: "Günlük hediye paranı alır" },
    { cmd: "!kredi", desc: "Timeout karşılığı bakiye alır" },
    { cmd: "!zenginler", desc: "Kanalın en zenginlerini listeler" },
    { cmd: "!slot [miktar]", desc: "Slot makinesinde şansını dener" },
    { cmd: "!yazitura [miktar] [y/t]", desc: "Yazı-tura bahis oyunu" },
    { cmd: "!kutu [miktar]", desc: "Gizemli kutu açar" },
    { cmd: "!duello @isim [miktar]", desc: "Başkasına meydan okur" },
    { cmd: "!soygun", desc: "Banka soygunu başlatır/katılır" },
    { cmd: "!atyarışı [miktar] [1-5]", desc: "At yarışına bahis yatırır" },
    { cmd: "!piyango katıl", desc: "Aktif piyangoya bilet alır" },
    { cmd: "!fal", desc: "Geleceğine dair ipucu alır" },
    { cmd: "!burç [burç]", desc: "Günlük burç yorumunu çeker" },
    { cmd: "!söz", desc: "Rastgele anlamlı bir söz paylaşır" },
    { cmd: "!efkar", desc: "Efkar seviyesini ölçer" },
    { cmd: "!hava [şehir]", desc: "Hava durumunu öğrenir" },
    { cmd: "!borsa", desc: "Küresel borsa durumunu görür" },
    { cmd: "!borsa al [kod] [adet]", desc: "Hisse senedi satın alır" },
    { cmd: "!borsa sat [kod] [adet]", desc: "Hisse senedi satışı yapar" }
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

    // 3. SR
    const srCost = settings.sr_cost || 5000;
    renderItem("🎵 Şarkı İsteği (!sr)", "YouTube'dan istediğiniz şarkıyı açar.", srCost, "sr");

    // 4. SOUNDS
    Object.entries(sounds).forEach(([name, data]) => {
        renderItem(`🎵 Ses: !ses ${name}`, "Kanalda özel ses efekti çalar.", data.cost, "sound", name, data.url, data.duration || 0);
    });
}

function renderItem(name, desc, price, type, trigger = "", soundUrl = "", duration = 0) {
    const card = document.createElement('div');
    card.className = 'item-card';
    const icon = type === 'tts' ? '🎙️' : (type === 'mute' ? '🚫' : (type === 'sr' ? '🎵' : '🎼'));
    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div class="item-icon">${icon}</div>
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
    } else if (type === 'sr') {
        userInput = prompt("YouTube Video Linkini Yapıştırın:");
        if (!userInput) return;
        if (!userInput.includes('youtube.com') && !userInput.includes('youtu.be')) {
            alert("Lütfen geçerli bir YouTube linki girin!");
            return;
        }
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
    } else if (type === 'sr') {
        await db.ref(`channels/${currentChannelId}/stream_events/song_requests`).push({
            query: userInput, user: currentUser, source: "market",
            played: false, timestamp: Date.now(), broadcasterId: currentChannelId
        });
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
    if (id === 'borsa') loadBorsa();
    if (id === 'quests') loadQuests();
    if (id === 'profile') loadProfile();
}

let borsaActive = false;
async function loadBorsa() {
    const container = document.getElementById('borsa-items');
    if (!container) return;

    if (borsaActive) return;
    borsaActive = true;

    container.innerHTML = `<div style="text-align:center; width:100%; padding:60px;"><div class="loader"></div><p style="margin-top:10px;">Borsa verileri yükleniyor...</p></div>`;

    const renderStocks = (stocks) => {
        if (!stocks) return;

        // --- HATA KONTROLÜ ---
        if (stocks.error) {
            console.error("Borsa Error Data:", stocks.error);
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align:center; padding: 40px; background: rgba(255,50,50,0.05); border-radius: 15px; border: 1px solid rgba(255,50,50,0.2);">
                    <div style="font-size: 2rem; margin-bottom: 10px;">⚠️</div>
                    <h3 style="color:#ff4d4d;">Borsa Bağlantı Hatası</h3>
                    <p style="font-size:0.8rem;">${stocks.error}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = "";
        const entries = Object.entries(stocks);

        if (entries.length === 0) {
            container.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding:40px;">Borsa şu an kapalı.</p>`;
            return;
        }

        entries.forEach(([code, data]) => {
            if (!data || typeof data !== 'object') return;
            const trend = data.trend === 1 ? '📈' : '📉';
            const color = data.trend === 1 ? '#05ea6a' : '#ff4d4d';
            const diff = data.oldPrice ? (((data.price - data.oldPrice) / data.oldPrice) * 100).toFixed(2) : "0.00";

            const card = document.createElement('div');
            card.className = 'item-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <span style="font-size:1.5rem;">🏦</span>
                    <span style="color:${color}; font-weight:800; font-size:0.8rem; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:6px; border:1px solid ${color}33;">
                        ${data.trend === 1 ? '+' : ''}${diff}% ${trend}
                    </span>
                </div>
                <h3 style="margin:5px 0; font-size:1.2rem;">${code}</h3>
                <div style="font-size:1.7rem; font-weight:800; color:white; margin:15px 0;">
                    ${(data.price || 0).toLocaleString()} <span style="font-size:0.9rem; color:var(--primary);">💰</span>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                    <button class="buy-btn" onclick="executeBorsaBuy('${code}', ${data.price})" style="background:var(--primary); color:black; font-weight:800; padding:10px;">AL</button>
                    <button class="buy-btn" onclick="executeBorsaSell('${code}', ${data.price})" style="background:rgba(255,255,255,0.05); color:white; border:1px solid var(--glass-border); padding:10px;">SAT</button>
                </div>
            `;
            container.appendChild(card);
        });
    };

    // 1. Firebase Listener
    db.ref('global_stocks').on('value', snap => {
        if (snap.exists()) renderStocks(snap.val());
    });

    // 2. HTTP Fallback (Emniyet için 1sn sonra API'yi sorgula eğer veri gelmediyse)
    setTimeout(async () => {
        if (container.querySelector('.loader')) {
            try {
                const res = await fetch('/api/borsa');
                const data = await res.json();
                if (container.querySelector('.loader')) renderStocks(data);
            } catch (e) {
                console.error("Borsa API Fallback Error:", e);
            }
        }
    }, 1500);
}

async function executeBorsaBuy(code, price) {
    if (!currentUser) return;
    const amount = prompt(`${code} hissesinden kaç adet almak istersin?`);
    if (!amount || isNaN(amount) || amount <= 0) return;

    const total = price * parseInt(amount);
    if (!confirm(`${amount} adet ${code} için ${total.toLocaleString()} 💰 ödenecek. Onaylıyor musun?`)) return;

    db.ref('users/' + currentUser).once('value', async (snap) => {
        const u = snap.val() || { balance: 0 };
        if (!u.is_infinite && u.balance < total) return showToast("Bakiye yetersiz!", "error");

        await db.ref('users/' + currentUser).transaction(user => {
            if (user) {
                if (!user.is_infinite) user.balance -= total;
                if (!user.stocks) user.stocks = {};
                user.stocks[code] = (user.stocks[code] || 0) + parseInt(amount);
            }
            return user;
        });
        showToast(`${amount} adet ${code} alındı!`, "success");
    });
}

async function executeBorsaSell(code, price) {
    if (!currentUser) return;
    db.ref('users/' + currentUser).once('value', async (snap) => {
        const u = snap.val() || {};
        const owned = u.stocks?.[code] || 0;

        if (owned <= 0) return showToast("Bu hisseden elinde yok!", "error");

        const amount = prompt(`Kaç adet satmak istersin? (Mevcut: ${owned})`);
        if (!amount || isNaN(amount) || amount <= 0) return;
        if (parseInt(amount) > owned) return showToast("Elindekinden fazlasını satamazsın!", "error");

        const total = price * parseInt(amount);
        await db.ref('users/' + currentUser).transaction(user => {
            if (user) {
                user.balance = (user.balance || 0) + total;
                user.stocks[code] -= parseInt(amount);
                if (user.stocks[code] <= 0) delete user.stocks[code];
            }
            return user;
        });
        showToast(`${amount} adet ${code} satıldı! Kazanç: ${total.toLocaleString()} 💰`, "success");
    });
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
            const today = getTodayKey();
            const userToday = u.quests?.[today] || { m: 0, g: 0, d: 0, w: 0, claimed: {} };

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
                    <h3 style="margin-bottom:15px; font-size:1rem; opacity:0.8;">📈 İstatistikler</h3>
                    <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:15px; margin-bottom:15px;">
                        <div class="stat-mini" style="background:rgba(255,255,255,0.05); border:1px solid var(--primary);">
                            <label style="color:var(--primary);">Günlük İzleme</label>
                            <div class="v" style="color:var(--primary);">${u.quests?.[getTodayKey()]?.w || 0} dk</div>
                        </div>
                        <div class="stat-mini" style="background:rgba(5, 234, 106, 0.1);">
                            <label>Kanal İzleme</label>
                            <div class="v">${u.channel_watch_time?.[currentChannelId] || 0} dk</div>
                        </div>
                        <div class="stat-mini">
                            <label>Toplam İzleme</label>
                            <div class="v">${u.lifetime_w || 0} dk</div>
                        </div>
                        <div class="stat-mini">
                            <label>Toplam Mesaj</label>
                            <div class="v">${u.lifetime_m || 0}</div>
                        </div>
                        <div class="stat-mini">
                            <label>Toplam Kumar</label>
                            <div class="v">${u.lifetime_g || 0}</div>
                        </div>
                        <div class="stat-mini">
                            <label>Düello Galibiyet</label>
                            <div class="v">${u.lifetime_d || 0}</div>
                        </div>
                    </div>
                </div>

                <div class="portfolio-section" style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
                    <h3 style="margin-bottom:15px; font-size:1rem; opacity:0.8;">📂 Borsa Portföyüm</h3>
                    <div id="user-portfolio" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px;">
                        ${u.stocks && Object.keys(u.stocks).length > 0 ?
                Object.entries(u.stocks).map(([code, amt]) => `
                                <div class="stat-mini" style="border:1px solid #05ea6a33; background:rgba(5, 234, 106, 0.05);">
                                    <label>${code}</label>
                                    <div class="v">${amt} Adet</div>
                                </div>
                            `).join('') : '<p style="grid-column: span 2; font-size: 0.8rem; color:#666;">Henüz hissedar değilsin.</p>'
            }
                    </div>
                </div>
            </div>
        `;
    });
}

init();
