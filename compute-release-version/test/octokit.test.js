import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createOctokit } from "../src/octokit.js";

// A server that answers with the given statuses in turn, and then 200, and counts the requests
let server;
afterEach(() => server?.close());
async function serve(statuses) {
  const requests = [];
  server = http.createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const status = statuses.shift() ?? 200;
    response.writeHead(status, { "content-type": "application/json" });
    response.end(
      JSON.stringify(
        status === 200 ? { ok: true } : { message: `status ${status}` },
      ),
    );
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}
const octokit = (url, retries = 3) =>
  createOctokit({ baseUrl: url, retries, retryDelayMs: 1 });

describe("createOctokit", () => {
  it("tries a read again after a 5xx", async () => {
    const { url, requests } = await serve([504, 502]);
    const { data } = await octokit(url).request("GET /repos/o/r");
    expect(data).toEqual({ ok: true });
    expect(requests).toHaveLength(3);
  });

  it("gives up after the retries, with the error of GitHub", async () => {
    const { url, requests } = await serve([504, 504, 504, 504, 504]);
    await expect(
      octokit(url, 2).request("GET /repos/o/r"),
    ).rejects.toMatchObject({ status: 504 });
    expect(requests).toHaveLength(3);
  });

  it("does not try a read again after a 4xx", async () => {
    const { url, requests } = await serve([404]);
    await expect(octokit(url).request("GET /repos/o/r")).rejects.toMatchObject({
      status: 404,
    });
    expect(requests).toHaveLength(1);
  });

  it("does not try a write again: it may have been done", async () => {
    const { url, requests } = await serve([502]);
    await expect(
      octokit(url).request("POST /repos/o/r/issues", { title: "t" }),
    ).rejects.toMatchObject({
      status: 502,
    });
    expect(requests).toHaveLength(1);
  });
});
