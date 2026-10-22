import { FastifyReply } from 'fastify';

/** Tipi accettati per la foto profilo (mostrata in <img>). */
export const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

/** Tipi che il browser può mostrare senza eseguire codice: tutto il resto si scarica come allegato. */
const INLINE_SAFE_TYPES = new Set([...PROFILE_IMAGE_TYPES, 'application/pdf']);

/** Tipi con contenuto attivo (script) che non si caricano come documenti. */
const ACTIVE_CONTENT = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript|application\/x-javascript)$/i;
const ACTIVE_EXTENSIONS = /\.(html?|xhtml|svgz?|xml|js|mjs)$/i;

export function isActiveContent(mimeType: string, filename: string): boolean {
  return ACTIVE_CONTENT.test(String(mimeType ?? '').trim()) || ACTIVE_EXTENSIONS.test(String(filename ?? '').trim());
}

/**
 * Header per servire un file caricato dagli utenti dall'origine dell'app: i tipi non sicuri diventano allegati
 * generici (niente HTML/SVG interpretati dal browser) e la CSP sandbox blocca comunque qualsiasi script.
 */
export function setFileHeaders(res: FastifyReply, mimeType: string, originalName: string, disposition: 'inline' | 'attachment') {
  const type = String(mimeType ?? '').toLowerCase();
  const safe = INLINE_SAFE_TYPES.has(type);
  res.header('Content-Type', safe ? type : 'application/octet-stream');
  res.header(
    'Content-Disposition',
    `${safe ? disposition : 'attachment'}; filename*=UTF-8''${encodeURIComponent(originalName || 'file')}`,
  );
  res.header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.header('X-Content-Type-Options', 'nosniff');
}
