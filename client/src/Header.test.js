/* eslint-env jest */
/* eslint-disable react/prop-types */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Header from "./Header";

jest.mock("react-router-dom", () => {
  const React = require("react");

  return {
    MemoryRouter: ({ children }) => <>{children}</>,
    Link: ({ children, to = "/", ...props }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  };
}, { virtual: true });

describe("Header", () => {
  it("opens and closes the audio placeholder dialog", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Header />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /audio instructions/i }));

    expect(screen.getByRole("dialog", { name: /audio instructions/i })).toBeInTheDocument();
    expect(screen.getByText(/audio playback is not enabled yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close audio instructions/i }));

    expect(screen.queryByRole("dialog", { name: /audio instructions/i })).not.toBeInTheDocument();
  });
});
