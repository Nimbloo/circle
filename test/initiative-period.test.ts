import { describe, expect, it } from 'vitest';
import { dayLabel, targetDateFromLabel, toIsoDate } from '@/lib/initiative-period';

describe('targetDateFromLabel', () => {
   it.each([
      ['Q1 2026', '2026-03-31'],
      ['Q2 2026', '2026-06-30'],
      ['Q3 2026', '2026-09-30'],
      ['q4 2026', '2026-12-31'],
      ['H1 2026', '2026-06-30'],
      ['H2 2026', '2026-12-31'],
      ['2026', '2026-12-31'],
      ['Sep 2026', '2026-09-30'],
      ['February 2028', '2028-02-29'],
      ['february 2027', '2027-02-28'],
      ['2026-02', '2026-02-28'],
      ['2026-09-15', '2026-09-15'],
      ['May 20, 2027', '2027-05-20'],
      ['May 20 2027', '2027-05-20'],
      ['  Q4 2026  ', '2026-12-31'],
   ])('deriva %s → %s', (label, expected) => {
      expect(targetDateFromLabel(label)).toBe(expected);
   });

   it.each([
      ['Sep 30th'],
      ['Q5 2026'],
      ['H3 2026'],
      ['2026-13'],
      ['2026-02-30'],
      ['Feb 30, 2027'],
      ['Xyz 2026'],
      ['soon'],
      [''],
      ['   '],
   ])('rótulo livre ou data inválida devolve null: %s', (label) => {
      expect(targetDateFromLabel(label)).toBeNull();
   });

   it('aceita null/undefined', () => {
      expect(targetDateFromLabel(null)).toBeNull();
      expect(targetDateFromLabel(undefined)).toBeNull();
   });
});

describe('dayLabel / toIsoDate', () => {
   it('dayLabel produz um rótulo que o parser reconverte na mesma data', () => {
      expect(dayLabel('2027-05-20')).toBe('May 20, 2027');
      expect(targetDateFromLabel(dayLabel('2027-05-20'))).toBe('2027-05-20');
   });

   it('toIsoDate usa a data local sem deslocar o dia pelo fuso', () => {
      expect(toIsoDate(new Date(2026, 8, 1))).toBe('2026-09-01');
      expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
   });
});
