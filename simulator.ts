// Default configuration
const DEFAULT_SERVER_URL = "http://localhost:8000/completion";
const DEFAULT_USER_ID = "default";
const DEFAULT_DURATION = 60;

// ANSI colors for terminal output
const GREEN = "\x1b[92m";
const YELLOW = "\x1b[93m";
const RED = "\x1b[91m";
const BLUE = "\x1b[94m";
const CYAN = "\x1b[96m";
const MAGENTA = "\x1b[95m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Current wall-clock time in seconds (float), mirroring Python's time.time(). */
const nowSeconds = (): number => Date.now() / 1000;

/** Format like Python's "%H:%M:%S.%f" (6 fractional digits; JS resolves to ms). */
function timestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const micros = String(d.getMilliseconds()).padStart(3, "0") + "000";
  return `${hh}:${mm}:${ss}.${micros}`;
}

/** Render a number the way Python's str() does (whole floats keep a ".0"). */
function pyFloat(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/**
 * A client that sends requests to a specified URL at a specified interval.
 * Logs are maintained in an ordered map (timestamp -> message).
 */
class Client {
  readonly clientName: string;
  readonly clientId: number;
  readonly nChars: number;
  readonly interval: number; // seconds
  readonly userId: string;
  readonly url: string;

  // Statistics
  nSuccess = 0;
  nFailure = 0;

  // Logs: key is timestamp string, value is colorized message
  readonly logs = new Map<string, string>();

  constructor(
    clientId: number,
    nChars: number,
    interval: number,
    userId: string,
    url: string,
  ) {
    this.clientName = `CLIENT ${clientId}`;
    this.clientId = clientId;
    this.nChars = nChars;
    this.interval = interval;
    this.userId = userId;
    this.url = url;
  }

  async run(endTime: number): Promise<void> {
    while (nowSeconds() < endTime) {
      await this.runOnce();
      await sleep(this.interval * 1000);
    }
  }

  async runOnce(): Promise<void> {
    // Generate the prompt
    const prompt = "A".repeat(this.nChars);
    const requestData = { prompt, user_id: this.userId };

    // First log entry: "Sending ..."
    const logKey = timestamp();
    this.upsertLog(`» Sending ${this.nChars}c...`, BLUE, logKey);

    try {
      const startTime = nowSeconds();
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestData),
        signal: AbortSignal.timeout(120_000),
      });

      let responseJson: { n_chars?: number } = {};
      try {
        responseJson = await response.json();
      } catch {
        responseJson = {};
      }
      const latency = nowSeconds() - startTime;

      if (response.status === 200) {
        if (responseJson?.n_chars === this.nChars) {
          this.nSuccess += 1;
          this.upsertLog(
            `✓ [200] Sent ${this.nChars}c (${latency.toFixed(2)}s)`,
            GREEN,
            logKey,
          );
        } else {
          this.nFailure += 1;
          this.upsertLog("x [200] Incorrect response", RED, logKey);
        }
      } else if (response.status === 429) {
        this.nFailure += 1;
        this.upsertLog("x [429] Rate limited", RED, logKey);
      } else {
        this.nFailure += 1;
        this.upsertLog(`x [${response.status}] Error`, RED, logKey);
      }
    } catch (e) {
      this.nFailure += 1;
      this.upsertLog(`x Error: ${e}`, RED, logKey);
    }
  }

  upsertLog(message: string, color: string, logKey: string): void {
    const coloredMessage = `${color}${message}${RESET}`;
    this.logs.set(logKey, coloredMessage);
  }

  getSuccessRate(): number {
    const total = this.nSuccess + this.nFailure;
    return total > 0 ? (this.nSuccess / total) * 100 : 0;
  }

  /** Returns formatted statistics lines for display. */
  getStatsOutput(): string[] {
    const lines: string[] = [];
    const totalRequests = this.nSuccess + this.nFailure;

    // Header
    const displayName = `${this.clientName} (${this.nChars}c/${pyFloat(this.interval)}s)`;
    lines.push(`${BOLD}${displayName}${RESET}`);

    // Stats
    lines.push(`${GREEN}✓ Successful requests: ${this.nSuccess}${RESET}`);
    lines.push(`${RED}✗ Failed requests: ${this.nFailure}${RESET}`);

    if (totalRequests > 0) {
      const successRate = this.getSuccessRate();
      let color: string;
      if (successRate > 80) {
        color = GREEN;
      } else if (successRate > 50) {
        color = YELLOW;
      } else {
        color = RED;
      }
      lines.push(`${color}Success rate: ${successRate.toFixed(1)}%${RESET}`);
    }

    return lines;
  }
}

/**
 * Responsible for printing the logs of one or more clients side by side.
 */
class Display {
  private static clear(): void {
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
  }

  private static getTermWidth(): number {
    return process.stdout.columns || 80;
  }

  private static getHeader(client: Client): string {
    return `${BOLD}${client.clientName} (${client.nChars}c/${pyFloat(client.interval)}s)${RESET}`;
  }

  /**
   * Left-justify text with ANSI color codes, accounting for the invisible
   * ANSI characters.
   */
  static ansiLjust(text: string, width: number): string {
    const ansiEscape = /\x1b\[[0-9;]*m/g;

    // Remove ANSI sequences to get the visible length
    const visibleText = text.replace(ansiEscape, "");
    const visibleLength = visibleText.length;

    // Calculate padding needed
    const padding = Math.max(0, width - visibleLength);

    // Add padding to the end of the original text (with ANSI codes)
    return text + " ".repeat(padding);
  }

  static displayLogs(client1: Client, client2: Client): void {
    Display.clear();

    const termWidth = Display.getTermWidth();
    const paneWidth = Math.max(20, Math.floor((termWidth - 3) / 2));
    const separator = "|";

    const header1 = Display.getHeader(client1);
    const header2 = Display.getHeader(client2);

    const header1Wrapped = Display.ansiLjust(header1, paneWidth);
    const header2Wrapped = Display.ansiLjust(header2, paneWidth);

    process.stdout.write(`${header1Wrapped} ${separator} ${header2Wrapped}\n`);
    process.stdout.write("-".repeat(termWidth) + "\n");

    const client1Logs = [...client1.logs.entries()];
    const client2Logs = [...client2.logs.entries()];

    // Pair them up so we can display in two columns
    const rows = Math.max(client1Logs.length, client2Logs.length);
    for (let i = 0; i < rows; i++) {
      let text1 = "";
      const log1 = client1Logs[i];
      if (log1) {
        const [ts, message] = log1;
        text1 = `${ts} | ${message}`;
      }

      let text2 = "";
      const log2 = client2Logs[i];
      if (log2) {
        const [ts, message] = log2;
        text2 = `${ts} | ${message}`;
      }

      // Wrap or truncate each side to one line within paneWidth
      const text1Wrapped = Display.ansiLjust(text1, paneWidth);
      const text2Wrapped = Display.ansiLjust(text2, paneWidth);

      // Print them side by side
      process.stdout.write(`${text1Wrapped} ${separator} ${text2Wrapped}\n`);
    }
  }

  /** Print final results after the simulation completes. */
  static displayResults(
    clients: Client[],
    duration: number,
    userId: string,
    serverUrl: string,
  ): void {
    process.stdout.write("\n\n\n");
    process.stdout.write(`${MAGENTA}${"=".repeat(80)}${RESET}\n`);
    process.stdout.write(`${BOLD}${MAGENTA}SIMULATION RESULTS${RESET}\n`);
    process.stdout.write(`${MAGENTA}${"=".repeat(80)}${RESET}\n`);

    process.stdout.write(`\n${CYAN}User ID: ${userId}${RESET}\n`);
    process.stdout.write(`${CYAN}Server URL: ${serverUrl}${RESET}\n`);
    process.stdout.write(`${CYAN}Duration: ${duration} seconds${RESET}\n\n`);

    for (const client of clients) {
      const stats = client.getStatsOutput();
      process.stdout.write(stats.join("\n") + "\n");
      process.stdout.write("\n");
    }

    process.stdout.write(`${MAGENTA}${"=".repeat(80)}${RESET}\n`);
  }

  static async run(
    client1: Client,
    client2: Client,
    endTime: number,
  ): Promise<void> {
    while (nowSeconds() < endTime) {
      Display.displayLogs(client1, client2);
      await sleep(500);
    }
  }
}

class Simulator {
  readonly userId: string;
  readonly url: string;
  readonly duration: number;

  readonly client1: Client;
  readonly client2: Client;

  constructor(userId: string, url: string, duration: number) {
    this.userId = userId;
    this.url = url;
    this.duration = duration;

    this.client1 = new Client(1, 16, 1.0, this.userId, this.url);
    this.client2 = new Client(2, 32, 8.0, this.userId, this.url);
  }

  async start(): Promise<void> {
    // Graceful shutdown on SIGINT / SIGTERM
    const onSignal = () => {
      process.stdout.write("\nSimulation interrupted.\n");
      process.exit(0);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    const endTime = nowSeconds() + this.duration;

    await Promise.all([
      this.client1.run(endTime),
      this.client2.run(endTime),
      Display.run(this.client1, this.client2, endTime),
    ]);

    Display.displayResults(
      [this.client1, this.client2],
      this.duration,
      this.userId,
      this.url,
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length > 3) {
    console.error(`Error: Got unexpected extra argument (${args.slice(3).join(" ")})`);
    process.exit(2);
  }

  const userId = args[0];
  if (!userId) {
    console.error("Error: Missing argument 'user_id'.");
    console.error("Usage: npm run sim -- <user_id> [url] [duration]");
    process.exit(2);
  }

  const url = args[1] ?? DEFAULT_SERVER_URL;

  let duration = DEFAULT_DURATION;
  if (args[2] !== undefined) {
    if (!/^-?\d+$/.test(args[2])) {
      console.error(
        `Error: Invalid value for 'duration': '${args[2]}' is not a valid integer.`,
      );
      process.exit(2);
    }
    duration = parseInt(args[2], 10);
  }

  const simulator = new Simulator(userId, url, duration);

  console.log(`Starting simulation for ${duration} seconds...`);
  console.log(`User ID: ${userId}`);
  console.log(`Server URL: ${url}`);

  await sleep(1000);

  await simulator.start();
}

main();
