import smtplib
import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from app.config import settings


def _send_sync(to_addrs: list[str], subject: str, body_html: str, attachment_bytes: bytes | None = None, attachment_name: str = "report.pdf"):
    if not settings.smtp_host:
        raise RuntimeError("SMTP not configured")

    msg = MIMEMultipart("mixed")
    msg["From"] = settings.smtp_from
    msg["To"] = ", ".join(to_addrs)
    msg["Subject"] = subject
    msg.attach(MIMEText(body_html, "html"))

    if attachment_bytes:
        part = MIMEBase("application", "pdf")
        part.set_payload(attachment_bytes)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{attachment_name}"')
        msg.attach(part)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.ehlo()
        if settings.smtp_port == 587:
            server.starttls()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_from, to_addrs, msg.as_string())


async def send_email(to_addrs: list[str], subject: str, body_html: str, attachment_bytes: bytes | None = None, attachment_name: str = "report.pdf"):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_sync, to_addrs, subject, body_html, attachment_bytes, attachment_name)
