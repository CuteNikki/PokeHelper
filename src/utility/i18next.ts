import { use } from 'i18next';
import i18NextFsBackend from 'i18next-fs-backend';
import { logger } from 'utility/logger';

const supportLanguages = ['en'];
const nameSpaces = ['messages'];

export async function initI18Next() {
  await use(i18NextFsBackend).init({
    debug: process.argv.includes('--debug'),
    ns: nameSpaces,
    defaultNS: nameSpaces[0],
    preload: supportLanguages,
    fallbackLng: supportLanguages[0],
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: 'src/locales/{{lng}}/{{ns}}.json',
    },
    missingInterpolationHandler: (text, value) => {
      logger.error(`Missing interpolation for key: ${text}, value: ${value}`);
      return text;
    },
  });
}
