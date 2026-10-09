// Pure, dependency-free helpers shared by the Worker and the self-check test.

// 1x1 transparent GIF89a (43 bytes). The pixel every tracked mail loads.
export const TRANSPARENT_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

// Opens within this window of send are almost certainly an automatic prefetch
// (Apple Mail Privacy Protection, corporate link/mail scanners), not a human.
export const PROXY_WINDOW_MS = 15_000;

// Opens within this window of a "sender viewed their own sent mail" mark are
// the sender, not the recipient.
export const SELF_WINDOW_MS = 120_000;

export function isProxyOpen(sentAt: number, openedAt: number): boolean {
  return openedAt - sentAt < PROXY_WINDOW_MS;
}

export function isSelfOpen(openedAt: number, selfMarks: number[]): boolean {
  return selfMarks.some((m) => Math.abs(openedAt - m) < SELF_WINDOW_MS);
}

export interface Mail {
  id: string;
  subject: string;
  recipient: string;
  sent_at: number;
}
export interface Open {
  id: string;
  opened_at: number;
  is_proxy: number;
  is_self: number;
}

export interface Row {
  id: string;
  subject: string;
  recipient: string;
  sent_at: number;
  opened: boolean;
  open_count: number; // real opens only (excludes self + proxy)
  first_open: number | null;
  last_open: number | null;
  auto_count: number; // suspected automatic prefetches
}

// Build dashboard rows from mails + their opens. Self opens are dropped
// entirely; proxy opens are counted separately as "auto" and never mark a
// mail as genuinely opened.
export function summarize(mails: Mail[], opens: Open[]): Row[] {
  const byId = new Map<string, Open[]>();
  for (const o of opens) {
    if (o.is_self) continue;
    (byId.get(o.id) ?? byId.set(o.id, []).get(o.id)!).push(o);
  }
  return mails
    .map((m) => {
      const list = byId.get(m.id) ?? [];
      const real = list.filter((o) => !o.is_proxy).map((o) => o.opened_at);
      const auto = list.filter((o) => o.is_proxy).length;
      return {
        id: m.id,
        subject: m.subject,
        recipient: m.recipient,
        sent_at: m.sent_at,
        opened: real.length > 0,
        open_count: real.length,
        first_open: real.length ? Math.min(...real) : null,
        last_open: real.length ? Math.max(...real) : null,
        auto_count: auto,
      };
    })
    .sort((a, b) => b.sent_at - a.sent_at);
}
