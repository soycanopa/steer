import { describe, expect, it } from "vitest";
import { parseTodos, replaceTodos } from "./todos";

describe("parseTodos", () => {
  it("normaliza el formato Claude Code ({todos:[{content,status,activeForm}]})", () => {
    const todos = parseTodos({
      todos: [
        { content: "Crear componentes", status: "completed", activeForm: "Creando componentes" },
        { content: "Wiring del estado", status: "in_progress", activeForm: "Conectando el estado" },
        { content: "Tests", status: "pending", activeForm: "Escribiendo tests" },
      ],
    });
    expect(todos).toEqual([
      { id: "todo-1", content: "Crear componentes", status: "completed" },
      { id: "todo-2", content: "Wiring del estado", status: "in_progress" },
      { id: "todo-3", content: "Tests", status: "pending" },
    ]);
  });

  it("conserva el id del provider si viene", () => {
    const todos = parseTodos({
      todos: [{ id: "op-1", content: "Leer el proyecto", status: "completed" }],
    });
    expect(todos).toEqual([
      { id: "op-1", content: "Leer el proyecto", status: "completed" },
    ]);
  });

  it("update_plan con plan de strings → todos pending", () => {
    expect(parseTodos({ plan: ["Explorar", "Editar", "Verificar"] })).toEqual([
      { id: "todo-1", content: "Explorar", status: "pending" },
      { id: "todo-2", content: "Editar", status: "pending" },
      { id: "todo-3", content: "Verificar", status: "pending" },
    ]);
  });

  it("acepta un array crudo y strings sueltas", () => {
    expect(parseTodos(["uno", "dos"])).toEqual([
      { id: "todo-1", content: "uno", status: "pending" },
      { id: "todo-2", content: "dos", status: "pending" },
    ]);
  });

  it("estado desconocido → pending; items vacíos o basura se descartan", () => {
    const todos = parseTodos([
      { content: "A", status: "weird" },
      { content: "  " },
      42,
      { text: "B", state: "done" },
      "",
    ]);
    expect(todos).toEqual([
      { id: "todo-1", content: "A", status: "pending" },
      { id: "todo-4", content: "B", status: "completed" },
    ]);
  });

  it("payload no parseable → lista vacía", () => {
    expect(parseTodos(null)).toEqual([]);
    expect(parseTodos({ nope: true })).toEqual([]);
  });
});

describe("replaceTodos", () => {
  it("el snapshot nuevo reemplaza al anterior", () => {
    const prev = [{ id: "t1", content: "Vieja", status: "in_progress" as const }];
    const next = [
      { id: "n1", content: "Nueva", status: "in_progress" as const },
      { id: "n2", content: "Otra", status: "pending" as const },
    ];
    expect(replaceTodos(prev, next)).toEqual(next);
  });

  it("reutiliza el id previo de igual contenido (claves de render estables)", () => {
    const prev = [{ id: "t1", content: "Explorar", status: "in_progress" as const }];
    const next = [{ id: "", content: "Explorar", status: "completed" as const }];
    expect(replaceTodos(prev, next)).toEqual([
      { id: "t1", content: "Explorar", status: "completed" },
    ]);
  });

  it("deduplica por contenido; ids repetidos se renombran, no se pierden", () => {
    const next = [
      { id: "a", content: "X", status: "pending" as const },
      { id: "a", content: "Y", status: "pending" as const },
      { id: "b", content: "X", status: "pending" as const },
    ];
    expect(replaceTodos(null, next)).toEqual([
      { id: "a", content: "X", status: "pending" },
      { id: "a+", content: "Y", status: "pending" },
    ]);
  });

  it("recorta y descarta contenidos vacíos", () => {
    const next = [
      { id: "a", content: "  hola  ", status: "pending" as const },
      { id: "b", content: "   ", status: "pending" as const },
    ];
    expect(replaceTodos(null, next)).toEqual([
      { id: "a", content: "hola", status: "pending" },
    ]);
  });
});
