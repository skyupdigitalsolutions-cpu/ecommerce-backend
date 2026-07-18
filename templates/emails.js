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

// Sent once an order is placed (COD) or paid (online).
const orderConfirmationTemplate = (name, order) => {
  const shortId = order._id.toString().slice(-8);
  const rows = (order.items || [])
    .map(
      (it) =>
        `<tr><td style="padding:4px 0;">${it.name} × ${it.quantity}</td><td style="padding:4px 0;text-align:right;">₹${it.price * it.quantity}</td></tr>`
    )
    .join("");
  return `
  <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto;">
    <h2>Thanks for your order, ${name || "there"}!</h2>
    <p>We've received your order <b>#${shortId}</b> and it's now being processed.</p>
    <table style="width:100%; border-collapse:collapse; margin:16px 0;">
      ${rows}
      <tr><td style="padding-top:10px; border-top:1px solid #eee;"><b>Total</b></td>
          <td style="padding-top:10px; border-top:1px solid #eee; text-align:right;"><b>₹${order.totalPrice}</b></td></tr>
    </table>
    <p>Payment method: ${order.paymentMethod}</p>
    <p style="color:#888; font-size:12px;">We'll email you as your order progresses.</p>
  </div>`;
};

// Sent whenever an admin moves the order to a new status.
const orderStatusTemplate = (name, order, status) => {
  const shortId = order._id.toString().slice(-8);
  return `
  <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto;">
    <h2>Order update</h2>
    <p>Hi ${name || "there"}, your order <b>#${shortId}</b> is now:</p>
    <p style="font-size:18px; font-weight:bold; text-transform:capitalize;">${status.replace(/_/g, " ")}</p>
    <p style="color:#888; font-size:12px;">Order total: ₹${order.totalPrice} · Placed ${new Date(order.createdAt).toLocaleDateString()}</p>
  </div>`;
};

module.exports = { verifyEmailTemplate, resetPasswordTemplate, orderConfirmationTemplate, orderStatusTemplate };
