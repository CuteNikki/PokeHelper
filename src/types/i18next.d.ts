import 'i18next';
import en from 'locales/en/messages.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    // The English texts are the shape every language follows, so keys are checked
    resources: {
      translation: typeof en;
    };
  }
}
