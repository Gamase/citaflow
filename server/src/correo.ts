// Envío de correos. Dos modos, según el entorno:
// - Con RESEND_API_KEY: por la API HTTP de Resend con fetch nativo (Render free bloquea SMTP
//   de salida; sin SDK ni nodemailer). El token y el enlace NUNCA se escriben en los logs.
// - Sin RESEND_API_KEY (DEV): el correo, con su enlace, se imprime en la consola del server.
//
// Nunca lanza: si el envío falla lo registra y regresa false. Quien manda un correo (registro,
// "olvidé", reenviar) no debe tronar por eso.

const RESEND_URL = "https://api.resend.com/emails";

export interface Correo {
  para: string;
  asunto: string;
  // Texto del correo en párrafos (sin HTML; se escapa).
  parrafos: string[];
  boton: { texto: string; url: string };
  pie: string;
}

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// HTML simple con los colores de CitaFlow (ink #0E2A3B, teal #0B7A6E). El "logo" va como texto:
// Gmail y Outlook bloquean SVG.
function html(c: Correo): string {
  const parrafos = c.parrafos
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#0E2A3B">${escapar(p)}</p>`)
    .join("");
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#F6F7F9;font-family:Inter,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0E2A3B;padding:20px 28px;font-size:20px;font-weight:700;color:#ffffff">Cita<span style="color:#12A594">Flow</span></td></tr>
<tr><td style="padding:28px">
${parrafos}
<p style="margin:24px 0"><a href="${escapar(c.boton.url)}" style="display:inline-block;background:#0B7A6E;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escapar(c.boton.texto)}</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5B6B77">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all">${escapar(c.boton.url)}</span></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#5B6B77">${escapar(c.pie)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function texto(c: Correo): string {
  return [...c.parrafos, "", `${c.boton.texto}: ${c.boton.url}`, "", c.pie, "", "— CitaFlow"].join("\n");
}

export async function enviarCorreo(c: Correo): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(
      `\n──── Correo (modo consola: sin RESEND_API_KEY) ────\nPara: ${c.para}\nAsunto: ${c.asunto}\n\n${texto(c)}\n────────────────────────────────────────────────\n`,
    );
    return true;
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.CORREO_REMITENTE,
        to: [c.para],
        subject: c.asunto,
        html: html(c),
        text: texto(c),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Solo el estado y la respuesta de Resend (que no incluye el cuerpo del correo).
      console.error(`Resend respondió ${res.status} al mandar "${c.asunto}": ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`No se pudo mandar "${c.asunto}" por Resend:`, err instanceof Error ? err.message : err);
    return false;
  }
}
