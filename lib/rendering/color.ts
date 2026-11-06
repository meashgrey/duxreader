export interface RGB {
  r: number;
  g: number;
  b: number;
  a: number;
}
const cache = new Map<string, RGB | undefined>();
const clamp = (n: number, limit = 1) => Math.max(0, Math.min(limit, n));
const component = (s: string, scale = 1) =>
  s === "none"
    ? 0
    : s.endsWith("%")
      ? (Number(s.slice(0, -1)) / 100) * scale
      : Number(s);
const angle = (s: string) =>
  s === "none"
    ? 0
    : parseFloat(s) *
      (s.endsWith("turn")
        ? 360
        : s.endsWith("grad")
          ? 0.9
          : s.endsWith("rad")
            ? 180 / Math.PI
            : 1);
const linear = (v: number) =>
  Math.sign(v) *
  (Math.abs(v) <= 0.04045
    ? Math.abs(v) / 12.92
    : ((Math.abs(v) + 0.055) / 1.055) ** 2.4);
const encoded = (v: number) =>
  Math.sign(v) *
  (Math.abs(v) <= 0.0031308
    ? Math.abs(v) * 12.92
    : 1.055 * Math.abs(v) ** (1 / 2.4) - 0.055);
function result(values: number[], alpha = 1): RGB | undefined {
  if (values.some((v) => !Number.isFinite(v)) || !Number.isFinite(alpha))
    return;
  return {
    r: Math.round(clamp(values[0]!, 255)),
    g: Math.round(clamp(values[1]!, 255)),
    b: Math.round(clamp(values[2]!, 255)),
    a: clamp(alpha),
  };
}
function fromLinear(values: number[], alpha: number) {
  return result(
    values.map((v) => encoded(v) * 255),
    alpha,
  );
}

// Convert source colors only for role classification. Palette output never
// uses these approximations or synthesizes shades. Color-space definitions:
// https://www.w3.org/TR/css-color-4/#color-conversion-code
function read(value: string): RGB | undefined {
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value);
  if (hex) {
    const digits =
      hex[1]!.length <= 4 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
    return result(
      [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)),
      digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1,
    );
  }
  const fn = /^([\w-]+)\(([^()]*)\)$/.exec(value);
  if (!fn) return;
  const parts = fn[2]!.trim().split(/\s*\/\s*/);
  const tokens = parts[0]!.split(/[\s,]+/);
  let kind = fn[1]!;
  if (kind === "color") kind = tokens.shift()!;
  const a = component(parts[1] ?? tokens[3] ?? "1");
  if (tokens.length < 3 || tokens.length > 4) return;
  if (kind === "rgb" || kind === "rgba")
    return result(
      tokens.slice(0, 3).map((t) => component(t, 255)),
      a,
    );
  if (kind === "srgb")
    return result(
      tokens.slice(0, 3).map((t) => component(t) * 255),
      a,
    );
  if (kind === "srgb-linear")
    return fromLinear(
      tokens.slice(0, 3).map((t) => component(t)),
      a,
    );
  if (kind === "hsl" || kind === "hsla") {
    const h = ((angle(tokens[0]!) % 360) + 360) % 360,
      s = clamp(component(tokens[1]!)),
      l = clamp(component(tokens[2]!));
    const c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = l - c / 2;
    const channels =
      h < 60
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
    return result(
      channels.map((v) => (v + m) * 255),
      a,
    );
  }
  if (kind === "oklab" || kind === "oklch") {
    const l = component(tokens[0]!),
      c = component(tokens[1]!, 0.4);
    const h = (angle(tokens[2]!) * Math.PI) / 180;
    const aa = kind === "oklch" ? c * Math.cos(h) : c;
    const b = kind === "oklch" ? c * Math.sin(h) : component(tokens[2]!, 0.4);
    const ll = (l + 0.3963377774 * aa + 0.2158037573 * b) ** 3;
    const mm = (l - 0.1055613458 * aa - 0.0638541728 * b) ** 3;
    const ss = (l - 0.0894841775 * aa - 1.291485548 * b) ** 3;
    return fromLinear(
      [
        4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss,
        -1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss,
        -0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss,
      ],
      a,
    );
  }
  if (kind === "display-p3") {
    const [r, g, b] = tokens.slice(0, 3).map((t) => linear(component(t))) as [
      number,
      number,
      number,
    ];
    const x =
      r * (608311 / 1250200) + g * (189793 / 714400) + b * (198249 / 1000160);
    const y =
      r * (35783 / 156275) + g * (247089 / 357200) + b * (198249 / 2500400);
    const z = g * (32229 / 714400) + b * (5220557 / 5000800);
    return fromLinear(
      [
        x * (12831 / 3959) - y * (329 / 214) - z * (1974 / 3959),
        -x * (851781 / 878810) + y * (1648619 / 878810) + z * (36519 / 878810),
        x * (705 / 12673) - y * (2585 / 12673) + z * (705 / 667),
      ],
      a,
    );
  }
}
export function parseColor(input: string): RGB | undefined {
  const value = input.trim().toLowerCase();
  if (cache.has(value)) return cache.get(value);
  const color = read(value);
  if (cache.size >= 4096) cache.clear();
  cache.set(value, color);
  return color;
}
