// Enable React 19 `act(...)` support across all Bun unit tests in Storefront.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
