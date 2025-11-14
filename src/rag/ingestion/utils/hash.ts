export function stableHash(str: string): string {
  // FNV-1a 64-bit (simplified)
  let h = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * prime) & BigInt("0xffffffffffffffff");
  }
  return h.toString(16);
}