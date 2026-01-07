const fs = require('fs');
const path = 'c:/Users/Mehmet/Desktop/KickChatBot/server.js';
let content = fs.readFileSync(path, 'utf8');

// Identify the block to replace (from /^!(do[gğ]rulama/ or startsWith)
const startMark = "else if (/^!(do[gğ]rulama|kod|verification|auth)/i.test(lowMsg)) {";
const endMark = "// MASTER ADMIN: YARDIMCI KOMUTLAR";

let startIndex = content.indexOf(startMark);
if (startIndex === -1) {
    // Fallback if the previous patch was different
    startIndex = content.indexOf("else if (lowMsg.startsWith('!doğrulama')");
}

let searchEnd = content.indexOf("// TAHMİN", startIndex);
let finalEndIndex = content.lastIndexOf('}', searchEnd);

if (startIndex === -1 || finalEndIndex === -1) {
    console.log(`Error: Could not find auth block. Start: ${startIndex}, End: ${finalEndIndex}`);
    process.exit(1);
}

const newBlock = `else if (/^!(do[gğ]rulama|kod|verification|auth)/i.test(lowMsg)) {
                // 1. Mesajdan 6 haneli kodu ayıkla
                const codeMatch = rawMsg.match(/\\d{6}/);
                const inputCode = codeMatch ? codeMatch[0] : args[0]?.trim();

                if (!inputCode) {
                    return await reply(\`@\${user}, Lütfen mağazadaki 6 haneli kodu yazın. Örn: !doğrulama 123456\`);
                }

                console.log(\`[Auth-Mega] Giriş Denemesi: User="\${user}" | Kod="\${inputCode}"\`);

                const cleanUser = user.toLowerCase().trim();
                let foundMatch = null;

                const getCode = (d) => (typeof d === 'object' && d !== null) ? (d.code || d.auth_code) : d;

                // --- TÜM VERİLERİ ÇEK (DEBUG İÇİN) ---
                const allPendingSnap = await db.ref('pending_auth').once('value');
                const allPending = allPendingSnap.val() || {};
                
                console.log(\`[Auth-Mega] Veritabanındaki Bekleyenler: \${Object.keys(allPending).join(', ') || 'BOŞ'}\`);

                // 1. Direkt Eşleşme
                if (allPending[cleanUser] && String(getCode(allPending[cleanUser])).trim() === String(inputCode)) {
                    foundMatch = { username: cleanUser, data: allPending[cleanUser] };
                }

                // 2. Havuz Taraması (Smart Match)
                if (!foundMatch) {
                    const matches = Object.entries(allPending).filter(([u, d]) => String(getCode(d)).trim() === String(inputCode));
                    if (matches.length === 1) {
                        foundMatch = { username: matches[0][0], data: matches[0][1], isSmart: true };
                    }
                }

                if (foundMatch) {
                    const { username: targetUser, data, isSmart } = foundMatch;
                    
                    await db.ref('auth_success/' + targetUser).set(true);
                    await db.ref('users/' + targetUser).update({ 
                        auth_channel: broadcasterId,
                        last_auth_at: Date.now(),
                        kick_name: user,
                        is_verified: true
                    });
                    await db.ref('pending_auth/' + targetUser).remove();

                    console.log(\`[Auth-Mega] BAŞARILI: \${targetUser}\`);
                    await reply(\`✅ @\${user}, Kimliğin doğrulandı! Mağaza sayfasına dönebilirsin. \${isSmart ? '(Otomatik eşleşme)' : ''}\`);
                } else {
                    console.log(\`[Auth-Mega] BAŞARISIZ. Girilen: \${inputCode}. Havuzda bu kod yok.\`);
                    await reply(\`❌ @\${user}, Kod yanlış! Lütfen Mağazadan 'Kod Al' diyerek yeni bir kod oluşturduğuna emin ol.\`);
                }
            }

            // --- ADMIN ARAÇLARI ---
            else if (lowMsg === '!auth-liste' && user.toLowerCase() === 'omegacyr') {
                const snap = await db.ref('pending_auth').once('value');
                const list = snap.val() || {};
                await reply(\`📊 Bekleyen: \${Object.keys(list).join(', ') || 'Yok'}\`);
            }

            else if (lowMsg === '!auth-temizle' && user.toLowerCase() === 'omegacyr') {
                await db.ref('pending_auth').remove();
                await reply(\`🧹 Tüm kodlar temizlendi.\`);
            }
`;

const before = content.substring(0, startIndex);
const after = content.substring(finalEndIndex + 1);

fs.writeFileSync(path, before + newBlock + after, 'utf8');
console.log("Successfully patched server.js");
