"""
Napel LMS — e-mail transacional via Napel Mailer (mailer.napel.com.br).
Nunca improvisar SMTP/SendGrid/Resend aqui — a regra da Napel é usar sempre o Mailer central.

Onda 6 — item 6.2 (link de reset de senha). Mais templates chegam no item 6.3.
"""
import json
import os
import threading
import urllib.request
import urllib.error

MAILER_URL = "https://mailer.napel.com.br/send"
MAILER_TOKEN = os.getenv("MAILER_TOKEN", "")
DEFAULT_SENDER = "contato@napel.com.br"

# Enquanto o Renato não liberar envio pra alunos reais, todo e-mail é redirecionado
# pro inbox de teste — LMS_EMAIL_TEST_MODE=false no Coolify libera o envio de verdade.
TEST_MODE = os.getenv("LMS_EMAIL_TEST_MODE", "true").lower() == "true"
TEST_MODE_RECIPIENT = "renatonapel@gmail.com"

PORTAL_URL = "https://lms.demos.napel.com.br"
API_URL = "https://api.lms.demos.napel.com.br"  # frontend e backend ficam em subdomínios separados (ver frontend/api.js API_BASE)


def send_email(to: str, subject: str, html: str, sender: str = DEFAULT_SENDER) -> bool:
    """Envia via Napel Mailer (urllib stdlib — sem dependência nova).
    OPUS_REVIEW: best-effort — qualquer falha (mailer fora do ar, token ausente, timeout)
    é engolida e só logada em stdout, pra nunca quebrar o fluxo principal (ex: pedido de
    reset de senha) por causa de um e-mail que não é essencial à operação."""
    if not MAILER_TOKEN:
        print(f"[emails] MAILER_TOKEN ausente — e-mail '{subject}' NÃO enviado")
        return False
    # OPUS_REVIEW: override de destinatário em modo teste — evita mandar e-mail real
    # pra aluno de demo enquanto o Renato não confirmar o piloto.
    dest = TEST_MODE_RECIPIENT if TEST_MODE else to
    if TEST_MODE and dest != to:
        subject = f"[TESTE — para {to}] {subject}"
    payload = json.dumps({
        "to": dest, "subject": subject, "html": html, "sender": sender,
    }).encode("utf-8")
    req = urllib.request.Request(
        MAILER_URL, data=payload, method="POST",
        headers={"Content-Type": "application/json", "X-Mailer-Token": MAILER_TOKEN},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            ok = 200 <= resp.status < 300
            if not ok:
                print(f"[emails] Mailer respondeu {resp.status} para '{subject}'")
            return ok
    except Exception as e:
        print(f"[emails] falha ao enviar '{subject}' para {dest}: {e}")
        return False


def send_email_async(to: str, subject: str, html: str, sender: str = DEFAULT_SENDER) -> None:
    """Dispara o envio numa thread separada — não bloqueia a request HTTP que chamou.
    OPUS_REVIEW: thread solta (daemon=True), sem fila/retry — se o processo morrer no meio,
    o envio se perde silenciosamente. Aceitável pra uma demo; numa escala maior valeria
    um job de fila de verdade (ex: tabela outbox + worker)."""
    t = threading.Thread(target=send_email, args=(to, subject, html, sender), daemon=True)
    t.start()


# ============ TEMPLATES ============
def _base_wrapper(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#F0F7FA;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F7FA;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <tr><td style="background:#113C58;padding:22px 28px;">
          <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.06em;">NAPEL <span style="color:#7DA4C6;font-size:12px;">LMS</span></span>
        </td></tr>
        <tr><td style="padding:28px;">
          {body_html}
        </td></tr>
        <tr><td style="background:#F0F7FA;padding:16px 28px;text-align:center;">
          <span style="font-size:11px;color:#94A3B8;">Napel LMS · equipe Napel</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _btn(href: str, label: str) -> str:
    return (f'<a href="{href}" style="display:inline-block;background:#113C58;color:#ffffff;'
            f'text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:6px;">{label}</a>')


def reset_password_email(name: str, link: str) -> tuple[str, str]:
    subject = "Napel LMS · Redefinição de senha"
    body = f"""
      <h2 style="color:#113C58;font-size:18px;margin:0 0 12px;">Olá, {name}</h2>
      <p style="color:#334155;font-size:14px;line-height:1.6;">
        Recebemos um pedido pra redefinir sua senha no Napel LMS. Clique no botão abaixo pra escolher uma nova senha.
        Este link expira em <b>30 minutos</b>.
      </p>
      <p style="margin:24px 0;">{_btn(link, "Redefinir minha senha")}</p>
      <p style="color:#94A3B8;font-size:12px;">Se você não pediu isso, ignore este e-mail — sua senha continua a mesma.</p>
    """
    return subject, _base_wrapper(subject, body)
