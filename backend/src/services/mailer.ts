import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
}

interface EmailOptions {
  from?: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Mailer service for sending transactional emails
 * 
 * Usage:
 * const mailer = new Mailer();
 * await mailer.sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Welcome to KuduPay',
 *   text: 'Welcome!',
 *   html: '<h1>Welcome!</h1>'
 * });
 */
export class Mailer {
  private config: SMTPConfig;
  private transporter: nodemailer.Transporter | null = null;
  private defaultFrom: string;

  constructor() {
    this.config = this.loadSMTPConfig();
    this.defaultFrom = process.env.SMTP_USER || 'noreply@kudupay.com';
  }

  /**
   * Load SMTP configuration from environment variables
   */
  private loadSMTPConfig(): SMTPConfig {
    const smtpServer = process.env.SMTP_SERVER;
    const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpSecure = process.env.SMTP_SECURE === 'true';

    if (!smtpServer) {
      throw new Error('SMTP_SERVER is not configured in backend/.env');
    }

    const config: SMTPConfig = {
      host: smtpServer,
      port: smtpPort,
      secure: smtpSecure,
    };

    if (smtpUser && smtpPass) {
      config.auth = {
        user: smtpUser,
        pass: smtpPass,
      };
    }

    return config;
  }

  /**
   * Create nodemailer transporter
   */
  private createTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport(this.config);
    }
    return this.transporter!;
  }

  /**
   * Test SMTP connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const transporter = this.createTransporter();
      await transporter.verify();
      return true;
    } catch (error) {
      console.error('SMTP connection failed:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Send a transactional email
   */
  async sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
      const transporter = this.createTransporter();
      
      // Prepare email options with default from address
      const emailOptions = {
        from: options.from || this.defaultFrom,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      };

      // Validate required fields
      if (!emailOptions.to) {
        throw new Error('Recipient email address is required');
      }
      if (!emailOptions.subject) {
        throw new Error('Email subject is required');
      }
      if (!emailOptions.text && !emailOptions.html) {
        throw new Error('Email must have either text or HTML content');
      }

      const info = await transporter.sendMail(emailOptions);
      
      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to send email:', errorMessage);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send a welcome email to new users
   */
  async sendWelcomeEmail(to: string, userName?: string, userRole?: string): Promise<EmailResult> {
    // Merchant-specific welcome email with Koos branding
    if (userRole === 'merchant') {
      return this.sendMerchantWelcomeEmail(to, userName);
    }

    // Default welcome email for other users
    const subject = 'Welcome to KuduPay!';
    const text = `Welcome to KuduPay${userName ? `, ${userName}` : ''}!

Thank you for joining our platform. We're excited to have you on board.

If you have any questions, feel free to reach out to our support team.

Best regards,
The KuduPay Team`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">🦌 Welcome to KuduPay!</h1>
        <p>Welcome to KuduPay${userName ? `, <strong>${userName}</strong>` : ''}!</p>
        <p>Thank you for joining our platform. We're excited to have you on board.</p>
        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p>Best regards,<br>The KuduPay Team</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      text,
      html,
    });
  }

  /**
   * Send a merchant-specific welcome email with Koos branding
   */
  async sendMerchantWelcomeEmail(to: string, userName?: string): Promise<EmailResult> {
    const subject = '🦌 Welcome to KuduPay, boet! Your business just got smarter';
    const text = `Howzit${userName ? ` ${userName}` : ''}!

Welcome to the KuduPay merchant family! I'm Koos the Kudu, your helpful sidekick who makes getting paid feel simple.

Here's what you can do now:
• Accept instant student payments via QR codes
• Track all your sales in real-time
• Get paid directly to your bank account
• Help students stick to their budgets (and keep sponsors happy!)

Your QR code is ready to go - just display it at your point of sale and watch the magic happen. Students scan, you get paid, everyone's happy. Lekker, hey?

Need help? I'm always here to lend a hoof. Just hit reply or check out our merchant support section.

Ready to make some sales? Let's do this!

– Koos the Kudu 🦌
Your KuduPay sidekick`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #fef7ed; padding: 20px; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #92400e; font-size: 28px; margin-bottom: 10px;">🦌 Welcome to KuduPay!</h1>
          <p style="color: #451a03; font-size: 18px; font-weight: bold;">Your business just got smarter, boet!</p>
        </div>
        
        <div style="background-color: white; padding: 25px; border-radius: 8px; margin-bottom: 20px;">
          <p style="color: #451a03; font-size: 16px; margin-bottom: 15px;">
            Howzit${userName ? ` <strong>${userName}</strong>` : ''}!
          </p>
          
          <p style="color: #451a03; margin-bottom: 20px;">
            Welcome to the KuduPay merchant family! I'm <strong>Koos the Kudu</strong>, your helpful sidekick who makes getting paid feel simple.
          </p>
          
          <div style="background-color: #fef3c7; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #92400e; margin-top: 0;">Here's what you can do now:</h3>
            <ul style="color: #451a03; margin: 10px 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">✅ Accept instant student payments via QR codes</li>
              <li style="margin-bottom: 8px;">📊 Track all your sales in real-time</li>
              <li style="margin-bottom: 8px;">💰 Get paid directly to your bank account</li>
              <li style="margin-bottom: 8px;">🎯 Help students stick to their budgets (and keep sponsors happy!)</li>
            </ul>
          </div>
          
          <p style="color: #451a03; margin-bottom: 15px;">
            Your QR code is ready to go - just display it at your point of sale and watch the magic happen. 
            Students scan, you get paid, everyone's happy. <strong>Lekker, hey?</strong>
          </p>
          
          <p style="color: #451a03; margin-bottom: 15px;">
            Need help? I'm always here to lend a hoof. Just hit reply or check out our merchant support section.
          </p>
          
          <div style="text-align: center; margin: 25px 0;">
            <p style="color: #92400e; font-size: 18px; font-weight: bold; margin-bottom: 10px;">
              Ready to make some sales? Let's do this!
            </p>
          </div>
        </div>
        
        <div style="text-align: center; color: #92400e; font-style: italic;">
          <p style="margin: 0;">– Koos the Kudu 🦌</p>
          <p style="margin: 5px 0 0 0; font-size: 14px;">Your KuduPay sidekick</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      text,
      html,
    });
  }

  /**
   * Send a password reset email
   */
  async sendPasswordResetEmail(to: string, resetToken: string, resetUrl?: string): Promise<EmailResult> {
    const baseUrl = resetUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const subject = 'Password Reset Request - KuduPay';
    const text = `You have requested to reset your password for your KuduPay account.

Click the following link to reset your password:
${resetLink}

This link will expire in 1 hour for security reasons.

If you did not request this password reset, please ignore this email.

Best regards,
The KuduPay Team`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">🔒 Password Reset Request</h1>
        <p>You have requested to reset your password for your KuduPay account.</p>
        <p>
          <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p><small>Or copy and paste this link: ${resetLink}</small></p>
        <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
        <p>If you did not request this password reset, please ignore this email.</p>
        <p>Best regards,<br>The KuduPay Team</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      text,
      html,
    });
  }

  /**
   * Send an email verification email
   */
  async sendVerificationEmail(to: string, verificationToken: string, verificationUrl?: string): Promise<EmailResult> {
    const baseUrl = verificationUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
    const verifyLink = `${baseUrl}/verify-email?token=${verificationToken}`;
    
    const subject = 'Verify Your Email - KuduPay';
    const text = `Please verify your email address to complete your KuduPay account setup.

Click the following link to verify your email:
${verifyLink}

This link will expire in 24 hours for security reasons.

If you did not create this account, please ignore this email.

Best regards,
The KuduPay Team`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">📧 Verify Your Email</h1>
        <p>Please verify your email address to complete your KuduPay account setup.</p>
        <p>
          <a href="${verifyLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email
          </a>
        </p>
        <p><small>Or copy and paste this link: ${verifyLink}</small></p>
        <p><strong>This link will expire in 24 hours for security reasons.</strong></p>
        <p>If you did not create this account, please ignore this email.</p>
        <p>Best regards,<br>The KuduPay Team</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      text,
      html,
    });
  }

  /**
   * Send an email verification email
   */
    /**
     * Send a magic link login email for students
     */
    async sendMagicLinkEmail(to: string, verificationToken: string, verificationUrl?: string): Promise<EmailResult> {
        const baseUrl = verificationUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
        const verifyLink = `${baseUrl}/verify-intent?token=${verificationToken}`;

        const subject = 'Your Secure Login Link - KuduPay';
        const text = `Hi there!

Someone (hopefully you!) requested to sign in to your KuduPay student account.

Click the link below to securely sign in:
${verifyLink}

This secure link will expire in 15 minutes for your protection.

If you didn't request this login link, you can safely ignore this email. Your account remains secure.

Need help? Feel free to reach out to our student support team.

Best regards,
The KuduPay Team`;

        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333; font-size: 24px;">🔐 Your Secure Login Link</h1>
        <p style="font-size: 16px; line-height: 1.5;">Hi there!</p>
        <p style="font-size: 16px; line-height: 1.5;">Someone (hopefully you!) requested to sign in to your KuduPay student account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyLink}" style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-size: 16px; font-weight: bold;">
            Sign In Securely
          </a>
        </div>
        <p style="font-size: 14px; color: #666; text-align: center;">Or copy and paste this link into your browser:</p>
        <p style="font-size: 12px; color: #666; word-break: break-all; text-align: center; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">${verifyLink}</p>
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #856404;"><strong>⏰ Important:</strong> This secure link will expire in 15 minutes for your protection.</p>
        </div>
        <p style="font-size: 14px; line-height: 1.5; color: #666;">If you didn't request this login link, you can safely ignore this email. Your account remains secure.</p>
        <p style="font-size: 14px; line-height: 1.5;">Need help? Feel free to reach out to our student support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="font-size: 14px; color: #666;">Best regards,<br><strong>The KuduPay Team</strong></p>
      </div>
    `;

        return this.sendEmail({
            to,
            subject,
            text,
            html,
        });
    }

  /**
   * Close the transporter connection
   */
  close(): void {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}

// Export a singleton instance for convenience
export const mailer = new Mailer();