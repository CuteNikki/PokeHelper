import { globby } from 'globby';

/**
 * Get all .ts and .js files from a given relative path.
 * @param relativePath - The relative path to search for files.
 * @returns A promise that resolves to an array of absolute file paths.
 */
export const getFilesFrom = (relativePath: string) => globby([`${relativePath}/**/*{.ts,.js}`], { absolute: true });
