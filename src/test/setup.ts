import "@testing-library/jest-dom";

// Stub browser APIs that jsdom doesn't provide
Object.defineProperty(URL, "createObjectURL", {
  writable: true,
  value: vi.fn(() => "blob:mock-url"),
});
Object.defineProperty(URL, "revokeObjectURL", {
  writable: true,
  value: vi.fn(),
});

// Clear mock call counts before each test so cross-test pollution doesn't cause
// "called N times instead of once" failures.
beforeEach(() => {
  vi.clearAllMocks();
});

// Suppress noisy console.error from React prop-type warnings in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const msg = args[0];
    if (typeof msg === "string" && msg.includes("Warning: ReactDOM.render")) return;
    originalError(...args);
  };
});
afterAll(() => {
  console.error = originalError;
});
