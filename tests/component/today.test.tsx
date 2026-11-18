// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Today from "../../apps/web/src/features/Today";
import { words } from "../../apps/web/src/i18n";
import { AppContext } from "../../apps/web/src/context";
it("exposes local water totals and named navigation in Persian", async () => {
  const ctx = {
    t: words.fa,
    owner: "device",
    locale: "fa" as const,
    calendar: "persian",
    setOwner: () => {},
    setCalendar: () => {},
    notice: () => {},
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AppContext.Provider value={ctx}>
          <Today />
        </AppContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("۰ میلی‌لیتر")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: words.fa.plans }).getAttribute("href"),
  ).toBe("/plans/medicines");
});
