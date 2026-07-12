/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { D1DatabaseLike } from "@passkeeper/d1";

declare global {
  namespace App {
    interface Locals {
      runtime?: {
        env: {
          DB: D1DatabaseLike;
          RP_ID?: string;
          RP_ORIGIN?: string;
        };
      };
    }
  }
}

export {};
