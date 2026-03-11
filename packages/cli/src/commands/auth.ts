import type { Command } from "commander";
import { readConfig, writeConfig, DEFAULT_API_URL } from "../lib/config.js";
import { handleError, isJsonMode, printJson, printSuccess } from "../lib/output.js";
import { createInterface } from "node:readline";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function registerAuthCommands(program: Command) {
  program
    .command("login")
    .description("Authenticate with a Lattice server")
    .option("--api-url <url>", "API server URL")
    .option("--token <token>", "Personal access token")
    .action(async (opts, cmd) => {
      try {
        const existing = readConfig();

        let apiUrl = opts.apiUrl as string | undefined;
        let token = opts.token as string | undefined;

        if (!apiUrl && !token && process.stdin.isTTY) {
          const currentUrl = existing.api_url || DEFAULT_API_URL;
          const urlAnswer = await prompt(
            `API URL (${currentUrl}): `,
          );
          apiUrl = urlAnswer || currentUrl;

          token = await prompt("Personal access token: ");
          if (!token) {
            throw new Error("Token is required. Generate one at your Lattice server under Settings > Tokens.");
          }
        }

        if (!token && !opts.apiUrl) {
          throw new Error(
            "Token is required. Use 'lattice login --token <token>' or run interactively.",
          );
        }

        if (apiUrl) existing.api_url = apiUrl;
        if (token) existing.token = token;
        writeConfig(existing);

        if (isJsonMode(cmd)) {
          printJson({ success: true, api_url: existing.api_url || DEFAULT_API_URL });
        } else {
          printSuccess(`Logged in to ${existing.api_url || DEFAULT_API_URL}`);
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });

  program
    .command("logout")
    .description("Clear stored authentication credentials")
    .action(async (_opts, cmd) => {
      try {
        const existing = readConfig();
        delete existing.token;
        writeConfig(existing);

        if (isJsonMode(cmd)) {
          printJson({ success: true });
        } else {
          printSuccess("Logged out. Token cleared.");
        }
      } catch (err) {
        handleError(err, cmd);
      }
    });
}
