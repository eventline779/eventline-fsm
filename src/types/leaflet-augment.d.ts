// Augmentation der Leaflet MapOptions um die zwei Plugin-Felder.
// Modul-Augmentation braucht eine Modul-Datei — `import "leaflet"`
// triggert das (die Datei wird nicht nur ein Script).
import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    smoothWheelZoom?: boolean;
    smoothSensitivity?: number;
  }
}
