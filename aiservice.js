import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function generateWaterReport(readings) {
  const { TDS, Temperature, Turbidity, pH } = readings;

  const prompt = `
You are a water quality expert.

TDS: ${TDS} ppm
Temperature: ${Temperature} °C
Turbidity: ${Turbidity} NTU
pH: ${pH}

Provide:
1. Simple summary
2. Health risks
3. Suggested actions
Keep it under 120 words.
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: prompt }] }
        ]
      })
    }
  );

  const data = await response.json();

  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No report generated.";
}
