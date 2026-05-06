// Quick smoke-test for Resend email delivery.
// Usage: RESEND_API_KEY=re_xxx node test-resend.js
const https = require("https");

const apiKey = process.env.RESEND_API_KEY || "YOUR_RESEND_API_KEY";
const data = JSON.stringify({
  from: "support@niri.live",
  to: "josephjob864@gmail.com",
  subject: "Test from NIRI",
  html: "<p>Resend is working! 🎉</p>",
});

const options = {
  hostname: "api.resend.com",
  path: "/emails",
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  },
};

const req = https.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Response:", body);
  });
});

req.on("error", (e) => console.error("Error:", e.message));
req.write(data);
req.end();
