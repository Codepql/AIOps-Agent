const url = 'http://127.0.0.1:3001/health';
const deadline = Date.now() + 30_000;

while (Date.now() < deadline) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      console.log('API is ready. Starting web UI at http://127.0.0.1:3000');
      process.exit(0);
    }
  } catch {
    // API is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

throw new Error(`API did not become ready at ${url} within 30 seconds. Check the [api] process output for the startup error.`);
