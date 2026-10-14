jest.mock('../../auth/google-identity', () => ({ verifiedGoogleIdentity: jest.fn() }));
import { UserService } from './user.service';
import { verifiedGoogleIdentity } from '../../auth/google-identity';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

const profile = { email:'fixture@example.invalid', sub:'fixture-sub', email_verified:true, name:'Fixture' };
function serviceFor(user: any) {
  const service = Object.create(UserService.prototype) as any;
  service.userRepo = { findOne:jest.fn(async () => user), create:jest.fn(value => value), save:jest.fn(async value => value) };
  service.kiemTraVaSinhVoucherSinhNhatChoUser = jest.fn(async () => false);
  service.taoAccessToken = jest.fn(async () => 'fixture-token');
  return service;
}
describe('customer authentication integration', () => {
  beforeEach(() => { jest.clearAllMocks(); (verifiedGoogleIdentity as jest.Mock).mockResolvedValue(profile); });
  it('Google can create a customer then returns the same session shape as login', async () => {
    const service = serviceFor(null);
    const result = await service.loginWithGoogle({ googleToken:'provider-token', isAccessToken:true });
    expect(result.accessToken).toBe('fixture-token'); expect(result.user.vaiTro).toBe('CUSTOMER');
    expect(service.userRepo.create).toHaveBeenCalledWith(expect.objectContaining({ email:profile.email, vai_tro:'CUSTOMER', trang_thai:'ACTIVE' }));
  });
  it('Google never reactivates a disabled account or signs its session', async () => {
    const service = serviceFor({ email:profile.email, trang_thai:'INACTIVE' });
    await expect(service.loginWithGoogle({ googleToken:'provider-token', isAccessToken:true })).rejects.toThrow('vô hiệu hóa');
    expect(service.userRepo.save).not.toHaveBeenCalled(); expect(service.taoAccessToken).not.toHaveBeenCalled();
  });
  it('provider failure does not create an account', async () => {
    (verifiedGoogleIdentity as jest.Mock).mockRejectedValueOnce(new Error('provider rejected'));
    const service = serviceFor(null);
    await expect(service.loginWithGoogle({ googleToken:'invalid' })).rejects.toThrow();
    expect(service.userRepo.findOne).not.toHaveBeenCalled(); expect(service.userRepo.save).not.toHaveBeenCalled();
  });
  it('OTP reset preserves password spaces and consumes the challenge', async () => {
    const user = { email:profile.email, reset_password_code_hash:createHash('sha256').update('123456').digest('hex'), reset_password_code_expires_at:new Date(Date.now()+60000), reset_password_attempts:0 };
    const service = serviceFor(user);
    await service.resetPasswordByOtp({ email:profile.email, otp:'123456', newPassword:' new password ' });
    expect(await bcrypt.compare(' new password ', user['mat_khau_hash'])).toBe(true);
    expect(user.reset_password_code_hash).toBeNull();
    await expect(service.resetPasswordByOtp({ email:profile.email, otp:'123456', newPassword:'another password' })).rejects.toThrow('không hợp lệ');
  });
  it('failed OTP email delivery reports failure and never logs the OTP', async () => {
    const service = serviceFor({}); service.mailSender = { sendMail:jest.fn().mockRejectedValue(new Error('smtp')) };
    const warning=jest.spyOn(console,'warn').mockImplementation(() => {});
    try {
      await expect(service.guiMailDatLaiMatKhau(profile.email,'Fixture','123456')).rejects.toThrow('Chưa gửi được email');
      expect(warning.mock.calls.flat().join(' ')).not.toContain('123456');
    } finally { warning.mockRestore(); }
  });
  it('expired OTP is rejected and its saved challenge cleared', async () => {
    const user = { email:profile.email, reset_password_code_hash:createHash('sha256').update('123456').digest('hex'), reset_password_code_expires_at:new Date(Date.now()-60000), reset_password_attempts:0 };
    const service = serviceFor(user);
    await expect(service.resetPasswordByOtp({ email:profile.email, otp:'123456', newPassword:'new password' })).rejects.toThrow('đã hết hạn');
    expect(user.reset_password_code_hash).toBeNull();
    expect(user['mat_khau_hash']).toBeUndefined();
  });
  it('fifth wrong OTP invalidates the challenge and cannot change the password', async () => {
    const user = { email:profile.email, reset_password_code_hash:createHash('sha256').update('123456').digest('hex'), reset_password_code_expires_at:new Date(Date.now()+60000), reset_password_attempts:4 };
    const service = serviceFor(user);
    await expect(service.resetPasswordByOtp({ email:profile.email, otp:'654321', newPassword:'new password' })).rejects.toThrow('không chính xác');
    expect(user.reset_password_attempts).toBe(5);
    expect(user.reset_password_code_hash).toBeNull();
    await expect(service.resetPasswordByOtp({ email:profile.email, otp:'123456', newPassword:'new password' })).rejects.toThrow('không hợp lệ');
    expect(user['mat_khau_hash']).toBeUndefined();
  });
});
