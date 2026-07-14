const nodemailer = require('nodemailer');
const { env } = require('../config/env.js');
const { logger } = require('./logger.js');

let transporter = null;

const isConfigured = !!env.SMTP_USER && !!env.SMTP_PASS;

if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

function generateEmailHTML(otp, type) {
  const title = type === 'forgot_password' ? 'Reset Your Password' : 'Verify Your Email';
  const message = type === 'forgot_password'
    ? 'You requested to reset your password. Please use the verification code below to set a new password.'
    : 'Welcome to QuotaFlow! Please use the verification code below to verify your email address and activate your account.';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; margin: 0; padding: 40px 20px; color: #f1f5f9; }
        .container { max-width: 480px; margin: 0 auto; background: #1e293b; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); overflow: hidden; border: 1px solid #334155; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px; }
        .content { padding: 32px; text-align: center; }
        .otp-box { background: #0f172a; border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid #475569; }
        .otp-code { font-size: 36px; font-weight: 700; color: #34d399; letter-spacing: 8px; font-family: monospace; }
        .message { color: #94a3b8; font-size: 14px; line-height: 1.6; }
        .footer { padding: 24px; text-align: center; border-top: 1px solid #334155; }
        .footer p { color: #64748b; font-size: 12px; margin: 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>QuotaFlow</h1>
        </div>
        <div class="content">
          <p class="message" style="font-weight: 600; font-size: 16px; color: #f1f5f9;">${title}</p>
          <p class="message">${message}</p>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>
          <p class="message">This code will expire in <strong>10 minutes</strong>. If you did not request this verification, please ignore this email.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} QuotaFlow API - Enterprise Quotation Generator</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendOTPEmail(email, otp, type = 'signup') {
  const subject = type === 'forgot_password' ? 'Reset Your Password - QuotaFlow' : 'Verify Your Email - QuotaFlow';
  const text = type === 'forgot_password'
    ? `Your password reset code is: ${otp}. This code will expire in 10 minutes.`
    : `Your verification code is: ${otp}. This code will expire in 10 minutes.`;
  const html = generateEmailHTML(otp, type);

  if (!isConfigured || env.NODE_ENV !== 'production') {
    logger.info(`
===============================================
✉️ [EMAIL SIMULATION]
To: ${email}
Subject: ${subject}
OTP Code: ${otp}
Type: ${type}
===============================================
    `);
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: subject,
      text: text,
      html: html,
    });
    logger.info({ messageId: info.messageId, to: email }, 'OTP Email sent successfully');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error({ error, to: email }, 'Failed to send OTP Email');
    throw error;
  }
}

module.exports = {
  sendOTPEmail,
};
