import { Resend } from 'resend';
import { env } from '../config/env.js';

/**
 * Email Service using Resend SDK
 * 
 * WHY:
 * 1. Resend provides high-deliverability transactional emails with instant dispatch.
 * 2. High-contrast dark theme email template matches DocVault's cyber aesthetic.
 * 3. Fail-safe handling: If Resend fails or RESEND_API_KEY is missing, we log clearly
 *    without crashing the request pipeline.
 */

const resendApiKey = env.RESEND_API_KEY || process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Sends a 6-digit OTP verification email for new user registration
 */
export async function sendOtpEmail(email, otp) {
  const subject = `Your DocVault Verification Code: ${otp}`;
  const sender = 'DocVault <onboarding@resend.dev>';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
      <style>
        body { margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        .wrapper { max-width: 520px; margin: 32px auto; padding: 36px 32px; background-color: #121214; border: 1px solid #27272a; border-radius: 16px; }
        .logo-pill { display: inline-block; padding: 6px 14px; background-color: #18181b; border: 1px solid #27272a; border-radius: 9999px; font-family: monospace; font-size: 11px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 1px; }
        .heading { margin-top: 24px; font-size: 22px; font-weight: 700; color: #f4f4f5; letter-spacing: -0.5px; }
        .desc { margin-top: 8px; font-size: 13px; color: #a1a1aa; line-height: 1.6; }
        .code-container { margin: 28px 0; padding: 22px; background-color: #09090b; border: 1px solid #27272a; border-radius: 12px; text-align: center; }
        .code-text { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 32px; font-weight: 700; color: #FF3B5C; letter-spacing: 8px; }
        .warning-box { margin-top: 24px; padding: 14px 16px; background-color: rgba(255, 59, 92, 0.08); border: 1px solid rgba(255, 59, 92, 0.2); border-radius: 10px; font-size: 12px; color: #fda4af; }
        .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #27272a; font-family: monospace; font-size: 10px; color: #71717a; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="logo-pill">DocVault • Security Verification</div>
        <h1 class="heading">Verify Your Email Address</h1>
        <p class="desc">
          You are registering a new Document Owner account on DocVault.
          Use the 6-digit verification code below to complete your registration.
        </p>

        <div class="code-container">
          <div class="code-text">${otp}</div>
        </div>

        <div class="warning-box">
          ⚠️ <strong>Security Notice:</strong> This code is valid for <strong>5 minutes</strong>.
          DocVault will never ask for your verification code. If you did not initiate this registration, please disregard this email.
        </div>

        <div class="footer">
          DocVault Zero-Trust Document Infrastructure • Immutable Audit Protection
        </div>
      </div>
    </body>
    </html>
  `;

  if (!resend) {
    console.warn(`[EmailService Warning] RESEND_API_KEY is not configured. For development/testing, OTP for ${email} is: [ ${otp} ]`);
    return { success: false, reason: 'RESEND_API_KEY not configured', devOtp: otp };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: sender,
      to: email,
      subject,
      html,
    });

    if (error) {
      console.error(`[EmailService Error] Resend dispatch failed for ${email}:`, error);
      // In development, also log the OTP so testing can proceed if domain is unverified
      console.warn(`[EmailService Fallback] For test debugging, OTP for ${email} is: [ ${otp} ]`);
      return { success: false, error };
    }

    console.log(`[EmailService] OTP verification email sent successfully to ${email} (id: ${data?.id})`);
    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error(`[EmailService Critical] Failed to send email via Resend: ${err.message}`);
    console.warn(`[EmailService Fallback] For test debugging, OTP for ${email} is: [ ${otp} ]`);
    return { success: false, error: err.message };
  }
}

/**
 * Sends document sharing notification email
 */
export async function sendShareEmail({
  recipientEmail,
  ownerName,
  documentTitle,
  permission,
  shareUrl,
  expiresAt,
  maxViews,
}) {
  if (!resend) {
    return {
      emailSent: false,
      reason: 'RESEND_API_KEY not configured. Use direct link copy.',
    };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'DocVault <onboarding@resend.dev>',
      to: recipientEmail,
      subject: `Confidential Document Shared: ${documentTitle}`,
      html: `
        <div style="background-color:#09090b; color:#f4f4f5; padding:32px; font-family:sans-serif;">
          <div style="max-width:500px; margin:auto; background:#121214; padding:28px; border:1px solid #27272a; border-radius:14px;">
            <h2 style="color:#FF3B5C; margin-top:0;">DocVault Secure Document Grant</h2>
            <p><strong>${ownerName}</strong> has shared a confidential document with you: <strong>${documentTitle}</strong>.</p>
            <p style="font-size:12px; color:#a1a1aa;">
              Permission: <strong>${permission.toUpperCase()}</strong> | 
              Expires: <strong>${new Date(expiresAt).toLocaleString()}</strong> | 
              View Limit: <strong>${maxViews ? maxViews : 'Unlimited'}</strong>
            </p>
            <div style="margin:24px 0;">
              <a href="${shareUrl}" style="background:#FF3B5C; color:#fff; padding:10px 20px; border-radius:10px; text-decoration:none; font-weight:bold; font-size:13px; display:inline-block;">
                Access Document
              </a>
            </div>
            <p style="font-size:11px; color:#71717a;">This is a tracked and monitored link. Access attempts are forensically logged.</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.warn(`[EmailService Share] Error sending to ${recipientEmail}:`, error);
      return { emailSent: false, error };
    }

    return { emailSent: true, messageId: data?.id };
  } catch (err) {
    console.error(`[EmailService Share] Exception: ${err.message}`);
    return { emailSent: false, error: err.message };
  }
}
