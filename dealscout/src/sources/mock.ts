import type { PricePoint, PriceSource, Product, WatchSpec } from "../types.ts";

const DAYS = 60;

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round99 = (n: number) => Math.round(n / 100) * 100 - 1;

function dateAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Noisy series around `base`, oldest first, ending yesterday. `shape` can reshape day i of n. */
function series(id: string, base: number, days: number, shape?: (i: number, n: number, p: number) => number): PricePoint[] {
  const r = rng(id);
  return Array.from({ length: days }, (_, i) => {
    const p = base * (1 + (r() - 0.5) * 0.06);
    return { date: dateAgo(days - i), price: round99(shape ? shape(i, days, p) : p) };
  });
}

interface Fixture {
  product: Product;
  history: PricePoint[];
}

const fixtures: Fixture[] = [
  {
    // Genuinely lowest in 60 days, but the banner discount is inflated.
    product: {
      id: "scarlett-2i2",
      name: "Focusrite Scarlett 2i2 (3rd Gen)",
      store: "Amazon.in",
      url: "https://example.com/amazon/scarlett-2i2",
      currentPrice: 11999,
      claimedOriginal: 17999,
      features: ["2 inputs", "USB-C", "48V phantom power", "24-bit/192kHz"],
    },
    history: series("scarlett-2i2", 13500, DAYS),
  },
  {
    // Pure fake discount: flat price, inflated "was" price.
    product: {
      id: "audiobox-usb96",
      name: "PreSonus AudioBox USB 96",
      store: "Flipkart",
      url: "https://example.com/flipkart/audiobox-usb96",
      currentPrice: 8499,
      claimedOriginal: 12999,
      features: ["2 inputs", "USB", "48V phantom power", "24-bit/96kHz"],
    },
    history: series("audiobox-usb96", 8500, DAYS),
  },
  {
    // Real discount: price spiked early on, today is a clear low.
    product: {
      id: "umc204hd",
      name: "Behringer UMC204HD",
      store: "Amazon.in",
      url: "https://example.com/amazon/umc204hd",
      currentPrice: 9499,
      claimedOriginal: 12999,
      features: ["2 inputs", "4 outputs", "USB", "48V phantom power", "24-bit/192kHz"],
    },
    history: series("umc204hd", 11000, DAYS, (i, _n, p) => (i < 10 ? 12999 : p)),
  },
  {
    // Niche store find. Dipped earlier, climbed, now sliding back down.
    product: {
      id: "mtrack-duo",
      name: "M-Audio M-Track Duo",
      store: "Musicians Hub",
      url: "https://example.com/musicianshub/mtrack-duo",
      currentPrice: 9199,
      claimedOriginal: 10999,
      features: ["2 inputs", "USB", "48V phantom power", "24-bit/48kHz"],
    },
    history: series("mtrack-duo", 8800, DAYS, (i, n, p) => {
      if (i >= 28 && i <= 32) return 8200;
      if (i >= n - 21 && i < n - 7) return 9900;
      if (i >= n - 7) return 9400;
      return p;
    }),
  },
  {
    product: {
      id: "audient-id4",
      name: "Audient iD4 MKII",
      store: "Amazon.in",
      url: "https://example.com/amazon/audient-id4",
      currentPrice: 20999,
      claimedOriginal: 24999,
      features: ["2 inputs", "USB-C", "48V phantom power", "24-bit/96kHz"],
    },
    history: series("audient-id4", 22000, DAYS),
  },
  {
    // Newly listed: too little history to judge.
    product: {
      id: "tascam-us2x2hr",
      name: "Tascam US-2x2HR",
      store: "Sweetwater India",
      url: "https://example.com/sweetwater/us2x2hr",
      currentPrice: 13499,
      features: ["2 inputs", "USB", "48V phantom power", "24-bit/192kHz"],
    },
    history: series("us2x2hr", 13800, 6),
  },
  {
    // Cheap and popular, but no phantom power: gets ruled out when the spec requires it.
    product: {
      id: "umc22",
      name: "Behringer UM2",
      store: "Amazon.in",
      url: "https://example.com/amazon/um2",
      currentPrice: 3999,
      claimedOriginal: 4999,
      features: ["2 inputs", "USB", "24-bit/48kHz"],
    },
    history: series("umc22", 4100, DAYS),
  },
  {
    // Unremarkable: sitting at its usual price.
    product: {
      id: "minifuse-2",
      name: "Arturia MiniFuse 2",
      store: "Flipkart",
      url: "https://example.com/flipkart/minifuse-2",
      currentPrice: 12499,
      claimedOriginal: 13999,
      features: ["2 inputs", "USB-C", "48V phantom power", "24-bit/192kHz"],
    },
    history: series("minifuse-2", 12500, DAYS),
  },
];

/** Offline stand-in for real retailers. Swap for a grounded-search or retailer-API source. */
export class MockSource implements PriceSource {
  name = "mock";

  async discover(_spec: WatchSpec): Promise<Product[]> {
    return fixtures.map((f) => f.product);
  }

  async history(product: Product): Promise<PricePoint[]> {
    return fixtures.find((f) => f.product.id === product.id)?.history ?? [];
  }
}
