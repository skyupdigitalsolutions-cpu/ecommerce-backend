const brevo = require("@getbrevo/brevo");
const env = require("../config/env");

// Send a transactional email through Brevo.
// The app still boots and runs without a BREVO_API_KEY; in that case we just
// log the email to the console instead of crashing (handy in development).
const sendEmail = async ({ to, subject, html }) => {
  if (!env.brevo.apiKey) {
    console.log(`[email skipped - no BREVO_API_KEY] to=${to} subject=${subject}`);
    return;
  }

  const api = new brevo.TransactionalEmailsApi();
  api.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, env.brevo.apiKey);

  const message = new brevo.SendSmtpEmail();
  message.sender = { name: env.brevo.fromName, email: env.brevo.fromAddress };
  message.to = [{ email: to }];
  message.subject = subject;
  message.htmlContent = html;

  await api.sendTransacEmail(message);
};

module.exports = sendEmail;
