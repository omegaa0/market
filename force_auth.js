const firebase = require('firebase/compat/app');
require('firebase/compat/database');
require('dotenv').config({ path: 'c:/Users/Mehmet/Desktop/KickChatBot/.env' });

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    databaseURL: process.env.FIREBASE_DB_URL
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

async function forceEntry() {
    console.log("Forcing pending_auth entry for 'omegacyr'...");
    const code = "999999";

    try {
        await db.ref('pending_auth/omegacyr').remove(); // Clean start
        await db.ref('pending_auth/omegacyr').set({
            code: code,
            timestamp: Date.now()
        });

        // Also verify read
        const snap = await db.ref('pending_auth/omegacyr').once('value');
        console.log("Write verification:", snap.val());

        console.log("SUCCESS! Entry created.");
        console.log("Lütfen şimdi chat'e şunu yazın: !doğrulama 999999");
        process.exit(0);
    } catch (error) {
        console.error("ERROR writing to Firebase:", error);
        process.exit(1);
    }
}

forceEntry();
