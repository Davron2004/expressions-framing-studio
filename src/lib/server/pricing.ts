import { frames, sizes, type Quote } from "@/lib/catalog";
import type { ValidConfiguration } from "./configuration";

const matPrices: Record<1.5 | 2 | 3, number> = { 1.5: 1500, 2: 2000, 3: 3000 };

export function quoteFor(configuration: ValidConfiguration): Quote {
  const size = sizes.find((item) => item.id === configuration.size)!;
  const frame = frames.find((item) => item.id === configuration.frame)!;
  const breakdown: Quote["breakdown"] = [
    { label: `${size.label} print`, amount: size.price },
    { label: frame.name, amount: frame.price },
  ];
  if (configuration.mat !== "none") {
    breakdown.push({
      label: `${configuration.matWidth}\" mat`,
      amount: matPrices[configuration.matWidth],
    });
    if (configuration.bottomWeighted)
      breakdown.push({ label: "Bottom-weighted mat", amount: 500 });
  }
  return {
    total: breakdown.reduce((sum, item) => sum + item.amount, 0),
    currency: "cad",
    breakdown,
  };
}
