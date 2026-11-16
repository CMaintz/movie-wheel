import { describe, expect, it } from 'vitest';
import { fillSlots, pickSlot } from './listWheel';

const titles = (n: number) => Array.from({ length: n }, (_, i) => `T${i}`);

describe('fillSlots', () => {
  it('puts every title on the wheel and never two copies side by side', () => {
    for (let n = 2; n <= 12; n++) {
      const slots = fillSlots(titles(n), 12);
      expect(slots).toHaveLength(12);
      expect(new Set(slots).size).toBe(n);
      slots.forEach((s, i) => expect(s).not.toBe(slots[(i + 1) % 12]));
    }
  });
});

describe('pickSlot', () => {
  // 5 titles over 12 slots: two get 3 slots and three get 2, so picking a slot would favour some
  it('gives every title the same chance however many slots it has', () => {
    const items = titles(5);
    const slots = fillSlots(items, 12);
    const wins = new Map<string, number>();
    const steps = 1000;
    for (let i = 0; i < steps; i++) {
      const rolls = [(i + 0.5) / steps, 0.5];
      const slot = pickSlot(slots, items, () => rolls.shift()!);
      wins.set(slots[slot], (wins.get(slots[slot]) ?? 0) + 1);
    }
    for (const t of items) expect(wins.get(t)).toBe(steps / 5);
  });
});
