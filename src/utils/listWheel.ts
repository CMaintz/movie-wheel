/**
 * Lays `items` (at least 2) round the `count` slots of the wheel, repeating them in turn, with no
 * two copies of a title in neighbouring slots.
 */
export const fillSlots = <T>(items: readonly T[], count: number): T[] => {
  const slots = Array.from({ length: count }, (_, i) => items[i % items.length]);
  // When one copy is left over, it lands next to the first slot on the way round
  if (slots[count - 1] === slots[0]) {
    [slots[count - 2], slots[count - 1]] = [slots[count - 1], slots[count - 2]];
  }
  return slots;
};

/**
 * Index of the winning slot. The title is drawn first, then one of its slots, so every title has
 * the same chance even when the slots don't split evenly between them.
 */
export const pickSlot = <T>(slots: readonly T[], items: readonly T[], random: () => number = Math.random): number => {
  const item = items[Math.floor(random() * items.length)];
  const owned = slots.flatMap((s, i) => (s === item ? [i] : []));
  return owned[Math.floor(random() * owned.length)];
};
