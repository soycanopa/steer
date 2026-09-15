// Contrato Intent — TRD §5. Fuente de verdad del prototipo.
// Cualquier UI que no pueda emitir uno de estos tipos no se construye.

export type SourceLoc = {
  file: string; // posix relativo al root del proyecto
  line: number; // 1-based
  col: number; // 1-based
};

export type Scope = "instance" | "component";

export type Selection = {
  source: SourceLoc;
  component: string | null; // nombre React si se puede inferir
  route: string | null; // pathname Start
  tag: string; // h1, button, section
  textPreview: string; // max 80 chars
  computed: Record<string, string>;
  breadcrumb: string[]; // ["Hero", "h1"]
};

export type TweakProp =
  | "fontSize"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "color"
  | "backgroundColor"
  | "textAlign"
  | "width"
  | "height"
  | "padding"
  | "margin"
  | "gap"
  | "flexDirection"
  | "flexWrap"
  | "justifyContent"
  | "alignItems"
  | "maxWidth"
  | "objectFit"
  | "fontStyle"
  | "textDecoration"
  | "borderRadius"
  | "opacity";

export type Intent =
  | {
      id: string;
      kind: "select";
      at: number;
      selection: Selection;
      scope: Scope;
    }
  | {
      id: string;
      kind: "comment";
      at: number;
      selection: Selection;
      scope: Scope;
      pin: number;
      body: string;
    }
  | {
      id: string;
      kind: "tweak";
      at: number;
      selection: Selection;
      scope: Scope;
      prop: TweakProp;
      from: string;
      to: string;
    }
  | {
      id: string;
      kind: "screenshot";
      at: number;
      selection: Selection | null;
      mime: "image/png";
      dataBase64: string;
    };

export type ApplyPayload = {
  projectRoot: string;
  route: string | null;
  intents: Intent[];
  userNote?: string;
};
