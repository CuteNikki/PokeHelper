import { GlobalFonts } from '@napi-rs/canvas';
import { join } from 'path';

export function loadFonts(): void {
  GlobalFonts.registerFromPath(join(process.cwd(), 'fonts', 'NotoColorEmoji.ttf'), 'EmojiFallback');
  GlobalFonts.registerFromPath(join(process.cwd(), 'fonts', 'Roboto-Regular.ttf'), 'Roboto');
}
