import { UAParser } from 'ua-parser-js';

/**
 * Client Information Parser (IP, User-Agent, Device Label)
 * 
 * WHY: For audit compliance and security forensics, every document interaction must
 * record the real IP and a human-readable device label (e.g. "Windows • Chrome 128").
 * This allows owners to visually detect link forwarding or suspicious access locations.
 */
export function getClientInfo(req) {
  // Extract client IP, respecting proxy headers if behind a reverse proxy/CDN
  let ip = req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';

  // Normalize IPv6 localhost notations
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    ip = '127.0.0.1';
  }

  const userAgent = req.headers['user-agent'] || 'Unknown User-Agent';

  // Parse User Agent into a human-readable label
  let deviceLabel = 'Unknown Device';
  try {
    const parser = new UAParser(userAgent);
    const os = parser.getOS();
    const browser = parser.getBrowser();
    const device = parser.getDevice();

    const osName = os.name ? `${os.name}${os.version ? ' ' + os.version.split('.')[0] : ''}` : '';
    const browserName = browser.name ? `${browser.name}${browser.version ? ' ' + browser.version.split('.')[0] : ''}` : '';

    if (osName && browserName) {
      deviceLabel = `${osName} • ${browserName}`;
    } else if (browserName) {
      deviceLabel = browserName;
    } else if (device.model) {
      deviceLabel = `${device.vendor || ''} ${device.model}`.trim();
    } else {
      deviceLabel = userAgent.slice(0, 32);
    }
  } catch (err) {
    deviceLabel = 'Web Client';
  }

  return {
    ip,
    userAgent,
    deviceLabel,
  };
}
