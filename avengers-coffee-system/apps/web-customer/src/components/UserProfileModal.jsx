import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { XMarkIcon, UserCircleIcon, KeyIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';

export default function UserProfileModal({ isOpen, onClose, user, onUserUpdated }) {

  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileForm, setProfileForm] = useState({ hoTen: '', soDienThoai: '', avatarUrl: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const userId = useMemo(() => user?.ma_nguoi_dung || user?.maNguoiDung || null, [user]);

  const {
    data: profile,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.userProfile(userId),
    queryFn: async () => {
      const response = await apiClient.get(`/users/${userId}/profile`);
      return response.data;
    },
    enabled: Boolean(isOpen && userId),
    staleTime: 30 * 1000,
    refetchInterval: 120 * 1000,
  });

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('profile');
      setProfileError('');
      setPasswordError('');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      return;
    }

    if (profile) {
      setProfileForm({
        hoTen: profile.ho_ten || '',
        soDienThoai: profile.so_dien_thoai || '',
        avatarUrl: profile.avatar_url || '',
      });
    }
  }, [isOpen, profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await apiClient.patch(`/users/${userId}/profile`, payload);
      return response.data;
    },
    onSuccess: (data) => {
      setProfileError('');
      const updatedUser = {
        ...user,
        ho_ten: data?.user?.ho_ten,
        hoTen: data?.user?.ho_ten,
        email: data?.user?.email,
      };

      onUserUpdated?.(updatedUser);
      queryClient.invalidateQueries({ queryKey: queryKeys.userProfile(userId) });
      alert('Cập nhật thông tin thành công!');
    },
    onError: (err) => {
      setProfileError(err?.response?.data?.message || 'Không thể cập nhật thông tin.');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await apiClient.post(`/users/${userId}/change-password`, payload);
      return response.data;
    },
    onSuccess: () => {
      setPasswordError('');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      alert('Đổi mật khẩu thành công!');
    },
    onError: (err) => {
      setPasswordError(err?.response?.data?.message || 'Không thể đổi mật khẩu.');
    },
  });

  if (!isOpen) return null;

  const handleUpdateProfile = (e) => {
    e.preventDefault();
    setProfileError('');

    updateProfileMutation.mutate({
      hoTen: profileForm.hoTen,
      soDienThoai: profileForm.soDienThoai,
      avatarUrl: profileForm.avatarUrl,
    });
  };

  const handleChangePassword = (e) => {
    e.preventDefault();
    setPasswordError('');

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Xác nhận mật khẩu không khớp.');
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative z-10 h-[88vh] w-full max-w-3xl overflow-hidden rounded-[28px] border border-orange-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-orange-50 bg-gradient-to-r from-orange-50 to-amber-50 px-6 py-5">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-gray-800">Trang cá nhân</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">Quản lý thông tin và bảo mật tài khoản của bạn</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-500 hover:bg-white">
            <XMarkIcon className="h-7 w-7" />
          </button>
        </div>

        {!userId ? (
          <div className="p-8 text-center text-lg font-bold text-gray-700">Bạn cần đăng nhập để xem trang cá nhân.</div>
        ) : (
          <div className="h-[calc(88vh-86px)] overflow-y-auto bg-[#fffdf9] p-6">
            <div className="mb-6 flex gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide ${
                  activeTab === 'profile' ? 'bg-tch-orange text-white' : 'bg-white text-gray-500 border border-gray-200'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <UserCircleIcon className="h-5 w-5" />
                  Hồ sơ
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('password')}
                className={`rounded-xl px-4 py-2 text-sm font-black uppercase tracking-wide ${
                  activeTab === 'password' ? 'bg-tch-orange text-white' : 'bg-white text-gray-500 border border-gray-200'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <KeyIcon className="h-5 w-5" />
                  Đổi mật khẩu
                </span>
              </button>
            </div>

            {activeTab === 'profile' ? (
              <div className="rounded-2xl border border-orange-100 bg-white p-5">
                {isLoading ? (
                  <div className="space-y-3">
                    <div className="h-12 animate-pulse rounded-xl bg-orange-100/70"></div>
                    <div className="h-12 animate-pulse rounded-xl bg-orange-100/70"></div>
                    <div className="h-12 animate-pulse rounded-xl bg-orange-100/70"></div>
                  </div>
                ) : isError ? (
                  <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
                    {error?.response?.data?.message || 'Không thể tải thông tin cá nhân.'}
                  </div>
                ) : (
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Họ tên</p>
                      <input
                        type="text"
                        required
                        value={profileForm.hoTen}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, hoTen: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Email</p>
                      <input
                        type="text"
                        disabled
                        value={profile?.email || ''}
                        className="w-full rounded-xl border border-gray-100 bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-500"
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Số điện thoại</p>
                      <input
                        type="text"
                        value={profileForm.soDienThoai}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, soDienThoai: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                        placeholder="Nhập số điện thoại"
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Avatar URL</p>
                      <input
                        type="text"
                        value={profileForm.avatarUrl}
                        onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                        placeholder="https://..."
                      />
                    </div>

                    {profileError ? <p className="text-sm font-semibold text-red-600">{profileError}</p> : null}

                    <button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                      className="rounded-xl bg-tch-orange px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-orange-200 disabled:bg-gray-300"
                    >
                      {updateProfileMutation.isPending ? 'Đang cập nhật...' : 'Lưu thay đổi'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-orange-100 bg-white p-5">
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Mật khẩu hiện tại</p>
                    <input
                      type="password"
                      required
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Mật khẩu mới</p>
                    <input
                      type="password"
                      required
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Xác nhận mật khẩu mới</p>
                    <input
                      type="password"
                      required
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                    />
                  </div>

                  {passwordError ? <p className="text-sm font-semibold text-red-600">{passwordError}</p> : null}

                  <button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    className="rounded-xl bg-tch-orange px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-orange-200 disabled:bg-gray-300"
                  >
                    {changePasswordMutation.isPending ? 'Đang xử lý...' : 'Đổi mật khẩu'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
