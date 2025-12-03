import z from "zod";

type Tool = {
  description?: string;
  inputSchema: z.ZodType<any>;
  execute: (params: any) => Promise<any> | any;
};

export function discoverToolsInMemory(
  query: string,
  tools: Record<string, Tool>
) {
  try {
    const matchedTools = [];
    const regex = new RegExp(query, "i"); // Case-insensitive search

    for (const [name, tool] of Object.entries(tools)) {
      // Stringify the schema for searching
      const schemaJson = z.toJSONSchema(tool.inputSchema);
      const schemaString = JSON.stringify(schemaJson);
      const description = tool.description || "";

      // Check if query matches tool name, description, or schema
      if (
        regex.test(name) ||
        regex.test(description) ||
        regex.test(schemaString)
      ) {
        matchedTools.push({
          name,
          description,
          schema: schemaJson,
        });
      }
    }

    return { tools: matchedTools };
  } catch {
    return { tools: [] };
  }
}
