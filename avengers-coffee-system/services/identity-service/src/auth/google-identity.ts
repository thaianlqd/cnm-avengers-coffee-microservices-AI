import { OAuth2Client } from 'google-auth-library';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

const googleClient = new OAuth2Client({ transporterOptions: { timeout: 8000 } });
export function allowedGoogleClients(env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set([env.GOOGLE_ALLOWED_CLIENT_IDS, env.GOOGLE_CLIENT_ID, env.WEB_CUSTOMER_GOOGLE_CLIENT_ID]
    .filter(Boolean).flatMap(value => String(value).split(/[\s,;]+/)).filter(Boolean))];
}

export async function verifiedGoogleIdentity(token: string, accessToken: boolean, audiences = allowedGoogleClients(), client = googleClient, request = fetch) {
  if (!audiences.length) throw new ServiceUnavailableException('Đăng nhập Google chưa được cấu hình. Vui lòng dùng email.');
  try {
    let profile: { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
    if (accessToken) {
      const info = await client.getTokenInfo(token);
      if (!info.aud || !audiences.includes(info.aud) || info.expiry_date <= Date.now()) throw new Error('Invalid audience/expiry');
      const response = await request('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Invalid Google token');
      profile = await response.json();
      if (info.sub && profile.sub !== info.sub) throw new Error('Identity mismatch');
    } else {
      const ticket = await client.verifyIdToken({ idToken: token, audience: audiences });
      profile = ticket.getPayload() || {};
    }
    if (!profile.sub || !profile.email || profile.email_verified !== true) throw new Error('Unverified email');
    return { ...profile, email: profile.email.trim().toLowerCase() };
  } catch {
    throw new UnauthorizedException('Không thể xác thực tài khoản Google. Vui lòng thử lại.');
  }
}
