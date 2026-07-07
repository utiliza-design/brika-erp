interface InvitationEmailParams {
  toEmail: string;
  invitedByName: string;
  appUrl: string;
}

interface CobranzaEmailParams {
  clienteNombre: string;
  nDocumento: string;
  montoDocumento: number;
  fechaEmision: string;
  numeroAviso: number;
  cuerpoEditable: string;
}

export interface EmailResult {
  sent: boolean;
  error?: string;
}

function formatCLPSimple(n: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}

function buildCobranzaHtml(params: CobranzaEmailParams): string {
  const { clienteNombre, nDocumento, montoDocumento, fechaEmision, numeroAviso, cuerpoEditable } = params;
  const bodyParagraphs = cuerpoEditable
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p style="margin: 0 0 12px; color: #374151; line-height: 1.6;">${line}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#4a7c59;padding:28px 32px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">Brika</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Aviso de cobranza</p>
    </div>
    <div style="padding:32px;">
      ${bodyParagraphs}
      <div style="background:#f3f4f6;border-radius:6px;padding:20px;margin:20px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">N° Documento</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#111;text-align:right;">${nDocumento}</td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Fecha de emisión</td><td style="padding:4px 0;font-size:13px;color:#374151;text-align:right;">${fechaEmision}</td></tr>
          <tr style="border-top:1px solid #e5e7eb;"><td style="padding:12px 0 4px;font-size:14px;font-weight:600;color:#111;">Total a pagar</td><td style="padding:12px 0 4px;font-size:16px;font-weight:700;color:#4a7c59;text-align:right;">${formatCLPSimple(montoDocumento)}</td></tr>
        </table>
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Este es un mensaje automático enviado por el sistema de gestión Brika SpA.</p>
    </div>
  </div>
</body>
</html>`;
}

async function getRawResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const { Resend } = await import("resend");
  return new Resend(apiKey);
}

export async function sendEmail(
  template: "cobranza",
  params: CobranzaEmailParams,
  destinatarios: string[],
  asunto: string,
): Promise<EmailResult> {
  const resend = await getRawResend();
  if (!resend) return { sent: false, error: "RESEND_API_KEY no configurado" };

  const html = buildCobranzaHtml(params);
  try {
    const { error } = await resend.emails.send({
      from: "Brika <cobranzas@brikaorganics.cl>",
      to: destinatarios,
      subject: asunto,
      html,
    });
    if (error) { console.error("Resend error:", error); return { sent: false, error: error.message }; }
    return { sent: true };
  } catch (err: any) {
    console.error("Email send error:", err);
    return { sent: false, error: err.message };
  }
}

export async function sendInvitationEmail(params: InvitationEmailParams): Promise<EmailResult> {
  const resend = await getRawResend();
  if (!resend) return { sent: false, error: "RESEND_API_KEY not configured" };

  const { toEmail, invitedByName, appUrl } = params;
  try {
    const { error } = await resend.emails.send({
      from: "Brika <cobranzas@brikaorganics.cl>",
      to: [toEmail],
      subject: `${invitedByName} te ha invitado a Brika`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #111; margin-bottom: 8px;">Tienes una invitación a Brika</h2>
          <p style="color: #555; margin-bottom: 24px;">
            <strong>${invitedByName}</strong> te ha invitado a acceder a <strong>Brika</strong>,
            la plataforma de gestión financiera de la empresa.
          </p>
          <a href="${appUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px;">
            Acceder a Brika →
          </a>
          <p style="color: #999; font-size: 13px; margin-top: 24px;">
            Deberás iniciar sesión con tu cuenta de Google asociada a <strong>${toEmail}</strong>.
          </p>
        </div>
      `,
    });
    if (error) { console.error("Resend error:", error); return { sent: false, error: error.message }; }
    return { sent: true };
  } catch (err: any) {
    console.error("Email send error:", err);
    return { sent: false, error: err.message };
  }
}
