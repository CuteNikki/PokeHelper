/** Longest message that's evaluated as math, to keep evaluation cheap. */
const MAX_MATH_LENGTH = 200;
/** Largest number factorial is allowed on, above this the result is no longer exact. */
const MAX_FACTORIAL = 20;

/**
 * Read the number a counting message counts, or null. The number comes first, followed by whitespace or nothing, so `5` and `5 nice`
 * count as 5 while `5abc`, `5.9` and `05` don't. With math allowed it can be an expression like `2 * (3 - 1)`, `2^3` or `3!`,
 * as long as the result is a whole number.
 */
export function parseCount(content: string, allowMath: boolean): number | null {
  const text = content.trim();

  if (!allowMath) {
    const match = /^([1-9]\d*)(?:\s|$)/.exec(text);
    if (!match?.[1]) return null;
    const number = Number(match[1]);
    return Number.isSafeInteger(number) ? number : null;
  }

  if (text.length > MAX_MATH_LENGTH) return null;

  const parser = new ExpressionParser(text);
  const result = parser.parse();
  if (result === null) return null;

  // Whatever follows the expression must be separated from it, so `1+1abc` doesn't count
  const rest = text.slice(parser.end);
  if (rest.length > 0 && !/^\s/.test(rest)) return null;

  return toWholeNumber(result);
}

/** Round to a whole number if it's one within floating point error, like `0.1 * 30`. Null if it isn't a positive safe integer. */
function toWholeNumber(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) > 1e-9 * Math.max(1, Math.abs(value))) return null;
  return Number.isSafeInteger(rounded) && rounded > 0 ? rounded : null;
}

/**
 * A small recursive descent parser for arithmetic, so messages are never passed to `eval`.
 *
 * Grammar, loosest binding first:
 * - expression: term (('+' | '-') term)*
 * - term: unary (('*' | '/' | '×' | '÷' | '%') unary)*
 * - unary: ('-' | '+') unary | power
 * - power: postfix (('^' | '**') unary)?, right associative so `2^3^2` is `2^9`
 * - postfix: primary '!'*
 * - primary: number | '(' expression ')'
 *
 * When an operator isn't followed by a valid operand, the expression ends before it, so `5 - nice` reads as 5 followed by text.
 */
class ExpressionParser {
  private position = 0;
  /** The position right after the last character that belongs to the expression. */
  end = 0;

  constructor(private readonly text: string) {}

  parse(): number | null {
    return this.expression();
  }

  private skipWhitespace() {
    while (this.position < this.text.length && /\s/.test(this.text[this.position]!)) this.position++;
  }

  /** Consume one of the given operators if it's next, and return it. */
  private operator(...operators: string[]): string | null {
    const start = this.position;
    this.skipWhitespace();
    // Longest first, so `**` isn't read as `*`
    for (const op of [...operators].sort((a, b) => b.length - a.length)) {
      if (this.text.startsWith(op, this.position)) {
        this.position += op.length;
        return op;
      }
    }
    this.position = start;
    return null;
  }

  /** Parse an operand after a binary operator, rewinding to before the operator if there's none. */
  private operand(operatorStart: number, parse: () => number | null): number | null {
    const value = parse();
    if (value === null) {
      this.position = operatorStart;
      this.end = operatorStart;
    }
    return value;
  }

  private expression(): number | null {
    let left = this.term();
    if (left === null) return null;

    while (true) {
      const start = this.position;
      const op = this.operator('+', '-');
      if (!op) break;
      const right = this.operand(start, () => this.term());
      if (right === null) break;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private term(): number | null {
    let left = this.unary();
    if (left === null) return null;

    while (true) {
      const start = this.position;
      // `**` is power, which binds tighter and is handled further down, so it must not be read as `*`
      if (this.operator('**')) {
        this.position = start;
        break;
      }
      const op = this.operator('*', '/', '×', '÷', '%');
      if (!op) break;
      const right = this.operand(start, () => this.unary());
      if (right === null) break;
      if (op === '*' || op === '×') left *= right;
      else if (op === '/' || op === '÷') left /= right;
      else left %= right;
    }
    return left;
  }

  private unary(): number | null {
    const start = this.position;
    const op = this.operator('-', '+');
    if (op) {
      const value = this.unary();
      if (value === null) {
        this.position = start;
        return null;
      }
      return op === '-' ? -value : value;
    }
    return this.power();
  }

  private power(): number | null {
    const base = this.postfix();
    if (base === null) return null;

    const start = this.position;
    if (!this.operator('**', '^')) return base;
    const exponent = this.operand(start, () => this.unary());
    return exponent === null ? base : Math.pow(base, exponent);
  }

  private postfix(): number | null {
    let value = this.primary();
    if (value === null) return null;

    while (this.operator('!')) {
      if (!Number.isInteger(value) || value < 0 || value > MAX_FACTORIAL) return null;
      let result = 1;
      for (let i = 2; i <= value; i++) result *= i;
      value = result;
      this.end = this.position;
    }
    return value;
  }

  private primary(): number | null {
    this.skipWhitespace();

    if (this.text[this.position] === '(') {
      const start = this.position;
      this.position++;
      const value = this.expression();
      if (value === null || !this.operator(')')) {
        this.position = start;
        return null;
      }
      this.end = this.position;
      return value;
    }

    // No leading zeros, like without math, so `05` doesn't count, while `0.5` still works in a sum
    const match = /^(?:0|[1-9]\d*)(?:\.\d+)?/.exec(this.text.slice(this.position));
    if (!match) return null;
    this.position += match[0].length;
    this.end = this.position;
    return Number(match[0]);
  }
}
