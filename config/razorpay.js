const env = require("./env");

// We lazy-load the Razorpay SDK and only create the client the first time an
// API call actually needs it. This means the app still boots fine even if the
// `razorpay` package isn't installed yet or the keys aren't set - only the
// endpoints that talk to Razorpay's API will error, with a clear message.
// (The signature-verification and webhook endpoints don't need this client;
// they only use the secret + Node's crypto.)
let client = null;

const getRazorpay = () => {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new Error(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env"
    );
  }
  if (!client) {
    const Razorpay = require("razorpay"); // required here, not at top of file
    client = new Razorpay({
      key_id: env.razorpay.keyId,
      key_secret: env.razorpay.keySecret,
    });
  }
  return client;
};

module.exports = { getRazorpay };
