import { OAuth2Client } from 'google-auth-library';
import { allowedGoogleClients, verifiedGoogleIdentity } from './google-identity';

const audience = 'web.apps.googleusercontent.com';
function fixture() {
  const profile = { sub:'subject', email:'ME@Example.com', email_verified:true, name:'Me' };
  const client = { verifyIdToken:jest.fn().mockResolvedValue({ getPayload:() => profile }), getTokenInfo:jest.fn().mockResolvedValue({ aud:audience, sub:'subject', expiry_date:Date.now()+60000 }) };
  const request = jest.fn().mockResolvedValue({ ok:true, json:async () => profile });
  return { profile, client, request, run:(access = true) => verifiedGoogleIdentity('credential', access, [audience], client as unknown as OAuth2Client, request as unknown as typeof fetch) };
}
describe('Google identity boundary', () => {
  it('requires a configured audience', async () => {
    await expect(verifiedGoogleIdentity('token', true, [])).rejects.toThrow('chưa được cấu hình');
    expect(allowedGoogleClients({ GOOGLE_ALLOWED_CLIENT_IDS:'a,b;a', GOOGLE_CLIENT_ID:'c' })).toEqual(['a','b','c']);
  });
  it('asks the Google SDK to verify the signed ID token and audience', async () => {
    const f=fixture(); expect((await f.run(false)).email).toBe('me@example.com');
    expect(f.client.verifyIdToken).toHaveBeenCalledWith({ idToken:'credential', audience:[audience] });
    expect(f.request).not.toHaveBeenCalled();
    f.client.verifyIdToken.mockRejectedValueOnce(new Error('signature'));
    await expect(f.run(false)).rejects.toThrow('Không thể xác thực');
  });
  it('verifies access-token audience/expiry before reading userinfo', async () => {
    const f=fixture(); expect((await f.run()).email).toBe('me@example.com');
    f.client.getTokenInfo.mockResolvedValueOnce({ aud:'other', sub:'subject', expiry_date:Date.now()+60000 });
    await expect(f.run()).rejects.toThrow('Không thể xác thực');
    expect(f.request).toHaveBeenCalledTimes(1);
    f.client.getTokenInfo.mockResolvedValueOnce({ aud:audience, sub:'subject', expiry_date:Date.now()-1 });
    await expect(f.run()).rejects.toThrow('Không thể xác thực');
  });
  it('rejects unverified email and mismatched subjects', async () => {
    const f=fixture(); f.profile.email_verified=false; await expect(f.run()).rejects.toThrow('Không thể xác thực');
    f.profile.email_verified=true; f.profile.sub='other'; await expect(f.run()).rejects.toThrow('Không thể xác thực');
  });
});
