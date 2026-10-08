const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  const { data, error } = await resend.emails.send({
    from: 'SwiftDrop Operations <onboarding@resend.dev>',
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