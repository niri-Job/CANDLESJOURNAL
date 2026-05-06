import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(email: string, name: string) {
  await resend.emails.send({
    from: "NIRI <support@niri.live>",
    to: email,
    subject: "Welcome to NIRI",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0A0A0F;color:#F0E6D3;border-radius:12px;">
        <div style="text-align:center;margin-bottom:28px;">
          <div style="width:56px;height:56px;border-radius:12px;background:linear-gradient(135deg,#F5C518,#C9A227);display:inline-flex;align-items:center;justify-content:center;font-size:1.25rem;font-weight:900;color:#0A0A0F;">NI</div>
        </div>
        <h2 style="font-size:1.5rem;font-weight:800;margin:0 0 12px;color:#F0E6D3;">Welcome to NIRI, ${name}!</h2>
        <p style="color:#8A7D65;line-height:1.7;margin:0 0 24px;">
          Your account is ready. Connect your MT5 account to start tracking your trading performance automatically.
        </p>
        <div style="text-align:center;margin-bottom:28px;">
          <a href="https://niri.live/dashboard"
             style="background:linear-gradient(135deg,#F5C518,#C9A227);color:#0A0A0F;padding:13px 28px;text-decoration:none;border-radius:8px;font-weight:700;font-size:0.9375rem;display:inline-block;">
            Go to Dashboard →
          </a>
        </div>
        <p style="color:#5a4a2a;font-size:0.8125rem;margin:0;">The NIRI Team · <a href="https://niri.live" style="color:#8B6914;">niri.live</a></p>
      </div>
    `,
  });
}
