try {
  await import('../src/main.js');
} catch (error) {
  console.error('[api] Failed to load the API application.');
  console.error(error);
  process.exit(1);
}
