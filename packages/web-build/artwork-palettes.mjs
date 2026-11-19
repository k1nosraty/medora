import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

// The order is part of the palette data format. Each record contains the full
// VP8 chunk (header, RGB payload and padding). The base supplies VP8X/ICCP/ALPH.
export const colors = [
  "gold", "peach", "coral", "rose", "purple", "indigo", "blue", "green", "pistachio", "slate",
];

function splitWebP(image) {
  if (image.length < 12 || image.toString("ascii", 0, 4) !== "RIFF" ||
      image.toString("ascii", 8, 12) !== "WEBP" || image.readUInt32LE(4) !== image.length - 8)
    throw Error("Invalid WebP container");
  let offset = 12;
  for (const tag of ["VP8X", "ICCP", "ALPH"]) {
    if (offset + 8 > image.length || image.toString("ascii", offset, offset + 4) !== tag)
      throw Error("Expected WebP chunk " + tag);
    const size = image.readUInt32LE(offset + 4);
    offset += 8 + size + (size % 2);
  }
  const end = colorEnd(image, offset);
  if (end !== image.length) throw Error("Unexpected trailing WebP chunks");
  return { shared: image.subarray(0, offset), color: image.subarray(offset) };
}

function colorEnd(data, offset) {
  if (offset + 8 > data.length || data.toString("ascii", offset, offset + 4) !== "VP8 ")
    throw Error("Expected VP8 color chunk");
  const size = data.readUInt32LE(offset + 4);
  const end = offset + 8 + size + (size % 2);
  if (!size || end > data.length) throw Error("Truncated VP8 color chunk");
  return end;
}

export function packPalette(base, variants) {
  const { shared } = splitWebP(base);
  if (variants.length !== colors.length) throw Error("Incomplete artwork palette");
  return Buffer.concat(variants.map((image) => {
    const variant = splitWebP(image);
    // RIFF's size field differs when the RGB payload length differs.
    if (!shared.subarray(8).equals(variant.shared.subarray(8)))
      throw Error("Artwork variant differs in transparency or color profile");
    return variant.color;
  }));
}

/** @returns {[string, Buffer][]} */
export function expandPalette(base, palette) {
  const { shared } = splitWebP(base);
  let offset = 0;
  const variants = colors.map((color) => {
    const end = colorEnd(palette, offset);
    const image = Buffer.concat([shared, palette.subarray(offset, end)]);
    image.writeUInt32LE(image.length - 8, 4);
    offset = end;
    return /** @type {[string, Buffer]} */ ([color, image]);
  });
  if (offset !== palette.length) throw Error("Unexpected trailing palette data");
  return variants;
}

export async function emitArtworkPalettes(source, output) {
  const variants = new URL("colors/", output);
  await Promise.all(colors.map((color) => mkdir(new URL(color + "/", variants), { recursive: true })));
  const files = await readdir(source);
  await Promise.all(files.filter((file) => file.endsWith(".vp8")).map(async (file) => {
    const name = file.replace(/\.vp8$/, ".webp");
    const [base, palette] = await Promise.all([
      readFile(new URL(name, output)), readFile(new URL(file, source)),
    ]);
    await Promise.all(expandPalette(base, palette).map(([color, image]) =>
      writeFile(new URL(`${color}/${name}`, variants), image),
    ));
  }));
}
