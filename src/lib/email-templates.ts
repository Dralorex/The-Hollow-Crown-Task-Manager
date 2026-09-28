import { getAppBaseUrl } from "@/lib/mail";

function shell(title: string, bodyHtml: string, bodyText: string) {
  const brand = "Rowgon";
  return {
    html: `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#E8F7F6;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E8F7F6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px;border:1px solid rgba(10,61,69,0.12);">
            <tr>
              <td style="color:#0A3D45;">
                <p style="margin:0 0 8px;font-size:22px;font-weight:700;">${brand}</p>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">${title}</h1>
                ${bodyHtml}
                <p style="margin:24px 0 0;font-size:12px;color:rgba(10,61,69,0.55);">
                  Sent by Rowgon regarding your account. Manage email settings in Profile.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    text: `${brand}\n\n${title}\n\n${bodyText}\n\nSent by Rowgon regarding your account. Manage email settings in Profile.\n`,
  };
}

export function emailVerificationCodeEmail(opts: {
  username: string;
  code: string;
  email: string;
}) {
  return {
    subject: "Your Rowgon verification code",
    ...shell(
      "Confirm your email",
      `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:rgba(10,61,69,0.85);">
        Hi @${escapeHtml(opts.username)}, use this code to confirm
        <strong>${escapeHtml(opts.email)}</strong> on Rowgon:
      </p>
      <p style="margin:0 0 20px;font-size:36px;letter-spacing:0.35em;font-weight:700;color:#0A3D45;">
        ${escapeHtml(opts.code)}
      </p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:rgba(10,61,69,0.7);">
        This code expires in 15 minutes. If you didn’t request it, you can ignore this email.
      </p>`,
      `Hi @${opts.username}, your Rowgon verification code for ${opts.email} is: ${opts.code}\n\nIt expires in 15 minutes.`,
    ),
  };
}

export function welcomeAccountEmail(opts: {
  username: string;
  nickname?: string | null;
}) {
  const name = opts.nickname?.trim() || opts.username;
  const appUrl = getAppBaseUrl();
  return {
    subject: "Welcome to Rowgon",
    ...shell(
      "Thanks for creating your account",
      `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:rgba(10,61,69,0.85);">
        Hi ${escapeHtml(name)}, thanks for joining Rowgon. Your account is ready —
        you can sign in anytime with your username <strong>@${escapeHtml(opts.username)}</strong>.
      </p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:rgba(10,61,69,0.85);">
        This email confirms the address on your account so you can reset your password if you ever need to.
      </p>
      <p style="margin:0;">
        <a href="${appUrl}/app" style="display:inline-block;background:#0A3D45;color:#E8F7F6;text-decoration:none;padding:12px 18px;border-radius:999px;font-size:14px;">
          Open Rowgon
        </a>
      </p>`,
      `Hi ${name}, thanks for joining Rowgon. Your account is ready — sign in with @${opts.username}.\n\nOpen Rowgon: ${appUrl}/app`,
    ),
  };
}

export function passwordResetEmail(opts: { username: string; code: string }) {
  return {
    subject: "Your Rowgon password reset code",
    code: opts.code,
    ...shell(
      "Password reset",
      `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:rgba(10,61,69,0.85);">
        We received a request to reset the password for <strong>@${escapeHtml(opts.username)}</strong>.
      </p>
      <p style="margin:0 0 20px;font-size:36px;letter-spacing:0.35em;font-weight:700;color:#0A3D45;">
        ${escapeHtml(opts.code)}
      </p>
      <p style="margin:0;font-size:14px;line-height:1.5;color:rgba(10,61,69,0.7);">
        Enter this code on the Rowgon website to choose a new password. It expires in 15 minutes.
        If you didn’t ask for a reset, you can ignore this email.
      </p>`,
      `Reset the password for @${opts.username}.\n\nYour code: ${opts.code}\n\nEnter it on the Rowgon website within 15 minutes.\n\nIf you didn’t ask for a reset, ignore this email.`,
    ),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
