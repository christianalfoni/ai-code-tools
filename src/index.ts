import { z } from "zod";
import { discoverToolsInMemory } from "./discover_tools";
import { executeTools } from "./execute_tools";

type Tool = {
  description?: string;
  inputSchema: z.ZodType<any>;
  execute: (params: any) => Promise<any> | any;
};

export function createCodeTools(tools: Record<string, Tool>) {
  return {
    discover_tools: {
      description:
        "Discover available tools by searching tool names and schemas with a query pattern",
      inputSchema: z.object({
        query: z.string().describe("The search query to find relevant tools"),
      }),
      execute: async ({ query }: { query: string }) => {
        return discoverToolsInMemory(query, tools);
      },
    },
    execute_tools: {
      description:
        "Execute JavaScript code with access to tools via the 'tools' object. Return the result you want access to. IMPORTANT: Only use this tool to call the available tools and return their results. Do NOT attempt to access system resources, import modules, or execute any code outside of calling the provided tools. The code will be validated and execution will fail if it attempts to use require(), import, eval(), access process/global objects, or any other potentially dangerous operations.",
      inputSchema: z.object({
        code: z.string().describe("The JavaScript code to execute"),
      }),
      execute: async ({ code }: { code: string }) => {
        return executeTools(code, tools);
      },
    },
  };
}
