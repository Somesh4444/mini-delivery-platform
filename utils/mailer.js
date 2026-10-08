const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  // Resend free sandbox only allows sending to the account owner (lipu.getrafic@gmail.com).
  // If sending to any other test email, we route it to your Resend account email
  // with a header note so it never fails with a 403 validation error.
  const recipient = 'lipu.getrafic@gmail.com';

  const { data, error } = await resend.emails.send({
    from: 'SwiftDrop Operations <onboarding@resend.dev>',
    to: [recipient],
    subject: `[Target: ${to}] ${subject}`,
    html
  });

  if (error) {
    console.error('Resend delivery error:', error);
    throw new Error(error.message);
  }

  return data;
};

module.exports = { sendEmail };