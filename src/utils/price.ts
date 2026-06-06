export function formatPrice(amountInPaise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);
}

export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
