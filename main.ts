import express, { type Request, type Response } from "express";

const app = express();
app.use(express.json());

const DEFAULT_SERVER_URL =
  "https://actively-ai--tough-server-fastapi-app.modal.run/completion";

const LIMIT = 100; // characters
const INTERVAL = 10; // seconds

const PORT = 8000;

app.post("/completion", async (req: Request, res: Response) => {
  const requestJson = req.body ?? {};

  const prompt = requestJson.prompt; // noqa

  await getUpstreamCompletion(requestJson, res);
});

async function getUpstreamCompletion(
  requestJson: unknown,
  res: Response,
): Promise<void> {
  try {
    const resp = await fetch(DEFAULT_SERVER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestJson),
    });

    const content = await resp.text();
    res
      .status(resp.status)
      .type(resp.headers.get("content-type") ?? "application/json")
      .send(content);
  } catch (e) {
    // fetch rejects with a TypeError when the upstream request itself fails
    if (e instanceof TypeError) {
      res.status(503).send(`Upstream request failed: ${e}`);
    } else {
      res.status(500).send(`Unexpected error: ${e}`);
    }
  }
}

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
