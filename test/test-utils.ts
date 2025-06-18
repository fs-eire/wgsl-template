// Basic assertion utilities
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

export function assertEquals(
  actual: string,
  expected: string,
  message?: string
): void {
  if (actual !== expected) {
    const errorMessage =
      message || `Expected:\n${expected}\n\nActual:\n${actual}`;
    throw new AssertionError(errorMessage);
  }
}

export function assertContains(
  text: string,
  substring: string,
  message?: string
): void {
  if (!text.includes(substring)) {
    const errorMessage =
      message ||
      `Expected text to contain "${substring}" but it didn't.\nText: ${text}`;
    throw new AssertionError(errorMessage);
  }
}

export function assertNotContains(
  text: string,
  substring: string,
  message?: string
): void {
  if (text.includes(substring)) {
    const errorMessage =
      message ||
      `Expected text not to contain "${substring}" but it did.\nText: ${text}`;
    throw new AssertionError(errorMessage);
  }
}
