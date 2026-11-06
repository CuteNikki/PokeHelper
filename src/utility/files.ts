import { globby } from 'globby';

/** Every .ts and .js file in a folder and the folders in it, as absolute paths. */
export const getFilesFrom = (relativePath: string) => globby([`${relativePath}/**/*{.ts,.js}`], { absolute: true });
