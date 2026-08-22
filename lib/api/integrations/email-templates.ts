import { escapeHtml } from '../notify';

/**
 * Template HTML branded para e-mails transacionais (convite, etc). Table-based +
 * estilos INLINE (clients de e-mail ignoram <style>/CSS externo). Paleta Nimbloo
 * (#642878). Dark-safe o suficiente (fundo claro fixo — e-mail não segue tema do app).
 */
const BRAND = '#642878';

export interface EmailCta {
   /** Título grande (H1). */
   title: string;
   /** Parágrafo(s) de introdução — texto simples, será escapado. */
   intro: string;
   /** Rótulo do botão. */
   buttonLabel: string;
   /** URL do botão (também mostrada como fallback). */
   buttonUrl: string;
   /** Linha fina extra abaixo do CTA (opcional), escapada. */
   footnote?: string;
}

/** Monta um e-mail HTML com header de marca + CTA em botão + fallback de link. */
export function ctaEmailHtml({ title, intro, buttonLabel, buttonUrl, footnote }: EmailCta): string {
   const url = escapeHtml(buttonUrl);
   return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f4f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;border:1px solid #ececf1;overflow:hidden;">
      <tr><td style="padding:28px 32px 8px 32px;">
        <div style="display:inline-flex;align-items:center;gap:8px;">
          <span style="display:inline-block;width:22px;height:22px;border-radius:50%;border:2.5px solid ${BRAND};box-sizing:border-box;"></span>
          <span style="font-size:17px;font-weight:700;color:#15131a;letter-spacing:-0.01em;">Circle</span>
        </div>
      </td></tr>
      <tr><td style="padding:8px 32px 0 32px;">
        <h1 style="margin:8px 0 6px 0;font-size:20px;line-height:1.3;color:#15131a;font-weight:700;">${escapeHtml(title)}</h1>
        <p style="margin:0 0 22px 0;font-size:14px;line-height:1.6;color:#4a4754;">${escapeHtml(intro)}</p>
        <a href="${url}" style="display:inline-block;background:${BRAND};color:#ffffff;padding:12px 22px;border-radius:9px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(buttonLabel)}</a>
        ${footnote ? `<p style="margin:18px 0 0 0;font-size:13px;color:#6b6875;">${escapeHtml(footnote)}</p>` : ''}
        <p style="margin:22px 0 4px 0;font-size:12px;color:#9a97a5;">Se o botão não funcionar, cole este link no navegador:</p>
        <p style="margin:0 0 28px 0;font-size:12px;word-break:break-all;"><a href="${url}" style="color:${BRAND};">${url}</a></p>
      </td></tr>
    </table>
    <p style="margin:16px 0 0 0;font-size:11px;color:#a9a6b4;">Circle · by <span style="color:${BRAND};font-weight:600;">nimbloo</span></p>
  </td></tr>
</table>
</body></html>`;
}
