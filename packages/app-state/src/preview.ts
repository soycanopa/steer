// previewSlice — estado del dev server del proyecto abierto.
// En Fase B el iframe es directo (sin proxy ni bridge). El PreviewPort
// completo (mensajes steer:*) se enchufa en Fase C.
export type PreviewStatus = "idle" | "starting" | "live" | "down";

export type PreviewSlice = {
  previewStatus: PreviewStatus;
  previewUrl: string | null;
  /** Ruta actual del iframe (pathname), p. ej. "/" o "/about". */
  previewPath: string;
  previewError: string | null;
  /** Sube en cada reload para remontar el iframe. */
  reloadNonce: number;
};

export const initialPreviewSlice: PreviewSlice = {
  previewStatus: "idle",
  previewUrl: null,
  previewPath: "/",
  previewError: null,
  reloadNonce: 0,
};
