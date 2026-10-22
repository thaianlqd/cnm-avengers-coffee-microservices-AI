import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CameraIcon, XMarkIcon } from './icons';
import { apiClient } from '../../lib/apiClient';
import { prepareAvatar, validateAvatarFile } from '../../lib/avatarUpload';
import { uiText as ui } from '../../lib/uiText';

export default function AvatarUpload({ userId, value, name, onSaved }) {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const requestRef = useRef(false);
  const titleId = useId();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const close = () => {
    if (requestRef.current) return;
    dialogRef.current?.close();
    setFile(null);
    setPreview('');
    setError('');
  };
  const choose = event => {
    const next = event.target.files?.[0];
    event.target.value = '';
    if (!next) return;
    const issue = validateAvatarFile(next);
    setError(issue);
    if (!issue) {
      setFile(next);
      dialogRef.current?.showModal();
    }
  };
  const save = async () => {
    if (!file || requestRef.current) return;
    requestRef.current = true;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('avatar', await prepareAvatar(file));
      const { data } = await apiClient.post(`/users/${userId}/avatar`, body);
      onSaved(data.user);
      requestRef.current = false;
      close();
    } catch (err) {
      setError(err?.response?.data?.message || t('profile.avatarFailed'));
    } finally {
      requestRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-5">
        <button type="button" aria-label={t('profile.changeAvatar')} onClick={() => inputRef.current?.click()}
          className="relative h-24 w-24 shrink-0 rounded-full border border-stone-300 bg-stone-100">
          {value ? <img src={value} alt={t('profile.avatar')} className="h-full w-full rounded-full object-cover" />
            : <span className="text-3xl text-stone-700">{(name || 'A').slice(0, 1)}</span>}
          <span className="absolute bottom-0 right-0 rounded-full bg-[#b22830] p-2 text-white"><CameraIcon className="h-4 w-4" /></span>
        </button>
        <div>
          <button type="button" onClick={() => inputRef.current?.click()} className="text-sm font-medium text-[#b22830] underline underline-offset-4">{t('profile.changeAvatar')}</button>
          <p className="mt-2 text-xs text-stone-500">{t('profile.avatarHint')}</p>
        </div>
      </div>
      <input ref={inputRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={choose} />
      {error && !file && <p role="alert" className="text-sm text-red-700">{ui(error)}</p>}
      <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}
        className="fixed inset-0 m-auto w-[min(92vw,400px)] rounded-2xl border border-stone-200 bg-white p-6 shadow-xl backdrop:bg-black/50">
        <div className="flex items-center justify-between gap-4">
          <h3 id={titleId} className="text-lg font-medium">{t('profile.changeAvatar')}</h3>
          <button type="button" onClick={close} disabled={busy} aria-label={t('common.close')}><XMarkIcon className="h-5 w-5" /></button>
        </div>
        {preview && <img src={preview} alt={t('profile.previewAvatar')} className="mx-auto my-6 h-48 w-48 rounded-full object-cover" />}
        {error && <p role="alert" className="mb-4 text-sm text-red-700">{ui(error)}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={close} disabled={busy} className="rounded-lg border px-4 py-2">{t('common.cancel')}</button>
          <button type="button" onClick={save} disabled={busy || !file} className="rounded-lg bg-[#b22830] px-4 py-2 text-white disabled:opacity-50">{t(busy ? 'common.saving' : 'common.save')}</button>
        </div>
      </dialog>
    </div>
  );
}
