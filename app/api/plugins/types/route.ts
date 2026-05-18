import { NextResponse } from "next/server";
import { listPluginTypes, getPluginType } from "@/lib/plugins/registry";

// GET /api/plugins/types  → registry metadata (id, name, defaultSize, etc.)
// Used by the CMS to populate the "New plugin instance" picker.
export async function GET() {
  // Include a JSON-shaped settingsSchema description per type so the UI can
  // generate a settings form without importing zod into the browser bundle.
  const types = listPluginTypes().map((t) => {
    const full = getPluginType(t.id)!;
    return { ...t, settingsSchema: schemaShape(full.settingsSchema) };
  });
  return NextResponse.json(types);
}

// Minimal zod-schema introspection. We only need enough shape for the CMS
// form to know which fields to render — full schema fidelity comes from
// running validation server-side at runInstance() time.
function schemaShape(schema: any): unknown {
  try {
    const def = schema._def;
    if (!def) return { kind: "unknown" };
    switch (def.typeName) {
      case "ZodObject": {
        const shape = def.shape();
        const fields: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(shape)) {
          fields[k] = schemaShape(v);
        }
        return { kind: "object", fields };
      }
      case "ZodString":
        return { kind: "string" };
      case "ZodNumber":
        return { kind: "number" };
      case "ZodBoolean":
        return { kind: "boolean" };
      case "ZodEnum":
        return { kind: "enum", values: def.values };
      case "ZodOptional":
        return { kind: "optional", inner: schemaShape(def.innerType) };
      case "ZodDefault":
        return { kind: "default", inner: schemaShape(def.innerType), default: def.defaultValue() };
      case "ZodArray":
        return { kind: "array", element: schemaShape(def.type) };
      case "ZodDiscriminatedUnion":
        return { kind: "discriminatedUnion", discriminator: def.discriminator, options: def.options.map(schemaShape) };
      case "ZodUnion":
        return { kind: "union", options: def.options.map(schemaShape) };
      case "ZodRecord":
        return { kind: "record" };
      case "ZodLiteral":
        return { kind: "literal", value: def.value };
      default:
        return { kind: "unknown", typeName: def.typeName };
    }
  } catch {
    return { kind: "unknown" };
  }
}
