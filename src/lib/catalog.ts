export const sizes = [
  { id: "5x7", label: "5 × 7", width: 5, height: 7, price: 4900 },
  { id: "8x10", label: "8 × 10", width: 8, height: 10, price: 7900 },
  { id: "11x14", label: "11 × 14", width: 11, height: 14, price: 11900 },
  { id: "16x20", label: "16 × 20", width: 16, height: 20, price: 17900 },
] as const;
export const frames = [
  {
    id: "oak",
    name: "Natural oak",
    description: "Warm grain. Quiet character.",
    color: "#b58b56",
    price: 0,
  },
  {
    id: "walnut",
    name: "American walnut",
    description: "Deep, rich, and wonderfully timeless.",
    color: "#56372a",
    price: 1500,
  },
  {
    id: "black",
    name: "Gallery black",
    description: "A crisp outline. All eyes on your art.",
    color: "#242522",
    price: 500,
  },
  {
    id: "white",
    name: "Soft white",
    description: "Light, bright, beautifully understated.",
    color: "#ebe9e2",
    price: 500,
  },
] as const;
export const mats = [
  { id: "ivory", name: "Warm white", color: "#f3f0e6" },
  { id: "white", name: "Gallery white", color: "#fafafa" },
  { id: "charcoal", name: "Charcoal", color: "#343735" },
  { id: "none", name: "No mat", color: "transparent" },
] as const;
export const samples = [
  {
    id: "mountain",
    name: "Alpine stillness",
    location: "A moment in the mountains",
    src: "/samples/mountain.jpg",
  },
  {
    id: "coast",
    name: "Coastal light",
    location: "Where the land meets the sea",
    src: "/samples/coast.jpg",
  },
  {
    id: "botanical",
    name: "Quiet growth",
    location: "A little closer to nature",
    src: "/samples/botanical.jpg",
  },
] as const;
export type Configuration = {
  size: (typeof sizes)[number]["id"];
  frame: (typeof frames)[number]["id"];
  mat: (typeof mats)[number]["id"];
  matWidth: 1.5 | 2 | 3;
  bottomWeighted: boolean;
  photo: string;
  photoName: string;
};
export const defaultConfiguration: Configuration = {
  size: "8x10",
  frame: "oak",
  mat: "ivory",
  matWidth: 2,
  bottomWeighted: true,
  photo: "/samples/mountain.jpg",
  photoName: "Alpine stillness",
};
export type Quote = {
  total: number;
  currency: "cad";
  breakdown: { label: string; amount: number }[];
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
export function dimensions(config: Configuration) {
  const s = sizes.find((s) => s.id === config.size)!;
  const m = config.mat === "none" ? 0 : config.matWidth;
  const bottom = m + (m && config.bottomWeighted ? 0.5 : 0);
  return {
    printWidth: s.width,
    printHeight: s.height,
    mat: m,
    bottom,
    outerWidth: s.width + 2 * m + 1.5,
    outerHeight: s.height + m + bottom + 1.5,
  };
}
