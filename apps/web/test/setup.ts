import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

beforeEach(() => window.history.replaceState({}, "", "/app/"));
afterEach(() => cleanup());
