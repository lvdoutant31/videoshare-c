const LAST_RECOMMENDATION_ORDER_KEY = 'feed:recommend:last-first-page-order:v1';

function orderSignature<T extends { id: string }>(items: T[]): string {
  return items.map((item) => item.id).join(',');
}

function readLastFirstPageOrder(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_RECOMMENDATION_ORDER_KEY);
  } catch {
    return null;
  }
}

function rememberFirstPageOrder(signature: string): void {
  try {
    window.sessionStorage.setItem(LAST_RECOMMENDATION_ORDER_KEY, signature);
  } catch {
    // Storage can be unavailable in private browsing; random order still works.
  }
}

export function shuffleFeedPage<T extends { id: string }>(
  items: T[],
  options: { isFirstPage?: boolean; random?: () => number } = {},
): T[] {
  const { isFirstPage = false, random = Math.random } = options;
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  if (isFirstPage && shuffled.length > 1) {
    const signature = orderSignature(shuffled);
    if (signature === readLastFirstPageOrder()) {
      shuffled.push(shuffled.shift()!);
    }
    rememberFirstPageOrder(orderSignature(shuffled));
  }

  return shuffled;
}
