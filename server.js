require("dotenv").config();

const express = require("express");
const admin = require("firebase-admin");
const twilio = require("twilio");

const app = express();
app.use(express.json());

/* ======================================================
   🔐 LOAD FIREBASE SERVICE ACCOUNT
====================================================== */

let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("🔐 Using Firebase service account from ENV");
  } else {
    serviceAccount = require("./serviceAccountKey.json");
    console.log("🔐 Using local serviceAccountKey.json");
  }
} catch (err) {
  console.error("❌ Failed to load Firebase service account:", err.message);
  process.exit(1);
}

/* ======================================================
   🔥 INITIALIZE FIREBASE
====================================================== */

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  console.log("✅ Firebase initialized");
} catch (err) {
  console.error("❌ Firebase initialization failed:", err.message);
  process.exit(1);
}

const db = admin.database();

/* ======================================================
   📲 INITIALIZE TWILIO
====================================================== */

if (
  !process.env.TWILIO_ACCOUNT_SID ||
  !process.env.TWILIO_AUTH_TOKEN ||
  !process.env.TWILIO_PHONE ||
  !process.env.ALERT_PHONE
) {
  console.error("❌ Missing Twilio environment variables");
  process.exit(1);
}

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

console.log("📲 Twilio initialized");

/* ======================================================
   📩 SEND SMS FUNCTION
====================================================== */

async function sendSMS(message) {
  try {
    const msg = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to: process.env.ALERT_PHONE,
    });

    console.log("✅ SMS Sent:", msg.sid);
  } catch (err) {
    console.error("❌ SMS Error:", err.message);
  }
}

/* ======================================================
   🚨 WATER LEVEL ALERT LOGIC (LISTEN TO tank/percentage)
====================================================== */

let alertSent = false;

console.log("🔥 Listening to tank/percentage...");

db.ref("tank/percentage").on(
  "value",
  async (snapshot) => {
    const level = snapshot.val();

    if (level === null) {
      console.log("⚠️ No tank percentage found");
      return;
    }

    console.log("💧 Tank Level:", level);

    // 🚨 Alert when above 85%
    if (level > 85 && !alertSent) {
      console.log("🚨 Tank level above 85%. Sending alert...");
      await sendSMS(
        `🚨 ALERT! Tank water level is ${level}%. Above safe limit!`
      );
      alertSent = true;
    }

    // Reset alert when safe
    if (level <= 85 && alertSent) {
      console.log("✅ Tank level back to safe range.");
      alertSent = false;
    }
  },
  (error) => {
    console.error("❌ Firebase Listener Error:", error);
  }
);

/* ======================================================
   🌐 EXPRESS SERVER
====================================================== */

app.get("/", (req, res) => {
  res.send("🚀 Backend + Firebase + Twilio running!");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🌍 Server running on port ${PORT}`);
});
