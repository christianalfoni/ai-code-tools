import { createCodeTools } from "./dist/index.js";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs, tool } from "ai";
import z from "zod";

const apiKey = process.env.ANTHROPIC_API_KEY || "";

if (!apiKey) {
  console.error("Error: ANTHROPIC_API_KEY environment variable is not set");
  process.exit(1);
}

const prompt =
  process.argv[2] ||
  "Hello! Could you compare the weather in Trondheim and Amsterdam?";

async function testInference() {
  try {
    console.log("Prompt:", prompt);
    console.log("");

    const anthropic = createAnthropic({
      apiKey,
    });

    console.log("\n=== Starting inference ===\n");

    const startTime = Date.now();

    const { text, steps } = await generateText({
      model: anthropic("claude-sonnet-4-5-20250929"),
      prompt,
      stopWhen: stepCountIs(10),
      tools: createCodeTools({
        getWeather: tool({
          inputSchema: z.object({
            city: z.string().describe("The city to get weather for"),
            country: z
              .string()
              .optional()
              .describe("The country code (e.g., 'US', 'UK')"),
          }),
          execute: async (params) => {
            const location = params.country
              ? `${params.city}, ${params.country}`
              : params.city;

            // Mock weather response
            return {
              location,
              temperature: Math.floor(Math.random() * 30) + 5,
              conditions: "Partly cloudy",
              humidity: 65,
              windSpeed: 12,
            };
          },
        }),
      }),
    });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log("\n=== All Steps ===");
    steps.forEach((step, index) => {
      console.log(`\nStep ${index + 1}:`);
      console.log(`- Text: ${step.text || "(none)"}`);
      console.log(`- Tool Calls: ${step.toolCalls?.length || 0}`);
      if (step.toolCalls && step.toolCalls.length > 0) {
        step.toolCalls.forEach((tc) => {
          console.log(`  - ${tc.toolName}(${JSON.stringify(tc.input)})`);
        });
      }
      console.log(`- Tool Results: ${step.toolResults?.length || 0}`);
    });

    console.log(`\n=== Timing ===`);
    console.log(`Total duration: ${duration}s`);
    console.log(`Total steps: ${steps.length}`);
  } catch (error) {
    console.error("Failed to run inference:", error);
    process.exit(1);
  }
}

testInference();
