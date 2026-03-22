import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("admin shell", () => {
  it("renders the login entrypoint and allows signing in", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /operator console for a packaged customer deployment/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sign in with microsoft entra/i }));

    expect(
      await screen.findByRole("heading", { name: /branding and support metadata/i })
    ).toBeInTheDocument();
  });
});
