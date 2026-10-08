const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use direct SSL (not STARTTLS on 587)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 10000, // 10s connection timeout
  greetingTimeout: 10000,
  socketTimeout: 15000
});

module.exports = transporter;