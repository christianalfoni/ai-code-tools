import { validateCode } from './validate_code';

export async function executeTools(code: string, tools: Record<string, any>) {
  try {
    // Validate the code before execution
    const validation = validateCode(code);
    if (!validation.isValid) {
      return {
        output: `Code validation failed:\n${validation.errors.join('\n')}`
      };
    }

    // Wrap tools so they can be called directly as functions
    const wrappedTools: Record<string, any> = {};
    for (const [name, tool] of Object.entries(tools)) {
      // Make the tool callable directly
      wrappedTools[name] = tool.execute.bind(tool);
      // Also keep the original structure for tools.name.execute() pattern
      wrappedTools[name].execute = tool.execute.bind(tool);
    }

    // Create the async function with tools in scope
    const asyncFunc = new Function(
      'tools',
      `return (async () => {
${code}
      })();`
    );

    // Execute the function with the wrapped tools context
    const result = await asyncFunc(wrappedTools);

    // Return the result as a string
    const output = typeof result === 'object'
      ? JSON.stringify(result, null, 2)
      : String(result);

    return { output };
  } catch (error: any) {
    console.error("Error executing tools:", error);
    return { output: `Error: ${error.message}` };
  }
}
