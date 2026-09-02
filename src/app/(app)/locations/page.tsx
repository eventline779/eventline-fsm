"use client";

/**
 * Deep-Link-Alias fuer Locations. Die eigentliche View lebt in
 * src/components/locations/locations-view.tsx — sowohl diese Seite als
 * auch /kontakte?tab=locations rendern sie. Deep-Links auf /standorte/[id]
 * und /raeume/[id] laufen weiterhin ueber ihre eigenen Routes.
 */

import { LocationsView } from "@/components/locations/locations-view";

export default function LocationsPage() {
  return <LocationsView />;
}
