import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './locales/vi.json';
import en from './locales/en.json';

const resources = { vi: { translation: vi }, en: { translation: en } };

const normalizeLanguage = value => String(value || '').toLowerCase().startsWith('en') ? 'en' : 'vi';
let savedLanguage = 'vi';
try { savedLanguage = normalizeLanguage(localStorage.getItem('i18nextLng')); } catch { /* Storage may be disabled. */ }
i18n.use(initReactI18next).init({
  resources, lng: savedLanguage, supportedLngs: ['vi', 'en'], nonExplicitSupportedLngs: true,
  fallbackLng: 'vi', load: 'languageOnly', interpolation: { escapeValue: false }
});
const persistLanguage = lng => {
  const language = normalizeLanguage(lng);
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem('i18nextLng', language); } catch { /* Keep this session working. */ }
};
persistLanguage(savedLanguage);
i18n.on('languageChanged', persistLanguage);
export default i18n;
