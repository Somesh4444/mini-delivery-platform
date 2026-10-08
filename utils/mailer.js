const sendEmail = async ({ to, subject, html }) => {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: 'SwiftDrop Fleet Operations',
        email: process.env.EMAIL_USER || 'lipu.getrafic@gmail.com'
      },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('Brevo delivery error:', data);
    throw new Error(data.message || 'Failed to send email via Brevo');
  }

  return data;
};

module.exports = { sendEmail };