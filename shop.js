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

// Global Variables
let currentUser = null;
let currentChannelId = null;
let currentPreview = null;
let currentPreviewTimeout = null;

function init() {
    console.log("Market initialized");
    const savedUser = localStorage.getItem('aloskegang_user');
    renderFreeCommands();

    if (savedUser) {
        login(savedUser);
    } else {
        showAuth();
    }

    const genBtn = document.getElementById('generate-code-btn');
    if (genBtn) genBtn.addEventListener('click', startAuth);

    const backBtn = document.getElementById('back-btn');
    if (backBtn) backBtn.addEventListener('click', showAuth);

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

window.addEventListener('DOMContentLoaded', init);

function getTodayKey() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

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

function renderFreeCommands() {
    const freeCmdContainer = document.getElementById('free-commands');
    if (!freeCmdContainer) return;
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
    if (!username || username === "Misafir") return;
    try {
        const pfpImg = document.getElementById('user-pfp');
        const fallback = document.getElementById('user-pfp-fallback');

        // Use our server proxy to bypass CORS
        const res = await fetch(`/api/kick/pfp/${username}`);
        if (!res.ok) throw new Error("PFP not found");
        const data = await res.json();

        if (data.pfp) {
            pfpImg.src = data.pfp;
            pfpImg.onload = () => {
                pfpImg.style.display = 'block';
                if (fallback) fallback.style.display = 'none';
            };
            pfpImg.onerror = () => {
                pfpImg.style.display = 'none';
                if (fallback) fallback.style.display = 'flex';
            };
        }
    } catch (e) {
        console.log("PFP fetch error (CORS or server)", e);
        // Fallback remains visible
    }
}

function showAuth() {
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');

    if (authContainer) authContainer.classList.remove('hidden');
    if (mainContent) mainContent.classList.add('hidden');
    if (step1) step1.classList.remove('hidden');
    if (step2) step2.classList.add('hidden');
    db.ref('pending_auth').off();
}

function startAuth() {
    const usernameInput = document.getElementById('username-input');
    const user = usernameInput.value.toLowerCase().trim();
    if (user.length < 3) return showToast("Geçersiz kullanıcı adı!", "error");

    // Özel karakter kontrolü
    if (/[.#$\[\]]/.test(user)) return showToast("Kullanıcı adı geçersiz karakterler içeriyor!", "error");

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const codeDisplay = document.getElementById('auth-code');
    const cmdExample = document.getElementById('cmd-example');
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');

    // UI'yi hemen güncelle ki kullanıcı beklediğini anlasın
    if (codeDisplay) codeDisplay.innerText = code;
    if (cmdExample) cmdExample.innerText = `!doğrulama ${code}`;
    if (step1) step1.classList.add('hidden');
    if (step2) step2.classList.remove('hidden');

    showToast("Kod oluşturuldu, kaydediliyor...", "success");

    db.ref('pending_auth/' + user).set({ code, timestamp: Date.now() })
        .then(() => {
            console.log(`[Shop] Auth code WRITE commanded for ${user}: ${code}`);

            // VERIFICATION READ
            db.ref('pending_auth/' + user).once('value').then(snap => {
                const val = snap.val();
                console.log(`[Shop] Auth code READ BACK for ${user}:`, val);
                if (!val) {
                    showToast("HATA: Kod veritabanına yazılamadı! (Read-back failed)", "error");
                    alert(`KRİTİK HATA: '${user}' için veritabanına yazma başarısız oldu. Lütfen konsolu kontrol et.`);
                } else {
                    showToast(`Kod Kaydedildi: ${user} -> ${code}`, "success");
                }
            });

            // Onay bekleyen dinleyiciyi kur
            db.ref('auth_success/' + user).off(); // Eski varsa temizle
            db.ref('auth_success/' + user).on('value', (snap) => {
                if (snap.val()) {
                    db.ref('auth_success/' + user).remove();
                    db.ref('auth_success/' + user).off();
                    login(user);
                }
            });
        })
        .catch(err => {
            console.error("Auth Firebase Error:", err);
            showToast("Bağlantı hatası! Firebase yetkilerini kontrol edin.", "error");
            // Hata varsa geri dön
            if (step1) step1.classList.remove('hidden');
            if (step2) step2.classList.add('hidden');
        });
}

function login(user) {
    currentUser = user;
    localStorage.setItem('aloskegang_user', user);

    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    if (authContainer) authContainer.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');

    const dispName = document.getElementById('display-name');
    const heroName = document.getElementById('hero-name');
    if (dispName) dispName.innerText = user.toUpperCase();
    if (heroName) heroName.innerText = user.toUpperCase();

    // Setup PFP
    const fallback = document.getElementById('user-pfp-fallback');
    if (fallback) fallback.innerText = user[0].toUpperCase();
    fetchKickPFP(user);

    db.ref('users/' + user).on('value', (snap) => {
        const data = snap.val() || { balance: 0, auth_channel: null };
        const balanceEl = document.getElementById('user-balance');
        if (balanceEl) balanceEl.innerText = `${(data.balance || 0).toLocaleString()} 💰`;

        if (data.auth_channel && data.auth_channel !== currentChannelId) {
            currentChannelId = data.auth_channel;
            loadChannelMarket(currentChannelId);
        } else if (!data.auth_channel) {
            const noChanMsg = document.getElementById('no-channel-msg');
            const marketGrid = document.getElementById('market-items');
            const channelBadge = document.getElementById('channel-badge');
            const marketStat = document.getElementById('market-status');

            if (noChanMsg) noChanMsg.classList.remove('hidden');
            if (marketGrid) marketGrid.innerHTML = "";
            if (channelBadge) channelBadge.classList.add('hidden');
            if (marketStat) marketStat.innerText = "Market ürünlerini görmek için herhangi bir kanalda !doğrulama yapmalısın.";
        }
    });
}

async function loadChannelMarket(channelId) {
    document.getElementById('no-channel-msg').classList.add('hidden');
    const channelBadge = document.getElementById('channel-badge');
    if (channelBadge) channelBadge.classList.remove('hidden');
    const snap = await db.ref('channels/' + channelId).once('value');
    const channelData = snap.val() || {};
    const settings = channelData.settings || {};
    const sounds = settings.custom_sounds || {};

    const chanName = channelData.username || "Kick Kanalı";
    document.getElementById('chan-name').innerText = chanName;

    // Broadcaster PFP Fetch via Proxy
    try {
        const chanPfpImg = document.getElementById('chan-pfp');
        const chanPfpFallback = document.getElementById('chan-pfp-fallback');

        const res = await fetch(`/api/kick/pfp/${chanName}`);
        if (!res.ok) throw new Error("PFP error");
        const data = await res.json();

        if (data.pfp) {
            chanPfpImg.src = data.pfp;
            chanPfpImg.onload = () => {
                chanPfpImg.style.display = 'block';
                if (chanPfpFallback) chanPfpFallback.style.display = 'none';
            };
            chanPfpImg.onerror = () => {
                chanPfpImg.style.display = 'none';
                if (chanPfpFallback) chanPfpFallback.style.display = 'flex';
            };
        } else {
            throw new Error("No pfp data");
        }
    } catch (e) {
        console.log("Broadcaster PFP error", e);
        const chanPfpImg = document.getElementById('chan-pfp');
        const chanPfpFallback = document.getElementById('chan-pfp-fallback');
        if (chanPfpImg) chanPfpImg.style.display = 'none';
        if (chanPfpFallback) {
            chanPfpFallback.innerText = chanName[0].toUpperCase();
            chanPfpFallback.style.display = 'flex';
        }
    }

    // Side GIFs Update
    const leftGif = settings.left_gif || "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHlxYnV4YzB6MzB6bmR4bmR4bmR4bmR4bmR4bmR4bmR4bmR4bmR4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKMGpxPucV0G3S0/giphy.gif";
    const rightGif = settings.right_gif || "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHlxYnV4YzB6MzB6bmR4bmR4bmR4bmR4bmR4bmR4bmR4bmR4bmR4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKMGpxPucV0G3S0/giphy.gif";

    const leftGifEl = document.querySelector('.side-gif.left img');
    const rightGifEl = document.querySelector('.side-gif.right img');
    if (leftGifEl) leftGifEl.src = leftGif;
    if (rightGifEl) rightGifEl.src = rightGif;

    document.getElementById('market-status').innerText = `${chanName} market ürünleri yönetiliyor.`;
    const marketGrid = document.getElementById('market-items');
    if (marketGrid) marketGrid.innerHTML = "";

    const isEnabled = (cmd) => settings[cmd] !== false;

    // 1. MUTE
    const muteCost = settings.mute_cost || 10000;
    renderItem("🚫 Kullanıcı Sustur", "Hedeflenen kişiyi 2 dakika boyunca susturur.", muteCost, "mute", "", "", 0, !isEnabled('sustur'));

    // 2. TTS
    const ttsCost = settings.tts_cost || 2500;
    renderItem("🎙️ TTS (Sesli Mesaj)", "Mesajınızı yayında farklı seslerle seslendirir. (Maks 500 karakter)", ttsCost, "tts", "", "", 0, !isEnabled('tts'));

    // 3. SR
    const srCost = settings.sr_cost || 5000;
    renderItem("🎵 Şarkı İsteği (!sr)", "YouTube'dan istediğiniz şarkıyı açar.", srCost, "sr", "", "", 0, !isEnabled('sr'));

    // 4. SOUNDS
    Object.entries(sounds).forEach(([name, data]) => {
        renderItem(`🎵 Ses: !ses ${name}`, "Kanalda özel ses efekti çalar.", data.cost, "sound", name, data.url, data.duration || 0, !isEnabled('ses'));
    });
}

function renderItem(name, desc, price, type, trigger = "", soundUrl = "", duration = 0, isDisabled = false) {
    const marketGrid = document.getElementById('market-items');
    if (!marketGrid) return;

    const card = document.createElement('div');
    card.className = `item-card ${isDisabled ? 'disabled' : ''}`;
    const icon = type === 'tts' ? '🎙️' : (type === 'mute' ? '🚫' : (type === 'sr' ? '🎵' : '🎼'));

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div class="item-icon">${icon}</div>
            ${type === 'sound' && !isDisabled ? `
                <div style="display:flex; gap:10px;">
                    <button onclick="previewShopSound('${soundUrl}', ${duration})" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:1.5rem; padding:0;">▶️</button>
                    <button onclick="stopAllPreviews()" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:1.5rem; padding:0;">⏹️</button>
                </div>
            ` : ''}
            ${isDisabled ? `<span class="disabled-label">DEVREDIŞI</span>` : ''}
        </div>
        <h3>${name}</h3>
        <p>${desc}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <span class="price-tag" style="margin:0;">${parseInt(price).toLocaleString()} 💰</span>
            ${duration > 0 ? `<small style="color:#666">${duration}sn</small>` : ''}
        </div>
        <button class="buy-btn" ${isDisabled ? 'disabled' : ''} onclick="executePurchase('${type}', '${trigger}', ${price})">
            ${isDisabled ? 'Kapalı' : 'Hemen Uygula'}
        </button>
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
        openTTSModal(price);
        return;
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
            text: `@${currentUser} diyor ki: ${userInput}`,
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

function openTTSModal(price) {
    const modal = document.getElementById('tts-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.getElementById('tts-input').value = "";
    document.getElementById('confirm-tts-buy').onclick = () => finalizeTTSPurchase(price);
}

function closeTTSModal() {
    const modal = document.getElementById('tts-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

async function finalizeTTSPurchase(price) {
    const text = document.getElementById('tts-input').value.trim();
    const voice = document.getElementById('tts-voice-select').value;

    if (!text) return showToast("Mesaj boş olamaz!", "error");
    if (text.length > 500) return showToast("Mesaj çok uzun!", "error");

    const userSnap = await db.ref('users/' + currentUser).once('value');
    const userData = userSnap.val() || { balance: 0 };
    if (!userData.is_infinite && (userData.balance || 0) < price) {
        return showToast("Bakiye yetersiz! ❌", "error");
    }

    if (!userData.is_infinite) {
        await db.ref('users/' + currentUser).transaction(u => { if (u) u.balance -= price; return u; });
    }

    await db.ref(`channels/${currentChannelId}/stream_events/tts`).push({
        text: `@${currentUser} diyor ki: ${text}`,
        voice: voice,
        played: false, notified: false, source: "market", timestamp: Date.now(), broadcasterId: currentChannelId
    });

    closeTTSModal();
    showToast("TTS Mesajın yayına gönderildi! 🎙️", "success");
    loadProfile();
}

function logout() {
    // 1. Local Storage
    localStorage.removeItem('aloskegang_user');
    localStorage.clear();

    // 2. Session Storage
    sessionStorage.clear();

    // 3. Clear Cookies
    document.cookie.split(";").forEach((c) => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    // 4. Reload
    location.reload();
}
function showToast(msg, type) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.className = `toast ${type}`;
    t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 3000);
}
// TABS LOGIC
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById('tab-' + id).classList.remove('hidden');

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    event.currentTarget.classList.add('active');

    if (id === 'leaderboard') loadLeaderboard();
    if (id === 'borsa') loadBorsa();
    if (id === 'emlak') loadEmlak();
    if (id === 'quests') loadQuests();
    if (id === 'profile') loadProfile();
}

let borsaActive = false;
let stockHistory = {}; // { CODE: [p1, p2, p3... p20] }

function drawStockChart(canvas, history, trend) {
    if (!canvas || !history || history.length < 2) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = trend === 1 ? '#05ea6a' : '#ff4d4d';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = max - min || 1;

    history.forEach((val, i) => {
        const x = (i / (history.length - 1)) * w;
        const y = h - ((val - min) / range) * h * 0.8 - (h * 0.1);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Area
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, trend === 1 ? 'rgba(5,234,106,0.1)' : 'rgba(255,77,77,0.1)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fill();
}

async function loadBorsa() {
    const container = document.getElementById('borsa-items');
    if (!container) return;

    if (borsaActive) return;
    borsaActive = true;

    if (currentUser === 'omegacyr') {
        const resetBtn = document.createElement('button');
        resetBtn.innerHTML = "🚨 TÜM HİSSELERİ SIFIRLA (ADMİN)";
        resetBtn.className = "primary-btn";
        resetBtn.style.background = "#ff4d4d";
        resetBtn.style.color = "white";
        resetBtn.style.marginBottom = "20px";
        resetBtn.onclick = async () => {
            if (!confirm("Tüm kullanıcıların tüm hisselerini silmek istediğine emin misin?")) return;
            const res = await fetch('/api/borsa/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requester: 'omegacyr' })
            });
            const d = await res.json();
            if (d.success) showToast(d.message, "success");
        };
        container.parentElement.insertBefore(resetBtn, container);
    }

    container.innerHTML = `<div style="text-align:center; width:100%; padding:60px;"><div class="loader"></div><p style="margin-top:10px;">Borsa verileri yükleniyor...</p></div>`;

    const renderStocks = (stocks) => {
        if (!stocks) return;

        if (stocks.error) {
            container.innerHTML = `<div class="error-box">${stocks.error}</div>`;
            return;
        }

        entries.forEach(([code, data]) => {
            if (!data || typeof data !== 'object') return;

            // Update history for chart (last 20 points from real-time)
            if (!stockHistory[code]) stockHistory[code] = [];
            stockHistory[code].push(data.price);
            if (stockHistory[code].length > 20) stockHistory[code].shift();

            const trend = data.trend === 1 ? '📈' : '📉';
            const color = data.trend === 1 ? '#05ea6a' : '#ff4d4d';
            const diff = data.oldPrice ? (((data.price - data.oldPrice) / data.oldPrice) * 100).toFixed(2) : "0.00";

            let card = document.querySelector(`.borsa-card[data-code="${code}"]`);
            if (card) {
                // Sadece değişen kısımları güncelle (Input değerini koru)
                const trendEl = card.querySelector('.trend-val');
                const priceEl = card.querySelector('.price-val');
                const buyBtn = card.querySelector('.btn-buy-main');
                const sellBtn = card.querySelector('.btn-sell-main');

                trendEl.innerHTML = `${data.trend === 1 ? '+' : ''}${diff}% ${trend}`;
                trendEl.style.color = color;
                priceEl.innerHTML = `${(data.price || 0).toLocaleString()} <span style="font-size:0.8rem; color:var(--primary);">💰</span>`;

                // Butonlardaki fiyatları güncelle
                buyBtn.onclick = () => executeBorsaBuy(code, data.price);
                sellBtn.onclick = () => executeBorsaSell(code, data.price);
            } else {
                card = document.createElement('div');
                card.className = 'item-card borsa-card';
                card.setAttribute('data-code', code);
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-weight:800; font-size:1.1rem; color:var(--primary);">${code}</span>
                        <span class="trend-val" style="color:${color}; font-weight:800; font-size:0.75rem;">
                            ${data.trend === 1 ? '+' : ''}${diff}% ${trend}
                        </span>
                    </div>
                    
                    <canvas id="chart-${code}" width="200" height="60" style="width:100%; height:60px; margin:10px 0;"></canvas>

                    <div class="price-val" style="font-size:1.5rem; font-weight:800; color:white; margin:10px 0;">
                        ${(data.price || 0).toLocaleString()} <span style="font-size:0.8rem; color:var(--primary);">💰</span>
                    </div>

                    <div class="borsa-controls" style="margin-top:15px;">
                        <input type="number" id="input-${code}" class="borsa-input" value="1" min="1" placeholder="Adet" aria-label="${code} Adet Satın Al/Sat">
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                            <button class="buy-btn btn-buy-main" onclick="executeBorsaBuy('${code}', ${data.price})" style="background:var(--primary); color:black; font-weight:800; padding:8px;">AL</button>
                            <button class="buy-btn btn-sell-main" onclick="executeBorsaSell('${code}', ${data.price})" style="background:rgba(255,255,255,0.05); color:white; border:1px solid var(--glass-border); padding:8px;">SAT</button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            }
            drawStockChart(document.getElementById(`chart-${code}`), data.history || stockHistory[code], data.trend);
        });
    };

    db.ref('global_stocks').on('value', snap => {
        if (snap.exists()) renderStocks(snap.val());
    });
}

async function executeBorsaBuy(code, price) {
    if (!currentUser) return;
    const input = document.getElementById(`input-${code}`);
    const amount = parseInt(input.value);
    if (!amount || isNaN(amount) || amount <= 0) return showToast("Geçersiz miktar!", "error");

    const total = price * amount;
    if (!confirm(`${amount} adet ${code} için ${total.toLocaleString()} 💰 ödenecek. Onaylıyor musun?`)) return;

    db.ref('users/' + currentUser).once('value', async (snap) => {
        const u = snap.val() || { balance: 0 };
        if (!u.is_infinite && u.balance < total) return showToast("Bakiye yetersiz!", "error");

        await db.ref('users/' + currentUser).transaction(user => {
            if (user) {
                if (!user.is_infinite) user.balance -= total;
                if (!user.stocks) user.stocks = {};
                user.stocks[code] = (user.stocks[code] || 0) + amount;
            }
            return user;
        });
        showToast(`${amount} adet ${code} alındı!`, "success");
        loadProfile();
    });
}

async function executeBorsaSell(code, price) {
    if (!currentUser) return;
    const input = document.getElementById(`input-${code}`);
    const amount = parseInt(input.value);

    db.ref('users/' + currentUser).once('value', async (snap) => {
        const u = snap.val() || {};
        const owned = u.stocks?.[code] || 0;

        if (owned <= 0) return showToast("Bu hisseden elinde yok!", "error");
        if (!amount || isNaN(amount) || amount <= 0) return showToast("Geçersiz miktar!", "error");
        if (amount > owned) return showToast("Elindekinden fazlasını satamazsın!", "error");

        const total = price * amount;
        await db.ref('users/' + currentUser).transaction(user => {
            if (user) {
                user.balance = (user.balance || 0) + total;
                user.stocks[code] -= amount;
                if (user.stocks[code] <= 0) delete user.stocks[code];
            }
            return user;
        });
        showToast(`${amount} adet ${code} satıldı! Kazanç: ${total.toLocaleString()} 💰`, "success");
        loadProfile();
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
        // Use direct Firebase read instead of admin API which is restricted
        const snap = await db.ref('global_quests').once('value');
        const globalQuests = snap.val() || {};

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
                        <span style="color:var(--primary); font-weight:700;">+${(parseInt(q.reward) || 0).toLocaleString()} 💰</span>
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

                <div class="emlak-portfolio-section" style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px;">
                    <h3 style="margin-bottom:15px; font-size:1rem; opacity:0.8;">🏠 Emlak Portföyüm</h3>
                    <div id="user-emlak" style="display:grid; grid-template-columns: 1fr; gap:10px;">
                        ${u.properties && u.properties.length > 0 ?
                u.properties.map(p => `
                                <div class="stat-mini" style="border:1px solid var(--primary); background:rgba(102, 252, 241, 0.05); display:flex; justify-content:space-between; align-items:center;">
                                    <div>
                                        <label>${p.city}</label>
                                        <div class="v" style="font-size:0.9rem;">${p.name}</div>
                                    </div>
                                    <div style="text-align:right;">
                                        <div style="color:var(--primary); font-weight:800; font-size:0.8rem;">+${Math.floor(p.income / 24)} 💰 / Saat</div>
                                        <div style="font-size:0.7rem; color:#666;">Günlük: ${p.income}</div>
                                    </div>
                                </div>
                            `).join('') : '<p style="font-size: 0.8rem; color:#666;">Henüz mülk sahibi değilsin.</p>'
            }
                    </div>
                </div>
            </div>
        `;
    });
}

const EMLAK_CITIES = [
    { "id": "ADANA", "name": "Adana", "x": 50, "y": 81 },
    { "id": "ADIYAMAN", "name": "Adıyaman", "x": 66, "y": 72 },
    { "id": "AFYONKARAHISAR", "name": "Afyon", "x": 25, "y": 53 },
    { "id": "AGRI", "name": "Ağrı", "x": 91, "y": 38 },
    { "id": "AMASYA", "name": "Amasya", "x": 53, "y": 23 },
    { "id": "ANKARA", "name": "Ankara", "x": 38, "y": 34 },
    { "id": "ANTALYA", "name": "Antalya", "x": 26, "y": 83 },
    { "id": "ARTVIN", "name": "Artvin", "x": 84, "y": 15 },
    { "id": "AYDIN", "name": "Aydın", "x": 11, "y": 68 },
    { "id": "BALIKESIR", "name": "Balıkesir", "x": 12, "y": 39 },
    { "id": "BILECIK", "name": "Bilecik", "x": 23, "y": 31 },
    { "id": "BINGOL", "name": "Bingöl", "x": 77, "y": 51 },
    { "id": "BITLIS", "name": "Bitlis", "x": 86, "y": 59 },
    { "id": "BOLU", "name": "Bolu", "x": 31, "y": 22 },
    { "id": "BURDUR", "name": "Burdur", "x": 24, "y": 70 },
    { "id": "BURSA", "name": "Bursa", "x": 18, "y": 30 },
    { "id": "CANAKKALE", "name": "Çanakkale", "x": 4, "y": 31 },
    { "id": "CANKIRI", "name": "Çankırı", "x": 42, "y": 24 },
    { "id": "CORUM", "name": "Çorum", "x": 49, "y": 25 },
    { "id": "DENIZLI", "name": "Denizli", "x": 18, "y": 69 },
    { "id": "DIYARBAKIR", "name": "Diyarbakır", "x": 76, "y": 66 },
    { "id": "EDIRNE", "name": "Edirne", "x": 5, "y": 7 },
    { "id": "ELAZIG", "name": "Elazığ", "x": 71, "y": 54 },
    { "id": "ERZINCAN", "name": "Erzincan", "x": 72, "y": 37 },
    { "id": "ERZURUM", "name": "Erzurum", "x": 81, "y": 35 },
    { "id": "ESKISEHIR", "name": "Eskişehir", "x": 25, "y": 37 },
    { "id": "GAZIANTEP", "name": "Gaziantep", "x": 61, "y": 80 },
    { "id": "GIRESUN", "name": "Giresun", "x": 66, "y": 19 },
    { "id": "GUMUSHANE", "name": "Gümüşhane", "x": 72, "y": 26 },
    { "id": "HAKKARI", "name": "Hakkari", "x": 94, "y": 72 },
    { "id": "HATAY", "name": "Hatay", "x": 55, "y": 94 },
    { "id": "ISPARTA", "name": "Isparta", "x": 26, "y": 69 },
    { "id": "MERSIN", "name": "Mersin", "x": 47, "y": 84 },
    { "id": "ISTANBUL", "name": "İstanbul", "x": 17, "y": 17 },
    { "id": "IZMIR", "name": "İzmir", "x": 8, "y": 58 },
    { "id": "KARS", "name": "Kars", "x": 91, "y": 24 },
    { "id": "KASTAMONU", "name": "Kastamonu", "x": 42, "y": 12 },
    { "id": "KAYSERI", "name": "Kayseri", "x": 51, "y": 54 },
    { "id": "KIRKLARELI", "name": "Kırklareli", "x": 8, "y": 6 },
    { "id": "KIRSEHIR", "name": "Kırşehir", "x": 44, "y": 47 },
    { "id": "KOCAELI", "name": "Kocaeli", "x": 22, "y": 21 },
    { "id": "KONYA", "name": "Konya", "x": 36, "y": 67 },
    { "id": "KUTAHYA", "name": "Kütahya", "x": 23, "y": 43 },
    { "id": "MALATYA", "name": "Malatya", "x": 66, "y": 60 },
    { "id": "MANISA", "name": "Manisa", "x": 9, "y": 55 },
    { "id": "KAHRAMANMARAS", "name": "Kahramanmaraş", "x": 59, "y": 72 },
    { "id": "MARDIN", "name": "Mardin", "x": 79, "y": 76 },
    { "id": "MUGLA", "name": "Muğla", "x": 14, "y": 78 },
    { "id": "MUS", "name": "Muş", "x": 83, "y": 54 },
    { "id": "NEVSEHIR", "name": "Nevşehir", "x": 47, "y": 55 },
    { "id": "NIGDE", "name": "Niğde", "x": 47, "y": 66 },
    { "id": "ORDU", "name": "Ordu", "x": 64, "y": 18 },
    { "id": "RIZE", "name": "Rize", "x": 78, "y": 17 },
    { "id": "SAKARYA", "name": "Sakarya", "x": 25, "y": 21 },
    { "id": "SAMSUN", "name": "Samsun", "x": 56, "y": 13 },
    { "id": "SIIRT", "name": "Siirt", "x": 85, "y": 66 },
    { "id": "SINOP", "name": "Sinop", "x": 50, "y": 1 },
    { "id": "SIVAS", "name": "Sivas", "x": 59, "y": 37 },
    { "id": "TEKIRDAG", "name": "Tekirdağ", "x": 10, "y": 18 },
    { "id": "TOKAT", "name": "Tokat", "x": 57, "y": 28 },
    { "id": "TRABZON", "name": "Trabzon", "x": 73, "y": 17 },
    { "id": "TUNCELI", "name": "Tunceli", "x": 72, "y": 48 },
    { "id": "SANLIURFA", "name": "Şanlıurfa", "x": 69, "y": 78 },
    { "id": "USAK", "name": "Uşak", "x": 20, "y": 54 },
    { "id": "VAN", "name": "Van", "x": 92, "y": 57 },
    { "id": "YOZGAT", "name": "Yozgat", "x": 48, "y": 36 },
    { "id": "ZONGULDAK", "name": "Zonguldak", "x": 32, "y": 10 },
    { "id": "AKSARAY", "name": "Aksaray", "x": 44, "y": 59 },
    { "id": "BAYBURT", "name": "Bayburt", "x": 76, "y": 29 },
    { "id": "KARAMAN", "name": "Karaman", "x": 39, "y": 78 },
    { "id": "KIRIKKALE", "name": "Kırıkkale", "x": 41, "y": 36 },
    { "id": "BATMAN", "name": "Batman", "x": 81, "y": 67 },
    { "id": "SIRNAK", "name": "Şırnak", "x": 88, "y": 73 },
    { "id": "BARTIN", "name": "Bartın", "x": 35, "y": 7 },
    { "id": "ARDAHAN", "name": "Ardahan", "x": 89, "y": 16 },
    { "id": "IGDIR", "name": "Iğdır", "x": 96, "y": 35 },
    { "id": "YALOVA", "name": "Yalova", "x": 19, "y": 23 },
    { "id": "KARABUK", "name": "Karabük", "x": 36, "y": 14 },
    { "id": "KILIS", "name": "Kilis", "x": 60, "y": 86 },
    { "id": "OSMANIYE", "name": "Osmaniye", "x": 55, "y": 80 },
    { "id": "DUZCE", "name": "Düzce", "x": 29, "y": 20 }
];

let emlakActive = false;
function loadEmlak() {
    if (emlakActive) return;
    emlakActive = true;
    renderEmlakMap();
}

function renderEmlakMap() {
    const overlay = document.getElementById('map-overlay');
    if (!overlay) return;
    overlay.innerHTML = "";

    EMLAK_CITIES.forEach(city => {
        const dot = document.createElement('div');
        dot.className = 'city-dot';
        dot.style.left = `${city.x}%`;
        dot.style.top = `${city.y}%`;
        dot.style.transform = "translate(-50%, -50%)"; // Hizalama garantisi

        dot.addEventListener('mouseenter', () => {
            const toast = document.getElementById('city-info-toast');
            toast.querySelector('span').innerText = city.name.toUpperCase();
            toast.style.display = "flex";
        });

        dot.addEventListener('mouseleave', () => {
            const toast = document.getElementById('city-info-toast');
            toast.style.display = "none";
        });

        dot.addEventListener('click', () => {
            document.querySelectorAll('.city-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            loadCityProperties(city.id, city.name);
        });

        overlay.appendChild(dot);
    });
}

async function loadCityProperties(cityId, cityName) {
    const list = document.getElementById('city-properties-list');
    if (!list) return;

    // Başlığı güncelle
    const cityTitle = document.getElementById('city-title');
    if (cityTitle) cityTitle.innerText = cityName;

    list.innerHTML = `<div class="loader" style="margin: 20px auto;"></div>`;

    try {
        const res = await fetch(`/api/real-estate/properties/${cityId}`);
        const props = await res.json();

        list.innerHTML = "";

        if (!props || props.length === 0) {
            list.innerHTML = `
                <div style="text-align:center; padding:30px 10px; background: rgba(255, 0, 0, 0.05); border: 1px dashed rgba(255, 0, 0, 0.3); border-radius: 15px;">
                    <i class="fas fa-lock" style="font-size: 2.5rem; color: #ff4d4d; margin-bottom: 15px;"></i>
                    <h4 style="color: white; margin-bottom: 10px;">Veri Erişim Engellendi</h4>
                    <p style="font-size: 0.8rem; color: #aaa; line-height: 1.5;">
                        Şehir verileri sunucudan boş döndü. Bu durum genellikle <b>Firebase Security Rules</b> ayarlarından kaynaklanır.
                    </p>
                    <div style="margin-top: 15px; padding: 10px; background: #000; border-radius: 8px; font-family: monospace; font-size: 0.7rem; color: #00ff88; text-align: left;">
                        Rules -> real_estate_market: { ".read": true, ".write": true }
                    </div>
                </div>
            `;
            return;
        }

        props.forEach((p, index) => {
            const item = document.createElement('div');
            item.className = 'property-card';
            item.style.padding = "20px";
            item.style.background = p.owner ? "rgba(255,50,50,0.03)" : "rgba(255,255,255,0.03)";
            item.style.borderRadius = "18px";
            item.style.border = p.owner ? "1px solid rgba(255,50,50,0.15)" : "1px solid rgba(255,255,255,0.05)";
            item.style.transition = "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
            item.style.opacity = p.owner ? "0.6" : "1";
            item.style.transform = "translateY(20px)";
            item.style.animation = `fadeInUp 0.5s forwards ${index * 0.1}s`;

            const typeIcons = { low: 'shop', med: 'building', high: 'landmark' };
            const icon = typeIcons[p.type] || 'house';

            const btnHtml = p.owner
                ? `<div style="color:#ff4d4d; font-weight:900; font-size:0.75rem; background:rgba(255,77,77,0.1); padding:5px 12px; border-radius:10px; border:1px solid rgba(255,77,77,0.2);">💸 SAHİBİ: @${p.owner}</div>`
                : `<button class="buy-btn" onclick="executePropertyBuy('${cityId}', '${p.id}', ${p.price}, '${cityName}')" style="background:var(--primary); color:#000; padding: 10px 20px; font-size: 0.85rem; font-weight:900; width: auto; margin:0; border-radius:12px; box-shadow: 0 10px 20px rgba(0,255,136,0.2);">SATIN AL</button>`;

            item.innerHTML = `
                <div style="display:flex; align-items:flex-start; gap:15px; margin-bottom:15px;">
                    <div style="width:50px; height:50px; background:rgba(255,255,255,0.05); border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; color:var(--primary);">
                        <i class="fas fa-${icon}"></i>
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:900; color:white; font-size:1.1rem; margin-bottom:2px;">${p.name}</div>
                        <div style="color:var(--primary); font-size:1rem; font-weight:900;">+${p.income.toLocaleString()} 💰 <span style="font-weight:400; font-size:0.7rem; color:#888;">/ Gün</span></div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:10px; border-radius:14px;">
                    <div style="display:flex; flex-direction:column;">
                        <span style="color:#666; font-size:0.65rem; text-transform:uppercase; letter-spacing:1px; font-weight:700;">MALİYET</span>
                        <span style="color:#fff; font-size:0.95rem; font-weight:800;">${p.price.toLocaleString()} 💰</span>
                    </div>
                    ${btnHtml}
                </div>
            `;
            list.appendChild(item);
        });
    } catch (e) {
        list.innerHTML = `
            <div style="text-align:center; padding:20px; color:var(--danger);">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; margin-bottom:10px;"></i>
                <p>Veriler yüklenemedi!</p>
                <p style="font-size:0.7rem; color:#888; margin-top:10px;">
                    Hata: ${e.message}<br><br>
                    <b>Çözüm:</b> Firebase konsolundan 'real_estate_market' düğümü için Security Rules ayarlarını güncelleyin veya botun yetkilerini kontrol edin.
                </p>
            </div>
        `;
    }
}

async function executePropertyBuy(cityId, propId, price, cityName) {
    if (!currentUser) return showToast("Giriş yapmalısın!", "error");

    if (!confirm(`${price.toLocaleString()} 💰 karşılığında bu mülkü satın almak istediğine emin misin?`)) return;

    try {
        const res = await fetch('/api/real-estate/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser,
                cityId: cityId,
                propertyId: propId
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message, "success");
            loadProfile(); // Bakiyeyi güncellemek için
            loadCityProperties(cityId, cityName); // Listeyi yenile
        } else {
            showToast(data.error, "error");
        }
    } catch (e) {
        showToast("İşlem sırasında bir hata oluştu!", "error");
    }
}

// init is called via DOMContentLoaded
