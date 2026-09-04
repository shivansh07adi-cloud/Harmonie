import { evaluate } from 'mathjs';

export function safeCalculate(expression) {
  // mathjs's default evaluate() has no access to Node globals/filesystem,
  // so arbitrary code execution isn't possible through it.
  const result = evaluate(expression);
  return typeof result === 'object' ? result.toString() : String(result);
}
