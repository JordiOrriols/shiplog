import { describe, expect, it } from "vitest";
import { releaseInputSchema, versionPattern } from "./contracts";

describe("release contracts", () => {
  it.each([
    "0.0.0",
    "1.2.3",
    "2.0.0-beta.1",
    "1.0.0+build.42",
    "1.0.0-rc.1+sha.abc",
  ])("accepts SemVer %s", (version) => {
    expect(versionPattern.test(version)).toBe(true);
  });
  it.each([
    "",
    "1",
    "1.2",
    "v1.2.3",
    "01.2.3",
    "1.2.3-01",
    "1.2.3-",
    "1.2.3+",
    "1.2.3.4",
  ])("rejects malformed version %s", (version) => {
    expect(versionPattern.test(version)).toBe(false);
  });
  it("validates and trims draft input before transport", () => {
    const input = {
      application_id: "11111111-1111-4111-8111-111111111111",
      version: "1.0.0",
      release_type: "hotfix",
      title: " First ",
      internal_notes: "Private",
      public_notes: "Public",
    };
    expect(releaseInputSchema.parse(input).title).toBe("First");
    expect(releaseInputSchema.safeParse({ ...input, title: " " }).success).toBe(
      false,
    );
    expect(
      releaseInputSchema.safeParse({ ...input, application_id: "invalid" })
        .success,
    ).toBe(false);
  });
});
