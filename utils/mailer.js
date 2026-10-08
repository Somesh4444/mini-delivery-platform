const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  // During testing on the free tier, Resend allows sending from onboarding@resend.dev
  // to the email address registered with your Resend account.
  const { data, error } = await resend.emails.send({
    from: 'Somesh Mini Dlivery System <onboarding@resend.dev>',
    to: [to],
    subject,
    html
  });

  if (error) {
    console.error('Resend delivery error:', error);
    throw new Error(error.message);
  }

  return data;
};

module.exports = { sendEmail };