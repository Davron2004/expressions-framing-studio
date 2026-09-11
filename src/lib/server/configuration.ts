import {
  frames,
  mats,
  samples,
  sizes,
  type Configuration,
} from "@/lib/catalog";
import { z } from "zod";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const samplePaths = new Set<string>(samples.map((sample) => sample.src));

const dataPhoto = z.string().superRefine((value, context) => {
  if (samplePaths.has(value)) return;
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value,
    );
  if (!match) {
    context.addIssue({
      code: "custom",
      message: "Photo must be a catalog image or JPEG, PNG, or WebP data URL.",
    });
    return;
  }
  const encoded = match[2];
  if (
    encoded.length % 4 !== 0 ||
    (encoded.indexOf("=") !== -1 && !/=+$/.test(encoded))
  ) {
    context.addIssue({ code: "custom", message: "Photo data is malformed." });
    return;
  }
  const byteLength =
    (encoded.length / 4) * 3 -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (byteLength > MAX_PHOTO_BYTES) {
    context.addIssue({
      code: "custom",
      message: "Photo must be 2MB or smaller.",
    });
    return;
  }
  const bytes = Buffer.from(encoded, "base64");
  const type = match[1];
  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  const png =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).equals(Buffer.from("RIFF")) &&
    bytes.subarray(8, 12).equals(Buffer.from("WEBP"));
  if (
    (type === "image/jpeg" && !jpeg) ||
    (type === "image/png" && !png) ||
    (type === "image/webp" && !webp)
  ) {
    context.addIssue({
      code: "custom",
      message: "Photo contents do not match its image type.",
    });
  }
});

export const configurationSchema = z
  .object({
    size: z.enum(
      sizes.map((item) => item.id) as [
        Configuration["size"],
        ...Configuration["size"][],
      ],
    ),
    frame: z.enum(
      frames.map((item) => item.id) as [
        Configuration["frame"],
        ...Configuration["frame"][],
      ],
    ),
    mat: z.enum(
      mats.map((item) => item.id) as [
        Configuration["mat"],
        ...Configuration["mat"][],
      ],
    ),
    matWidth: z.union([z.literal(1.5), z.literal(2), z.literal(3)]),
    bottomWeighted: z.boolean(),
    photo: dataPhoto,
    photoName: z.string().trim().min(1).max(160),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.mat === "none" && config.bottomWeighted) {
      context.addIssue({
        code: "custom",
        path: ["bottomWeighted"],
        message: "Bottom weighting requires a mat.",
      });
    }
  });

export type ValidConfiguration = z.infer<typeof configurationSchema>;

export function parseConfiguration(value: unknown): ValidConfiguration {
  return configurationSchema.parse(value);
}
