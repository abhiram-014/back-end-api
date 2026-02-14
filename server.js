require("dotenv").config();

const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const twilio = require("twilio");
const fetch = require("node-fetch");

const app = express();

/* ==================================
   ✅ CORS & BODY PARSER
================================== */
app.use(cors());
app.use(express.json());
/* ================================== */


/* ==================================
   FIREBASE SETUP
================================== */

let serviceAccount;

try {
  serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require("./serviceAccountKey.json");

  console.log("🔐 Firebase service account loaded");
} catch (err) {
  console.error("❌ Failed to load Firebase service account:", err.message);
  process.exit(1);
}

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


/* ==================================
   TWILIO SETUP
================================== */

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


/* ==================================
   TANK LEVEL LISTENER
================================== */

let alertSent = false;

db.ref("tank/percentage").on("value", async (snapshot) => {
  const level = snapshot.val();
  if (level === null || level === undefined) return;

  console.log("💧 Tank Level:", level);

  if (level > 85 && !alertSent) {
    await sendSMS(`🚨 ALERT! Tank water level is ${level}%. Above safe limit!`);
    alertSent = true;
  }

  if (level <= 85 && alertSent) {
    alertSent = false;
  }
});


/* ==================================
   AI REPORT ROUTE
================================== */

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing in .env");
  process.exit(1);
}

app.post("/api/generate-report", async (req, res) => {
  try {
    const { TDS, Temperature, Turbidity, pH } = req.body;

    // ✅ Safe validation (accepts 0 values)
    if (
      TDS === undefined ||
      Temperature === undefined ||
      Turbidity === undefined ||
      pH === undefined
    ) {
      return res.status(400).json({ error: "Missing sensor data" });
    }

    const prompt = `
You are a certified water quality expert.

Sensor Readings:
TDS: ${TDS} ppm
Temperature: ${Temperature} °C
Turbidity: ${Turbidity} NTU
pH: ${pH}

Provide:
1. Simple overall summary
2. Health risks (if any)
3. Suggested actions

Keep response under 120 words.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Gemini API Error:", errorText);
      return res.status(500).json({ error: "Gemini API failed" });
    }

    const data = await response.json();

    const report =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No report generated.";

    res.json({ report });

  } catch (error) {
    console.error("❌ AI Route Error:", error.message);
    res.status(500).json({ error: "Failed to generate report" });
  }
});


/* ==================================
   HEALTH CHECK
================================== */

app.get("/", (req, res) => {
  res.send("🚀 Backend + Firebase + Twilio + Gemini running!");
});


/* ==================================
   START SERVER
================================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🌍 Server running on port ${PORT}`);
});
