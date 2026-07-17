// HTML bodies for the transactional emails. Kept here so controllers stay
// clean and you can restyle all emails in one place. Each function returns an
// HTML string that helpers/sendEmail.js passes to Brevo.

const verifyEmailTemplate = (name, url) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
    <h2>Verify your email</h2>
    <p>Hi ${name || "there"}, thanks for signing up. Please confirm your email address:</p>
    <p>
      <a href="${url}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">
        Verify email
      </a>
    </p>
    <p>Or paste this link into your browser:</p>
    <p><a href="${url}">${url}</a></p>
    <p style="color:#888;font-size:12px;">
      This link expires in 24 hours. If you didn't create an account, you can ignore this email.
    </p>
  </div>
`;

const resetPasswordTemplate = (name, url) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
    <h2>Reset your password</h2>
    <p>Hi ${name || "there"}, we received a request to reset your password.</p>
    <p>
      <a href="${url}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">
        Reset password
      </a>
    </p>
    <p>Or paste this link into your browser:</p>
    <p><a href="${url}">${url}</a></p>
    <p style="color:#888;font-size:12px;">
      This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.
    </p>
  </div>
`;

module.exports = { verifyEmailTemplate, resetPasswordTemplate };