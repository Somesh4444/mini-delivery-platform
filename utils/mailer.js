const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail', // or host: 'smtp.gmail.com', port: 465, secure: true
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS // Gmail App Password (16 characters)
  }
});

// Verify connection configuration (optional, logs in terminal on startup)
transporter.verify((error) => {
  if (error) {
    console.warn('⚠️ Mailer warning: Check EMAIL_USER and EMAIL_PASS in .env:', error.message);
  } else {
    console.log('✅ Mailer ready: Connected to SMTP server');
  }
});

module.exports = transporter;