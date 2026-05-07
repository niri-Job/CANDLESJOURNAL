import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = "NIRI <support@niri.live>";

// ─── Shared primitives ────────────────────────────────────────────────────────
function logo() {
  return `
    <div style="text-align:center;margin-bottom:32px;">
      <div style="width:52px;height:52px;border-radius:12px;
                  background:linear-gradient(135deg,#F5C518,#C9A227);
                  display:inline-flex;align-items:center;justify-content:center;
                  font-size:1.2rem;font-weight:900;color:#0A0A0F;
                  box-shadow:0 0 24px rgba(245,197,24,0.30);">NI</div>
      <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.12em;
                  color:#8B6914;margin-top:6px;">NIRI</div>
    </div>`;
}

function wrapper(content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D0D12;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;padding:40px 36px;
              background:#141418;border-radius:16px;
              border:1px solid #2a2415;
              box-shadow:0 0 60px rgba(245,197,24,0.06);">
    ${logo()}
    ${content}
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #1e1a10;
                font-size:0.75rem;color:#4a3f22;text-align:center;line-height:1.8;">
      The NIRI Team ·
      <a href="https://niri.live" style="color:#8B6914;text-decoration:none;">niri.live</a>
      · <a href="mailto:support@niri.live" style="color:#8B6914;text-decoration:none;">support@niri.live</a>
    </div>
  </div>
</body>
</html>`;
}

function goldButton(label: string, href: string) {
  return `
    <div style="text-align:center;margin:28px 0;">
      <a href="${href}"
         style="background:linear-gradient(135deg,#F5C518,#C9A227);
                color:#0A0A0F;padding:14px 32px;
                text-decoration:none;border-radius:9px;
                font-weight:700;font-size:0.9375rem;display:inline-block;
                letter-spacing:0.02em;">
        ${label}
      </a>
    </div>`;
}

function h1(text: string) {
  return `<h1 style="font-size:1.5rem;font-weight:800;color:#F0E6D3;margin:0 0 12px;">${text}</h1>`;
}

function p(text: string, style = "") {
  return `<p style="color:#8A7D65;line-height:1.75;margin:0 0 16px;font-size:0.9375rem;${style}">${text}</p>`;
}

// ─── 1. Welcome email ─────────────────────────────────────────────────────────
export async function sendWelcomeEmail(email: string, name: string) {
  const displayName = name || "Trader";

  const content = `
    ${h1(`Welcome to NIRI, ${displayName}!`)}
    ${p("Your account is live. NIRI is your AI-powered trading journal — built to help you trade more consistently, understand your edge, and grow your account over time.")}

    <div style="margin:24px 0;border-radius:12px;border:1px solid #2a2415;overflow:hidden;">
      ${[
        ["📡", "Connect your MT5 account", "Use Quick Connect in onboarding to sync your trades automatically — no manual entry needed."],
        ["📊", "Track every trade", "Your dashboard shows equity curve, win rate, best sessions, and more — all updated in real time."],
        ["🤖", "Get AI coaching", "After a few trades, hit Analyse to get personalised feedback on your patterns and psychology."],
      ].map(([icon, title, body], i) => `
        <div style="display:flex;gap:16px;padding:16px 20px;
                    ${i > 0 ? "border-top:1px solid #1e1a10;" : ""}">
          <div style="font-size:1.25rem;width:28px;flex-shrink:0;padding-top:1px;">${icon}</div>
          <div>
            <div style="font-size:0.875rem;font-weight:700;color:#E8D5A0;margin-bottom:3px;">${title}</div>
            <div style="font-size:0.8125rem;color:#6a5e42;line-height:1.6;">${body}</div>
          </div>
        </div>`).join("")}
    </div>

    ${goldButton("Go to Dashboard →", "https://niri.live/dashboard")}
    ${p("If you have any questions, just reply to this email.", "font-size:0.8125rem;color:#5a4a2a;")}`;

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: "Welcome to NIRI — your trading journal is ready",
    html:    wrapper(content),
  });

  if (error) {
    console.error("[email] sendWelcomeEmail failed:", error);
  }
}

// ─── 2. Payment receipt ───────────────────────────────────────────────────────
interface ReceiptData {
  name:            string;
  billingType:     "monthly" | "yearly";
  subscriptionEnd: string; // ISO date string
  reference:       string;
}

export async function sendPaymentReceipt(email: string, data: ReceiptData) {
  const { name, billingType, subscriptionEnd, reference } = data;
  const displayName = name || "Trader";

  const isYearly    = billingType === "yearly";
  const amountLabel = isYearly ? "$140.40 / year" : "$13.00 / month";
  const nextDate    = new Date(subscriptionEnd).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  function row(label: string, value: string, highlight = false) {
    return `
      <tr>
        <td style="padding:11px 16px;font-size:0.8125rem;color:#6a5e42;
                   border-bottom:1px solid #1e1a10;">${label}</td>
        <td style="padding:11px 16px;font-size:0.8125rem;text-align:right;
                   font-weight:${highlight ? "700" : "500"};
                   color:${highlight ? "#F5C518" : "#C8B98A"};
                   border-bottom:1px solid #1e1a10;">${value}</td>
      </tr>`;
  }

  const content = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <div style="width:40px;height:40px;border-radius:10px;flex-shrink:0;
                  background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.25);
                  display:flex;align-items:center;justify-content:center;
                  font-size:1.1rem;">✓</div>
      <div>
        ${h1("Payment confirmed")}
        <div style="font-size:0.875rem;color:#6a5e42;margin-top:-8px;">
          You're now on <strong style="color:#F5C518;">NIRI Pro</strong>
        </div>
      </div>
    </div>

    ${p(`Hi ${displayName}, your Pro subscription is active. Here's your receipt.`)}

    <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;
                  border:1px solid #2a2415;margin:0 0 24px;">
      <tbody>
        ${row("Plan",             "NIRI Pro",   false)}
        ${row("Amount",           amountLabel,  true)}
        ${row("Billing",          isYearly ? "Yearly" : "Monthly", false)}
        ${row("Next billing date", nextDate,     false)}
        ${row("Reference",        reference,    false)}
      </tbody>
    </table>

    ${p("Your Pro access includes unlimited trades, MT5 Quick Connect, AI coaching, advanced analytics, and more.", "font-size:0.875rem;")}

    ${goldButton("Go to Dashboard →", "https://niri.live/dashboard")}

    ${p(
      'Questions about your subscription? Reply to this email or visit ' +
      '<a href="https://niri.live/pricing" style="color:#8B6914;">niri.live/pricing</a>.',
      "font-size:0.8125rem;color:#5a4a2a;"
    )}`;

  const { error } = await resend.emails.send({
    from:    FROM,
    to:      email,
    subject: `NIRI Pro — payment confirmed (${amountLabel})`,
    html:    wrapper(content),
  });

  if (error) {
    console.error("[email] sendPaymentReceipt failed:", error);
  }
}
