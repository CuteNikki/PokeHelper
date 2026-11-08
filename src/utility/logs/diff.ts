/** Most words compared, so a huge edit can't make the comparison slow. Past it, the whole text counts as changed. */
const MAX_WORDS = 600;

/** A text split into words and the spaces between them, so they're put back together exactly. */
const split = (text: string) => text.split(/(\s+)/).filter((part) => part !== '');

/**
 * Mark what changed between two versions of a text, word by word, like Dyno does: what was taken out is crossed out in the old text,
 * and what was added is underlined in the new one. Words next to each other that changed are marked together.
 */
export function markChanges(before: string, after: string): { before: string; after: string } {
  const old = split(before);
  const current = split(after);
  if (old.length > MAX_WORDS || current.length > MAX_WORDS) return { before: `~~${before}~~`, after: `__${after}__` };

  // The longest run of words both have in the same order, the usual way to compare texts
  const lengths = Array.from({ length: old.length + 1 }, () => new Array<number>(current.length + 1).fill(0));
  for (let i = old.length - 1; i >= 0; i--) {
    for (let j = current.length - 1; j >= 0; j--) {
      lengths[i]![j] = old[i] === current[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  const kept = { before: new Array<boolean>(old.length).fill(false), after: new Array<boolean>(current.length).fill(false) };
  for (let i = 0, j = 0; i < old.length && j < current.length;) {
    if (old[i] === current[j]) {
      kept.before[i++] = true;
      kept.after[j++] = true;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) i++;
    else j++;
  }

  return { before: mark(old, kept.before, '~~'), after: mark(current, kept.after, '__') };
}

/** Put the words back together, wrapping each run of changed words in the marker. Spaces around a run stay outside it. */
function mark(parts: string[], kept: boolean[], marker: string): string {
  let result = '';
  let run = '';
  const flush = () => {
    if (!run) return;
    const text = run.trim();
    // Markdown only marks text that doesn't start or end with a space, so those stay outside
    result += text ? run.replace(text, `${marker}${text}${marker}`) : run;
    run = '';
  };
  parts.forEach((part, index) => {
    // Spaces between two changed words belong to the run, so they're marked as one. A line break ends it, as Discord doesn't mark
    // across lines, and a mark over two lines would show its markers instead
    const lineBreak = part.includes('\n');
    const changed = !lineBreak && (!kept[index] || (/^\s+$/.test(part) && run !== '' && kept[index + 1] === false));
    if (changed) run += part;
    else {
      flush();
      result += part;
    }
  });
  flush();
  return result;
}
