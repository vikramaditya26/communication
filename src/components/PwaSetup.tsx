"use client";

import { useEffect } from "react";
import { setupPwa } from "@/lib/pwa";
import { startAutoSync } from "@/lib/sync";

export function PwaSetup() {
  useEffect(setupPwa, []);
  useEffect(startAutoSync, []);
  return null;
}
