/**
 * Pure implementation of Anthropic's text editor tool
 * (`text_editor_20250728`, name `str_replace_based_edit_tool`) over an
 * in-memory map of files. Persistence is the caller's job, which keeps this
 * easy to unit-test.
 */
import { InvalidPathError, isRootPath, MAX_FILE_BYTES, MAX_FILES, normalizePath } from "./paths";

export type SiteFiles = Record<string, string>;

export interface EditorResult {
  output: string;
  isError: boolean;
  /** Set when the command changed a file. */
  change?: { path: string; content: string; created: boolean };
  /** Short human description for the activity feed. */
  summary: string;
}

type EditorInput = {
  command?: unknown;
  path?: unknown;
  view_range?: unknown;
  file_text?: unknown;
  old_str?: unknown;
  new_str?: unknown;
  insert_line?: unknown;
  insert_text?: unknown;
};

function fail(output: string, summary: string): EditorResult {
  return { output, isError: true, summary };
}

function withLineNumbers(content: string, start = 1): string {
  return content
    .split("\n")
    .map((line, i) => `${String(start + i).padStart(4, " ")}\t${line}`)
    .join("\n");
}

function sizeOk(content: string): boolean {
  return Buffer.byteLength(content, "utf8") <= MAX_FILE_BYTES;
}

export function listing(files: SiteFiles): string {
  const paths = Object.keys(files).sort();
  if (paths.length === 0) return "La web está vacía.";
  return paths
    .map((p) => `${p} (${Buffer.byteLength(files[p], "utf8")} bytes)`)
    .join("\n");
}

export function applyEditorCommand(files: SiteFiles, rawInput: unknown): EditorResult {
  const input = (rawInput ?? {}) as EditorInput;
  const command = typeof input.command === "string" ? input.command : "";
  const rawPath = typeof input.path === "string" ? input.path : "";

  if (command === "view" && isRootPath(rawPath)) {
    return { output: listing(files), isError: false, summary: "Listó los archivos de la web" };
  }

  let path: string;
  try {
    path = normalizePath(rawPath);
  } catch (error) {
    const message = error instanceof InvalidPathError ? error.message : "Ruta no válida.";
    return fail(message, `Ruta rechazada: ${rawPath || "(vacía)"}`);
  }

  const exists = Object.prototype.hasOwnProperty.call(files, path);

  switch (command) {
    case "view": {
      if (!exists) return fail(`El archivo ${path} no existe.\n\nArchivos:\n${listing(files)}`, `Buscó ${path} (no existe)`);
      const content = files[path];
      const range = input.view_range;
      if (Array.isArray(range) && range.length === 2) {
        const lines = content.split("\n");
        const start = Math.max(1, Number(range[0]) || 1);
        const endRaw = Number(range[1]);
        const end = endRaw === -1 || !Number.isFinite(endRaw) ? lines.length : Math.min(lines.length, endRaw);
        if (start > lines.length) return fail(`El archivo solo tiene ${lines.length} líneas.`, `Leyó ${path}`);
        return {
          output: withLineNumbers(lines.slice(start - 1, end).join("\n"), start),
          isError: false,
          summary: `Leyó ${path} (líneas ${start}-${end})`,
        };
      }
      return { output: withLineNumbers(content), isError: false, summary: `Leyó ${path}` };
    }

    case "create": {
      if (typeof input.file_text !== "string") return fail("Falta file_text.", `Intentó crear ${path} sin contenido`);
      if (!exists && Object.keys(files).length >= MAX_FILES) {
        return fail(`La web ya tiene el máximo de ${MAX_FILES} archivos.`, `No pudo crear ${path}`);
      }
      if (!sizeOk(input.file_text)) return fail(`El archivo supera ${MAX_FILE_BYTES} bytes.`, `No pudo crear ${path}`);
      return {
        output: exists ? `Archivo ${path} sobrescrito.` : `Archivo ${path} creado.`,
        isError: false,
        change: { path, content: input.file_text, created: !exists },
        summary: exists ? `Reescribió ${path}` : `Creó ${path}`,
      };
    }

    case "str_replace": {
      if (!exists) return fail(`El archivo ${path} no existe.`, `Intentó editar ${path} (no existe)`);
      if (typeof input.old_str !== "string" || input.old_str === "") {
        return fail("old_str es obligatorio y no puede estar vacío.", `Edición inválida en ${path}`);
      }
      const newStr = typeof input.new_str === "string" ? input.new_str : "";
      const content = files[path];
      const occurrences = content.split(input.old_str).length - 1;
      if (occurrences === 0) {
        return fail(
          `No se encontró old_str en ${path}. Revisa espacios e indentación (usa view para ver el texto exacto).`,
          `Edición fallida en ${path} (texto no encontrado)`,
        );
      }
      if (occurrences > 1) {
        return fail(
          `old_str aparece ${occurrences} veces en ${path}. Incluye más contexto para que sea único.`,
          `Edición fallida en ${path} (texto ambiguo)`,
        );
      }
      const updated = content.replace(input.old_str, () => newStr);
      if (!sizeOk(updated)) return fail(`El archivo superaría ${MAX_FILE_BYTES} bytes.`, `Edición rechazada en ${path}`);
      return {
        output: `Archivo ${path} editado.`,
        isError: false,
        change: { path, content: updated, created: false },
        summary: `Editó ${path}`,
      };
    }

    case "insert": {
      if (!exists) return fail(`El archivo ${path} no existe.`, `Intentó insertar en ${path} (no existe)`);
      const text =
        typeof input.insert_text === "string"
          ? input.insert_text
          : typeof input.new_str === "string"
            ? input.new_str
            : null;
      if (text === null) return fail("Falta insert_text.", `Inserción inválida en ${path}`);
      const lines = files[path].split("\n");
      const at = Number(input.insert_line);
      if (!Number.isInteger(at) || at < 0 || at > lines.length) {
        return fail(`insert_line debe estar entre 0 y ${lines.length}.`, `Inserción inválida en ${path}`);
      }
      lines.splice(at, 0, ...text.split("\n"));
      const updated = lines.join("\n");
      if (!sizeOk(updated)) return fail(`El archivo superaría ${MAX_FILE_BYTES} bytes.`, `Inserción rechazada en ${path}`);
      return {
        output: `Texto insertado en ${path} tras la línea ${at}.`,
        isError: false,
        change: { path, content: updated, created: false },
        summary: `Insertó contenido en ${path}`,
      };
    }

    default:
      return fail(
        `Comando no soportado: "${command}". Usa view, create, str_replace o insert.`,
        `Comando no soportado (${command || "vacío"})`,
      );
  }
}
