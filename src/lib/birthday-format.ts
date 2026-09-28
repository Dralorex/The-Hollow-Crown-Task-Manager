/** Pure birthday date helpers — safe for client components (no Prisma/Node). */

/** Store birthday as UTC noon on month/day of year 2000 (year ignored in UI). */
export function birthdayFromMonthDay(month: number, day: number): Date | null {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(2000, month - 1, day, 12, 0, 0));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

export function birthdayParts(birthday: Date | null | undefined) {
  if (!birthday) return null;
  return { month: birthday.getUTCMonth() + 1, day: birthday.getUTCDate() };
}

export function formatBirthday(birthday: Date): string {
  return birthday.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function isBirthdayToday(birthday: Date, now = new Date()): boolean {
  return (
    birthday.getUTCMonth() === now.getMonth() &&
    birthday.getUTCDate() === now.getDate()
  );
}
