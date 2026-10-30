import React from "react";
import { render, screen } from "@testing-library/react";
import { it, expect } from "vitest";
import "@/i18n";
import { publicReleaseSchema } from "@/lib/contracts";
import PublicReleaseContent from "./PublicReleaseContent";

it("renders release notes and feature names without links to private Planner data", () => {
  const release = publicReleaseSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    application_id: "22222222-2222-4222-8222-222222222222",
    version: "1.0.0",
    title: "Website",
    release_type: "major",
    public_notes: "Full release story",
    status: "draft",
    created_at: "2026-10-30",
    features: [{ name: "Roadmap", description: "SECRET", id: "private" }],
  });
  render(<PublicReleaseContent release={release} />);
  expect(screen.getByText("Full release story")).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Included features" }),
  ).toHaveTextContent("Roadmap");
  expect(screen.queryByText("SECRET")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
