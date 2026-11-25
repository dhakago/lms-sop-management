import 'server-only';
import { randomInt } from 'node:crypto';

// Tanpa karakter yang mudah tertukar (0/O, 1/l/I) karena kata sandi sementara sering dibacakan atau diketik ulang.
const LETTERS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

// 10 karakter, selalu memuat huruf dan angka sehingga lolos passwordProblem().
export function tempPassword(): string {
  const pick = (s: string) => s[randomInt(s.length)]!;
  const chars = [pick(DIGITS), pick(DIGITS), pick(LETTERS), pick(LETTERS)];
  while (chars.length < 10) chars.push(pick(LETTERS + DIGITS));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
