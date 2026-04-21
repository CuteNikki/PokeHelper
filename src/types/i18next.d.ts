import 'i18next';
import en from 'locales/en/messages.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    // This allows you to reference 'en' as the default structure
    resources: {
      translation: typeof en;
    };
  }
}
