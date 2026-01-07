const fs = require('fs');
const shop = fs.readFileSync('c:/Users/Mehmet/Desktop/KickChatBot/shop.js', 'utf8');
const env = fs.readFileSync('c:/Users/Mehmet/Desktop/KickChatBot/.env', 'utf8');

const shopMatch = shop.match(/databaseURL:\s*"(https:\/\/[^"]+)"/);
const envMatch = env.match(/FIREBASE_DB_URL=(https:\/\/[^\s]+)/);

console.log('SHOP_DB:', shopMatch ? shopMatch[1] : 'NOT FOUND');
console.log('ENV_DB: ', envMatch ? envMatch[1] : 'NOT FOUND');

if (shopMatch && envMatch && shopMatch[1] === envMatch[1]) {
    console.log('MATCH: YES');
} else {
    console.log('MATCH: NO');
}
