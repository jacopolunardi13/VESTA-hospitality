// Helper di formattazione (locale fissa it-IT per coerenza server/client).

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

const dateFmt = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
});

const dateTimeFmt = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

export function formatDateRange(checkIn: string, checkOut: string): string {
  return `${dateFmt.format(new Date(checkIn))} → ${dateFmt.format(new Date(checkOut))}`;
}

export function formatGuests(adults: number, children: { age: number }[]): string {
  const parts = [`${adults} adult${adults === 1 ? "o" : "i"}`];
  if (children.length > 0) {
    parts.push(
      `${children.length} bambin${children.length === 1 ? "o" : "i"} (${children
        .map((c) => c.age)
        .join(", ")} anni)`
    );
  }
  return parts.join(" + ");
}
