# Python
"""
SMTP Mailer for KuduQ Consumer

- Loads SMTP config from environment and optional .smtp.env file in the project.
- Provides helpers to send welcome emails and student magic-link emails.

Environment variables supported (mirrors __sample_mailer/mailer.ts):
  SMTP_SERVER
  SMTP_PORT
  SMTP_USER
  SMTP_PASS
  SMTP_SECURE  ("true"/"false")
  SMTP_FROM    (optional; default: SMTP_USER or noreply@kudupay.com)
  FRONTEND_URL (optional; used when link URL is not provided)
"""
from __future__ import annotations

import os
import logging
import smtplib
import ssl
from typing import Iterable, Optional
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def _load_smtp_env_file_if_present():
    """Load key=value pairs from ../.smtp.env into os.environ if file exists.
    Does not override existing environment variables.
    This keeps dependencies minimal (no python-dotenv).
    """
    try:
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
        env_path = os.path.join(base_dir, ".smtp.env")
        if not os.path.isfile(env_path):
            return
        with open(env_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                # Do not override if already set in env
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as exc:
        logger.warning("Failed to load .smtp.env: %s", exc)


class SMTPMailer:
    def __init__(self) -> None:
        # Attempt to load ../.smtp.env once during construction
        _load_smtp_env_file_if_present()
        self.server: Optional[str] = os.environ.get("SMTP_SERVER")
        self.port: int = int(os.environ.get("SMTP_PORT", "587"))
        self.username: Optional[str] = os.environ.get("SMTP_USER")
        self.password: Optional[str] = os.environ.get("SMTP_PASS")
        self.secure: bool = os.environ.get("SMTP_SECURE", "false").lower() == "true"
        self.default_from: str = (
            os.environ.get("SMTP_FROM")
            or self.username
            or "noreply@kudupay.com"
        )
        # Lazily created client per send; Lambda may reuse the process

    # --- Low-level email sender ---
    def send_email(
        self,
        to: str | Iterable[str],
        subject: str,
        text: Optional[str] = None,
        html: Optional[str] = None,
        from_addr: Optional[str] = None,
    ) -> bool:
        if not self.server:
            logger.error("SMTP_SERVER is not configured; skipping email send")
            return False
        if not subject:
            logger.error("Missing subject for email; skipping")
            return False
        if not text and not html:
            logger.error("Email requires text or html content; skipping")
            return False

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = from_addr or self.default_from
        if isinstance(to, str):
            recipients = [to]
        else:
            recipients = list(to)
        if not recipients:
            logger.error("No recipients provided; skipping email")
            return False
        msg["To"] = ", ".join(recipients)

        if text and html:
            msg.set_content(text)
            msg.add_alternative(html, subtype="html")
        elif html:
            # Provide a minimal plain fallback alongside HTML-only
            msg.set_content("This message contains HTML content. Use an HTML-capable email client.")
            msg.add_alternative(html, subtype="html")
        else:
            msg.set_content(text or "")

        # Connect and send
        try:
            if self.secure:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(self.server, self.port, context=context) as smtp:
                    if self.username and self.password:
                        smtp.login(self.username, self.password)
                    smtp.send_message(msg)
            else:
                with smtplib.SMTP(self.server, self.port) as smtp:
                    # Upgrade to TLS if supported (common for port 587)
                    try:
                        smtp.starttls(context=ssl.create_default_context())
                    except Exception:
                        # Some servers/ports may not support STARTTLS; continue without it
                        pass
                    if self.username and self.password:
                        smtp.login(self.username, self.password)
                    smtp.send_message(msg)
            logger.info("Email sent to %s with subject '%s'", msg["To"], subject)
            return True
        except Exception as exc:
            logger.exception("Failed to send email via SMTP: %s", exc)
            return False

    # --- High-level helpers ---
    def send_welcome_email(self, to: str, user_name: Optional[str] = None, user_role: Optional[str] = None) -> bool:
        # Use a merchant-specific variant if needed in future; for now, keep a common welcome
        subject = "Welcome to KuduPay!"
        greeting_name = f", {user_name}" if user_name else ""
        text = (
            f"Welcome to KuduPay{greeting_name}!\n\n"
            "Thank you for joining our platform. We're excited to have you on board.\n\n"
            "If you have any questions, feel free to reach out to our support team.\n\n"
            "Best regards,\nThe KuduPay Team"
        )
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">🦌 Welcome to KuduPay!</h1>
          <p>Welcome to KuduPay{f', <strong>{user_name}</strong>' if user_name else ''}!</p>
          <p>Thank you for joining our platform. We're excited to have you on board.</p>
          <p>If you have any questions, feel free to reach out to our support team.</p>
          <p>Best regards,<br>The KuduPay Team</p>
        </div>
        """
        return self.send_email(to=to, subject=subject, text=text, html=html)

    def send_magic_link_email(self, to: str, magic_token: str, link_url: Optional[str] = None) -> bool:
        # If link_url is not provided, build from FRONTEND_URL
        if link_url:
            verify_link = link_url
        else:
            base_url = os.environ.get("FRONTEND_URL", "http://localhost:5173/for-students/login")
            verify_link = f"{base_url.rstrip('/')}/verify-intent?token={magic_token}"

        subject = "Your Secure Login Link - KuduPay"
        text = (
            "Hi there!\n\n"
            "Someone (hopefully you!) requested to sign in to your KuduPay student account.\n\n"
            "Click the link below to securely sign in:\n"
            f"{verify_link}\n\n"
            "This secure link will expire in 15 minutes for your protection.\n\n"
            "If you didn't request this login link, you can safely ignore this email. Your account remains secure.\n\n"
            "Need help? Feel free to reach out to our student support team.\n\n"
            "Best regards,\nThe KuduPay Team"
        )
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; font-size: 24px;">🔐 Your Secure Login Link</h1>
          <p style="font-size: 16px; line-height: 1.5;">Hi there!</p>
          <p style="font-size: 16px; line-height: 1.5;">Someone (hopefully you!) requested to sign in to your KuduPay student account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="{verify_link}" style="background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-size: 16px; font-weight: bold;">
              Sign In Securely
            </a>
          </div>
          <p style="font-size: 14px; color: #666; text-align: center;">Or copy and paste this link into your browser:</p>
          <p style="font-size: 12px; color: #666; word-break: break-all; text-align: center; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">{verify_link}</p>
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #856404;"><strong>⏰ Important:</strong> This secure link will expire in 15 minutes for your protection.</p>
          </div>
          <p style="font-size: 14px; line-height: 1.5; color: #666;">If you didn't request this login link, you can safely ignore this email. Your account remains secure.</p>
          <p style="font-size: 14px; line-height: 1.5;">Need help? Feel free to reach out to our student support team.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 14px; color: #666;">Best regards,<br><strong>The KuduPay Team</strong></p>
        </div>
        """
        return self.send_email(to=to, subject=subject, text=text, html=html)
